import { describe, expect, it } from 'vitest';
import type { GateDef, Task } from '../types';
import {
  computeRollup,
  dashboardLists,
  gateStatuses,
  isDueSoon,
  isOverdue,
  overallProgress,
  spend,
  workstreamStats,
} from './progress';
import { mk, sample } from './fixtures.test-util';

const set = (tasks: Task[], id: string, patch: Partial<Task>) => tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));

describe('roll-up', () => {
  it('counts leaves only', () => {
    const r = computeRollup(sample());
    expect(r.get('a')).toMatchObject({ done: 0, total: 2, isLeaf: false, status: 'not_started' });
    expect(r.get('a2')).toMatchObject({ total: 1, isLeaf: false });
    expect(r.get('a1')).toMatchObject({ total: 1, isLeaf: true });
    expect(overallProgress(sample(), r)).toEqual({ done: 0, total: 5, pct: 0 });
  });
  it('derives parent status from leaves', () => {
    let t = set(sample(), 'a1', { status: 'done' });
    let r = computeRollup(t);
    expect(r.get('a')!.status).toBe('in_progress');
    expect(r.get('a')).toMatchObject({ done: 1, total: 2 });
    t = set(t, 'a2x', { status: 'done' });
    r = computeRollup(t);
    expect(r.get('a')!.status).toBe('done');
    expect(r.get('a2')!.status).toBe('done');
    expect(overallProgress(t, r).pct).toBe(40);
  });
  it('in_progress leaf makes the parent in progress; blocked leaf sets the blocked flag', () => {
    let r = computeRollup(set(sample(), 'a1', { status: 'in_progress' }));
    expect(r.get('a')!.status).toBe('in_progress');
    r = computeRollup(set(sample(), 'a2x', { status: 'blocked' }));
    expect(r.get('a')!.hasBlocked).toBe(true);
    expect(r.get('a')!.status).toBe('not_started');
  });
  it('manual override on a parent wins', () => {
    const r = computeRollup(set(sample(), 'a', { status: 'waiting', statusManual: true }));
    expect(r.get('a')!.status).toBe('waiting');
  });
  it('excludes dropped tasks and their subtrees from all counts', () => {
    let t = set(sample(), 'a2', { status: 'dropped' });
    let r = computeRollup(t);
    expect(r.get('a')).toMatchObject({ total: 1 });
    expect(r.get('a2x')!.excluded).toBe(true);
    expect(overallProgress(t, r).total).toBe(4);
    t = set(t, 'a1', { status: 'done' });
    r = computeRollup(t);
    expect(r.get('a')!.status).toBe('done');
  });
  it('a parent whose children are all dropped counts as a leaf itself', () => {
    const t = set(sample(), 'b1', { status: 'dropped' });
    const r = computeRollup(t);
    expect(r.get('b')).toMatchObject({ isLeaf: true, total: 1 });
  });
  it('P0-only percentage', () => {
    let t = set(sample(), 'a1', { priority: 'P0', status: 'done' });
    t = set(t, 'b1', { priority: 'P0' });
    expect(overallProgress(t, computeRollup(t), 'P0')).toEqual({ done: 1, total: 2, pct: 50 });
  });
  it('flags a child due after its parent', () => {
    let t = set(sample(), 'a', { dueDate: '2026-11-20' });
    t = set(t, 'a1', { dueDate: '2026-11-22' });
    expect(computeRollup(t).get('a')!.childDueAfter).toBe('2026-11-22');
  });
});

describe('overdue / due soon', () => {
  const today = '2026-11-20';
  it('overdue = due before today and not done/dropped', () => {
    const t = [
      mk('x', null, 0, { dueDate: '2026-11-19' }),
      mk('y', null, 1, { dueDate: '2026-11-19', status: 'done' }),
      mk('z', null, 2, { dueDate: '2026-11-19', status: 'dropped' }),
      mk('w', null, 3, { dueDate: '2026-11-20' }),
    ];
    const r = computeRollup(t);
    expect(t.map((x) => isOverdue(x, r.get(x.id), today))).toEqual([true, false, false, false]);
  });
  it('a parent is overdue only if its derived status is not done', () => {
    const t = [mk('p', null, 0, { dueDate: '2026-11-10' }), mk('c', 'p', 0, { status: 'done' })];
    const r = computeRollup(t);
    expect(isOverdue(t[0], r.get('p'), today)).toBe(false);
  });
  it('due soon = today .. today+3, not done', () => {
    const t = ['2026-11-19', '2026-11-20', '2026-11-23', '2026-11-24'].map((d, i) => mk(`t${i}`, null, i, { dueDate: d }));
    const r = computeRollup(t);
    expect(t.map((x) => isDueSoon(x, r.get(x.id), today))).toEqual([false, true, true, false]);
  });
  it('daily expo checklist tasks are not overdue until the expo ends', () => {
    const t = [mk('d', null, 0, { dueDate: '2026-12-09', tags: ['daily'] })];
    const r = computeRollup(t);
    const s = { expoEnd: '2026-12-13' };
    expect(isOverdue(t[0], r.get('d'), '2026-12-11', s)).toBe(false);
    expect(isOverdue(t[0], r.get('d'), '2026-12-14', s)).toBe(true);
  });
  it('dashboard lists use leaves', () => {
    const t = [
      mk('p', null, 0, { dueDate: '2026-11-10', priority: 'P0' }),
      mk('c1', 'p', 0, { dueDate: '2026-11-10', priority: 'P0' }),
      mk('c2', 'p', 1, { dueDate: '2026-11-21', status: 'waiting' }),
    ];
    const l = dashboardLists(t, computeRollup(t), today);
    expect(l.overdue.map((x) => x.id)).toEqual(['c1']);
    expect(l.dueSoon.map((x) => x.id)).toEqual(['c2']);
    expect(l.blockedWaiting.map((x) => x.id)).toEqual(['c2']);
    expect(l.p0NotStarted.map((x) => x.id)).toEqual(['c1']);
  });
});

describe('gates, workstreams, spend', () => {
  const gates: GateDef[] = [
    { code: 'G1', name: 'One', date: '2026-11-18', definition: '' },
    { code: 'G2', name: 'Two', date: '2026-11-21', definition: '' },
  ];
  const base = [
    mk('m1', null, 0, { tags: ['G1'], isMilestone: true, dueDate: '2026-11-18' }),
    mk('t1', null, 1, { tags: ['G1'], dueDate: '2026-11-17' }),
    mk('t2', null, 2, { tags: ['G2'], dueDate: '2026-11-20', estCost: 1000, actualCost: 400 }),
    mk('t3', null, 3, { tags: ['G2'], status: 'dropped', estCost: 999 }),
  ];
  it('gate states', () => {
    const r = computeRollup(base);
    expect(gateStatuses(base, r, gates, '2026-11-14').map((g) => g.state)).toEqual(['on_track', 'on_track']);
    expect(gateStatuses(base, r, gates, '2026-11-16').map((g) => g.state)).toEqual(['at_risk', 'on_track']);
    expect(gateStatuses(base, r, gates, '2026-11-19').map((g) => g.state)).toEqual(['missed', 'at_risk']);
    const done = base.map((t) => (t.tags?.includes('G1') ? { ...t, status: 'done' as const } : t));
    expect(gateStatuses(done, computeRollup(done), gates, '2026-11-19')[0].state).toBe('done');
  });
  it('gate date follows the milestone task due date', () => {
    const moved = base.map((t) => (t.id === 'm1' ? { ...t, dueDate: '2026-11-25' } : t));
    expect(gateStatuses(moved, computeRollup(moved), gates, '2026-11-14')[0].date).toBe('2026-11-25');
  });
  it('workstream stats and spend', () => {
    const r = computeRollup(base);
    const ws = workstreamStats(base, r, '2026-11-18').get('WS')!;
    expect(ws).toMatchObject({ done: 0, total: 3, overdue: 1 });
    expect(ws.next?.id).toBe('m1');
    expect(spend(base, r)).toEqual({ estimated: 1000, actual: 400 });
  });
});
