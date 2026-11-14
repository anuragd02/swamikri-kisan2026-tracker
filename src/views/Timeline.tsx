import { useMemo } from 'react';
import { useDashboard, useData, useRollup, useToday, useWorkstreams } from '../store';
import { useUI } from '../store/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { hasAnyFilter, matchesFilters } from '../lib/filters';
import { buildGroups, getAncestorIds } from '../lib/tree';
import { isOverdue } from '../lib/progress';
import { addDays, dateRange, dayName, diffDays, fmtShort, weekday } from '../lib/dates';
import { usePersistentState } from '../lib/usePersistent';
import { PLAN_START } from '../data/seed';
import { cx } from '../components/ui';
import type { Task } from '../types';

const END = '2026-12-18';
const DAY_W = 28;
const ROW_H = 30;

export default function Timeline() {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const workstreams = useWorkstreams();
  const roll = useRollup();
  const today = useToday();
  const { gates } = useDashboard(today);
  const [filters] = useFilters();
  const [showSubs, setShowSubs] = usePersistentState('tracker:timeline-subs', false);
  const openDrawer = useUI((s) => s.openDrawer);

  const days = useMemo(() => dateRange(PLAN_START, END), []);
  const width = days.length * DAY_W;
  const xOf = (d: string) => Math.max(0, Math.min(days.length, diffDays(PLAN_START, d))) * DAY_W;

  const groups = useMemo(() => buildGroups(tasks), [tasks]);
  const filtering = hasAnyFilter(filters);

  const sections = useMemo(() => {
    let visible: Set<string> | null = null;
    if (filtering) {
      visible = new Set();
      for (const t of tasks) {
        if (!matchesFilters(t, filters, roll, today, settings)) continue;
        visible.add(t.id);
        for (const a of getAncestorIds(tasks, t.id)) visible.add(a);
      }
    }
    return workstreams
      .map((w) => {
        const rows: { t: Task; depth: number }[] = [];
        const walk = (list: Task[], depth: number) => {
          for (const t of list) {
            if (roll.get(t.id)?.excluded) continue;
            if (visible && !visible.has(t.id)) continue;
            rows.push({ t, depth });
            if (showSubs || filtering) walk(groups.get(t.id) ?? [], depth + 1);
          }
        };
        walk(groups.get(`root:${w.code}`) ?? [], 0);
        return { w, rows };
      })
      .filter((s) => s.rows.length > 0);
  }, [workstreams, groups, roll, showSubs, filtering, filters, tasks, today, settings]);

  const weeks = days.filter((_, i) => i % 7 === 0);
  const todayX = today >= PLAN_START && today <= END ? xOf(today) + DAY_W / 2 : null;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Timeline</h1>
        <p className="text-sm text-ink-muted">
          {fmtShort(PLAN_START)} to {fmtShort(END)}. Bars run from start date (or the day before the due date) to the due date. Click a bar to edit.
        </p>
      </div>
      <FilterBar>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={showSubs} onChange={(e) => setShowSubs(e.target.checked)} />
          Show subtasks
        </label>
      </FilterBar>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="relative" style={{ width: `calc(var(--tl-label) + ${width}px)` }}>
            <div className="grid" style={{ gridTemplateColumns: `var(--tl-label) ${width}px` }}>
              {/* Header */}
              <div className="sticky left-0 z-20 border-b border-r border-line bg-white" style={{ height: 64 }} />
              <div className="relative border-b border-line bg-white" style={{ height: 64 }}>
                {weeks.map((d) => (
                  <div key={d} className="absolute top-0 border-l border-line pl-1.5 pt-1 text-[11px] font-medium text-ink-muted" style={{ left: xOf(d), width: DAY_W * 7 }}>
                    Week of {fmtShort(d)}
                  </div>
                ))}
                {days.map((d) => (
                  <div
                    key={d}
                    className={cx('absolute bottom-0 flex h-8 flex-col items-center justify-center text-[10px] tabular', d === today ? 'font-semibold text-forest' : 'text-ink-faint', (weekday(d) === 0 || weekday(d) === 6) && 'bg-stone-50')}
                    style={{ left: xOf(d), width: DAY_W }}
                    title={`${dayName(d)} ${fmtShort(d)}`}
                  >
                    <span>{dayName(d).slice(0, 1)}</span>
                    <span>{Number(d.slice(8))}</span>
                  </div>
                ))}
                {gates.map((g) => (
                  <div key={g.gate.code} className="absolute top-5 -translate-x-1/2 rounded bg-forest px-1 text-[10px] font-semibold text-white" style={{ left: xOf(g.date) + DAY_W / 2 }} title={`${g.gate.code} ${g.gate.name} · ${fmtShort(g.date)}`}>
                    {g.gate.code}
                  </div>
                ))}
                <div className="absolute top-5 rounded bg-leaf px-1 text-[10px] font-semibold text-forest-900" style={{ left: xOf(settings.expoStart) + 2 }}>
                  Expo
                </div>
              </div>

              {/* Body */}
              {sections.map(({ w, rows }) => (
                <Section key={w.code}>
                  <div className="sticky left-0 z-10 flex items-center gap-2 border-b border-r border-line bg-stone-50 px-3 text-xs font-semibold" style={{ height: ROW_H }}>
                    <span className="h-3 w-1 rounded-full" style={{ background: w.color }} />
                    <span className="truncate">{w.name}</span>
                  </div>
                  <div className="relative border-b border-line bg-stone-50" style={{ height: ROW_H }} />
                  {rows.map(({ t, depth }) => {
                    const r = roll.get(t.id)!;
                    const due = t.dueDate;
                    const start = t.startDate && due && t.startDate <= due ? t.startDate : due ? addDays(due, -1) : undefined;
                    const done = r.status === 'done';
                    const late = isOverdue(t, r, today, settings);
                    return (
                      <Section key={t.id}>
                        <button
                          className="sticky left-0 z-10 flex items-center border-b border-r border-line bg-white pr-2 text-left text-xs hover:bg-stone-50"
                          style={{ height: ROW_H, paddingLeft: 12 + depth * 12 }}
                          onClick={() => openDrawer(t.id)}
                          title={t.title}
                        >
                          <span className={cx('truncate', depth === 0 && 'font-medium', done && 'text-ink-faint line-through')}>{t.title}</span>
                        </button>
                        <div className="relative border-b border-line/60" style={{ height: ROW_H }}>
                          {due && start && due >= PLAN_START && start <= END && (
                            t.isMilestone ? (
                              <button
                                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-white"
                                style={{ left: xOf(due) + DAY_W / 2, background: done ? '#94C750' : w.color }}
                                onClick={() => openDrawer(t.id)}
                                aria-label={`${t.title}, milestone ${fmtShort(due)}`}
                                title={`${t.title} · ${fmtShort(due)}`}
                              />
                            ) : (
                              <button
                                className={cx('absolute top-[7px] h-4 rounded-[4px] transition-opacity hover:opacity-80', late && 'ring-2 ring-danger ring-offset-1')}
                                style={{
                                  left: xOf(start) + 3,
                                  width: Math.max(DAY_W - 6, xOf(due) - xOf(start) + DAY_W - 6),
                                  background: w.color,
                                  opacity: done ? 0.3 : !r.isLeaf ? 0.55 : 1,
                                }}
                                onClick={() => openDrawer(t.id)}
                                aria-label={`${t.title}, ${fmtShort(start)} to ${fmtShort(due)}${late ? ', overdue' : ''}`}
                                title={`${t.title} · ${fmtShort(start)} to ${fmtShort(due)}${!r.isLeaf ? ` · ${r.done}/${r.total}` : ''}`}
                              />
                            )
                          )}
                        </div>
                      </Section>
                    );
                  })}
                </Section>
              ))}
            </div>

            {/* Overlays: expo band, gate lines, today line (behind the sticky label column) */}
            <div className="pointer-events-none absolute inset-y-0" style={{ left: 'var(--tl-label)', width }}>
              <div className="absolute inset-y-0 bg-leaf/10" style={{ left: xOf(settings.expoStart), width: xOf(addDays(settings.expoEnd, 1)) - xOf(settings.expoStart) }} />
              {gates.map((g) => (
                <div key={g.gate.code} className="absolute bottom-0 top-[64px] border-l border-dashed border-forest/30" style={{ left: xOf(g.date) + DAY_W / 2 }} />
              ))}
              {todayX !== null && <div className="absolute inset-y-0 w-0.5 bg-ochre" style={{ left: todayX }} />}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-0.5 bg-ochre" /> Today
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 bg-leaf/30" /> Expo days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rotate-45 bg-forest" /> Milestone
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-stone-500 ring-2 ring-danger ring-offset-1" /> Overdue
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-sm bg-stone-500 opacity-30" /> Done
        </span>
      </div>
    </div>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
