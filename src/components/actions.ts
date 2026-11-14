import { useData } from '../store';
import { pickTask, toast } from '../store/ui';
import { getDescendantIds } from '../lib/tree';

/** "Move under..." flow: searchable picker, then re-parent (children move along). */
export async function moveUnderFlow(ids: string[]) {
  const { tasks } = useData.getState();
  const exclude = new Set<string>();
  for (const id of ids) {
    exclude.add(id);
    for (const d of getDescendantIds(tasks, id)) exclude.add(d);
  }
  const title = ids.length === 1 ? `Move "${tasks.find((t) => t.id === ids[0])?.title ?? ''}" under` : `Move ${ids.length} tasks under`;
  const target = await pickTask({ title, excludeIds: exclude, allowRoot: true });
  if (target === undefined) return;
  const s = useData.getState();
  if (ids.length === 1) {
    if (target === null) s.moveToRoot(ids[0]);
    else s.moveUnder(ids[0], target);
  } else {
    s.moveManyUnder(ids, target);
  }
}

export async function addDependencyFlow(taskId: string) {
  const { tasks } = useData.getState();
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return;
  const exclude = new Set([taskId, ...(task.blockedBy ?? [])]);
  const dep = await pickTask({ title: 'Depends on', excludeIds: exclude });
  if (!dep) return;
  // Prevent trivial mutual dependency loops.
  const other = useData.getState().tasks.find((t) => t.id === dep);
  if (other?.blockedBy?.includes(taskId)) {
    toast('That task already depends on this one. Circular dependencies are not allowed.', { kind: 'error' });
    return;
  }
  useData.getState().updateTask(taskId, { blockedBy: [...(task.blockedBy ?? []), dep] });
}
