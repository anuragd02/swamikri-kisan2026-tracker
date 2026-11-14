import { AlertTriangle, Ban, Check, CircleDashed, Clock, Hourglass, Link2, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Priority, Status, Task, Workstream } from '../types';
import { STATUSES, STATUS_LABEL } from '../types';
import { fmtShort, fmtRelative, diffDays } from '../lib/dates';

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
}

export const STATUS_STYLE: Record<Status, { chip: string; dot: string }> = {
  not_started: { chip: 'bg-stone-100 text-stone-700', dot: '#A8A29E' },
  in_progress: { chip: 'bg-info-50 text-info', dot: '#1D5FA8' },
  waiting: { chip: 'bg-ochre-50 text-ochre-700', dot: '#B7791F' },
  blocked: { chip: 'bg-danger-50 text-danger', dot: '#B42318' },
  done: { chip: 'bg-forest-50 text-forest', dot: '#265022' },
  dropped: { chip: 'bg-stone-100 text-stone-500 line-through', dot: '#D6D3D1' },
};

const STATUS_ICON: Record<Status, typeof Check> = {
  not_started: CircleDashed,
  in_progress: Clock,
  waiting: Hourglass,
  blocked: OctagonAlert,
  done: Check,
  dropped: Ban,
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={cx('chip', STATUS_STYLE[status].chip, className)}>
      <Icon size={11} strokeWidth={2.5} aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function StatusSelect({
  value,
  onChange,
  className,
  derived,
}: {
  value: Status;
  onChange: (s: Status) => void;
  className?: string;
  derived?: boolean;
}) {
  return (
    <select
      aria-label="Status"
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className={cx(
        'rounded-md border-0 pl-2 pr-6 h-7 text-xs font-medium cursor-pointer focus:ring-2 focus:ring-forest/20',
        STATUS_STYLE[value].chip,
        className,
      )}
      title={derived ? 'Derived from subtasks. Choosing a status here overrides it.' : undefined}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}

const PRI_STYLE: Record<Priority, string> = {
  P0: 'bg-danger-50 text-danger ring-1 ring-inset ring-danger/20',
  P1: 'bg-ochre-50 text-ochre-700',
  P2: 'bg-stone-100 text-stone-600',
};

export function PriorityChip({ p }: { p: Priority }) {
  return (
    <span className={cx('chip tabular', PRI_STYLE[p])} title={{ P0: 'P0: expo fails without it', P1: 'P1: should have', P2: 'P2: nice to have' }[p]}>
      {p}
    </span>
  );
}

export function WsDot({ color, size = 8 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color }} />;
}

export function WsChip({ ws, short = true }: { ws?: Workstream; short?: boolean }) {
  if (!ws) return null;
  return (
    <span className="chip bg-white border border-line text-ink-muted" title={ws.name}>
      <WsDot color={ws.color} size={6} />
      {short ? ws.code : ws.name}
    </span>
  );
}

export function DueChip({
  due,
  today,
  overdue,
  closed,
  showRelative = false,
}: {
  due?: string;
  today: string;
  overdue?: boolean;
  closed?: boolean;
  showRelative?: boolean;
}) {
  if (!due) return null;
  const soon = !closed && !overdue && diffDays(today, due) <= 3 && diffDays(today, due) >= 0;
  return (
    <span
      className={cx(
        'chip tabular',
        overdue ? 'bg-danger text-white' : soon ? 'bg-ochre-50 text-ochre-700' : 'text-ink-muted',
        closed && 'opacity-60',
      )}
      title={overdue ? `Overdue: was due ${fmtShort(due)}` : `Due ${fmtShort(due)}`}
    >
      {overdue && <AlertTriangle size={10} strokeWidth={2.5} aria-hidden />}
      {fmtShort(due)}
      {showRelative && !closed && <span className="opacity-80">· {fmtRelative(due, today)}</span>}
    </span>
  );
}

export function GateChip({ task }: { task: Task }) {
  const g = task.tags?.find((t) => /^G\d$/.test(t));
  if (!g) return null;
  return <span className="chip bg-forest-50 text-forest-700 tabular">{g}</span>;
}

export function DepChip({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="chip bg-ochre-50 text-ochre-700" title={`Waiting on ${count} unfinished dependenc${count === 1 ? 'y' : 'ies'}`}>
      <Link2 size={10} strokeWidth={2.5} aria-hidden />
      {count}
    </span>
  );
}

export function ProgressBar({
  done,
  total,
  color = '#265022',
  className,
  height = 4,
  track,
}: {
  done: number;
  total: number;
  color?: string;
  className?: string;
  height?: number;
  track?: string;
}) {
  const pct = total ? (done / total) * 100 : 0;
  return (
    <div
      className={cx('overflow-hidden rounded-full', !/(^|\s)(sm:|md:|lg:)?w-/.test(className ?? '') && 'w-full', className)}
      style={{ height, background: track ?? `${color}1F` }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Checkbox({
  checked,
  partial,
  onChange,
  label,
  size = 18,
  disabled,
}: {
  checked: boolean;
  partial?: boolean;
  onChange: () => void;
  label: string;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked ? 'true' : partial ? 'mixed' : 'false'}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className="group relative inline-flex shrink-0 items-center justify-center p-1.5 -m-1.5"
    >
      <span
        className={cx(
          'flex items-center justify-center rounded-[5px] border-[1.5px] transition-colors',
          checked
            ? 'bg-forest border-forest text-white'
            : partial
              ? 'border-forest bg-forest-50 text-forest'
              : 'border-stone-300 bg-white group-hover:border-forest',
        )}
        style={{ width: size, height: size }}
      >
        {checked ? <Check size={size - 6} strokeWidth={3} /> : partial ? <span className="h-0.5 w-2 rounded bg-forest" /> : null}
      </span>
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-4 py-6 text-center text-sm text-ink-faint">{children}</div>;
}

export function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

/** Compact list of people on a task: "@Anurag @Ravi +2". */
export function OwnerChips({ owners, max = 2, className }: { owners?: string[]; max?: number; className?: string }) {
  const list = (owners ?? []).filter((o) => o.trim());
  if (!list.length) return null;
  const shown = list.slice(0, max);
  return (
    <span className={cx('inline-flex items-center gap-1', className)} title={list.join(', ')}>
      {shown.map((o) => (
        <span key={o} className="chip bg-stone-100 text-ink-muted">
          @{o}
        </span>
      ))}
      {list.length > max && <span className="chip bg-stone-100 text-ink-muted">+{list.length - max}</span>}
    </span>
  );
}
