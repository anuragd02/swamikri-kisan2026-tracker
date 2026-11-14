import { lazy, Suspense, useEffect } from 'react';
import { useData, useToday } from './store';
import { useUI } from './store/ui';
import { navigate, useRoute, VIEWS, href } from './lib/router';
import { diffDays, fmtShort } from './lib/dates';
import { AddButton, QuickAdd } from './components/QuickAdd';
import { ChoiceDialog, Modal, TaskPicker, Toasts } from './components/Overlays';
import { TaskDrawer } from './components/TaskDrawer';
import { PrintChecklist } from './components/PrintChecklist';
import { cx } from './components/ui';
import Dashboard from './views/Dashboard';
import TasksView from './views/Tasks';

const Board = lazy(() => import('./views/Board'));
const Timeline = lazy(() => import('./views/Timeline'));
const MyTasks = lazy(() => import('./views/MyTasks'));
const Expo = lazy(() => import('./views/Expo'));
const SettingsView = lazy(() => import('./views/Settings'));

export default function App() {
  const route = useRoute();
  const today = useToday();
  const recordSnapshot = useData((s) => s.recordSnapshot);
  const tasks = useData((s) => s.tasks);

  // One burndown snapshot per calendar day (kept current as work is done today).
  useEffect(() => {
    const t = setTimeout(() => recordSnapshot(today), 300);
    return () => clearTimeout(t);
  }, [today, tasks, recordSnapshot]);

  useGlobalShortcuts();

  useEffect(() => {
    const label = VIEWS.find((v) => v.id === route.view)?.label ?? '';
    document.title = `${label} · KISAN 2026 · Swamikri Labs`;
  }, [route.view]);

  const wide = route.view === 'timeline' || route.view === 'board';

  return (
    <>
      <div className="app-shell min-h-screen">
        <Header />
        <main className={cx('mx-auto px-4 pb-16 pt-5 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-7xl', route.view === 'expo' && 'max-w-2xl')}>
          <Suspense fallback={<div className="py-20 text-center text-sm text-ink-faint">Loading…</div>}>
            {route.view === 'dashboard' && <Dashboard />}
            {route.view === 'tasks' && <TasksView />}
            {route.view === 'board' && <Board />}
            {route.view === 'timeline' && <Timeline />}
            {route.view === 'mine' && <MyTasks />}
            {route.view === 'expo' && <Expo />}
            {route.view === 'settings' && <SettingsView />}
          </Suspense>
        </main>
        <TaskDrawer />
        <QuickAdd />
        <TaskPicker />
        <ChoiceDialog />
        <ShortcutsDialog />
        <Toasts />
      </div>
      <div className="print-only">
        <PrintChecklist />
      </div>
    </>
  );
}

function Header() {
  const route = useRoute();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4 sm:px-6">
        <a href={href('dashboard')} className="flex shrink-0 items-center gap-3" aria-label="Swamikri Labs, go to dashboard">
          <img src="./brand/logo.png" alt="Swamikri Labs" className="hidden h-8 w-auto md:block" />
          <img src="./brand/mark.png" alt="Swamikri Labs" className="h-8 w-8 md:hidden" />
          <span className="hidden h-7 w-px bg-line md:block" aria-hidden />
          <span className="leading-tight">
            <span className="block text-sm font-semibold tracking-tight">KISAN 2026</span>
            <span className="hidden text-[11px] text-ink-faint sm:block">Expo tracker</span>
          </span>
        </a>
        <Countdown />
        <AddButton className="ml-auto shrink-0 px-2.5 sm:px-3" />
      </div>
      <nav className="no-scrollbar mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-2 sm:px-4" aria-label="Views">
        {VIEWS.map((v) => {
          const active = route.view === v.id;
          return (
            <a
              key={v.id}
              href={href(v.id)}
              aria-current={active ? 'page' : undefined}
              className={cx(
                'relative shrink-0 px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'text-forest' : 'text-ink-muted hover:text-ink',
              )}
            >
              {v.label}
              {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-forest" />}
            </a>
          );
        })}
      </nav>
    </header>
  );
}

function Countdown() {
  const today = useToday();
  const settings = useData((s) => s.settings);
  const toSetup = diffDays(today, settings.setupDate);
  const toExpo = diffDays(today, settings.expoStart);
  const expoLen = diffDays(settings.expoStart, settings.expoEnd) + 1;
  const chip = 'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium tabular';
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  let chips: React.ReactNode;
  if (today > settings.expoEnd) {
    chips = <span className={cx(chip, 'bg-stone-100 text-ink-muted')}>Expo finished · follow-up</span>;
  } else if (toExpo <= 0) {
    const n = diffDays(settings.expoStart, today) + 1;
    chips = (
      <span className={cx(chip, 'bg-leaf text-forest-900')}>
        Expo day {n} of {expoLen}
      </span>
    );
  } else {
    chips = (
      <>
        <span className={cx(chip, toSetup <= 3 ? 'bg-ochre-50 text-ochre-700' : 'bg-forest-50 text-forest')} title={`Move-in ${fmtShort(settings.setupDate)}`}>
          <span className="hidden sm:inline">{toSetup > 0 ? `Setup in ${days(toSetup)}` : toSetup === 0 ? 'Setup today' : 'Setup done'}</span>
          <span className="sm:hidden">{toSetup > 0 ? `Setup ${toSetup}d` : toSetup === 0 ? 'Setup today' : 'Setup done'}</span>
        </span>
        <span className={cx(chip, 'bg-forest text-white')} title={`Opens ${fmtShort(settings.expoStart)}`}>
          <span className="hidden sm:inline">Expo in {days(toExpo)}</span>
          <span className="sm:hidden">Expo {toExpo}d</span>
        </span>
      </>
    );
  }
  return <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">{chips}</div>;
}

function isTyping(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping()) return;
      const ui = useUI.getState();
      if (ui.quickAddOpen || ui.choice || ui.picker) return;
      if (e.key === 'n') {
        e.preventDefault();
        ui.openQuickAdd();
      } else if (e.key === '/') {
        e.preventDefault();
        const focus = () => document.getElementById('global-search')?.focus();
        if (document.getElementById('global-search')) focus();
        else {
          navigate('tasks');
          setTimeout(focus, 50);
        }
      } else if (e.key === '?') {
        e.preventDefault();
        ui.setShortcutsOpen(true);
      } else if (/^[1-9]$/.test(e.key) && Number(e.key) <= VIEWS.length && !ui.drawerId) {
        navigate(VIEWS[Number(e.key) - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

const SHORTCUTS: [string, string][] = [
  ['n', 'Add task (quick-add) from any view'],
  ['/', 'Search tasks'],
  [`1 to ${VIEWS.length}`, 'Switch view'],
  ['?', 'This list'],
  ['↑ ↓', 'Tasks: move between rows'],
  ['→ ←', 'Tasks: expand / collapse'],
  ['Tab / Shift+Tab', 'Tasks: make subtask of the task above / move up a level'],
  ['Alt+↑ / Alt+↓', 'Tasks: reorder'],
  ['Enter', 'Tasks: rename'],
  ['Space', 'Tasks: toggle done'],
  ['o / a / m', 'Tasks: open details / add subtask / move under…'],
  ['Delete', 'Tasks: delete (undo for 10 s)'],
  ['Esc', 'Close dialog or drawer'],
];

function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const set = useUI((s) => s.setShortcutsOpen);
  if (!open) return null;
  return (
    <Modal onClose={() => set(false)} labelledBy="sc-title">
      <div className="p-5">
        <h2 id="sc-title" className="text-base font-semibold">
          Keyboard shortcuts
        </h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-line bg-stone-50 px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
              </dt>
              <dd className="text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
        <button className="btn-secondary mt-4 w-full" onClick={() => set(false)}>
          Close
        </button>
      </div>
    </Modal>
  );
}
