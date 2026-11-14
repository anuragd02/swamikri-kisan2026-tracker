import { describe, expect, it } from 'vitest';
import { parseDueToken, parseQuickAdd } from './quickadd';
import { applyUndo, diffTasks } from './undo';
import { deleteTask, updateTask } from './tree';
import { sample } from './fixtures.test-util';
import { todayIST } from './dates';

const today = '2026-11-14'; // Saturday
const ctx = {
  today,
  workstreams: ['STALL', 'DESIGN', 'ASTRA', 'TREAD', 'INBOX'],
  owners: ['Anurag'],
  tasks: [
    { id: 'design-01', title: 'Visiting cards', workstream: 'DESIGN' },
    { id: 'stall-01', title: 'Finalise the stall dimensions and location', workstream: 'STALL' },
    { id: 'astra-10', title: 'Load it on tractor and take video', workstream: 'ASTRA' },
    { id: 'astra-11', title: 'Take video of actual crop detection', workstream: 'ASTRA' },
  ],
};

describe('due date tokens', () => {
  it.each([
    ['nov30', '2026-11-30'],
    ['Nov30', '2026-11-30'],
    ['30nov', '2026-11-30'],
    ['dec-2', '2026-12-02'],
    ['30/11', '2026-11-30'],
    ['3/12/2026', '2026-12-03'],
    ['2026-11-30', '2026-11-30'],
    ['today', '2026-11-14'],
    ['tomorrow', '2026-11-15'],
    ['mon', '2026-11-16'],
    ['sat', '2026-11-21'],
    ['friday', '2026-11-20'],
    ['+3', '2026-11-17'],
    ['jan5', '2027-01-05'],
  ])('%s -> %s', (raw, iso) => {
    expect(parseDueToken(raw, today)).toBe(iso);
  });
  it('rejects nonsense and impossible dates', () => {
    expect(parseDueToken('soon', today)).toBeNull();
    expect(parseDueToken('31/11', today)).toBeNull();
    expect(parseDueToken('2026-02-30', today)).toBeNull();
  });
});

describe('quick-add parsing', () => {
  it('parses the spec example', () => {
    const r = parseQuickAdd('Print QR stickers #design @anurag !p1 due:nov30 ^design-01', ctx);
    expect(r).toMatchObject({
      title: 'Print QR stickers',
      workstream: 'DESIGN',
      owners: ['Anurag'],
      priority: 'P1',
      dueDate: '2026-11-30',
      parentId: 'design-01',
      warnings: [],
    });
  });
  it('defaults to INBOX with no workstream', () => {
    const r = parseQuickAdd('Buy zip ties', ctx);
    expect(r.workstream).toBe('INBOX');
    expect(r.workstreamGiven).toBe(false);
    expect(r.title).toBe('Buy zip ties');
  });
  it('supports tokens anywhere in the line', () => {
    const r = parseQuickAdd('!p0 #astra Weld boom due:tomorrow', ctx);
    expect(r).toMatchObject({ title: 'Weld boom', workstream: 'ASTRA', priority: 'P0', dueDate: '2026-11-15' });
  });
  it('parent by quoted title fragment, inherits its workstream', () => {
    const r = parseQuickAdd('Call vendor ^"stall dimensions" #design', ctx);
    expect(r.parentId).toBe('stall-01');
    expect(r.workstream).toBe('STALL');
    expect(r.warnings.length).toBe(1);
  });
  it('warns on ambiguous parent and unknown workstream', () => {
    const r = parseQuickAdd('Thing ^"take video" #nope', ctx);
    expect(r.parentId).toBeUndefined();
    expect(r.workstream).toBe('INBOX');
    expect(r.warnings.length).toBe(2);
  });
  it('quoted owner and bad date', () => {
    const r = parseQuickAdd('Thing @"Ravi K" due:someday', ctx);
    expect(r.owners).toEqual(['Ravi K']);
    expect(r.dueDate).toBeUndefined();
    expect(r.warnings.length).toBe(1);
  });
  it('several people on one task, de-duplicated, canonical case', () => {
    const r = parseQuickAdd('Shoot video @anurag @Ravi @"Priya S" @ANURAG #astra', ctx);
    expect(r.owners).toEqual(['Anurag', 'Ravi', 'Priya S']);
    expect(r.title).toBe('Shoot video');
  });
  it('leaves #numbers and emails in the title', () => {
    const r = parseQuickAdd('Fix issue #3 mail a@b.com', ctx);
    expect(r.title).toBe('Fix issue #3 mail a@b.com');
  });
});

describe('undo patches', () => {
  const NOW = '2026-11-15T00:00:00.000Z';
  it('undo of a cascade delete restores tasks in place', () => {
    const before = sample();
    const r = deleteTask(before, 'a', 'cascade', NOW);
    if (!r.ok) throw new Error();
    const restored = applyUndo(r.tasks, diffTasks(before, r.tasks));
    expect(restored).toEqual(before);
  });
  it('undo of a promote delete keeps unrelated later edits', () => {
    const before = sample();
    const r = deleteTask(before, 'a', 'promote', NOW);
    if (!r.ok) throw new Error();
    const patch = diffTasks(before, r.tasks);
    const later = updateTask(r.tasks, 'c', { title: 'edited later' }, NOW);
    if (!later.ok) throw new Error();
    const restored = applyUndo(later.tasks, patch);
    expect(restored.find((t) => t.id === 'c')!.title).toBe('edited later');
    expect(restored.find((t) => t.id === 'a1')!.parentId).toBe('a');
    expect(restored.map((t) => t.id)).toEqual(before.map((t) => t.id));
  });
});

describe('today in Asia/Kolkata', () => {
  it('uses IST, not UTC', () => {
    // 20:00 UTC on 14 Nov = 01:30 IST on 15 Nov
    expect(todayIST(new Date('2026-11-14T20:00:00Z'))).toBe('2026-11-15');
    expect(todayIST(new Date('2026-11-14T18:00:00Z'))).toBe('2026-11-14');
  });
});
