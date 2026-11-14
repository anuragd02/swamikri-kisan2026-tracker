import { useEffect, useMemo, useState } from 'react';
import { LocalStorageAdapter } from '../storage/adapter';
import { createSeedData } from '../storage/migrate';
import { createDataStore, extractData } from './data';
import { isIsoDate, todayIST } from '../lib/dates';
import {
  computeRollup,
  dashboardLists,
  gateStatuses,
  overallProgress,
  spend,
  workstreamStats,
} from '../lib/progress';
import { GATES } from '../data/seed';
import type { Task } from '../types';

export const storage = new LocalStorageAdapter();

const loaded = storage.load();
export const firstRun = loaded === null;
export const useData = createDataStore(loaded ?? createSeedData());

let applyingRemote = false;
let lastSavedAt: number | null = null;
export const getLastSavedAt = () => lastSavedAt;

useData.subscribe((s, prev) => {
  if (applyingRemote) return;
  if (
    s.tasks !== prev.tasks ||
    s.settings !== prev.settings ||
    s.workstreams !== prev.workstreams ||
    s.snapshots !== prev.snapshots ||
    s.expoChecks !== prev.expoChecks
  ) {
    storage.save(extractData(s));
    lastSavedAt = Date.now();
  }
});

// Write back immediately on first run (so a refresh never re-seeds) and after a schema
// upgrade on load (so the migrated data is what's stored, not just what's in memory).
if (firstRun || storage.migratedOnLoad) {
  storage.save(extractData(useData.getState()));
  storage.flush();
}

// Another tab changed the data: adopt it.
storage.subscribe((data) => {
  applyingRemote = true;
  useData.getState().replaceAll(data);
  applyingRemote = false;
});

const flush = () => storage.flush();
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});

/**
 * Today's date in Asia/Kolkata, re-checked every minute so the dashboard rolls over at midnight.
 * A `?today=yyyy-mm-dd` query (before the #) overrides it, for rehearsing expo mode.
 */
export function useToday(): string {
  const override = new URLSearchParams(window.location.search).get('today');
  const [today, setToday] = useState(() => (isIsoDate(override) ? override : todayIST()));
  useEffect(() => {
    if (isIsoDate(override)) return;
    const t = setInterval(() => setToday(todayIST()), 60_000);
    return () => clearInterval(t);
  }, [override]);
  return today;
}

export function useRollup() {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => computeRollup(tasks), [tasks]);
}

export function useTaskIndex(): Map<string, Task> {
  const tasks = useData((s) => s.tasks);
  return useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
}

export function useWorkstreams() {
  const ws = useData((s) => s.workstreams);
  return useMemo(() => [...ws].sort((a, b) => a.order - b.order), [ws]);
}

export function useWorkstreamMap() {
  const ws = useData((s) => s.workstreams);
  return useMemo(() => new Map(ws.map((w) => [w.code, w])), [ws]);
}

/** Owners: team members from Settings plus anyone typed on a task. */
export function useOwners(): string[] {
  const tasks = useData((s) => s.tasks);
  const team = useData((s) => s.settings.teamMembers);
  return useMemo(() => {
    const set = new Map<string, string>();
    for (const m of team) set.set(m.toLowerCase(), m);
    for (const t of tasks) for (const o of t.owners ?? []) if (o.trim() && !set.has(o.toLowerCase())) set.set(o.toLowerCase(), o);
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  }, [tasks, team]);
}

export function useDashboard(today: string) {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const roll = useRollup();
  return useMemo(
    () => ({
      roll,
      overall: overallProgress(tasks, roll),
      p0: overallProgress(tasks, roll, 'P0'),
      lists: dashboardLists(tasks, roll, today, settings),
      gates: gateStatuses(tasks, roll, GATES, today),
      ws: workstreamStats(tasks, roll, today, settings),
      spend: spend(tasks, roll),
      inbox: tasks.filter((t) => t.workstream === 'INBOX' && !roll.get(t.id)?.excluded).length,
    }),
    [tasks, roll, today, settings],
  );
}
