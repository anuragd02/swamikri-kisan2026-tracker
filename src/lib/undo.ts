import type { Task } from '../types';

/**
 * A minimal, field-level patch that undoes a change to the task list.
 * Only fields the action changed are put back, so edits made to other fields
 * (or other tasks) in the meantime are kept.
 */
export interface TaskPatchSet {
  /** Tasks the action removed, with their previous array index. */
  reinsert: { task: Task; index: number }[];
  /** Ids of tasks the action added (removed on undo). */
  remove: string[];
  /** For changed tasks: previous values of the fields that changed (undefined = field was absent). */
  fields: Record<string, Partial<Record<keyof Task, unknown>>>;
}

export function diffTasks(before: Task[], after: Task[]): TaskPatchSet {
  const afterById = new Map(after.map((t) => [t.id, t]));
  const beforeIds = new Set(before.map((t) => t.id));
  const patch: TaskPatchSet = { reinsert: [], remove: [], fields: {} };
  before.forEach((t, index) => {
    const a = afterById.get(t.id);
    if (!a) {
      patch.reinsert.push({ task: t, index });
      return;
    }
    if (a === t) return;
    const keys = new Set([...Object.keys(t), ...Object.keys(a)] as (keyof Task)[]);
    const prev: Partial<Record<keyof Task, unknown>> = {};
    for (const k of keys) {
      if (JSON.stringify(t[k]) !== JSON.stringify(a[k])) prev[k] = t[k];
    }
    if (Object.keys(prev).length) patch.fields[t.id] = prev;
  });
  patch.remove = after.filter((t) => !beforeIds.has(t.id)).map((t) => t.id);
  return patch;
}

export function applyUndo(current: Task[], patch: TaskPatchSet): Task[] {
  const removeSet = new Set(patch.remove);
  const out = current
    .filter((t) => !removeSet.has(t.id))
    .map((t) => {
      const prev = patch.fields[t.id];
      if (!prev) return t;
      const next = { ...t } as Record<string, unknown>;
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete next[k];
        else next[k] = v;
      }
      return next as unknown as Task;
    });
  const present = new Set(out.map((t) => t.id));
  const missing = patch.reinsert.filter((r) => !present.has(r.task.id)).sort((a, b) => a.index - b.index);
  for (const r of missing) out.splice(Math.min(r.index, out.length), 0, r.task);
  return out;
}
