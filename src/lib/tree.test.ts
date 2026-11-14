import { describe, expect, it } from 'vitest';
import type { Task } from '../types';
import {
  CYCLE_ERROR,
  addTask,
  changeWorkstream,
  deleteTask,
  getAncestorIds,
  getDescendantIds,
  indent,
  moveManyUnder,
  moveRelative,
  moveToRoot,
  moveUnder,
  outdent,
  shift,
  updateTask,
  validateTree,
  wouldCycle,
  type TreeResult,
} from './tree';
import { NOW, get, kids, sample } from './fixtures.test-util';

const T2 = '2026-11-15T10:00:00.000Z';

function ok(r: TreeResult): Task[] {
  if (!r.ok) throw new Error(r.error);
  expect(validateTree(r.tasks)).toEqual([]);
  return r.tasks;
}

describe('descendants and ancestors', () => {
  it('lists descendants depth-first and ancestors bottom-up', () => {
    const t = sample();
    expect(getDescendantIds(t, 'a')).toEqual(['a1', 'a2', 'a2x']);
    expect(getAncestorIds(t, 'a2x')).toEqual(['a2', 'a']);
    expect(getAncestorIds(t, 'a')).toEqual([]);
  });
});

describe('cycle prevention', () => {
  it('detects moving under self or a descendant', () => {
    const t = sample();
    expect(wouldCycle(t, 'a', 'a')).toBe(true);
    expect(wouldCycle(t, 'a', 'a2x')).toBe(true);
    expect(wouldCycle(t, 'a2', 'b1')).toBe(false);
    expect(wouldCycle(t, 'a', null)).toBe(false);
  });
  it('refuses moveUnder into own subtree with a clear message', () => {
    const t = sample();
    const r = moveUnder(t, 'a', 'a2x', T2);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(CYCLE_ERROR);
    expect(moveUnder(t, 'a2', 'a2', T2).ok).toBe(false);
  });
  it('refuses dropping before/after a task inside own subtree', () => {
    const r = moveRelative(sample(), 'a', 'a2x', 'before', T2);
    expect(r.ok).toBe(false);
  });
});

describe('re-parenting', () => {
  it('turns a main task into a subtask and keeps its children', () => {
    const t = ok(moveUnder(sample(), 'a', 'b', T2));
    expect(get(t, 'a').parentId).toBe('b');
    expect(kids(t, 'b')).toEqual(['b1', 'a']);
    expect(kids(t, 'a')).toEqual(['a1', 'a2']);
    expect(kids(t, 'a2')).toEqual(['a2x']);
    expect(kids(t, 'root:WS')).toEqual(['b', 'c']);
    expect(get(t, 'b').order).toBe(0);
    expect(get(t, 'a').updatedAt).toBe(T2);
  });
  it('turns a subtask back into a main task, placed after its old top ancestor', () => {
    const t = ok(moveToRoot(sample(), 'a2', T2));
    expect(get(t, 'a2').parentId).toBeNull();
    expect(kids(t, 'root:WS')).toEqual(['a', 'a2', 'b', 'c']);
    expect(kids(t, 'a2')).toEqual(['a2x']);
    expect(kids(t, 'a')).toEqual(['a1']);
  });
  it('round trip main -> sub -> main loses no data', () => {
    const start = sample().map((x) => (x.id === 'a2' ? { ...x, notes: 'n', owners: ['Anurag', 'Ravi'], estCost: 500 } : x));
    let t = ok(moveUnder(start, 'a2', 'c', T2));
    t = ok(moveToRoot(t, 'a2', T2));
    const a2 = get(t, 'a2');
    expect(a2.notes).toBe('n');
    expect(a2.owners).toEqual(['Anurag', 'Ravi']);
    expect(a2.estCost).toBe(500);
    expect(kids(t, 'a2')).toEqual(['a2x']);
  });
  it('moving under a parent in another workstream moves the whole subtree there', () => {
    const t = ok(moveUnder(sample(), 'a', 'z', T2));
    for (const id of ['a', 'a1', 'a2', 'a2x']) expect(get(t, id).workstream).toBe('OTHER');
  });
  it('preserves input array order', () => {
    const t = ok(moveUnder(sample(), 'c', 'a', T2));
    expect(t.map((x) => x.id)).toEqual(sample().map((x) => x.id));
  });
});

describe('indent / outdent', () => {
  it('indent makes the task the last child of its previous sibling', () => {
    const t = ok(indent(sample(), 'b', T2));
    expect(get(t, 'b').parentId).toBe('a');
    expect(kids(t, 'a')).toEqual(['a1', 'a2', 'b']);
    expect(kids(t, 'b')).toEqual(['b1']);
  });
  it('indent fails on the first sibling', () => {
    expect(indent(sample(), 'a', T2).ok).toBe(false);
    expect(indent(sample(), 'a1', T2).ok).toBe(false);
  });
  it('outdent makes the task a sibling of its parent, right after it', () => {
    const t = ok(outdent(sample(), 'a1', T2));
    expect(get(t, 'a1').parentId).toBeNull();
    expect(kids(t, 'root:WS')).toEqual(['a', 'a1', 'b', 'c']);
    const t2 = ok(outdent(sample(), 'a2x', T2));
    expect(kids(t2, 'a')).toEqual(['a1', 'a2', 'a2x']);
  });
  it('outdent fails on a root task', () => {
    expect(outdent(sample(), 'a', T2).ok).toBe(false);
  });
  it('indent then outdent restores the structure', () => {
    let t = ok(indent(sample(), 'a2', T2));
    expect(get(t, 'a2').parentId).toBe('a1');
    t = ok(outdent(t, 'a2', T2));
    expect(kids(t, 'a')).toEqual(['a1', 'a2']);
    expect(kids(t, 'a2')).toEqual(['a2x']);
  });
});

describe('reorder (drag and drop)', () => {
  it('drops before / after a sibling', () => {
    let t = ok(moveRelative(sample(), 'c', 'a', 'before', T2));
    expect(kids(t, 'root:WS')).toEqual(['c', 'a', 'b']);
    t = ok(moveRelative(sample(), 'a', 'b', 'after', T2));
    expect(kids(t, 'root:WS')).toEqual(['b', 'a', 'c']);
  });
  it('drops between tasks of another parent (re-parent + position)', () => {
    const t = ok(moveRelative(sample(), 'c', 'a2', 'before', T2));
    expect(kids(t, 'a')).toEqual(['a1', 'c', 'a2']);
  });
  it('drops on a task to make it a child', () => {
    const t = ok(moveRelative(sample(), 'b1', 'a1', 'inside', T2));
    expect(get(t, 'b1').parentId).toBe('a1');
  });
  it('shift moves up and down among siblings', () => {
    let t = ok(shift(sample(), 'c', -1, T2));
    expect(kids(t, 'root:WS')).toEqual(['a', 'c', 'b']);
    t = ok(shift(t, 'a', 1, T2));
    expect(kids(t, 'root:WS')).toEqual(['c', 'a', 'b']);
  });
});

describe('add / update', () => {
  it('adds a subtask that inherits the parent workstream', () => {
    const t = ok(addTask(sample(), { title: ' New ', workstream: 'INBOX', parentId: 'z' }, 'n1', T2));
    const n = get(t, 'n1');
    expect(n.title).toBe('New');
    expect(n.workstream).toBe('OTHER');
    expect(kids(t, 'z')).toEqual(['n1']);
    expect(n.status).toBe('not_started');
  });
  it('inserts at an index', () => {
    const t = ok(addTask(sample(), { title: 'x', workstream: 'WS' }, 'x', T2, 1));
    expect(kids(t, 'root:WS')).toEqual(['a', 'x', 'b', 'c']);
  });
  it('rejects empty titles', () => {
    expect(addTask(sample(), { title: '  ', workstream: 'WS' }, 'x', T2).ok).toBe(false);
  });
  it('sets and clears completedAt with status', () => {
    let t = ok(updateTask(sample(), 'a1', { status: 'done' }, T2));
    expect(get(t, 'a1').completedAt).toBe(T2);
    t = ok(updateTask(t, 'a1', { status: 'in_progress' }, T2));
    expect(get(t, 'a1').completedAt).toBeUndefined();
    expect('completedAt' in get(t, 'a1')).toBe(false);
  });
  it('cannot change structure through updateTask', () => {
    const t = ok(updateTask(sample(), 'a1', { title: 'x', ...({ parentId: null } as object) }, T2));
    expect(get(t, 'a1').parentId).toBe('a');
  });
});

describe('delete', () => {
  it('cascade removes the whole subtree', () => {
    const t = ok(deleteTask(sample(), 'a', 'cascade', T2));
    expect(t.map((x) => x.id)).toEqual(['b', 'b1', 'c', 'z']);
    expect(kids(t, 'root:WS')).toEqual(['b', 'c']);
    expect(get(t, 'b').order).toBe(0);
  });
  it('promote moves children up one level into the deleted position', () => {
    const t = ok(deleteTask(sample(), 'a', 'promote', T2));
    expect(kids(t, 'root:WS')).toEqual(['a1', 'a2', 'b', 'c']);
    expect(kids(t, 'a2')).toEqual(['a2x']);
    const t2 = ok(deleteTask(sample(), 'a2', 'promote', T2));
    expect(kids(t2, 'a')).toEqual(['a1', 'a2x']);
  });
  it('removes dependencies on deleted tasks', () => {
    const start = sample().map((x) => (x.id === 'c' ? { ...x, blockedBy: ['a2x', 'b1'] } : x));
    const t = ok(deleteTask(start, 'a', 'cascade', T2));
    expect(get(t, 'c').blockedBy).toEqual(['b1']);
    const t2 = ok(deleteTask(t, 'b', 'cascade', T2));
    expect(get(t2, 'c').blockedBy).toBeUndefined();
  });
});

describe('change workstream', () => {
  it('moves the subtree by default', () => {
    const t = ok(changeWorkstream(sample(), 'a', 'OTHER', true, T2));
    expect(kids(t, 'root:OTHER')).toEqual(['z', 'a']);
    expect(get(t, 'a2x').workstream).toBe('OTHER');
  });
  it('can leave children behind in the old workstream', () => {
    const t = ok(changeWorkstream(sample(), 'a', 'OTHER', false, T2));
    expect(kids(t, 'root:OTHER')).toEqual(['z', 'a']);
    expect(kids(t, 'root:WS')).toEqual(['a1', 'a2', 'b', 'c']);
    expect(get(t, 'a2x').workstream).toBe('WS');
  });
  it('a subtask moved to another workstream becomes a main task there', () => {
    const t = ok(changeWorkstream(sample(), 'a2', 'OTHER', true, T2));
    expect(get(t, 'a2').parentId).toBeNull();
    expect(get(t, 'a2x').parentId).toBe('a2');
  });
});

describe('bulk move', () => {
  it('skips tasks whose ancestor is also selected', () => {
    const t = ok(moveManyUnder(sample(), ['a', 'a2', 'c'], 'b', T2));
    expect(kids(t, 'b')).toEqual(['b1', 'a', 'c']);
    expect(get(t, 'a2').parentId).toBe('a');
  });
  it('fails cleanly on a cycle', () => {
    expect(moveManyUnder(sample(), ['a'], 'a2x', NOW).ok).toBe(false);
  });
});
