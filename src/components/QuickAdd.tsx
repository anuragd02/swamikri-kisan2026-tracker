import { useMemo, useRef, useState } from 'react';
import { CornerDownLeft, Plus } from 'lucide-react';
import { useUI } from '../store/ui';
import { useData, useOwners, useToday, useWorkstreams } from '../store';
import { parseQuickAdd, INBOX } from '../lib/quickadd';
import { fmtDay } from '../lib/dates';
import { Modal } from './Overlays';
import { cx, PriorityChip, WsDot } from './ui';

interface Suggestion {
  insert: string;
  label: string;
  hint?: string;
  color?: string;
}

export function QuickAdd() {
  const open = useUI((s) => s.quickAddOpen);
  if (!open) return null;
  return <QuickAddInner />;
}

function QuickAddInner() {
  const prefill = useUI((s) => s.quickAddPrefill);
  const close = useUI((s) => s.closeQuickAdd);
  const toast = useUI((s) => s.toast);
  const openDrawer = useUI((s) => s.openDrawer);
  const tasks = useData((s) => s.tasks);
  const addTask = useData((s) => s.addTask);
  const workstreams = useWorkstreams();
  const owners = useOwners();
  const today = useToday();
  const [text, setText] = useState(prefill ? `${prefill} ` : '');
  const [sel, setSel] = useState(0);
  const [count, setCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const ctx = useMemo(
    () => ({ today, workstreams: workstreams.map((w) => w.code), tasks, owners }),
    [today, workstreams, tasks, owners],
  );
  const parsed = useMemo(() => parseQuickAdd(text, ctx), [text, ctx]);
  const parent = parsed.parentId ? tasks.find((t) => t.id === parsed.parentId) : undefined;
  const ws = workstreams.find((w) => w.code === parsed.workstream);

  // Autocomplete for the token being typed at the end of the input.
  const suggestions = useMemo((): Suggestion[] => {
    const m = /(^|\s)([#@^])("?)([^\s"]*)$/.exec(text);
    if (!m) return [];
    const [, , sigil, , frag] = m;
    const f = frag.toLowerCase();
    if (sigil === '#')
      return workstreams
        .filter((w) => w.code.toLowerCase().startsWith(f) || w.name.toLowerCase().includes(f))
        .slice(0, 8)
        .map((w) => ({ insert: `#${w.code.toLowerCase()}`, label: w.code, hint: w.name, color: w.color }));
    if (sigil === '@')
      return owners
        .filter((o) => o.toLowerCase().startsWith(f))
        .slice(0, 6)
        .map((o) => ({ insert: o.includes(' ') ? `@"${o}"` : `@${o}`, label: o }));
    if (!f) return [];
    return tasks
      .filter((t) => t.id.startsWith(f) || t.title.toLowerCase().includes(f))
      .slice(0, 6)
      .map((t) => ({ insert: `^${t.id}`, label: t.title, hint: t.id, color: workstreams.find((w) => w.code === t.workstream)?.color }));
  }, [text, workstreams, owners, tasks]);

  // Enter accepts a suggestion only while the last token is still incomplete (e.g. "#bra").
  const tokenComplete = useMemo(() => {
    const m = /(^|\s)([#@^]"?[^\s"]*"?)$/.exec(text);
    if (!m) return true;
    const tok = m[2].toLowerCase();
    if (tok.startsWith('@')) return true;
    return suggestions.some((s) => s.insert.toLowerCase() === tok);
  }, [text, suggestions]);

  const applySuggestion = (s: Suggestion) => {
    setText((t) => t.replace(/(^|\s)[#@^]"?[^\s"]*$/, `$1${s.insert} `));
    setSel(0);
    inputRef.current?.focus();
  };

  const submit = (keepOpen: boolean) => {
    if (!parsed.title) {
      toast('Type a task title first.', { kind: 'error' });
      return;
    }
    const id = addTask({
      title: parsed.title,
      workstream: parsed.workstream,
      parentId: parsed.parentId ?? null,
      owners: parsed.owners,
      priority: parsed.priority ?? 'P1',
      dueDate: parsed.dueDate,
    });
    if (!id) return;
    const where = parent ? `under "${parent.title}"` : `to ${parsed.workstream}`;
    toast(`Added ${where}`, { kind: 'success', action: { label: 'Open', run: () => openDrawer(id) }, timeoutMs: 4000 });
    setText('');
    setCount((c) => c + 1);
    if (!keepOpen) close();
  };

  return (
    <Modal onClose={close} labelledBy="qa-title" wide top>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="qa-title" className="text-sm font-semibold">
            Add task {count > 0 && <span className="font-normal text-ink-faint">· {count} added</span>}
          </h2>
          <span className="hidden text-xs text-ink-faint sm:block">Enter to add · Shift+Enter to add another · Esc to close</span>
        </div>
        <div className="relative">
          <input
            ref={inputRef}
            autoFocus
            className="input h-11 pr-11 text-[15px]"
            placeholder="Order standee #design @Anurag @Ravi !p0 due:nov30"
            value={text}
            aria-label="New task"
            enterKeyHint="done"
            onChange={(e) => {
              setText(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (suggestions.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                setSel((s) => (s + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length) % suggestions.length);
              } else if (suggestions.length && e.key === 'Tab') {
                e.preventDefault();
                applySuggestion(suggestions[sel]);
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions.length && !e.shiftKey && !tokenComplete) applySuggestion(suggestions[sel]);
                else submit(e.shiftKey);
              }
            }}
          />
          <button
            aria-label="Add"
            className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-md bg-forest text-white hover:bg-forest-800"
            onClick={() => submit(false)}
          >
            <CornerDownLeft size={16} />
          </button>
        </div>

        {suggestions.length > 0 && (
          <ul className="mt-1 overflow-hidden rounded-lg border border-line" role="listbox">
            {suggestions.map((s, i) => (
              <li key={s.insert}>
                <button
                  role="option"
                  aria-selected={i === sel}
                  className={cx('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm', i === sel ? 'bg-forest-50' : 'hover:bg-stone-50')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                >
                  {s.color && <WsDot color={s.color} />}
                  <span className="truncate">{s.label}</span>
                  {s.hint && <span className="ml-auto shrink-0 truncate text-xs text-ink-faint">{s.hint}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {/* Live preview */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-ink-faint">Will add</span>
          <span className="max-w-[16rem] truncate font-medium">{parsed.title || '…'}</span>
          <span className="text-ink-faint">to</span>
          <span className={cx('chip border', parsed.workstream === INBOX ? 'border-ochre/40 bg-ochre-50 text-ochre-700' : 'border-line bg-white')}>
            {ws && <WsDot color={ws.color} size={6} />}
            {parsed.workstream}
          </span>
          {parent && (
            <span className="chip border border-line bg-white" title={parent.title}>
              under <span className="max-w-[10rem] truncate">{parent.title}</span>
            </span>
          )}
          {parsed.priority && <PriorityChip p={parsed.priority} />}
          {parsed.owners.map((o) => (
            <span key={o} className="chip bg-stone-100">
              @{o}
            </span>
          ))}
          {parsed.dueDate && <span className="chip bg-stone-100 tabular">due {fmtDay(parsed.dueDate)}</span>}
        </div>
        {parsed.warnings.map((w) => (
          <p key={w} className="mt-1.5 text-xs text-ochre-700">
            {w}
          </p>
        ))}

        <details className="mt-3 text-xs text-ink-muted">
          <summary className="cursor-pointer select-none text-ink-faint hover:text-ink">Token cheatsheet</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-mono text-ink">#design</dt>
            <dd>category: #stall #design #astra #tread (default INBOX)</dd>
            <dt className="font-mono text-ink">@Anurag</dt>
            <dd>person; repeat for several: @Anurag @Ravi (use @"Full Name" for spaces)</dd>
            <dt className="font-mono text-ink">!p0 !p1 !p2</dt>
            <dd>priority (default P1)</dd>
            <dt className="font-mono text-ink">due:nov30</dt>
            <dd>also 30/11, 2026-11-30, today, tomorrow, mon, +3</dd>
            <dt className="font-mono text-ink">^design-02</dt>
            <dd>parent task by id, or ^"title words"</dd>
          </dl>
        </details>
      </div>
    </Modal>
  );
}

export function AddButton({ className }: { className?: string }) {
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  return (
    <button className={cx('btn-primary', className)} onClick={() => openQuickAdd()} title="Add task (n)">
      <Plus size={16} strokeWidth={2.5} />
      <span className="hidden sm:inline">Add task</span>
      <kbd className="ml-1 hidden rounded bg-white/15 px-1 text-[10px] font-medium lg:inline">N</kbd>
    </button>
  );
}
