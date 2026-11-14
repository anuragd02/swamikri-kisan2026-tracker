import { useEffect, useMemo, useRef, useState } from 'react';
import { CornerLeftUp, Search, X } from 'lucide-react';
import { useUI } from '../store/ui';
import { useData, useWorkstreamMap } from '../store';
import { cx, WsDot } from './ui';
import { getAncestorIds } from '../lib/tree';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 sm:bottom-6 z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} timeoutMs={t.timeoutMs} onDone={() => dismiss(t.id)}>
          <div
            className={cx(
              'pointer-events-auto anim-rise flex max-w-md items-center gap-3 rounded-xl px-4 py-2.5 text-sm shadow-pop',
              t.kind === 'error' ? 'bg-danger text-white' : 'bg-ink text-white',
            )}
            role={t.kind === 'error' ? 'alert' : 'status'}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                className="font-semibold text-leaf-300 hover:text-white underline-offset-2 hover:underline"
                onClick={() => {
                  t.action!.run();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Dismiss" className="opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        </ToastItem>
      ))}
    </div>
  );
}

function ToastItem({ timeoutMs, onDone, children }: { id: number; timeoutMs: number; onDone: () => void; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover) return;
    const t = setTimeout(onDone, timeoutMs);
    return () => clearTimeout(t);
  }, [hover, timeoutMs, onDone]);
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {children}
    </div>
  );
}

export function Modal({
  onClose,
  children,
  labelledBy,
  wide,
  top,
}: {
  onClose: () => void;
  children: React.ReactNode;
  labelledBy?: string;
  wide?: boolean;
  top?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div
      className={cx('fixed inset-0 z-[60] flex justify-center bg-ink/30 px-3', top ? 'items-start pt-[10vh]' : 'items-end sm:items-center pb-3 sm:pb-0')}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cx('anim-rise w-full rounded-2xl bg-white shadow-pop', wide ? 'max-w-xl' : 'max-w-md')}
      >
        {children}
      </div>
    </div>
  );
}

export function ChoiceDialog() {
  const choice = useUI((s) => s.choice);
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [choice]);
  if (!choice) return null;
  const locked = !!choice.typeToConfirm && typed.trim() !== choice.typeToConfirm;
  return (
    <Modal onClose={() => choice.resolve(null)} labelledBy="choice-title">
      <div className="p-5">
        <h2 id="choice-title" className="text-base font-semibold">
          {choice.title}
        </h2>
        {choice.body && <p className="mt-1 text-sm text-ink-muted">{choice.body}</p>}
        {choice.typeToConfirm && (
          <div className="mt-4">
            <label className="label" htmlFor="type-confirm">
              Type <span className="font-mono font-semibold text-ink">{choice.typeToConfirm}</span> to confirm
            </label>
            <input id="type-confirm" className="input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        )}
        <div className="mt-5 flex flex-col gap-2">
          {choice.options.map((o, i) => (
            <button
              key={o.value}
              autoFocus={!choice.typeToConfirm && i === 0}
              disabled={o.tone === 'danger' && locked}
              onClick={() => choice.resolve(o.value)}
              className={cx(
                'flex flex-col items-start rounded-xl border px-4 py-2.5 text-left text-sm transition-colors disabled:opacity-40',
                o.tone === 'danger'
                  ? 'border-danger/30 text-danger hover:bg-danger-50'
                  : o.tone === 'primary'
                    ? 'border-forest bg-forest text-white hover:bg-forest-800'
                    : 'border-line hover:bg-forest-50',
              )}
            >
              <span className="font-medium">{o.label}</span>
              {o.description && <span className={cx('text-xs', o.tone === 'primary' ? 'text-white/80' : 'text-ink-muted')}>{o.description}</span>}
            </button>
          ))}
          <button className="btn-ghost mt-1" onClick={() => choice.resolve(null)}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Searchable task picker used by "Move under..." and dependency selection. */
export function TaskPicker() {
  const picker = useUI((s) => s.picker);
  const tasks = useData((s) => s.tasks);
  const wsMap = useWorkstreamMap();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    setQ('');
    setActive(0);
  }, [picker]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const results = useMemo(() => {
    if (!picker) return [];
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return tasks
      .filter((t) => !picker.excludeIds.has(t.id))
      .filter((t) => {
        if (!words.length) return true;
        const hay = `${t.title} ${t.id} ${t.workstream}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 60);
  }, [picker, tasks, q]);

  if (!picker) return null;
  const choose = (id: string | null) => picker.resolve(id);
  const pathOf = (id: string) =>
    getAncestorIds(tasks, id)
      .reverse()
      .map((a) => byId.get(a)?.title)
      .join(' › ');

  return (
    <Modal onClose={() => picker.resolve(undefined)} labelledBy="picker-title" wide top>
      <div className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Search size={16} className="text-ink-faint" aria-hidden />
        <h2 id="picker-title" className="sr-only">
          {picker.title}
        </h2>
        <input
          autoFocus
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
          placeholder={`${picker.title}: search by title, id or category`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, results.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              choose(results[active].id);
            }
          }}
        />
        <button className="icon-btn" aria-label="Close" onClick={() => picker.resolve(undefined)}>
          <X size={16} />
        </button>
      </div>
      {picker.allowRoot && (
        <button className="flex w-full items-center gap-2 border-b border-line px-4 py-2.5 text-left text-sm font-medium text-forest hover:bg-forest-50" onClick={() => choose(null)}>
          <CornerLeftUp size={14} /> Make it a main task (no parent)
        </button>
      )}
      <ul ref={listRef} className="max-h-[55vh] overflow-y-auto py-1" role="listbox">
        {results.map((t, i) => {
          const path = pathOf(t.id);
          return (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button
                className={cx('flex w-full items-start gap-2.5 px-4 py-2 text-left', i === active ? 'bg-forest-50' : 'hover:bg-stone-50')}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(t.id)}
              >
                <span className="mt-1.5">
                  <WsDot color={wsMap.get(t.workstream)?.color ?? '#999'} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{t.title}</span>
                  <span className="block truncate text-xs text-ink-faint">
                    {t.workstream}
                    {path && ` › ${path}`} · {t.id}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-ink-faint">No matching tasks</li>}
      </ul>
    </Modal>
  );
}
