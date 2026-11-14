import type { Priority, Status, Task } from '../types';
import { ownersOf } from '../types';
import { PRIORITIES, STATUSES } from '../types';
import type { RollupMap } from './progress';
import { isOverdue } from './progress';
import type { Settings } from '../types';

export interface Filters {
  ws: string[];
  owner: string[];
  status: Status[];
  pri: Priority[];
  gate: string[];
  overdue: boolean;
  cost: boolean;
  q: string;
}

export const EMPTY_FILTERS: Filters = { ws: [], owner: [], status: [], pri: [], gate: [], overdue: false, cost: false, q: '' };

const list = (p: URLSearchParams, k: string) => (p.get(k) ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export function filtersFromParams(p: URLSearchParams): Filters {
  return {
    ws: list(p, 'ws'),
    owner: list(p, 'owner'),
    status: list(p, 'status').filter((s): s is Status => (STATUSES as string[]).includes(s)),
    pri: list(p, 'pri').filter((s): s is Priority => (PRIORITIES as string[]).includes(s)),
    gate: list(p, 'gate'),
    overdue: p.get('overdue') === '1',
    cost: p.get('cost') === '1',
    q: p.get('q') ?? '',
  };
}

export function filtersToParams(f: Filters, base?: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base);
  const setList = (k: string, v: string[]) => (v.length ? p.set(k, v.join(',')) : p.delete(k));
  setList('ws', f.ws);
  setList('owner', f.owner);
  setList('status', f.status);
  setList('pri', f.pri);
  setList('gate', f.gate);
  f.overdue ? p.set('overdue', '1') : p.delete('overdue');
  f.cost ? p.set('cost', '1') : p.delete('cost');
  f.q.trim() ? p.set('q', f.q) : p.delete('q');
  return p;
}

export function activeFilterCount(f: Filters): number {
  return f.ws.length + f.owner.length + f.status.length + f.pri.length + f.gate.length + (f.overdue ? 1 : 0) + (f.cost ? 1 : 0);
}

export function hasAnyFilter(f: Filters): boolean {
  return activeFilterCount(f) > 0 || f.q.trim() !== '';
}

export const UNASSIGNED = '(unassigned)';

export function matchesFilters(
  t: Task,
  f: Filters,
  roll: RollupMap,
  today: string,
  settings?: Pick<Settings, 'expoEnd'>,
): boolean {
  const r = roll.get(t.id);
  if (f.ws.length && !f.ws.includes(t.workstream)) return false;
  if (f.owner.length) {
    const mine = ownersOf(t).map((o) => o.toLowerCase());
    const want = f.owner.map((x) => x.toLowerCase());
    const hit = want.some((w) => (w === UNASSIGNED ? mine.length === 0 : mine.includes(w)));
    if (!hit) return false;
  }
  if (f.status.length && !f.status.includes(r?.status ?? t.status)) return false;
  if (f.pri.length && !f.pri.includes(t.priority)) return false;
  if (f.gate.length && !f.gate.some((g) => t.tags?.includes(g))) return false;
  if (f.overdue && !isOverdue(t, r, today, settings)) return false;
  if (f.cost && !(t.estCost || t.actualCost)) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = `${t.title}\n${t.notes ?? ''}\n${t.id}`.toLowerCase();
    if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
  }
  return true;
}
