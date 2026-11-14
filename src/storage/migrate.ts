import type { AppData, Settings, Task, Workstream } from '../types';
import { SEED_OWNER, SEED_SETTINGS, SEED_TASKS, SEED_WORKSTREAMS } from '../data/seed';
import { validateTree } from '../lib/tree';

export const SCHEMA_VERSION = 4;

/** createdAt shared by every seed task; anything else was added by the team. */
const SEED_CREATED = '2026-11-14T00:00:00.000Z';

export function createSeedData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks: structuredClone(SEED_TASKS),
    workstreams: structuredClone(SEED_WORKSTREAMS),
    settings: structuredClone(SEED_SETTINGS),
    snapshots: [],
    expoChecks: {},
  };
}


type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Bring any stored or imported JSON up to the current schema.
 * Throws with a readable message if the data cannot be used.
 */
export function migrate(input: unknown): AppData {
  if (!isObj(input)) throw new Error('Not a tracker backup (expected a JSON object).');
  let data: Raw = { ...input };
  let version = typeof data.schemaVersion === 'number' ? data.schemaVersion : 0;
  if (version > SCHEMA_VERSION) {
    throw new Error(`This backup was made by a newer version of the tracker (schema ${version}).`);
  }
  // v0 -> v1: early drafts had no schemaVersion / expoChecks / snapshots.
  if (version === 0) {
    data = { snapshots: [], expoChecks: {}, ...data, schemaVersion: 2 };
    version = 2;
  }
  // v1 -> v2: the 325-task plan was replaced by the 33-task list in 4 categories.
  // Seed tasks are swapped for the new list; tasks the team added themselves are kept,
  // as main tasks in INBOX (their old parents may no longer exist). Settings are kept.
  if (version === 1) {
    const old = Array.isArray(data.tasks) ? (data.tasks as Task[]) : [];
    const kept = old
      .filter((t) => t && t.createdAt !== SEED_CREATED)
      .map((t, i): Task => ({ ...t, workstream: 'INBOX', parentId: null, order: i, blockedBy: undefined }))
      .map((t) => JSON.parse(JSON.stringify(t)) as Task);
    data = {
      ...data,
      tasks: [...structuredClone(SEED_TASKS), ...kept],
      workstreams: structuredClone(SEED_WORKSTREAMS),
      snapshots: [],
      expoChecks: {},
      schemaVersion: 2,
    };
    version = 2;
  }
  // v2 -> v3: every task without an owner is assigned to the default owner (Anurag),
  // who is also added to the team list. Owners already set are left alone.
  if (version === 2) {
    const settings = isObj(data.settings) ? (data.settings as Partial<Settings>) : {};
    const team = Array.isArray(settings.teamMembers) ? settings.teamMembers : [];
    data = {
      ...data,
      // Leave malformed task data untouched so validation below still rejects it.
      tasks:
        SEED_OWNER && Array.isArray(data.tasks)
          ? (data.tasks as Raw[]).map((t) => (isObj(t) && !(typeof t.owner === 'string' && t.owner.trim()) ? { ...t, owner: SEED_OWNER } : t))
          : data.tasks,
      settings: {
        ...settings,
        teamMembers: SEED_OWNER && !team.some((m) => m.toLowerCase() === SEED_OWNER.toLowerCase()) ? [SEED_OWNER, ...team] : team,
      },
      schemaVersion: 3,
    };
    version = 3;
  }
  // v3 -> v4: a task can have several people. `owner: "A"` becomes `owners: ["A"]`.
  if (version === 3) {
    data = {
      ...data,
      tasks: Array.isArray(data.tasks)
        ? (data.tasks as Raw[]).map((t) => {
            if (!isObj(t) || !('owner' in t)) return t;
            const { owner, ...rest } = t;
            return typeof owner === 'string' && owner.trim() ? { ...rest, owners: [owner.trim()] } : rest;
          })
        : data.tasks,
      schemaVersion: 4,
    };
    version = 4;
  }
  // Future migrations go here: if (version === 4) { ...; version = 5; }

  if (!Array.isArray(data.tasks)) throw new Error('Backup has no task list.');
  const tasks = data.tasks as Task[];
  for (const t of tasks) {
    if (!isObj(t) || typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.workstream !== 'string') {
      throw new Error('Backup contains a malformed task.');
    }
  }
  const errors = validateTree(tasks).filter((e) => !e.startsWith('Dangling'));
  if (errors.length) throw new Error(`Backup has an invalid task tree: ${errors.slice(0, 3).join('; ')}`);

  const workstreams = (Array.isArray(data.workstreams) ? data.workstreams : SEED_WORKSTREAMS) as Workstream[];
  if (!workstreams.some((w) => w.code === 'INBOX')) {
    workstreams.push({ ...SEED_WORKSTREAMS.find((w) => w.code === 'INBOX')!, order: workstreams.length });
  }
  // Any workstream referenced by a task but missing from the list gets a neutral entry.
  for (const code of new Set(tasks.map((t) => t.workstream))) {
    if (!workstreams.some((w) => w.code === code)) {
      workstreams.push({ code, name: code, color: '#6B7280', order: workstreams.length });
    }
  }
  const settings: Settings = { ...SEED_SETTINGS, ...(isObj(data.settings) ? (data.settings as Partial<Settings>) : {}) };
  return {
    schemaVersion: SCHEMA_VERSION,
    tasks,
    workstreams,
    settings,
    snapshots: Array.isArray(data.snapshots) ? (data.snapshots as AppData['snapshots']) : [],
    expoChecks: isObj(data.expoChecks) ? (data.expoChecks as AppData['expoChecks']) : {},
  };
}

/** Merge an imported backup into current data by id. Imported versions win on conflicts. */
export function mergeData(current: AppData, incoming: AppData): AppData {
  const incomingById = new Map(incoming.tasks.map((t) => [t.id, t]));
  const tasks = current.tasks.map((t) => incomingById.get(t.id) ?? t);
  const have = new Set(current.tasks.map((t) => t.id));
  for (const t of incoming.tasks) if (!have.has(t.id)) tasks.push(t);
  const workstreams = [...current.workstreams];
  for (const w of incoming.workstreams) if (!workstreams.some((x) => x.code === w.code)) workstreams.push(w);
  const snapshots = new Map(current.snapshots.map((s) => [s.date, s]));
  for (const s of incoming.snapshots) snapshots.set(s.date, s);
  const expoChecks = structuredClone(current.expoChecks);
  for (const [d, m] of Object.entries(incoming.expoChecks)) expoChecks[d] = { ...(expoChecks[d] ?? {}), ...m };
  const merged: AppData = {
    ...current,
    tasks,
    workstreams,
    settings: {
      ...current.settings,
      teamMembers: [...new Set([...current.settings.teamMembers, ...incoming.settings.teamMembers])],
    },
    snapshots: [...snapshots.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    expoChecks,
  };
  // Re-validate: merging can create orphans if the two copies were restructured differently.
  const errs = validateTree(merged.tasks).filter((e) => !e.startsWith('Dangling'));
  if (errs.length) throw new Error(`Merge would break the task tree (${errs[0]}). Use "Replace" instead.`);
  return merged;
}
