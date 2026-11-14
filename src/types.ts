export type Status = 'not_started' | 'in_progress' | 'waiting' | 'blocked' | 'done' | 'dropped';
export type Priority = 'P0' | 'P1' | 'P2';

export const STATUSES: Status[] = ['not_started', 'in_progress', 'waiting', 'blocked', 'done', 'dropped'];
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2'];

export const STATUS_LABEL: Record<Status, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  done: 'Done',
  dropped: 'Dropped',
};

export interface TaskLink {
  label: string;
  url: string;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  workstream: string;
  parentId: string | null;
  order: number;
  status: Status;
  /** For parents: when true, `status` is shown instead of the derived roll-up status. */
  statusManual?: boolean;
  priority: Priority;
  /** People responsible. Empty or missing = unassigned. */
  owners?: string[];
  startDate?: string;
  dueDate?: string;
  estCost?: number;
  actualCost?: number;
  vendor?: string;
  blockedBy?: string[];
  tags?: string[];
  isMilestone?: boolean;
  links?: TaskLink[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** Normalised list of people on a task. */
export function ownersOf(t: Pick<Task, 'owners'>): string[] {
  return (t.owners ?? []).filter((o) => o.trim());
}

/** Add/remove a person (case-insensitive), keeping order and removing duplicates. */
export function withOwner(list: string[] | undefined, name: string): string[] {
  const n = name.trim();
  const cur = list ?? [];
  if (!n || cur.some((o) => o.toLowerCase() === n.toLowerCase())) return cur;
  return [...cur, n];
}
export function withoutOwner(list: string[] | undefined, name: string): string[] {
  return (list ?? []).filter((o) => o.toLowerCase() !== name.trim().toLowerCase());
}

export interface Workstream {
  code: string;
  name: string;
  color: string;
  order: number;
}

export interface Settings {
  expoStart: string;
  expoEnd: string;
  setupDate: string;
  teamMembers: string[];
}

export interface Snapshot {
  date: string;
  total: number;
  done: number;
}

/** Expo mode daily checklist completion: date -> taskId -> checked */
export type ExpoChecks = Record<string, Record<string, boolean>>;

export interface AppData {
  schemaVersion: number;
  tasks: Task[];
  workstreams: Workstream[];
  settings: Settings;
  snapshots: Snapshot[];
  expoChecks: ExpoChecks;
}

export interface GateDef {
  code: string;
  name: string;
  date: string;
  definition: string;
}
