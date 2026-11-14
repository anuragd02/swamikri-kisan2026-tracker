import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { useRoute, navigate } from '../lib/router';
import { EMPTY_FILTERS, activeFilterCount, filtersFromParams, filtersToParams, UNASSIGNED, type Filters } from '../lib/filters';
import { useOwners, useWorkstreams } from '../store';
import { PRIORITIES, STATUSES, STATUS_LABEL } from '../types';
import { GATES } from '../data/seed';
import { cx, WsDot } from './ui';

export function useFilters(): [Filters, (f: Filters) => void] {
  const route = useRoute();
  const filters = useMemo(() => filtersFromParams(route.params), [route.params]);
  const set = (f: Filters) => navigate(route.view, filtersToParams(f, route.params), true);
  return [filters, set];
}

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function ChipToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx(
        'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors',
        on ? 'border-forest bg-forest text-white' : 'border-line bg-white text-ink-muted hover:border-forest/40 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({ children, searchId = 'global-search' }: { children?: React.ReactNode; searchId?: string }) {
  const [f, setF] = useFilters();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(f.q);
  const workstreams = useWorkstreams();
  const owners = useOwners();
  const n = activeFilterCount(f);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => setQ(f.q), [f.q]);
  const onSearch = (v: string) => {
    setQ(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setF({ ...f, q: v }), 150);
  };

  const removable: { label: string; clear: () => void }[] = [
    ...f.ws.map((w) => ({ label: w, clear: () => setF({ ...f, ws: f.ws.filter((x) => x !== w) }) })),
    ...f.status.map((s) => ({ label: STATUS_LABEL[s], clear: () => setF({ ...f, status: f.status.filter((x) => x !== s) }) })),
    ...f.pri.map((p) => ({ label: p, clear: () => setF({ ...f, pri: f.pri.filter((x) => x !== p) }) })),
    ...f.gate.map((g) => ({ label: g, clear: () => setF({ ...f, gate: f.gate.filter((x) => x !== g) }) })),
    ...f.owner.map((o) => ({ label: o === UNASSIGNED ? 'Unassigned' : `@${o}`, clear: () => setF({ ...f, owner: f.owner.filter((x) => x !== o) }) })),
    ...(f.overdue ? [{ label: 'Overdue', clear: () => setF({ ...f, overdue: false }) }] : []),
    ...(f.cost ? [{ label: 'Has cost', clear: () => setF({ ...f, cost: false }) }] : []),
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            id={searchId}
            className="input pl-8 pr-8"
            placeholder="Search titles and notes"
            value={q}
            onChange={(e) => onSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onSearch('');
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Search tasks"
          />
          {q ? (
            <button className="absolute right-1.5 top-1/2 -translate-y-1/2 icon-btn h-6 w-6" aria-label="Clear search" onClick={() => onSearch('')}>
              <X size={13} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1 text-[10px] text-ink-faint sm:block">/</kbd>
          )}
        </div>
        <button className={cx('btn-secondary', (open || n > 0) && 'border-forest/40')} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SlidersHorizontal size={15} /> Filters
          {n > 0 && <span className="rounded-full bg-forest px-1.5 text-[11px] font-semibold text-white tabular">{n}</span>}
        </button>
        {children}
      </div>

      {removable.length > 0 && !open && (
        <div className="flex flex-wrap items-center gap-1.5">
          {removable.map((r) => (
            <button key={r.label} onClick={r.clear} className="inline-flex h-6 items-center gap-1 rounded-full bg-forest-50 px-2 text-xs font-medium text-forest hover:bg-forest-100">
              {r.label} <X size={11} />
            </button>
          ))}
          <button className="text-xs text-ink-muted hover:text-ink hover:underline" onClick={() => setF({ ...EMPTY_FILTERS, q: f.q })}>
            Clear all
          </button>
        </div>
      )}

      {open && (
        <div className="card anim-rise space-y-3 p-3">
          <Group label="Category">
            {workstreams.map((w) => (
              <ChipToggle key={w.code} on={f.ws.includes(w.code)} onClick={() => setF({ ...f, ws: toggle(f.ws, w.code) })}>
                <WsDot color={w.color} size={6} />
                {w.code}
              </ChipToggle>
            ))}
          </Group>
          <Group label="Status">
            {STATUSES.map((s) => (
              <ChipToggle key={s} on={f.status.includes(s)} onClick={() => setF({ ...f, status: toggle(f.status, s) })}>
                {STATUS_LABEL[s]}
              </ChipToggle>
            ))}
          </Group>
          <div className="grid gap-3 sm:grid-cols-2">
            <Group label="Priority">
              {PRIORITIES.map((p) => (
                <ChipToggle key={p} on={f.pri.includes(p)} onClick={() => setF({ ...f, pri: toggle(f.pri, p) })}>
                  {p}
                </ChipToggle>
              ))}
            </Group>
            {GATES.length > 0 && <Group label="Gate">
              {GATES.map((g) => (
                <ChipToggle key={g.code} on={f.gate.includes(g.code)} onClick={() => setF({ ...f, gate: toggle(f.gate, g.code) })}>
                  {g.code}
                </ChipToggle>
              ))}
            </Group>}
          </div>
          <Group label="Owner">
            {[...owners, UNASSIGNED].map((o) => (
              <ChipToggle key={o} on={f.owner.includes(o)} onClick={() => setF({ ...f, owner: toggle(f.owner, o) })}>
                {o === UNASSIGNED ? 'Unassigned' : o}
              </ChipToggle>
            ))}
          </Group>
          <Group label="Other">
            <ChipToggle on={f.overdue} onClick={() => setF({ ...f, overdue: !f.overdue })}>
              Overdue only
            </ChipToggle>
            <ChipToggle on={f.cost} onClick={() => setF({ ...f, cost: !f.cost })}>
              Has cost
            </ChipToggle>
          </Group>
          <div className="flex justify-between border-t border-line pt-2">
            <button className="btn-ghost h-8" onClick={() => setF({ ...EMPTY_FILTERS, q: f.q })}>
              Clear filters
            </button>
            <button className="btn-secondary h-8" onClick={() => setOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
