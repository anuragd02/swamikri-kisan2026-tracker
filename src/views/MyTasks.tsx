import { useMemo, useState } from 'react';
import { useData, useOwners, useRollup, useTaskIndex, useToday, useWorkstreamMap } from '../store';
import { useUI } from '../store/ui';
import { usePersistentState } from '../lib/usePersistent';
import { byDueThenPriority, isOverdue } from '../lib/progress';
import { addDays } from '../lib/dates';
import { UNASSIGNED } from '../lib/filters';
import { href } from '../lib/router';
import type { Task } from '../types';
import { ownersOf } from '../types';
import { Checkbox, cx, DueChip, Empty, PriorityChip, StatusSelect, WsDot } from '../components/ui';

export default function MyTasks() {
  const owners = useOwners();
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const roll = useRollup();
  const today = useToday();
  const [owner, setOwner] = usePersistentState<string>('tracker:me', '');
  const [showDone, setShowDone] = useState(false);
  const [leavesOnly, setLeavesOnly] = usePersistentState('tracker:mine-leaves', true);

  const mine = useMemo(() => {
    if (!owner) return [];
    return tasks
      .filter((t) => {
        const r = roll.get(t.id);
        if (!r || r.excluded) return false;
        if (leavesOnly && !r.isLeaf) return false;
        const people = ownersOf(t);
        return owner === UNASSIGNED ? people.length === 0 : people.some((o) => o.toLowerCase() === owner.toLowerCase());
      })
      .sort(byDueThenPriority);
  }, [tasks, roll, owner, leavesOnly]);

  const buckets = useMemo(() => {
    const open = mine.filter((t) => roll.get(t.id)!.status !== 'done');
    const weekEnd = addDays(today, 7);
    return [
      { key: 'overdue', title: 'Overdue', tone: 'danger', items: open.filter((t) => isOverdue(t, roll.get(t.id), today, settings)) },
      { key: 'today', title: 'Today', items: open.filter((t) => t.dueDate === today) },
      { key: 'week', title: 'Next 7 days', items: open.filter((t) => t.dueDate && t.dueDate > today && t.dueDate <= weekEnd) },
      { key: 'later', title: 'Later', items: open.filter((t) => t.dueDate && t.dueDate > weekEnd) },
      { key: 'nodate', title: 'No due date', items: open.filter((t) => !t.dueDate) },
      ...(showDone ? [{ key: 'done', title: 'Done', items: mine.filter((t) => roll.get(t.id)!.status === 'done') }] : []),
    ].map((b) => ({ ...b, items: b.key === 'today' || b.key === 'week' || b.key === 'later' ? b.items.filter((t) => !isOverdue(t, roll.get(t.id), today, settings)) : b.items }));
  }, [mine, roll, today, settings, showDone]);

  const openCount = mine.filter((t) => roll.get(t.id)!.status !== 'done').length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My tasks</h1>
        <p className="text-sm text-ink-muted">Pick a person to see every task they are on, including shared tasks, by due date. The choice is remembered on this device.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-[200px]" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
          <option value="">Choose a person…</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
          <option value={UNASSIGNED}>Unassigned</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={leavesOnly} onChange={(e) => setLeavesOnly(e.target.checked)} />
          Actionable only (hide parents)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
          Show done
        </label>
        {owner && <span className="ml-auto text-sm text-ink-muted tabular">{openCount} open</span>}
      </div>

      {owners.length === 0 && (
        <div className="card p-4 text-sm text-ink-muted">
          No people yet. Add team members in <a className="text-forest underline" href={href('settings')}>Settings</a>, or add people on any task (quick-add: <code className="rounded bg-stone-100 px-1">@Name</code>). Meanwhile, choose <em>Unassigned</em> to see tasks nobody owns.
        </div>
      )}

      {owner &&
        buckets.map((b) =>
          b.items.length === 0 && b.key !== 'overdue' ? null : (
            <section key={b.key} className="card overflow-hidden">
              <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold">
                {b.title}
                <span className={cx('chip tabular', b.key === 'overdue' && b.items.length ? 'bg-danger text-white' : 'bg-stone-100 text-ink-muted')}>{b.items.length}</span>
              </h2>
              {b.items.length === 0 ? <Empty>Nothing overdue.</Empty> : <ul className="divide-y divide-line">{b.items.map((t) => <Item key={t.id} t={t} today={today} />)}</ul>}
            </section>
          ),
        )}
    </div>
  );
}

function Item({ t, today }: { t: Task; today: string }) {
  const roll = useRollup();
  const byId = useTaskIndex();
  const wsMap = useWorkstreamMap();
  const settings = useData((s) => s.settings);
  const openDrawer = useUI((s) => s.openDrawer);
  const r = roll.get(t.id)!;
  const parent = t.parentId ? byId.get(t.parentId) : undefined;
  const done = r.status === 'done';
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Checkbox checked={done} onChange={() => useData.getState().toggleDone(t.id)} label={done ? 'Mark not done' : 'Mark done'} size={20} />
      <button className="min-w-0 flex-1 text-left" onClick={() => openDrawer(t.id)}>
        <span className={cx('block text-sm', done && 'text-ink-faint line-through')}>{t.title}</span>
        <span className="flex items-center gap-1.5 truncate text-[11px] text-ink-faint">
          <WsDot color={wsMap.get(t.workstream)?.color ?? '#999'} size={6} />
          {t.workstream}
          {parent && ` › ${parent.title}`}
        </span>
      </button>
      <span className="hidden sm:inline-flex">
        <PriorityChip p={t.priority} />
      </span>
      <DueChip due={t.dueDate} today={today} overdue={isOverdue(t, r, today, settings)} closed={done} showRelative />
      <span className="hidden sm:block">
        <StatusSelect value={r.status} onChange={(s) => useData.getState().setStatus(t.id, s)} />
      </span>
    </li>
  );
}
