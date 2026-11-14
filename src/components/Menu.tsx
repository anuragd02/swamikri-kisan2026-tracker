import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cx } from './ui';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hint?: string;
  hidden?: boolean;
  disabled?: boolean;
}

export function Menu({
  trigger,
  items,
  label,
  className,
}: {
  trigger: ReactNode;
  items: (MenuItem | 'sep')[];
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const b = btn.current.getBoundingClientRect();
    const p = pop.current.getBoundingClientRect();
    let top = b.bottom + 4;
    if (top + p.height > window.innerHeight - 8) top = Math.max(8, b.top - p.height - 4);
    let left = b.right - p.width;
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8));
    setPos({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    pop.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    return () => {
      document.removeEventListener('pointerdown', close, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const visible = items.filter((i) => i === 'sep' || !i.hidden);

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx('icon-btn', className)}
        onClick={(e) => {
          e.stopPropagation();
          setPos(null);
          setOpen((o) => !o);
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={pop}
            role="menu"
            className="fixed z-[80] min-w-[210px] rounded-xl border border-line bg-white py-1 shadow-pop"
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
              e.preventDefault();
              const btns = [...pop.current!.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
              const i = btns.indexOf(document.activeElement as HTMLButtonElement);
              btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
            }}
          >
            {visible.map((it, i) =>
              it === 'sep' ? (
                <div key={`sep${i}`} className="my-1 h-px bg-line" />
              ) : (
                <button
                  key={it.label}
                  role="menuitem"
                  disabled={it.disabled}
                  className={cx(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none disabled:opacity-40 sm:py-1.5',
                    it.danger ? 'text-danger hover:bg-danger-50 focus:bg-danger-50' : 'hover:bg-forest-50 focus:bg-forest-50',
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  <span className="flex w-4 justify-center text-ink-muted">{it.icon}</span>
                  <span className="flex-1">{it.label}</span>
                  {it.hint && <kbd className="text-[10px] text-ink-faint">{it.hint}</kbd>}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
