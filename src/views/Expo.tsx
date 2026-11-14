import { useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { useData, useRollup, useToday } from '../store';
import { buildGroups } from '../lib/tree';
import { dateRange, dayName, fmtDay, fmtShort } from '../lib/dates';
import type { Status, Task } from '../types';
import { cx, ProgressBar } from '../components/ui';

type Tab = { key: string; label: string; sub: string; date?: string; kind: 'setup' | 'day' | 'dismantle' };

/**
 * Phone-first checklist for the expo itself (ONSITE workstream only).
 * Daily checklists (tagged "daily") store completion per date; others use the task status.
 */
export default function Expo() {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const expoChecks = useData((s) => s.expoChecks);
  const roll = useRollup();
  const today = useToday();
  const groups = useMemo(() => buildGroups(tasks), [tasks]);
  const roots = groups.get('root:ONSITE') ?? [];

  const expoDays = dateRange(settings.expoStart, settings.expoEnd);
  const tabs: Tab[] = [
    { key: 'setup', label: 'Setup', sub: fmtShort(settings.setupDate), kind: 'setup' },
    ...expoDays.map((d, i) => ({ key: d, label: `Day ${i + 1}`, sub: `${dayName(d)} ${Number(d.slice(8))}`, date: d, kind: 'day' as const })),
    { key: 'dismantle', label: 'Dismantle', sub: fmtShort(settings.expoEnd), kind: 'dismantle' },
  ];
  const defaultTab = today < settings.expoStart ? 'setup' : today > settings.expoEnd ? 'dismantle' : today;
  const [tabKey, setTabKey] = useState(defaultTab);
  const tab = tabs.find((t) => t.key === tabKey) ?? tabs[0];

  const live = (t: Task) => !roll.get(t.id)?.excluded;
  const isDaily = (t: Task) => !!t.tags?.includes('daily');
  const dailyRoots = roots.filter((r) => isDaily(r) && live(r));
  const otherRoots = roots.filter((r) => !isDaily(r) && live(r));
  const sections =
    tab.kind === 'day'
      ? dailyRoots
      : otherRoots.filter((r) => (tab.kind === 'setup' ? (r.dueDate ?? '') <= settings.expoStart : (r.dueDate ?? '') > settings.expoStart));

  const itemsOf = (root: Task) => {
    const kids = (groups.get(root.id) ?? []).filter(live);
    return kids.length ? kids : [root];
  };

  const s = useData.getState;
  const toggleDaily = (date: string, task: Task) => {
    s().toggleExpoCheck(date, task.id);
    // Keep the tracker status in step: done once ticked on the final expo day.
    const checks = useData.getState().expoChecks;
    const anyDay = expoDays.some((d) => checks[d]?.[task.id]);
    const status: Status = checks[settings.expoEnd]?.[task.id] ? 'done' : anyDay ? 'in_progress' : 'not_started';
    if (status !== task.status) s().updateTask(task.id, { status });
  };

  const isChecked = (t: Task) => (tab.kind === 'day' ? !!expoChecks[tab.date!]?.[t.id] : roll.get(t.id)?.status === 'done');
  const allItems = sections.flatMap(itemsOf);
  const doneCount = allItems.filter(isChecked).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Expo mode</h1>
        <p className="text-sm text-ink-muted">
          {tab.kind === 'day' ? `${fmtDay(tab.date)} · daily checklists reset each day` : tab.kind === 'setup' ? `Move-in ${fmtDay(settings.setupDate)} · stall ready by G6` : 'After closing on the last day'}
        </p>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="tablist">
        {tabs.map((t) => {
          const isToday = t.date === today;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === tab.key}
              onClick={() => setTabKey(t.key)}
              className={cx(
                'flex min-w-[72px] shrink-0 flex-col items-center rounded-xl border px-3 py-2 text-center transition-colors',
                t.key === tab.key ? 'border-forest bg-forest text-white' : 'border-line bg-white text-ink hover:border-forest/40',
              )}
            >
              <span className="text-sm font-semibold">{t.label}</span>
              <span className={cx('text-[11px]', t.key === tab.key ? 'text-white/80' : 'text-ink-faint')}>{isToday ? 'Today' : t.sub}</span>
            </button>
          );
        })}
      </div>

      <div className="card flex items-center gap-3 p-4">
        <div className="flex-1">
          <ProgressBar done={doneCount} total={allItems.length} height={8} />
        </div>
        <span className="text-sm font-semibold tabular">
          {doneCount}/{allItems.length}
        </span>
      </div>

      {sections.length === 0 && <p className="py-8 text-center text-sm text-ink-faint">No ONSITE checklists for this tab.</p>}

      {sections.map((root) => {
        const items = itemsOf(root);
        const n = items.filter(isChecked).length;
        return (
          <section key={root.id} aria-label={root.title}>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-base font-semibold">{root.title.replace(/\s*\(repeat each day\)/, '')}</h2>
              <span className="text-sm text-ink-muted tabular">
                {n}/{items.length}
              </span>
            </div>
            <ul className="space-y-2">
              {items.map((t) => {
                const checked = isChecked(t);
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => (tab.kind === 'day' ? toggleDaily(tab.date!, t) : s().toggleDone(t.id))}
                      aria-pressed={checked}
                      className={cx(
                        'flex min-h-[60px] w-full items-center gap-4 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99]',
                        checked ? 'border-forest/30 bg-forest-50' : 'border-line bg-white hover:border-forest/40',
                      )}
                    >
                      <span
                        className={cx(
                          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-2 transition-colors',
                          checked ? 'border-forest bg-forest text-white' : 'border-stone-300 bg-white',
                        )}
                      >
                        {checked && <Check size={20} strokeWidth={3} />}
                      </span>
                      <span className={cx('flex-1 text-[15px] leading-snug', checked && 'text-ink-muted line-through decoration-forest/40')}>{t.title}</span>
                      {t.priority === 'P0' && !checked && <span className="chip bg-danger-50 text-danger">P0</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {tab.kind === 'day' && doneCount > 0 && (
        <button
          className="btn-ghost mx-auto"
          onClick={() => {
            for (const t of allItems) if (expoChecks[tab.date!]?.[t.id]) toggleDaily(tab.date!, t);
          }}
        >
          <RotateCcw size={14} /> Clear {fmtShort(tab.date)} checks
        </button>
      )}
    </div>
  );
}
