/**
 * Pure tree operations over a flat Task[] list.
 *
 * Sibling groups: tasks with the same parentId. Root tasks (parentId = null) are grouped
 * per workstream, because the outline shows roots grouped by workstream.
 * Every structural op re-numbers `order` to 0..n-1 inside the groups it touches.
 * Array order of the input is preserved (new tasks are appended), so exports stay stable.
 */
import type { Status, Task } from '../types';

export type TreeResult = { ok: true; tasks: Task[] } | { ok: false; error: string };

export type DropPosition = 'before' | 'after' | 'inside';

export type TaskPatch = Partial<Omit<Task, 'id' | 'parentId' | 'order' | 'workstream' | 'createdAt'>>;

export interface NewTaskInput {
  title: string;
  workstream: string;
  parentId?: string | null;
  status?: Status;
  priority?: Task['priority'];
  owners?: string[];
  dueDate?: string;
  startDate?: string;
  notes?: string;
  tags?: string[];
  isMilestone?: boolean;
  estCost?: number;
  actualCost?: number;
  vendor?: string;
  blockedBy?: string[];
}

export const CYCLE_ERROR = "Can't move a task under itself or one of its own subtasks.";

export function groupKey(t: Pick<Task, 'parentId' | 'workstream'>): string {
  return t.parentId ?? `root:${t.workstream}`;
}

const byOrder = (a: Task, b: Task) => a.order - b.order;

/** Children map keyed by groupKey, each sorted by order. */
export function buildGroups(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const k = groupKey(t);
    let g = groups.get(k);
    if (!g) groups.set(k, (g = []));
    g.push(t);
  }
  for (const g of groups.values()) g.sort(byOrder);
  return groups;
}

export function getChildren(tasks: Task[], parentId: string): Task[] {
  return tasks.filter((t) => t.parentId === parentId).sort(byOrder);
}

export function getRoots(tasks: Task[], workstream: string): Task[] {
  return tasks.filter((t) => t.parentId === null && t.workstream === workstream).sort(byOrder);
}

/** All descendant ids, depth-first in display order. */
export function getDescendantIds(tasks: Task[], id: string, groups = buildGroups(tasks)): string[] {
  const out: string[] = [];
  const walk = (pid: string) => {
    for (const c of groups.get(pid) ?? []) {
      out.push(c.id);
      walk(c.id);
    }
  };
  walk(id);
  return out;
}

/** Ancestor ids from the direct parent up to the root. */
export function getAncestorIds(tasks: Task[], id: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    out.push(cur.parentId);
    cur = byId.get(cur.parentId);
  }
  return out;
}

export function getDepth(tasks: Task[], id: string): number {
  return getAncestorIds(tasks, id).length;
}

/** True if putting `id` under `newParentId` would create a cycle. */
export function wouldCycle(tasks: Task[], id: string, newParentId: string | null): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;
  return getAncestorIds(tasks, newParentId).includes(id);
}

/** Builds a result list, applying replacements and removals while keeping array order. */
function commit(tasks: Task[], changed: Map<string, Task>, removed: Set<string> = new Set(), added: Task[] = []): Task[] {
  const out: Task[] = [];
  for (const t of tasks) {
    if (removed.has(t.id)) continue;
    out.push(changed.get(t.id) ?? t);
  }
  for (const t of added) out.push(changed.get(t.id) ?? t);
  return out;
}

/** Re-number a group (array of ids in desired order) into `changed`. */
function renumber(ids: string[], get: (id: string) => Task, changed: Map<string, Task>) {
  ids.forEach((id, i) => {
    const t = get(id);
    if (t.order !== i) changed.set(id, { ...t, order: i });
  });
}

interface PlaceTarget {
  parentId: string | null;
  /** Required when parentId is null; ignored otherwise (subtasks take the parent's workstream). */
  workstream?: string;
  /** Index within the target sibling group (after removal of the moved task). Default: end. */
  index?: number;
}

/**
 * Core move: re-parents / reorders a task. Its whole subtree moves with it and adopts
 * the destination workstream.
 */
export function placeTask(tasks: Task[], id: string, target: PlaceTarget, now: string): TreeResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const task = byId.get(id);
  if (!task) return { ok: false, error: 'Task not found.' };
  let workstream: string;
  if (target.parentId !== null) {
    const parent = byId.get(target.parentId);
    if (!parent) return { ok: false, error: 'Target parent not found.' };
    if (wouldCycle(tasks, id, target.parentId)) return { ok: false, error: CYCLE_ERROR };
    workstream = parent.workstream;
  } else {
    workstream = target.workstream ?? task.workstream;
  }

  const changed = new Map<string, Task>();
  const get = (tid: string) => changed.get(tid) ?? byId.get(tid)!;
  const groups = buildGroups(tasks);

  // Remove from old group.
  const oldKey = groupKey(task);
  const oldIds = (groups.get(oldKey) ?? []).map((t) => t.id).filter((x) => x !== id);
  // Insert into new group.
  const newKey = target.parentId ?? `root:${workstream}`;
  const newIds = newKey === oldKey ? oldIds.slice() : (groups.get(newKey) ?? []).map((t) => t.id);
  const idx = target.index === undefined ? newIds.length : Math.max(0, Math.min(target.index, newIds.length));
  newIds.splice(idx, 0, id);

  const sameSpot =
    newKey === oldKey && (groups.get(oldKey) ?? []).map((t) => t.id).join('|') === newIds.join('|');
  if (sameSpot && task.workstream === workstream) return { ok: true, tasks };

  changed.set(id, { ...task, parentId: target.parentId, workstream, updatedAt: now });
  if (newKey !== oldKey) renumber(oldIds, get, changed);
  renumber(newIds, get, changed);

  if (task.workstream !== workstream) {
    for (const did of getDescendantIds(tasks, id, groups)) {
      const d = get(did);
      changed.set(did, { ...d, workstream, updatedAt: now });
    }
  }
  return { ok: true, tasks: commit(tasks, changed) };
}

function indexInGroup(tasks: Task[], task: Task): number {
  return buildGroups(tasks)
    .get(groupKey(task))!
    .findIndex((t) => t.id === task.id);
}

/** Make a task a main (root) task. It is placed right after its former top-level ancestor. */
export function moveToRoot(tasks: Task[], id: string, now: string): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  if (task.parentId === null) return { ok: true, tasks };
  const ancestors = getAncestorIds(tasks, id);
  const topId = ancestors[ancestors.length - 1];
  const top = tasks.find((t) => t.id === topId)!;
  const roots = getRoots(tasks, top.workstream);
  const idx = roots.findIndex((r) => r.id === topId) + 1;
  return placeTask(tasks, id, { parentId: null, workstream: top.workstream, index: idx }, now);
}

/** Make `id` a subtask of `parentId` (appended as last child unless index given). */
export function moveUnder(tasks: Task[], id: string, parentId: string, now: string, index?: number): TreeResult {
  return placeTask(tasks, id, { parentId, index }, now);
}

/** Indent: become the last child of the previous sibling. */
export function indent(tasks: Task[], id: string, now: string): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  const group = buildGroups(tasks).get(groupKey(task))!;
  const i = group.findIndex((t) => t.id === id);
  if (i <= 0) return { ok: false, error: 'Nothing above to indent under. Indent needs a task directly above at the same level.' };
  return placeTask(tasks, id, { parentId: group[i - 1].id }, now);
}

/** Outdent: become a sibling of the current parent, placed right after it. */
export function outdent(tasks: Task[], id: string, now: string): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  if (task.parentId === null) return { ok: false, error: 'Already a main task.' };
  const parent = tasks.find((t) => t.id === task.parentId)!;
  const pIdx = indexInGroup(tasks, parent);
  return placeTask(
    tasks,
    id,
    { parentId: parent.parentId, workstream: parent.workstream, index: pIdx + 1 },
    now,
  );
}

/** Move relative to another task: before/after it (as sibling) or inside it (as last child). */
export function moveRelative(
  tasks: Task[],
  id: string,
  targetId: string,
  position: DropPosition,
  now: string,
): TreeResult {
  if (id === targetId) return { ok: true, tasks };
  const target = tasks.find((t) => t.id === targetId);
  if (!target) return { ok: false, error: 'Target not found.' };
  if (position === 'inside') return moveUnder(tasks, id, targetId, now);
  if (wouldCycle(tasks, id, target.parentId)) return { ok: false, error: CYCLE_ERROR };
  // index computed on the group without the moving task
  const group = (buildGroups(tasks).get(groupKey(target)) ?? []).filter((t) => t.id !== id);
  let idx = group.findIndex((t) => t.id === targetId);
  if (position === 'after') idx += 1;
  return placeTask(tasks, id, { parentId: target.parentId, workstream: target.workstream, index: idx }, now);
}

/** Move up/down one place among siblings. */
export function shift(tasks: Task[], id: string, delta: -1 | 1, now: string): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  const i = indexInGroup(tasks, task);
  return placeTask(tasks, id, { parentId: task.parentId, workstream: task.workstream, index: Math.max(0, i + delta) }, now);
}

export function addTask(
  tasks: Task[],
  input: NewTaskInput,
  id: string,
  now: string,
  index?: number,
): TreeResult {
  if (tasks.some((t) => t.id === id)) return { ok: false, error: 'Duplicate id.' };
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Title is required.' };
  const parentId = input.parentId ?? null;
  let workstream = input.workstream;
  if (parentId) {
    const parent = tasks.find((t) => t.id === parentId);
    if (!parent) return { ok: false, error: 'Parent not found.' };
    workstream = parent.workstream;
  }
  const groups = buildGroups(tasks);
  const ids = (groups.get(parentId ?? `root:${workstream}`) ?? []).map((t) => t.id);
  const idx = index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length));
  ids.splice(idx, 0, id);
  const status = input.status ?? 'not_started';
  const task: Task = {
    id,
    title,
    workstream,
    parentId,
    order: idx,
    status,
    priority: input.priority ?? 'P1',
    createdAt: now,
    updatedAt: now,
  };
  const optional: (keyof NewTaskInput)[] = [
    'owners', 'dueDate', 'startDate', 'notes', 'tags', 'isMilestone', 'estCost', 'actualCost', 'vendor', 'blockedBy',
  ];
  for (const k of optional) {
    const v = input[k];
    if (v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) {
      (task as unknown as Record<string, unknown>)[k] = v;
    }
  }
  if (status === 'done') task.completedAt = now;
  const changed = new Map<string, Task>([[id, task]]);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  renumber(ids, (tid) => changed.get(tid) ?? byId.get(tid)!, changed);
  return { ok: true, tasks: commit(tasks, changed, new Set(), [task]) };
}

export function updateTask(tasks: Task[], id: string, patch: TaskPatch, now: string): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  const clean: Record<string, unknown> = { ...patch };
  for (const k of ['id', 'parentId', 'order', 'workstream', 'createdAt']) delete clean[k];
  if (typeof clean.title === 'string') {
    clean.title = (clean.title as string).trim();
    if (!clean.title) return { ok: false, error: 'Title is required.' };
  }
  if (Array.isArray(clean.blockedBy)) {
    const bad = (clean.blockedBy as string[]).find((b) => b === id);
    if (bad) return { ok: false, error: "A task can't depend on itself." };
  }
  const next: Task = { ...task, ...(clean as TaskPatch), updatedAt: now };
  // Drop keys explicitly set to undefined so JSON round-trips stay identical.
  for (const k of Object.keys(next) as (keyof Task)[]) if (next[k] === undefined) delete next[k];
  if (patch.status && patch.status !== task.status) {
    if (patch.status === 'done') next.completedAt = now;
    else delete next.completedAt;
  }
  return { ok: true, tasks: commit(tasks, new Map([[id, next]])) };
}

/** Apply the same patch to many tasks. */
export function updateMany(tasks: Task[], ids: string[], patch: TaskPatch, now: string): TreeResult {
  let cur = tasks;
  for (const id of ids) {
    const r = updateTask(cur, id, patch, now);
    if (!r.ok) return r;
    cur = r.tasks;
  }
  return { ok: true, tasks: cur };
}

export type DeleteMode = 'cascade' | 'promote';

/**
 * cascade: delete the task and its whole subtree.
 * promote: delete only the task; its children move up one level, taking its place.
 * Dependencies pointing at deleted tasks are removed.
 */
export function deleteTask(tasks: Task[], id: string, mode: DeleteMode, now: string): TreeResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const task = byId.get(id);
  if (!task) return { ok: false, error: 'Task not found.' };
  const groups = buildGroups(tasks);
  const removed = new Set<string>([id]);
  const changed = new Map<string, Task>();
  const get = (tid: string) => changed.get(tid) ?? byId.get(tid)!;

  const siblingIds = (groups.get(groupKey(task)) ?? []).map((t) => t.id);
  const pos = siblingIds.indexOf(id);
  const childIds = (groups.get(id) ?? []).map((t) => t.id);

  if (mode === 'cascade') {
    for (const d of getDescendantIds(tasks, id, groups)) removed.add(d);
    siblingIds.splice(pos, 1);
  } else {
    for (const cid of childIds) {
      changed.set(cid, { ...get(cid), parentId: task.parentId, updatedAt: now });
    }
    siblingIds.splice(pos, 1, ...childIds);
  }
  renumber(siblingIds, get, changed);

  for (const t of tasks) {
    if (removed.has(t.id) || !t.blockedBy?.some((b) => removed.has(b))) continue;
    const cur = get(t.id);
    const blockedBy = cur.blockedBy!.filter((b) => !removed.has(b));
    const next: Task = { ...cur, updatedAt: now };
    if (blockedBy.length) next.blockedBy = blockedBy;
    else delete next.blockedBy;
    changed.set(t.id, next);
  }
  return { ok: true, tasks: commit(tasks, changed, removed) };
}

/**
 * Move a task to another workstream.
 * withChildren = true: the subtree moves too.
 * withChildren = false: the children stay in the old workstream, attached to the task's old parent
 * (or as main tasks), in the task's old position.
 * A subtask moved to a different workstream than its parent becomes a main task there.
 */
export function changeWorkstream(
  tasks: Task[],
  id: string,
  workstream: string,
  withChildren: boolean,
  now: string,
): TreeResult {
  const task = tasks.find((t) => t.id === id);
  if (!task) return { ok: false, error: 'Task not found.' };
  if (task.workstream === workstream) return { ok: true, tasks };
  let cur = tasks;
  if (!withChildren) {
    const children = getChildren(cur, id);
    if (children.length) {
      let idx = indexInGroup(cur, task) + 1;
      for (const c of children) {
        const r = placeTask(cur, c.id, { parentId: task.parentId, workstream: task.workstream, index: idx++ }, now);
        if (!r.ok) return r;
        cur = r.tasks;
      }
    }
  }
  return placeTask(cur, id, { parentId: null, workstream }, now);
}

/**
 * Move several tasks under a parent (or to root when parentId is null).
 * Tasks whose ancestor is also selected are skipped; they move with that ancestor.
 */
export function moveManyUnder(tasks: Task[], ids: string[], parentId: string | null, now: string): TreeResult {
  const sel = new Set(ids);
  const top = ids.filter((id) => !getAncestorIds(tasks, id).some((a) => sel.has(a)));
  let cur = tasks;
  for (const id of top) {
    const r = parentId === null ? moveToRoot(cur, id, now) : moveUnder(cur, id, parentId, now);
    if (!r.ok) return r;
    cur = r.tasks;
  }
  return { ok: true, tasks: cur };
}

/** Breadcrumb path like "ASTRA-M > Fabrication > Cut, weld or bolt frame and boom". */
export function titlePath(tasks: Task[], id: string): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const chain = [id, ...getAncestorIds(tasks, id)].reverse();
  return chain.map((cid) => byId.get(cid)?.title ?? '?');
}

/** Detect any cycle or orphan in the data (used by seed tests and import validation). */
export function validateTree(tasks: Task[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const t of tasks) {
    if (ids.has(t.id)) errors.push(`Duplicate id ${t.id}`);
    ids.add(t.id);
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    if (t.parentId !== null && !byId.has(t.parentId)) errors.push(`Orphan ${t.id} -> ${t.parentId}`);
    const seen = new Set<string>([t.id]);
    let cur = t.parentId ? byId.get(t.parentId) : undefined;
    while (cur) {
      if (seen.has(cur.id)) {
        errors.push(`Cycle at ${t.id}`);
        break;
      }
      seen.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    for (const b of t.blockedBy ?? []) if (!byId.has(b)) errors.push(`Dangling dependency ${t.id} -> ${b}`);
  }
  return errors;
}
