import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { withOwner, withoutOwner } from '../types';

/**
 * Multi-person picker: chips for the people on the task, a text box with suggestions
 * (Enter or comma adds, Backspace on empty removes the last), and one-tap buttons for
 * team members not yet on the task.
 */
export function OwnersInput({
  value,
  onChange,
  suggestions,
  id,
}: {
  value: string[];
  onChange: (next: string[] | undefined) => void;
  suggestions: string[];
  id?: string;
}) {
  const [text, setText] = useState('');
  const commit = (list: string[]) => onChange(list.length ? list : undefined);
  const addText = (raw: string) => {
    let next = value;
    for (const part of raw.split(',')) next = withOwner(next, part);
    if (next !== value) commit(next);
    setText('');
  };
  const notOnTask = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()));
  const listId = `${id ?? 'owners'}-list`;

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-white px-2 py-1 focus-within:border-forest focus-within:ring-2 focus-within:ring-forest/15">
        {value.map((o) => (
          <span key={o} className="inline-flex h-6 items-center gap-1 rounded-full bg-forest-50 pl-2 pr-0.5 text-xs font-medium text-forest">
            {o}
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-forest-100"
              aria-label={`Remove ${o}`}
              onClick={() => commit(withoutOwner(value, o))}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          id={id}
          list={listId}
          className="h-7 min-w-[7rem] flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
          placeholder={value.length ? 'Add another person' : 'Unassigned · type a name'}
          value={text}
          onChange={(e) => (e.target.value.endsWith(',') ? addText(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addText(text);
            } else if (e.key === 'Backspace' && !text && value.length) {
              commit(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && addText(text)}
        />
        <datalist id={listId}>
          {notOnTask.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      </div>
      {notOnTask.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {notOnTask.slice(0, 8).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => commit(withOwner(value, o))}
              className="inline-flex h-6 items-center gap-0.5 rounded-full border border-dashed border-line px-2 text-xs text-ink-muted hover:border-forest/50 hover:text-forest"
            >
              <Plus size={11} /> {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
