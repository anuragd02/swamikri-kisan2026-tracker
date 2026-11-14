/**
 * Progress roll-up and derived signals (A5, A6).
 *
 * - "Excluded" = the task is dropped, or any ancestor is dropped. Excluded tasks never count.
 * - "Counting leaf" = a non-excluded task with no non-excluded children. Only counting leaves carry
 *   progress (done = 100%, anything else = 0%).
 * - Parent progress = done counting leaves in its subtree / all counting leaves in its subtree.
 * - Parent status is derived from its leaves unless `statusManual` is set.
 */
import type { GateDef, Priority, Settings, Status, Task } from '../types';
import { addDays, diffDays } from './dates';
import { buildGroups } from './tree';

export interface Rollup {
  done: number;
  total: number;
  isLeaf: boolean;
  excluded: boolean;
  hasBlocked: boolean;
  /** Status to show for this task (own status for leaves, derived for parents). */
  status: Status;
  /** Latest child due date if later than this task's due date (warning). */
  childDueAfter?: string;
}

export type RollupMap = Map<string, Rollup>;

export function deriveParentStatus(done: number, total: number, anyStarted: boolean): Status {
  if (total > 0 && done === total) return 'done';
  if (anyStarted || done > 0) return 'in_progress';
  return 'not_started';
}

export function computeRollup(tasks: Task[]): RollupMap {
  const groups = buildGroups(tasks);
  const out: RollupMap = new Map();

  const visit = (t: Task, ancestorDropped: boolean): Rollup => {
    const excluded = ancestorDropped || t.status === 'dropped';
    const kids = groups.get(t.id) ?? [];
    const kidRolls = kids.map((k) => ({ k, r: visit(k, excluded) }));
    const live = kidRolls.filter((x) => !x.r.excluded);
    let r: Rollup;
    if (excluded) {
      r = { done: 0, total: 0, isLeaf: live.length === 0, excluded: true, hasBlocked: false, status: 'dropped' };
    } else if (live.length === 0) {
      r = {
        done: t.status === 'done' ? 1 : 0,
        total: 1,
        isLeaf: true,
        excluded: false,
        hasBlocked: t.status === 'blocked',
        status: t.status,
      };
    } else {
      let done = 0;
      let total = 0;
      let hasBlocked = false;
      let anyStarted = false;
      for (const { r: kr } of live) {
        done += kr.done;
        total += kr.total;
        hasBlocked ||= kr.hasBlocked;
        anyStarted ||= kr.status === 'in_progress' || kr.status === 'done';
      }
      const derived = deriveParentStatus(done, total, anyStarted);
      r = {
        done,
        total,
        isLeaf: false,
        excluded: false,
        hasBlocked,
        status: t.statusManual ? t.status : derived,
      };
    }
    if (t.dueDate) {
      const late = kids
        .filter((k) => k.dueDate && k.dueDate > t.dueDate! && k.status !== 'dropped')
        .map((k) => k.dueDate!)
        .sort();
      if (late.length) r.childDueAfter = late[late.length - 1];
    }
    out.set(t.id, r);
    return r;
  };

  for (const t of tasks) if (t.parentId === null) visit(t, false);
  // Orphans (should not exist, but never crash): treat as roots.
  for (const t of tasks) if (!out.has(t.id)) visit(t, false);
  return out;
}

export function isClosed(status: Status): boolean {
  return status === 'done' || status === 'dropped';
}

/** Daily expo checklist tasks are only overdue after the expo ends. */
export function effectiveDue(t: Task, settings?: Pick<Settings, 'expoEnd'>): string | undefined {
  if (!t.dueDate) return undefined;
  if (settings && t.tags?.includes('daily') && settings.expoEnd > t.dueDate) return settings.expoEnd;
  return t.dueDate;
}

export function isOverdue(t: Task, r: Rollup | undefined, today: string, settings?: Pick<Settings, 'expoEnd'>): boolean {
  const due = effectiveDue(t, settings);
  if (!due || !r || r.excluded) return false;
  return due < today && !isClosed(r.status);
}

/** Due today or within the next `days` days, and not done. */
export function isDueSoon(t: Task, r: Rollup | undefined, today: string, days = 3): boolean {
  if (!t.dueDate || !r || r.excluded || isClosed(r.status)) return false;
  return t.dueDate >= today && t.dueDate <= addDays(today, days);
}

export interface Percent {
  done: number;
  total: number;
  pct: number;
}

export function pct(done: number, total: number): Percent {
  return { done, total, pct: total === 0 ? 0 : Math.round((done / total) * 100) };
}

export function countingLeaves(tasks: Task[], roll: RollupMap): Task[] {
  return tasks.filter((t) => {
    const r = roll.get(t.id);
    return r && !r.excluded && r.isLeaf;
  });
}

export function overallProgress(tasks: Task[], roll: RollupMap, priority?: Priority): Percent {
  const leaves = countingLeaves(tasks, roll).filter((t) => !priority || t.priority === priority);
  return pct(leaves.filter((t) => t.status === 'done').length, leaves.length);
}

export function unmetDependencies(t: Task, byId: Map<string, Task>, roll: RollupMap): Task[] {
  return (t.blockedBy ?? [])
    .map((id) => byId.get(id))
    .filter((d): d is Task => !!d && !isClosed(roll.get(d.id)?.status ?? d.status));
}

export type GateState = 'done' | 'on_track' | 'at_risk' | 'missed';

export interface GateStatus {
  gate: GateDef;
  date: string;
  state: GateState;
  done: number;
  total: number;
  open: number;
}

/**
 * Gate status. Tasks carry their gate as a tag (e.g. "G3"). Counting leaves with that tag
 * decide the gate. Date comes from the gate's milestone task if present, so editing the
 * milestone's due date moves the gate.
 */
export function gateStatuses(tasks: Task[], roll: RollupMap, gates: GateDef[], today: string): GateStatus[] {
  return gates.map((g) => {
    const milestones = tasks.filter((t) => t.isMilestone && t.tags?.includes(g.code) && t.dueDate);
    const date = milestones.length ? milestones.map((m) => m.dueDate!).sort()[0] : g.date;
    const leaves = countingLeaves(tasks, roll).filter((t) => t.tags?.includes(g.code));
    const done = leaves.filter((t) => t.status === 'done').length;
    const total = leaves.length;
    let state: GateState;
    if (total > 0 && done === total) state = 'done';
    else if (today > date) state = 'missed';
    else if (diffDays(today, date) <= 2) state = 'at_risk';
    else state = 'on_track';
    return { gate: g, date, state, done, total, open: total - done };
  });
}

export interface WorkstreamStat {
  code: string;
  done: number;
  total: number;
  pct: number;
  overdue: number;
  next?: Task;
}

export function workstreamStats(
  tasks: Task[],
  roll: RollupMap,
  today: string,
  settings?: Pick<Settings, 'expoEnd'>,
): Map<string, WorkstreamStat> {
  const out = new Map<string, WorkstreamStat>();
  for (const t of countingLeaves(tasks, roll)) {
    let s = out.get(t.workstream);
    if (!s) out.set(t.workstream, (s = { code: t.workstream, done: 0, total: 0, pct: 0, overdue: 0 }));
    s.total++;
    if (t.status === 'done') s.done++;
    if (isOverdue(t, roll.get(t.id), today, settings)) s.overdue++;
    if (t.status !== 'done' && t.dueDate && t.dueDate >= today) {
      if (!s.next || t.dueDate < s.next.dueDate! || (t.dueDate === s.next.dueDate && priRank(t) < priRank(s.next))) {
        s.next = t;
      }
    }
  }
  for (const s of out.values()) s.pct = pct(s.done, s.total).pct;
  return out;
}

const priRank = (t: Task) => ({ P0: 0, P1: 1, P2: 2 })[t.priority];

export function byDueThenPriority(a: Task, b: Task): number {
  const da = a.dueDate ?? '9999';
  const db = b.dueDate ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  return priRank(a) - priRank(b);
}

export interface DashboardLists {
  overdue: Task[];
  dueSoon: Task[];
  blockedWaiting: Task[];
  p0NotStarted: Task[];
}

/** Dashboard lists use counting leaves (actionable items) so parents are not double counted. */
export function dashboardLists(
  tasks: Task[],
  roll: RollupMap,
  today: string,
  settings?: Pick<Settings, 'expoEnd'>,
): DashboardLists {
  const leaves = countingLeaves(tasks, roll);
  return {
    overdue: leaves.filter((t) => isOverdue(t, roll.get(t.id), today, settings)).sort(byDueThenPriority),
    dueSoon: leaves.filter((t) => isDueSoon(t, roll.get(t.id), today)).sort(byDueThenPriority),
    blockedWaiting: leaves.filter((t) => t.status === 'blocked' || t.status === 'waiting').sort(byDueThenPriority),
    p0NotStarted: leaves.filter((t) => t.priority === 'P0' && t.status === 'not_started').sort(byDueThenPriority),
  };
}

export function spend(tasks: Task[], roll: RollupMap): { estimated: number; actual: number } {
  let estimated = 0;
  let actual = 0;
  for (const t of tasks) {
    if (roll.get(t.id)?.excluded) continue;
    estimated += t.estCost ?? 0;
    actual += t.actualCost ?? 0;
  }
  return { estimated, actual };
}
