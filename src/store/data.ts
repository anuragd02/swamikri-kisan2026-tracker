import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { AppData, Settings, Status, Task, Workstream } from '../types';
import { withOwner, withoutOwner } from '../types';
import * as tree from '../lib/tree';
import { computeRollup, countingLeaves } from '../lib/progress';
import { applyUndo, diffTasks } from '../lib/undo';
import { nowIso } from '../lib/dates';
import { createSeedData, mergeData } from '../storage/migrate';
import { askChoice, toast, useUI } from './ui';

export interface DataStore extends AppData {
  /** Bumped when data is replaced wholesale (import, reset, other tab). */
  revision: number;
  replaceAll: (data: AppData) => void;

  addTask: (input: tree.NewTaskInput, index?: number) => string | null;
  updateTask: (id: string, patch: tree.TaskPatch) => boolean;
  updateMany: (ids: string[], patch: tree.TaskPatch, label: string) => void;
  addOwnerMany: (ids: string[], name: string) => void;
  removeOwnerMany: (ids: string[], name: string) => void;
  setStatus: (id: string, status: Status) => void;
  toggleDone: (id: string) => void;

  moveToRoot: (id: string) => boolean;
  moveUnder: (id: string, parentId: string, index?: number) => boolean;
  indent: (id: string) => boolean;
  outdent: (id: string) => boolean;
  moveRelative: (id: string, targetId: string, pos: tree.DropPosition) => boolean;
  moveToWorkstreamRoot: (id: string, ws: string, index?: number) => boolean;
  shift: (id: string, delta: -1 | 1) => boolean;
  changeWorkstream: (id: string, ws: string) => Promise<void>;
  moveManyUnder: (ids: string[], parentId: string | null) => boolean;
  changeManyWorkstream: (ids: string[], ws: string) => void;

  requestDelete: (id: string) => Promise<void>;
  deleteMany: (ids: string[]) => Promise<void>;

  updateSettings: (patch: Partial<Settings>) => void;
  upsertWorkstream: (ws: Workstream) => void;
  recordSnapshot: (today: string) => void;
  toggleExpoCheck: (date: string, taskId: string) => void;

  importData: (data: AppData, mode: 'replace' | 'merge') => void;
  resetToSeed: () => void;
}

const dataOf = (s: AppData): AppData => ({
  schemaVersion: s.schemaVersion,
  tasks: s.tasks,
  workstreams: s.workstreams,
  settings: s.settings,
  snapshots: s.snapshots,
  expoChecks: s.expoChecks,
});

export function extractData(s: DataStore): AppData {
  return dataOf(s);
}

export function createDataStore(initial: AppData) {
  return create<DataStore>((set, get) => {
    /** Run a pure tree op; on error show a toast. Optionally offer Undo. */
    const run = (fn: (tasks: Task[], now: string) => tree.TreeResult, undoLabel?: string): boolean => {
      const before = get().tasks;
      const r = fn(before, nowIso());
      if (!r.ok) {
        toast(r.error, { kind: 'error' });
        return false;
      }
      if (r.tasks === before) return true;
      set({ tasks: r.tasks });
      if (undoLabel) offerUndo(undoLabel, before, r.tasks);
      return true;
    };

    const offerUndo = (label: string, before: Task[], after: Task[]) => {
      const patch = diffTasks(before, after);
      let undone = false;
      toast(label, {
        kind: 'info',
        action: {
          label: 'Undo',
          run: () => {
            if (undone) return;
            undone = true;
            set({ tasks: applyUndo(get().tasks, patch) });
            toast('Undone', { kind: 'success', timeoutMs: 1500 });
          },
        },
      });
    };

    const subtreeSize = (id: string) => tree.getDescendantIds(get().tasks, id).length;

    return {
      ...initial,
      revision: 0,
      replaceAll: (data) => set((s) => ({ ...dataOf(data), revision: s.revision + 1 })),

      addTask: (input, index) => {
        const id = nanoid(10);
        return run((t, now) => tree.addTask(t, input, id, now, index)) ? id : null;
      },
      updateTask: (id, patch) => run((t, now) => tree.updateTask(t, id, patch, now)),
      updateMany: (ids, patch, label) => run((t, now) => tree.updateMany(t, ids, patch, now), label),
      addOwnerMany: (ids, name) =>
        run((t, now) => {
          let cur = t;
          for (const id of ids) {
            const task = cur.find((x) => x.id === id);
            if (!task) continue;
            const next = withOwner(task.owners, name);
            if (next === task.owners) continue;
            const r = tree.updateTask(cur, id, { owners: next }, now);
            if (!r.ok) return r;
            cur = r.tasks;
          }
          return { ok: true, tasks: cur };
        }, `Added ${name.trim()} to ${ids.length} task${ids.length === 1 ? '' : 's'}`),
      removeOwnerMany: (ids, name) =>
        run((t, now) => {
          let cur = t;
          for (const id of ids) {
            const task = cur.find((x) => x.id === id);
            if (!task?.owners?.length) continue;
            const next = withoutOwner(task.owners, name);
            if (next.length === task.owners.length) continue;
            const r = tree.updateTask(cur, id, { owners: next.length ? next : undefined }, now);
            if (!r.ok) return r;
            cur = r.tasks;
          }
          return { ok: true, tasks: cur };
        }, `Removed ${name} from selected tasks`),
      setStatus: (id, status) => {
        const t = get().tasks.find((x) => x.id === id);
        if (!t) return;
        const hasKids = get().tasks.some((x) => x.parentId === id);
        // Setting a parent's status from a menu marks it as a manual override.
        run((ts, now) => tree.updateTask(ts, id, hasKids ? { status, statusManual: true } : { status }, now));
      },
      toggleDone: (id) => {
        const tasks = get().tasks;
        const roll = computeRollup(tasks);
        const r = roll.get(id);
        if (!r) return;
        if (r.isLeaf) {
          const t = tasks.find((x) => x.id === id)!;
          run((ts, now) => tree.updateTask(ts, id, { status: t.status === 'done' ? 'not_started' : 'done' }, now));
          return;
        }
        // Parent: complete (or reopen) every counting leaf below it.
        const desc = new Set(tree.getDescendantIds(tasks, id));
        const leaves = countingLeaves(tasks, roll).filter((l) => desc.has(l.id));
        const allDone = r.status === 'done';
        const ids = leaves.filter((l) => (allDone ? l.status === 'done' : l.status !== 'done')).map((l) => l.id);
        run(
          (ts, now) => {
            const res = tree.updateMany(ts, ids, { status: allDone ? 'not_started' : 'done' }, now);
            if (!res.ok) return res;
            const p = res.tasks.find((x) => x.id === id)!;
            return p.statusManual ? tree.updateTask(res.tasks, id, { statusManual: false }, now) : res;
          },
          allDone ? `Reopened ${ids.length} subtasks` : `Marked ${ids.length} subtasks done`,
        );
      },

      moveToRoot: (id) => run((t, now) => tree.moveToRoot(t, id, now), 'Made a main task'),
      moveUnder: (id, parentId, index) => run((t, now) => tree.moveUnder(t, id, parentId, now, index), 'Moved'),
      indent: (id) => run((t, now) => tree.indent(t, id, now)),
      outdent: (id) => run((t, now) => tree.outdent(t, id, now)),
      moveRelative: (id, targetId, pos) => run((t, now) => tree.moveRelative(t, id, targetId, pos, now), 'Moved'),
      moveToWorkstreamRoot: (id, ws, index) =>
        run((t, now) => tree.placeTask(t, id, { parentId: null, workstream: ws, index }, now), 'Moved'),
      shift: (id, delta) => run((t, now) => tree.shift(t, id, delta, now)),
      changeWorkstream: async (id, ws) => {
        const n = get().tasks.filter((x) => x.parentId === id).length;
        let withChildren = true;
        if (n > 0) {
          const total = subtreeSize(id);
          const c = await askChoice({
            title: 'Move subtasks too?',
            body: `This task has ${total} subtask${total === 1 ? '' : 's'}.`,
            options: [
              { value: 'with', label: `Move with ${total === 1 ? 'its subtask' : `all ${total} subtasks`}`, tone: 'primary' },
              { value: 'alone', label: 'Move only this task', description: 'Subtasks stay in the current workstream.' },
            ],
          });
          if (c === null) return;
          withChildren = c === 'with';
        }
        run((t, now) => tree.changeWorkstream(t, id, ws, withChildren, now), `Moved to ${ws}`);
      },
      moveManyUnder: (ids, parentId) =>
        run((t, now) => tree.moveManyUnder(t, ids, parentId, now), `Moved ${ids.length} tasks`),
      changeManyWorkstream: (ids, ws) =>
        run((t, now) => {
          const sel = new Set(ids);
          const top = ids.filter((id) => !tree.getAncestorIds(t, id).some((a) => sel.has(a)));
          let cur = t;
          for (const id of top) {
            const r = tree.changeWorkstream(cur, id, ws, true, now);
            if (!r.ok) return r;
            cur = r.tasks;
          }
          return { ok: true, tasks: cur };
        }, `Moved ${ids.length} tasks to ${ws}`),

      requestDelete: async (id) => {
        const task = get().tasks.find((x) => x.id === id);
        if (!task) return;
        const n = subtreeSize(id);
        let mode: tree.DeleteMode = 'cascade';
        if (n > 0) {
          const c = await askChoice({
            title: `Delete "${task.title}"?`,
            body: `This task has ${n} subtask${n === 1 ? '' : 's'}.`,
            options: [
              { value: 'promote', label: 'Delete and move subtasks up one level', tone: 'primary' },
              { value: 'cascade', label: `Delete with all ${n} subtask${n === 1 ? '' : 's'}`, tone: 'danger' },
            ],
          });
          if (c === null) return;
          mode = c as tree.DeleteMode;
        }
        if (useUIDrawerIs(id)) closeDrawer();
        run(
          (t, now) => tree.deleteTask(t, id, mode, now),
          mode === 'cascade' && n > 0 ? `Deleted "${task.title}" and ${n} subtasks` : `Deleted "${task.title}"`,
        );
      },
      deleteMany: async (ids) => {
        const tasks = get().tasks;
        const sel = new Set(ids);
        const top = ids.filter((id) => !tree.getAncestorIds(tasks, id).some((a) => sel.has(a)));
        const total = new Set(top.flatMap((id) => [id, ...tree.getDescendantIds(tasks, id)])).size;
        const c = await askChoice({
          title: `Delete ${total} task${total === 1 ? '' : 's'}?`,
          body: total > ids.length ? 'Includes subtasks of the selected tasks.' : undefined,
          options: [{ value: 'yes', label: 'Delete', tone: 'danger' }],
        });
        if (c !== 'yes') return;
        run((t, now) => {
          let cur = t;
          for (const id of top) {
            const r = tree.deleteTask(cur, id, 'cascade', now);
            if (!r.ok) return r;
            cur = r.tasks;
          }
          return { ok: true, tasks: cur };
        }, `Deleted ${total} tasks`);
      },

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      upsertWorkstream: (ws) =>
        set((s) => {
          const exists = s.workstreams.some((w) => w.code === ws.code);
          return {
            workstreams: exists ? s.workstreams.map((w) => (w.code === ws.code ? ws : w)) : [...s.workstreams, ws],
          };
        }),
      recordSnapshot: (today) => {
        const { tasks, snapshots } = get();
        const roll = computeRollup(tasks);
        const leaves = countingLeaves(tasks, roll);
        const snap = { date: today, total: leaves.length, done: leaves.filter((l) => l.status === 'done').length };
        const last = snapshots.find((s) => s.date === today);
        if (last && last.total === snap.total && last.done === snap.done) return;
        const rest = snapshots.filter((s) => s.date !== today);
        set({ snapshots: [...rest, snap].sort((a, b) => (a.date < b.date ? -1 : 1)) });
      },
      toggleExpoCheck: (date, taskId) =>
        set((s) => {
          const day = { ...(s.expoChecks[date] ?? {}) };
          if (day[taskId]) delete day[taskId];
          else day[taskId] = true;
          const expoChecks = { ...s.expoChecks, [date]: day };
          if (!Object.keys(day).length) delete expoChecks[date];
          return { expoChecks };
        }),

      importData: (data, mode) => {
        const next = mode === 'replace' ? data : mergeData(dataOf(get()), data);
        set((s) => ({ ...dataOf(next), revision: s.revision + 1 }));
      },
      resetToSeed: () => set((s) => ({ ...createSeedData(), revision: s.revision + 1 })),
    };
  });
}

const useUIDrawerIs = (id: string) => useUI.getState().drawerId === id;
const closeDrawer = () => useUI.getState().openDrawer(null);

export type DataStoreHook = ReturnType<typeof createDataStore>;
