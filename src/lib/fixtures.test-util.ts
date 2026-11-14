import type { Task } from '../types';

export const NOW = '2026-11-14T10:00:00.000Z';

export function mk(id: string, parentId: string | null, order: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    workstream: 'WS',
    parentId,
    order,
    status: 'not_started',
    priority: 'P1',
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

/**
 * WS roots: a, b, c
 *   a: a1, a2 (a2: a2x)
 *   b: b1
 * OTHER root: z
 */
export function sample(): Task[] {
  return [
    mk('a', null, 0),
    mk('a1', 'a', 0),
    mk('a2', 'a', 1),
    mk('a2x', 'a2', 0),
    mk('b', null, 1),
    mk('b1', 'b', 0),
    mk('c', null, 2),
    mk('z', null, 0, { workstream: 'OTHER' }),
  ];
}

export const get = (tasks: Task[], id: string) => tasks.find((t) => t.id === id)!;

/** Sorted child ids of a parent (or `root:WS`) */
export function kids(tasks: Task[], key: string): string[] {
  return tasks
    .filter((t) => (key.startsWith('root:') ? t.parentId === null && t.workstream === key.slice(5) : t.parentId === key))
    .sort((a, b) => a.order - b.order)
    .map((t) => t.id);
}
