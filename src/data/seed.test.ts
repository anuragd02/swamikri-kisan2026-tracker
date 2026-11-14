import { describe, expect, it } from 'vitest';
import { GATES, SEED_SETTINGS, SEED_TASKS, SEED_WORKSTREAMS } from './seed';
import { validateTree } from '../lib/tree';
import { computeRollup, overallProgress } from '../lib/progress';
import { isIsoDate } from '../lib/dates';
import { createSeedData, mergeData, migrate } from '../storage/migrate';
import { toCsv } from '../lib/csv';

describe('seed task list', () => {
  it('loads exactly 33 main tasks with a valid tree', () => {
    expect(SEED_TASKS.length).toBe(33);
    expect(validateTree(SEED_TASKS)).toEqual([]);
    expect(SEED_TASKS.every((t) => t.parentId === null)).toBe(true);
  });
  it('every task: known category, priority, valid due date, not started, Anurag on it', () => {
    const codes = new Set(SEED_WORKSTREAMS.map((w) => w.code));
    for (const t of SEED_TASKS) {
      expect(codes.has(t.workstream), t.id).toBe(true);
      expect(['P0', 'P1', 'P2']).toContain(t.priority);
      expect(isIsoDate(t.dueDate), t.id).toBe(true);
      expect(t.status).toBe('not_started');
      expect(t.owners).toEqual(['Anurag']);
    }
  });
  it('categories, counts and listed order', () => {
    expect(SEED_WORKSTREAMS.map((w) => [w.code, w.name])).toEqual([
      ['STALL', 'Stall Inputs'],
      ['DESIGN', 'Design'],
      ['ASTRA', 'ASTRA'],
      ['TREAD', 'Treadmill Setup'],
      ['INBOX', 'Inbox (untriaged)'],
    ]);
    const count = (c: string) => SEED_TASKS.filter((t) => t.workstream === c).length;
    expect([count('STALL'), count('DESIGN'), count('ASTRA'), count('TREAD')]).toEqual([4, 11, 13, 5]);
    for (const c of ['STALL', 'DESIGN', 'ASTRA', 'TREAD']) {
      const list = SEED_TASKS.filter((t) => t.workstream === c);
      expect(list.map((t) => t.order)).toEqual(list.map((_, i) => i));
      expect(list.map((t) => t.id)).toEqual(list.map((_, i) => `${c.toLowerCase()}-${String(i + 1).padStart(2, '0')}`));
    }
    expect(new Set(SEED_WORKSTREAMS.map((w) => w.color)).size).toBe(5);
  });
  it('matches the brief exactly for spot-checked rows', () => {
    const byId = new Map(SEED_TASKS.map((t) => [t.id, t]));
    expect(byId.get('stall-01')).toMatchObject({ title: 'Finalise the stall dimensions and location', dueDate: '2026-11-17', priority: 'P0' });
    expect(byId.get('design-07')!.title).toBe('Back wall design with the Swamikri logo and one-line positioning');
    expect(byId.get('astra-12')).toMatchObject({ title: 'New solenoid sprayers if needed', dueDate: '2026-11-20', priority: 'P1' });
    expect(byId.get('tread-05')).toMatchObject({ title: 'Assemble relay / lights on treadmill', dueDate: '2026-11-27' });
  });
  it('starts at 0% overall; no gates; settings', () => {
    expect(overallProgress(SEED_TASKS, computeRollup(SEED_TASKS)).pct).toBe(0);
    expect(GATES).toEqual([]);
    expect(SEED_SETTINGS.setupDate).toBe('2026-12-07');
    expect(SEED_SETTINGS.teamMembers).toEqual(['Anurag']);
  });
});

describe('migration v2 -> v3 (assign owner)', () => {
  it('assigns Anurag to tasks without an owner, keeps existing owners, adds to team', () => {
    const v2 = createSeedData();
    v2.schemaVersion = 2;
    v2.tasks = v2.tasks.map((t, i) => {
      const { owners: _o, ...rest } = t;
      return (i === 0 ? { ...rest, owner: 'Ravi' } : rest) as typeof t;
    });
    v2.settings.teamMembers = ['Ravi'];
    const m = migrate(JSON.parse(JSON.stringify(v2)));
    expect(m.schemaVersion).toBe(4);
    expect(m.tasks[0].owners).toEqual(['Ravi']);
    expect(m.tasks.slice(1).every((t) => t.owners?.join() === 'Anurag')).toBe(true);
    expect(m.settings.teamMembers).toEqual(['Anurag', 'Ravi']);
  });
});

describe('migration from the old 325-task plan (schema v1)', () => {
  it('replaces seed tasks, keeps settings and team-added tasks (in INBOX)', () => {
    const v1 = {
      schemaVersion: 1,
      tasks: [
        { id: 'pm-01', title: 'Old seed', workstream: 'PM', parentId: null, order: 0, status: 'done', priority: 'P0', createdAt: '2026-11-14T00:00:00.000Z', updatedAt: 'x' },
        { id: 'pm-01-01', title: 'Old seed child', workstream: 'PM', parentId: 'pm-01', order: 0, status: 'not_started', priority: 'P0', createdAt: '2026-11-14T00:00:00.000Z', updatedAt: 'x' },
        { id: 'abc', title: 'Team added', workstream: 'PM', parentId: 'pm-01', order: 1, status: 'in_progress', priority: 'P1', owner: 'Ravi', blockedBy: ['pm-01-01'], createdAt: '2026-11-15T09:00:00.000Z', updatedAt: 'y' },
      ],
      workstreams: [{ code: 'PM', name: 'PM', color: '#000', order: 0 }],
      settings: { ...SEED_SETTINGS, teamMembers: ['Ravi'] },
      snapshots: [{ date: '2026-11-14', total: 286, done: 0 }],
      expoChecks: {},
    };
    const m = migrate(v1);
    expect(m.schemaVersion).toBe(4);
    expect(m.tasks.length).toBe(34);
    expect(m.tasks.find((t) => t.id === 'pm-01')).toBeUndefined();
    expect(m.tasks.find((t) => t.id === 'abc')).toMatchObject({ workstream: 'INBOX', parentId: null, owners: ['Ravi'], status: 'in_progress' });
    expect(m.tasks.find((t) => t.id === 'abc')!.blockedBy).toBeUndefined();
    expect(m.settings.teamMembers).toEqual(['Anurag', 'Ravi']);
    expect(m.snapshots).toEqual([]);
    expect(m.workstreams.map((w) => w.code)).toEqual(['STALL', 'DESIGN', 'ASTRA', 'TREAD', 'INBOX']);
    expect(validateTree(m.tasks)).toEqual([]);
  });
});

describe('persistence', () => {
  it('JSON export then import reproduces the exact state', () => {
    const data = createSeedData();
    data.tasks[3] = { ...data.tasks[3], status: 'done', owners: ['Anurag', 'Ravi'], estCost: 1200, completedAt: '2026-11-15T00:00:00.000Z' };
    data.snapshots.push({ date: '2026-11-14', total: 300, done: 1 });
    data.expoChecks['2026-12-09'] = { 'onsite-03-01': true };
    data.settings.teamMembers = ['Anurag'];
    const exported = JSON.stringify(data);
    const imported = migrate(JSON.parse(exported));
    expect(imported).toEqual(data);
    expect(JSON.stringify(imported)).toBe(exported);
  });
  it('migrates a v0 backup without schemaVersion', () => {
    const { schemaVersion: _v, snapshots: _s, expoChecks: _e, ...v0 } = createSeedData();
    const m = migrate(v0);
    expect(m.schemaVersion).toBe(4);
    expect(m.snapshots).toEqual([]);
    expect(m.expoChecks).toEqual({});
  });
  it('rejects garbage and future schema versions', () => {
    expect(() => migrate('nope')).toThrow();
    expect(() => migrate({ tasks: 'x' })).toThrow();
    expect(() => migrate({ ...createSeedData(), schemaVersion: 99 })).toThrow(/newer/);
  });
  it('merge by id: incoming wins, new tasks appended', () => {
    const a = createSeedData();
    const b = createSeedData();
    b.tasks[0] = { ...b.tasks[0], status: 'done' };
    b.tasks.push({ ...b.tasks[1], id: 'new-1', title: 'New', parentId: null });
    const m = mergeData(a, b);
    expect(m.tasks[0].status).toBe('done');
    expect(m.tasks.length).toBe(a.tasks.length + 1);
  });
  it('CSV has a path column and one row per task', () => {
    const csv = toCsv(SEED_TASKS, SEED_WORKSTREAMS).split('\r\n');
    expect(csv[0].startsWith('id,path,title')).toBe(true);
    expect(csv.length).toBe(SEED_TASKS.length + 1);
    expect(csv.find((l) => l.startsWith('design-07,'))).toContain('Design > Back wall design with the Swamikri logo and one-line positioning');
  });
});
