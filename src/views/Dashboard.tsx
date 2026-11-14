import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, Check, CircleAlert, Clock, Flag, Inbox, OctagonAlert, Table2 } from 'lucide-react';
import { useDashboard, useData, useRollup, useToday, useWorkstreams } from '../store';
import { useUI } from '../store/ui';
import { href } from '../lib/router';
import { addDays, dateRange, diffDays, fmtDay, fmtShort, fmtRelative } from '../lib/dates';
import { isOverdue, type GateState, type GateStatus } from '../lib/progress';
import { PLAN_START } from '../data/seed';
import type { Snapshot, Task } from '../types';
import { cx, DueChip, Empty, formatINR, PriorityChip, ProgressBar, StatusPill, WsDot } from '../components/ui';

export default function Dashboard() {
  const today = useToday();
  const d = useDashboard(today);
  const settings = useData((s) => s.settings);
  const blocked = d.lists.blockedWaiting.filter((t) => t.status === 'blocked').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ASTRA at KISAN Agri Show 2026</h1>
          <p className="text-sm text-ink-muted">
            PIECC Moshi, Pune · {fmtDay(settings.expoStart)} to {fmtDay(settings.expoEnd)} · move-in {fmtDay(settings.setupDate)} · today {fmtDay(today)}
          </p>
        </div>
        {d.inbox > 0 && (
          <a href={href('tasks', { ws: 'INBOX' })} className="inline-flex items-center gap-2 rounded-lg border border-ochre/40 bg-ochre-50 px-3 py-1.5 text-sm font-medium text-ochre-700 hover:bg-ochre-100">
            <Inbox size={15} /> {d.inbox} in INBOX to triage <ArrowRight size={14} />
          </a>
        )}
      </div>

      {/* KPI row */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Key numbers">
        <Kpi label="Overall progress" value={`${d.overall.pct}%`} sub={`${d.overall.done} of ${d.overall.total} tasks done`} to={href('tasks')}>
          <ProgressBar done={d.overall.done} total={d.overall.total} height={6} className="mt-2" />
        </Kpi>
        <Kpi label="P0 progress" value={`${d.p0.pct}%`} sub={`${d.p0.done} of ${d.p0.total} must-haves`} to={href('tasks', { pri: 'P0' })}>
          <ProgressBar done={d.p0.done} total={d.p0.total} height={6} className="mt-2" color="#B42318" track="#FEE4E2" />
        </Kpi>
        <Kpi label="Overdue" value={String(d.lists.overdue.length)} sub={d.lists.overdue.length ? 'past due date, not done' : 'nothing overdue'} tone={d.lists.overdue.length ? 'danger' : 'good'} to={href('tasks', { overdue: '1' })} icon={<AlertTriangle size={14} />} />
        <Kpi label="Blocked" value={String(blocked)} sub={`${d.lists.blockedWaiting.length - blocked} waiting on others`} tone={blocked ? 'danger' : undefined} to={href('tasks', { status: 'blocked,waiting' })} icon={<OctagonAlert size={14} />} />
        <Kpi label="Due next 3 days" value={String(d.lists.dueSoon.length)} sub={`through ${fmtShort(addDays(today, 3))}`} tone={d.lists.dueSoon.length ? 'warn' : undefined} to="#due-soon" icon={<Clock size={14} />} />
        <Kpi
          label="Spend"
          value={formatINR(d.spend.actual)}
          sub={d.spend.estimated ? `of ${formatINR(d.spend.estimated)} estimated` : 'add costs in task details'}
          tone={d.spend.estimated && d.spend.actual > d.spend.estimated ? 'danger' : undefined}
          to={href('tasks', { cost: '1' })}
        >
          {d.spend.estimated > 0 && (
            <ProgressBar
              done={Math.min(d.spend.actual, d.spend.estimated)}
              total={d.spend.estimated}
              height={6}
              className="mt-2"
              color={d.spend.actual > d.spend.estimated ? '#B42318' : '#B7791F'}
              track="#F5E3BF"
            />
          )}
        </Kpi>
      </section>

      {d.gates.length > 0 && <GateStrip gates={d.gates} today={today} expoStart={settings.expoStart} expoEnd={settings.expoEnd} />}

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <WorkstreamGrid stats={d.ws} today={today} />
        <Burndown today={today} />
      </div>

      <section className="grid items-start gap-4 md:grid-cols-2" aria-label="Attention lists">
        <TaskList title="Overdue" tone="danger" tasks={d.lists.overdue} today={today} empty="Nothing overdue." link={href('tasks', { overdue: '1' })} />
        <TaskList id="due-soon" title="Due next 3 days" tone="warn" tasks={d.lists.dueSoon} today={today} empty="Nothing due in the next 3 days." />
        <TaskList title="Blocked / waiting" tasks={d.lists.blockedWaiting} today={today} empty="Nothing blocked or waiting. Set a task to Blocked or Waiting to track it here." showStatus link={href('tasks', { status: 'blocked,waiting' })} />
        <TaskList title="P0 not started" tasks={d.lists.p0NotStarted} today={today} empty="Every P0 task has started." link={href('tasks', { pri: 'P0', status: 'not_started' })} />
      </section>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
  to,
  icon,
  children,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: 'danger' | 'warn' | 'good';
  to: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <a href={to} className="card group flex flex-col p-4 transition-shadow hover:shadow-pop">
      <span className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        {icon && <span className={cx(tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-ochre' : 'text-ink-faint')}>{icon}</span>}
        {label}
      </span>
      <span className={cx('mt-1 text-[28px] font-semibold leading-tight tracking-tight tabular', tone === 'danger' && 'text-danger')}>{value}</span>
      <span className="text-xs text-ink-faint">{sub}</span>
      {children}
    </a>
  );
}

const GATE_STYLE: Record<GateState, { label: string; cls: string; icon: React.ReactNode }> = {
  done: { label: 'Done', cls: 'bg-forest text-white', icon: <Check size={12} strokeWidth={3} /> },
  on_track: { label: 'On track', cls: 'bg-white text-forest ring-1 ring-inset ring-forest/40', icon: <Flag size={11} /> },
  at_risk: { label: 'At risk', cls: 'bg-ochre-50 text-ochre-700 ring-1 ring-inset ring-ochre/50', icon: <CircleAlert size={12} /> },
  missed: { label: 'Missed', cls: 'bg-danger text-white', icon: <AlertTriangle size={12} /> },
};

function GateStrip({ gates, today, expoStart, expoEnd }: { gates: GateStatus[]; today: string; expoStart: string; expoEnd: string }) {
  const items = [...gates.map((g) => ({ kind: 'gate' as const, g, date: g.date })), { kind: 'expo' as const, date: expoStart }].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind === 'gate' ? -1 : 1));
  const nextIdx = items.findIndex((i) => i.date >= today && !(i.kind === 'gate' && i.g.state === 'done'));
  return (
    <section className="card p-4" aria-label="Gates">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Gates</h2>
        <span className="text-xs text-ink-faint">At risk = open tasks and gate within 2 days</span>
      </div>
      <ol className="no-scrollbar -mx-4 flex snap-x gap-0 overflow-x-auto px-4 pb-1">
        {items.map((it, i) => {
          const isNext = i === nextIdx;
          if (it.kind === 'expo') {
            const live = today >= expoStart && today <= expoEnd;
            return (
              <li key="expo" className="relative flex min-w-[128px] flex-1 snap-start flex-col items-start pr-3">
                <Connector first={i === 0} />
                <span className={cx('relative z-10 flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold', live ? 'bg-leaf text-forest-900' : 'bg-forest-900 text-white')}>Expo</span>
                <span className="mt-2 text-sm font-medium">KISAN 2026</span>
                <span className="text-xs text-ink-muted tabular">
                  {fmtShort(expoStart)} to {fmtShort(expoEnd)}
                </span>
                <span className="text-xs text-ink-faint">{live ? 'Live now' : today < expoStart ? fmtRelative(expoStart, today) : 'Ended'}</span>
              </li>
            );
          }
          const g = it.g;
          const st = GATE_STYLE[g.state];
          return (
            <li key={g.gate.code} className="relative flex min-w-[128px] flex-1 snap-start flex-col items-start pr-3">
              <Connector first={i === 0} />
              <span className={cx('relative z-10 flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-semibold', st.cls)} title={st.label}>
                {st.icon}
                {g.gate.code}
              </span>
              <a href={href('tasks', { gate: g.gate.code })} className={cx('mt-2 text-sm font-medium hover:underline', isNext && 'text-forest')} title={g.gate.definition}>
                {g.gate.name}
              </a>
              <span className="text-xs text-ink-muted tabular">
                {fmtDay(g.date)} · {st.label}
              </span>
              <span className="text-xs text-ink-faint tabular">
                {g.done}/{g.total} done{g.state !== 'done' && g.date >= today ? ` · ${fmtRelative(g.date, today)}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Connector({ first }: { first: boolean }) {
  return <span aria-hidden className={cx('absolute top-3 h-px bg-line', first ? 'left-4 right-0' : 'left-0 right-0')} />;
}

function WorkstreamGrid({ stats, today }: { stats: ReturnType<typeof useDashboard>['ws']; today: string }) {
  const workstreams = useWorkstreams();
  const openDrawer = useUI((s) => s.openDrawer);
  const list = workstreams.filter((w) => stats.has(w.code));
  return (
    <section aria-label="Categories">
      <h2 className="mb-3 text-sm font-semibold">Categories</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((w) => {
          const s = stats.get(w.code)!;
          return (
            <div key={w.code} className="card flex flex-col p-3.5 transition-shadow hover:shadow-pop">
              <a href={href('tasks', { ws: w.code })} className="group">
                <div className="flex items-center gap-2">
                  <WsDot color={w.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium group-hover:underline" title={w.name}>
                    {w.name}
                  </span>
                  <span className="text-sm font-semibold tabular">{s.pct}%</span>
                </div>
                <ProgressBar done={s.done} total={s.total} color={w.color} height={5} className="mt-2" />
                <div className="mt-1.5 flex items-center justify-between text-xs text-ink-faint tabular">
                  <span>
                    {s.done}/{s.total} done · {w.code}
                  </span>
                  {s.overdue > 0 ? (
                    <span className="inline-flex items-center gap-1 font-medium text-danger">
                      <AlertTriangle size={11} /> {s.overdue} overdue
                    </span>
                  ) : (
                    <span>none overdue</span>
                  )}
                </div>
              </a>
              {s.next && (
                <button className="mt-2 flex items-center gap-2 border-t border-line pt-2 text-left text-xs" onClick={() => openDrawer(s.next!.id)}>
                  <span className="shrink-0 text-ink-faint">Next</span>
                  <span className="min-w-0 flex-1 truncate text-ink hover:underline">{s.next.title}</span>
                  <span className="shrink-0 tabular text-ink-muted">{fmtRelative(s.next.dueDate!, today)}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function TaskList({
  id,
  title,
  tasks,
  today,
  empty,
  tone,
  showStatus,
  link,
}: {
  id?: string;
  title: string;
  tasks: Task[];
  today: string;
  empty: string;
  tone?: 'danger' | 'warn';
  showStatus?: boolean;
  link?: string;
}) {
  const openDrawer = useUI((s) => s.openDrawer);
  const wsList = useWorkstreams();
  const settings = useData((s) => s.settings);
  const roll = useRollup();
  const [all, setAll] = useState(false);
  const shown = all ? tasks : tasks.slice(0, 8);
  return (
    <div id={id} className="card flex flex-col overflow-hidden scroll-mt-24">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={cx('chip tabular', tone === 'danger' && tasks.length ? 'bg-danger text-white' : tone === 'warn' && tasks.length ? 'bg-ochre-50 text-ochre-700' : 'bg-stone-100 text-ink-muted')}>{tasks.length}</span>
        {link && tasks.length > 0 && (
          <a href={link} className="ml-auto text-xs text-forest hover:underline">
            View in tasks
          </a>
        )}
      </div>
      {tasks.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {shown.map((t) => {
            const ws = wsList.find((w) => w.code === t.workstream);
            return (
              <li key={t.id}>
                <button className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-stone-50" onClick={() => openDrawer(t.id)}>
                  <WsDot color={ws?.color ?? '#999'} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{t.title}</span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {t.workstream}
                      {t.owners?.length ? ` · ${t.owners.join(', ')}` : ' · unassigned'}
                    </span>
                  </span>
                  {showStatus && <StatusPill status={t.status} />}
                  {t.priority === 'P0' && <PriorityChip p="P0" />}
                  <DueChip due={t.dueDate} today={today} overdue={isOverdue(t, roll.get(t.id), today, settings)} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > 8 && (
        <button className="border-t border-line py-2 text-xs font-medium text-forest hover:bg-forest-50" onClick={() => setAll((a) => !a)}>
          {all ? 'Show fewer' : `Show all ${tasks.length}`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Burndown: remaining non-dropped leaf tasks per day vs an ideal straight line.

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((e) => setW(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Burndown({ today }: { today: string }) {
  const snapshots = useData((s) => s.snapshots);
  const settings = useData((s) => s.settings);
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const end = settings.expoStart;
  const days = useMemo(() => dateRange(PLAN_START, end), [end]);
  const snapByDate = useMemo(() => new Map(snapshots.map((s) => [s.date, s])), [snapshots]);
  const first: Snapshot | undefined = snapshots.find((s) => s.date >= PLAN_START) ?? snapshots[0];
  const start = first?.total ?? 0;
  const current = snapshots[snapshots.length - 1];
  const maxY = Math.max(1, ...snapshots.map((s) => s.total), start);
  const n = days.length - 1;
  const ideal = (i: number) => start * (1 - i / n);

  // geometry
  const H = 220;
  const m = { l: 34, r: 12, t: 12, b: 26 };
  const W = Math.max(260, width);
  const x = (i: number) => m.l + (i / n) * (W - m.l - m.r);
  const y = (v: number) => m.t + (1 - v / niceMax(maxY)) * (H - m.t - m.b);
  const yTicks = ticks(niceMax(maxY));

  const actual = days.map((d, i) => ({ i, d, s: snapByDate.get(d) })).filter((p) => p.s);
  const path = actual.map((p, k) => `${k ? 'L' : 'M'}${x(p.i)},${y(p.s!.total - p.s!.done)}`).join(' ');
  const todayIdx = diffDays(PLAN_START, today);
  const hoverDay = hover !== null ? days[hover] : null;
  const hoverSnap = hoverDay ? snapByDate.get(hoverDay) : undefined;

  useEffect(() => setHover(null), [width]);

  return (
    <section className="card flex flex-col p-4" aria-label="Burndown">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Burndown to opening day</h2>
          <p className="text-xs text-ink-faint">Open tasks remaining, recorded once a day when the tracker is opened</p>
        </div>
        <button className={cx('icon-btn', table && 'bg-forest-50 text-forest')} aria-pressed={table} onClick={() => setTable((t) => !t)} title="Show as table" aria-label="Show as table">
          <Table2 size={15} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-4 text-xs text-ink-muted" aria-hidden={table}>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-forest" /> Remaining
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="16" height="2" aria-hidden>
            <line x1="0" y1="1" x2="16" y2="1" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="4 3" />
          </svg>
          Ideal
        </span>
        {current && (
          <span className="ml-auto tabular">
            <span className="font-semibold text-ink">{current.total - current.done}</span> open today
          </span>
        )}
      </div>
      {table ? (
        <div className="mt-3 max-h-[240px] overflow-y-auto">
          <table className="w-full text-xs tabular">
            <thead className="sticky top-0 bg-white text-left text-ink-muted">
              <tr>
                <th className="py-1 font-medium">Date</th>
                <th className="py-1 text-right font-medium">Remaining</th>
                <th className="py-1 text-right font-medium">Ideal</th>
                <th className="py-1 text-right font-medium">Done</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => {
                const s = snapByDate.get(d);
                return (
                  <tr key={d} className={cx('border-t border-line', d === today && 'bg-forest-50')}>
                    <td className="py-1">{fmtDay(d)}</td>
                    <td className="py-1 text-right">{s ? s.total - s.done : '–'}</td>
                    <td className="py-1 text-right text-ink-muted">{Math.round(ideal(i))}</td>
                    <td className="py-1 text-right text-ink-muted">{s ? s.done : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={ref} className="relative mt-2 flex-1">
          {width > 0 && (
            <svg
              width={W}
              height={H}
              role="img"
              aria-label={`Burndown chart: ${current ? current.total - current.done : 0} tasks remaining today; ideal line reaches zero on ${fmtShort(end)}.`}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(e) => {
                const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                const px = e.clientX - rect.left;
                const i = Math.round(((px - m.l) / (W - m.l - m.r)) * n);
                setHover(i >= 0 && i <= n ? i : null);
              }}
            >
              {yTicks.map((t) => (
                <g key={t}>
                  <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="#EEEDE6" strokeWidth={1} />
                  <text x={m.l - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize="10" fill="#7A8175">
                    {t}
                  </text>
                </g>
              ))}
              {days.map((d, i) =>
                i % 7 === 0 || i === n ? (
                  <text key={d} x={x(i)} y={H - 8} textAnchor={i === n ? 'end' : i === 0 ? 'start' : 'middle'} fontSize="10" fill="#7A8175">
                    {fmtShort(d)}
                  </text>
                ) : null,
              )}
              {start > 0 && <line x1={x(0)} y1={y(start)} x2={x(n)} y2={y(0)} stroke="#9CA3AF" strokeWidth={2} strokeDasharray="5 4" strokeLinecap="round" />}
              {todayIdx >= 0 && todayIdx <= n && (
                <g>
                  <line x1={x(todayIdx)} x2={x(todayIdx)} y1={m.t} y2={H - m.b} stroke="#94C750" strokeWidth={1} />
                  <text x={x(todayIdx) + 4} y={m.t + 8} fontSize="10" fill="#5E8A26">
                    today
                  </text>
                </g>
              )}
              {path && <path d={path} fill="none" stroke="#265022" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
              {actual.length > 0 && (() => {
                const last = actual[actual.length - 1];
                return <circle cx={x(last.i)} cy={y(last.s!.total - last.s!.done)} r={4.5} fill="#265022" stroke="#fff" strokeWidth={2} />;
              })()}
              {hover !== null && (
                <g pointerEvents="none">
                  <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={H - m.b} stroke="#1B2118" strokeOpacity={0.25} strokeWidth={1} />
                  {hoverSnap && <circle cx={x(hover)} cy={y(hoverSnap.total - hoverSnap.done)} r={4.5} fill="#265022" stroke="#fff" strokeWidth={2} />}
                </g>
              )}
            </svg>
          )}
          {hover !== null && hoverDay && (
            <div
              className="pointer-events-none absolute top-2 z-10 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-pop tabular"
              style={{ left: Math.min(Math.max(x(hover) - 70, 0), W - 140), width: 140 }}
            >
              <div className="font-medium">{fmtDay(hoverDay)}</div>
              <div className="flex justify-between">
                <span className="text-white/70">Remaining</span>
                <span>{hoverSnap ? hoverSnap.total - hoverSnap.done : 'no record'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/70">Ideal</span>
                <span>{Math.round(ideal(hover))}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Round axis: pick a step from a fixed ladder so there are at most 5 intervals. */
function niceStep(v: number): number {
  return [2, 5, 10, 20, 25, 50, 100, 250, 500].find((st) => Math.ceil(v / st) <= 5) ?? 1000;
}

function niceMax(v: number): number {
  const st = niceStep(Math.max(v, 1));
  return Math.ceil(Math.max(v, 1) / st) * st;
}

function ticks(max: number): number[] {
  const st = niceStep(max);
  const out: number[] = [];
  for (let t = 0; t <= max; t += st) out.push(t);
  return out;
}
