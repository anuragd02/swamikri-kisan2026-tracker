import { useMemo } from 'react';
import { useData, useRollup, useToday, useWorkstreams } from '../store';
import { buildGroups } from '../lib/tree';
import { fmtLong, fmtShort } from '../lib/dates';
import type { Task } from '../types';

/** A4 checklist grouped by workstream. Rendered only for print (see @media print in index.css). */
export function PrintChecklist() {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const workstreams = useWorkstreams();
  const roll = useRollup();
  const today = useToday();
  const groups = useMemo(() => buildGroups(tasks), [tasks]);

  const rows = (list: Task[], depth: number): React.ReactNode[] =>
    list.flatMap((t) => {
      const r = roll.get(t.id);
      if (!r || r.excluded) return [];
      const done = r.status === 'done';
      return [
        <div key={t.id} className="print-row flex items-start gap-2 border-b border-stone-200 py-[3px] text-[10.5px] leading-snug" style={{ paddingLeft: depth * 16 }}>
          <span className="mt-[1px] inline-flex h-[11px] w-[11px] shrink-0 items-center justify-center border border-stone-500 text-[9px] leading-none">{done ? '✓' : ''}</span>
          <span className={`flex-1 ${depth === 0 ? 'font-semibold' : ''} ${done ? 'text-stone-400 line-through' : ''}`}>
            {t.isMilestone ? '◆ ' : ''}
            {t.title}
          </span>
          <span className="w-[22px] shrink-0 text-stone-600">{t.priority}</span>
          <span className="w-[20px] shrink-0 text-stone-600">{t.tags?.find((g) => /^G\d$/.test(g)) ?? ''}</span>
          <span className="w-[90px] shrink-0 truncate text-stone-600">{t.owners?.length ? t.owners.join(', ') : '________'}</span>
          <span className="w-[40px] shrink-0 text-right tabular-nums text-stone-700">{fmtShort(t.dueDate)}</span>
        </div>,
        ...rows(groups.get(t.id) ?? [], depth + 1),
      ];
    });

  return (
    <div className="font-sans text-black">
      <div className="mb-3 flex items-end justify-between border-b-2 border-black pb-2">
        <div className="flex items-center gap-3">
          <img src="./brand/logo.png" alt="" className="h-8" />
          <div>
            <div className="text-base font-bold">KISAN 2026 expo checklist</div>
            <div className="text-[10px] text-stone-600">
              PIECC Pune · Expo {fmtShort(settings.expoStart)} to {fmtShort(settings.expoEnd)} · move-in {fmtShort(settings.setupDate)}
            </div>
          </div>
        </div>
        <div className="text-right text-[10px] text-stone-600">Printed {fmtLong(today)}</div>
      </div>
      <div className="mb-1 flex gap-2 text-[9px] uppercase tracking-wide text-stone-500">
        <span className="w-[11px]" />
        <span className="flex-1">Task</span>
        <span className="w-[22px]">Pri</span>
        <span className="w-[20px]">Gate</span>
        <span className="w-[90px]">People</span>
        <span className="w-[40px] text-right">Due</span>
      </div>
      {workstreams.map((w) => {
        const list = groups.get(`root:${w.code}`) ?? [];
        if (!list.length) return null;
        return (
          <section key={w.code} className="print-ws mb-3">
            <h2 className="mb-0.5 mt-2 flex items-center gap-2 border-b border-black pb-0.5 text-[12px] font-bold">
              <span className="inline-block h-2.5 w-2.5" style={{ background: w.color }} />
              {w.name} <span className="font-normal text-stone-500">({w.code})</span>
            </h2>
            {rows(list, 0)}
          </section>
        );
      })}
    </div>
  );
}
