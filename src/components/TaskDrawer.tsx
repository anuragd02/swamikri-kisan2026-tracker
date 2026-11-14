import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpToLine, CornerDownRight, ExternalLink, Flag, Link2, Plus, Trash2, X } from 'lucide-react';
import { useUI } from '../store/ui';
import { useData, useOwners, useRollup, useTaskIndex, useToday, useWorkstreams } from '../store';
import type { Priority, Status, Task } from '../types';
import { PRIORITIES } from '../types';
import { getAncestorIds, getChildren } from '../lib/tree';
import { isOverdue, unmetDependencies } from '../lib/progress';
import { fmtLong, fmtShort, isIsoDate } from '../lib/dates';
import { Checkbox, cx, DueChip, ProgressBar, StatusPill, StatusSelect, WsDot } from './ui';
import { addDependencyFlow, moveUnderFlow } from './actions';
import { OwnersInput } from './OwnersInput';

export function TaskDrawer() {
  const id = useUI((s) => s.drawerId);
  const task = useData((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const close = () => useUI.getState().openDrawer(null);

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !useUI.getState().choice && !useUI.getState().picker) {
        const el = document.activeElement as HTMLElement | null;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
          el.blur();
          return;
        }
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  useEffect(() => {
    if (id && !task) close();
  }, [id, task]);

  if (!id || !task) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-ink/20 sm:bg-ink/10" onClick={close} aria-hidden />
      <aside
        className="anim-slide fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-pop sm:w-[460px] sm:border-l sm:border-line"
        role="dialog"
        aria-label="Task details"
      >
        <DrawerBody key={task.id} task={task} onClose={close} />
      </aside>
    </>
  );
}

function Field({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}

/** Text input that commits on blur / Enter. */
function CommitInput({
  value,
  onCommit,
  ...rest
}: { value: string; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      {...rest}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        rest.onKeyDown?.(e);
      }}
    />
  );
}

function DrawerBody({ task, onClose }: { task: Task; onClose: () => void }) {
  const s = useData.getState();
  const tasks = useData((st) => st.tasks);
  const settings = useData((st) => st.settings);
  const workstreams = useWorkstreams();
  const owners = useOwners();
  const roll = useRollup();
  const byId = useTaskIndex();
  const today = useToday();
  const openDrawer = useUI((st) => st.openDrawer);
  const r = roll.get(task.id)!;
  const children = useMemo(() => getChildren(tasks, task.id), [tasks, task.id]);
  const ancestors = useMemo(() => getAncestorIds(tasks, task.id).reverse().map((a) => byId.get(a)!), [tasks, task.id, byId]);
  const blocks = useMemo(() => tasks.filter((t) => t.blockedBy?.includes(task.id)), [tasks, task.id]);
  const unmet = unmetDependencies(task, byId, roll);
  const isParent = children.length > 0;
  const overdue = isOverdue(task, r, today, settings);
  const ws = workstreams.find((w) => w.code === task.workstream);
  const [newSub, setNewSub] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const up = (patch: Partial<Task>) => s.updateTask(task.id, patch);
  const num = (v: string) => {
    const n = Number(v.replace(/[,\s₹]/g, ''));
    return v.trim() === '' || !Number.isFinite(n) ? undefined : n;
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-start gap-2 border-b border-line px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <nav className="flex flex-wrap items-center gap-1 text-xs text-ink-faint" aria-label="Breadcrumb">
            <span className="inline-flex items-center gap-1">
              <WsDot color={ws?.color ?? '#999'} size={6} />
              {ws?.name ?? task.workstream}
            </span>
            {ancestors.map((a) => (
              <span key={a.id} className="inline-flex min-w-0 items-center gap-1">
                ›
                <button className="max-w-[12rem] truncate hover:text-ink hover:underline" onClick={() => openDrawer(a.id)}>
                  {a.title}
                </button>
              </span>
            ))}
          </nav>
          <div className="mt-1 flex items-start gap-2.5">
            <span className="mt-1.5">
              <Checkbox
                checked={r.status === 'done'}
                partial={isParent && r.done > 0 && r.status !== 'done'}
                onChange={() => s.toggleDone(task.id)}
                label={r.status === 'done' ? 'Mark not done' : 'Mark done'}
                size={20}
              />
            </span>
            <textarea
              key={task.title}
              defaultValue={task.title}
              rows={1}
              aria-label="Title"
              className="w-full resize-none rounded-md border border-transparent bg-transparent px-1 py-0.5 text-lg font-semibold leading-snug hover:border-line focus:border-forest focus:outline-none [field-sizing:content]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLTextAreaElement).blur();
                }
              }}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== task.title) up({ title: v });
                else e.target.value = task.title;
              }}
            />
          </div>
        </div>
        <button className="icon-btn shrink-0" aria-label="Close details" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {/* Signals */}
        {(overdue || r.childDueAfter || unmet.length > 0 || r.hasBlocked) && (
          <div className="space-y-1.5">
            {overdue && (
              <p className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
                <AlertTriangle size={14} /> Overdue since {fmtLong(task.dueDate)}
              </p>
            )}
            {r.childDueAfter && (
              <p className="flex items-center gap-2 rounded-lg bg-ochre-50 px-3 py-2 text-sm text-ochre-700">
                <AlertTriangle size={14} /> A subtask is due {fmtShort(r.childDueAfter)}, after this task's due date.
              </p>
            )}
            {r.hasBlocked && !r.isLeaf && (
              <p className="flex items-center gap-2 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger">
                <AlertTriangle size={14} /> One or more subtasks are blocked.
              </p>
            )}
            {unmet.length > 0 && (
              <p className="flex items-center gap-2 rounded-lg bg-ochre-50 px-3 py-2 text-sm text-ochre-700">
                <Link2 size={14} /> Waiting on {unmet.length} unfinished dependenc{unmet.length === 1 ? 'y' : 'ies'}.
              </p>
            )}
          </div>
        )}

        {/* People */}
        <Field label="People" htmlFor="f-owners">
          <OwnersInput id="f-owners" value={task.owners ?? []} suggestions={owners} onChange={(next) => up({ owners: next })} />
        </Field>

        {/* Core fields */}
        <div className="grid grid-cols-2 gap-3">
          <Field label={isParent ? 'Status (from subtasks)' : 'Status'}>
            <div className="flex items-center gap-2">
              <StatusSelect value={r.status === 'dropped' && task.status !== 'dropped' ? task.status : r.status} onChange={(st: Status) => s.setStatus(task.id, st)} derived={isParent} className="w-full" />
            </div>
            {isParent && task.statusManual && (
              <button className="mt-1 text-xs text-forest hover:underline" onClick={() => up({ statusManual: false })}>
                Manual override on · use derived status
              </button>
            )}
          </Field>
          <Field label="Priority" htmlFor="f-pri">
            <select id="f-pri" className="input" value={task.priority} onChange={(e) => up({ priority: e.target.value as Priority })}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p} · {{ P0: 'Must have', P1: 'Should have', P2: 'Nice to have' }[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="f-ws">
            <select id="f-ws" className="input" value={task.workstream} onChange={(e) => void s.changeWorkstream(task.id, e.target.value)}>
              {workstreams.map((w) => (
                <option key={w.code} value={w.code}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date" htmlFor="f-start">
            <input
              id="f-start"
              type="date"
              className="input"
              value={task.startDate ?? ''}
              onChange={(e) => up({ startDate: isIsoDate(e.target.value) ? e.target.value : undefined })}
            />
          </Field>
          <Field label="Due date" htmlFor="f-due">
            <input
              id="f-due"
              type="date"
              className={cx('input', overdue && 'border-danger text-danger')}
              value={task.dueDate ?? ''}
              onChange={(e) => up({ dueDate: isIsoDate(e.target.value) ? e.target.value : undefined })}
            />
          </Field>
        </div>

        {/* Hierarchy */}
        <section>
          <h3 className="section-title mb-2">Hierarchy</h3>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary h-8" onClick={() => void moveUnderFlow([task.id])}>
              <CornerDownRight size={14} /> Move under…
            </button>
            {task.parentId && (
              <button className="btn-secondary h-8" onClick={() => s.moveToRoot(task.id)}>
                <ArrowUpToLine size={14} /> Make main task
              </button>
            )}
          </div>
        </section>

        {/* Subtasks */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">
              Subtasks {isParent && <span className="tabular normal-case tracking-normal text-ink-faint">· {r.done}/{r.total} done</span>}
            </h3>
          </div>
          {isParent && <ProgressBar done={r.done} total={r.total} className="mb-2" />}
          <ul className="divide-y divide-line rounded-lg border border-line">
            {children.map((c) => {
              const cr = roll.get(c.id)!;
              return (
                <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Checkbox checked={cr.status === 'done'} onChange={() => s.toggleDone(c.id)} label={`Toggle ${c.title}`} />
                  <button className={cx('min-w-0 flex-1 truncate text-left text-sm hover:underline', cr.status === 'done' && 'text-ink-faint line-through')} onClick={() => openDrawer(c.id)}>
                    {c.title}
                  </button>
                  {!cr.isLeaf && <span className="tabular text-xs text-ink-faint">{cr.done}/{cr.total}</span>}
                  <DueChip due={c.dueDate} today={today} overdue={isOverdue(c, cr, today, settings)} closed={cr.status === 'done'} />
                </li>
              );
            })}
            <li className="flex items-center gap-2 px-3 py-1.5">
              <Plus size={14} className="text-ink-faint" />
              <input
                className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
                placeholder="Add subtask and press Enter"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSub.trim()) {
                    s.addTask({ title: newSub, workstream: task.workstream, parentId: task.id, priority: task.priority, dueDate: task.dueDate, tags: task.tags?.filter((g) => /^G\d$/.test(g)) });
                    setNewSub('');
                  }
                }}
              />
            </li>
          </ul>
        </section>

        {/* Notes */}
        <Field label="Notes" htmlFor="f-notes">
          <textarea
            id="f-notes"
            key={task.notes ?? ''}
            defaultValue={task.notes ?? ''}
            rows={4}
            placeholder="Details, decisions, links. Markdown is fine."
            className="input h-auto py-2 leading-relaxed"
            onBlur={(e) => e.target.value !== (task.notes ?? '') && up({ notes: e.target.value.trim() ? e.target.value : undefined })}
          />
        </Field>

        {/* Dependencies */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="section-title">Depends on</h3>
            <button className="text-xs font-medium text-forest hover:underline" onClick={() => void addDependencyFlow(task.id)}>
              + Add dependency
            </button>
          </div>
          {(task.blockedBy ?? []).length === 0 ? (
            <p className="text-sm text-ink-faint">No dependencies.</p>
          ) : (
            <ul className="space-y-1">
              {(task.blockedBy ?? []).map((d) => {
                const dt = byId.get(d);
                const dr = roll.get(d);
                return (
                  <li key={d} className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-1.5 text-sm">
                    {dr && <StatusPill status={dr.status} />}
                    <button className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => dt && openDrawer(d)}>
                      {dt?.title ?? d}
                    </button>
                    <button className="icon-btn h-6 w-6" aria-label="Remove dependency" onClick={() => up({ blockedBy: task.blockedBy!.filter((x) => x !== d) })}>
                      <X size={12} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {blocks.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">
              Blocks:{' '}
              {blocks.map((b, i) => (
                <span key={b.id}>
                  {i > 0 && ', '}
                  <button className="hover:underline" onClick={() => openDrawer(b.id)}>
                    {b.title}
                  </button>
                </span>
              ))}
            </p>
          )}
        </section>

        {/* Costs */}
        <section>
          <h3 className="section-title mb-2">Cost and vendor</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Estimated (₹)" htmlFor="f-est">
              <CommitInput id="f-est" inputMode="numeric" className="input tabular" value={task.estCost?.toString() ?? ''} onCommit={(v) => up({ estCost: num(v) })} />
            </Field>
            <Field label="Actual (₹)" htmlFor="f-act">
              <CommitInput id="f-act" inputMode="numeric" className="input tabular" value={task.actualCost?.toString() ?? ''} onCommit={(v) => up({ actualCost: num(v) })} />
            </Field>
            <div className="col-span-2">
              <Field label="Vendor" htmlFor="f-vendor">
                <CommitInput id="f-vendor" className="input" value={task.vendor ?? ''} onCommit={(v) => up({ vendor: v.trim() || undefined })} />
              </Field>
            </div>
          </div>
        </section>

        {/* Links */}
        <section>
          <h3 className="section-title mb-2">Links</h3>
          <ul className="space-y-1">
            {(task.links ?? []).map((l, i) => (
              <li key={i} className="flex items-center gap-2 text-sm">
                <ExternalLink size={13} className="text-ink-faint" />
                <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-forest hover:underline">
                  {l.label || l.url}
                </a>
                <button className="icon-btn h-6 w-6" aria-label="Remove link" onClick={() => up({ links: task.links!.filter((_, j) => j !== i) })}>
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!linkUrl.trim()) return;
              const url = /^https?:\/\//.test(linkUrl) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
              up({ links: [...(task.links ?? []), { label: linkLabel.trim() || url, url }] });
              setLinkLabel('');
              setLinkUrl('');
            }}
          >
            <input className="input w-1/3" placeholder="Label" value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} />
            <input className="input flex-1" placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <button className="btn-secondary" type="submit">
              Add
            </button>
          </form>
        </section>

        {/* Tags & milestone */}
        <section className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Tags (comma separated; G0 to G7 = gate)" htmlFor="f-tags">
            <CommitInput
              id="f-tags"
              className="input"
              value={(task.tags ?? []).join(', ')}
              onCommit={(v) => {
                const tags = [...new Set(v.split(',').map((x) => x.trim()).filter(Boolean))];
                up({ tags: tags.length ? tags : undefined });
              }}
            />
          </Field>
          <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-forest" checked={!!task.isMilestone} onChange={(e) => up({ isMilestone: e.target.checked || undefined })} />
            <Flag size={14} className="text-ink-muted" /> Milestone
          </label>
        </section>

        <p className="text-xs text-ink-faint">
          {task.id} · created {fmtShort(task.createdAt.slice(0, 10))} · updated {fmtShort(task.updatedAt.slice(0, 10))}
          {task.completedAt && ` · done ${fmtShort(task.completedAt.slice(0, 10))}`}
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button className="btn-ghost text-danger hover:bg-danger-50 hover:text-danger" onClick={() => void s.requestDelete(task.id)}>
          <Trash2 size={15} /> Delete
        </button>
        <button className="btn-secondary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  );
}
