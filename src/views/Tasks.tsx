import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CornerDownRight,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  ListChecks,
  MoreHorizontal,
  PanelRightOpen,
  Pencil,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { useData, useOwners, useRollup, useTaskIndex, useToday, useWorkstreams } from '../store';
import { useUI } from '../store/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { Menu } from '../components/Menu';
import { Checkbox, cx, DepChip, DueChip, GateChip, OwnerChips, PriorityChip, ProgressBar, Empty } from '../components/ui';
import { buildGroups, getAncestorIds, getDescendantIds, type DropPosition } from '../lib/tree';
import { isOverdue, unmetDependencies, type Rollup } from '../lib/progress';
import { hasAnyFilter, matchesFilters } from '../lib/filters';
import { parseQuickAdd } from '../lib/quickadd';
import { usePersistentState } from '../lib/usePersistent';
import { moveUnderFlow } from '../components/actions';
import type { Priority, Status, Task, Workstream } from '../types';
import { PRIORITIES, STATUSES, STATUS_LABEL } from '../types';

type Row =
  | { kind: 'ws'; ws: Workstream; key: string }
  | { kind: 'task'; task: Task; depth: number; hasChildren: boolean; collapsed: boolean; context: boolean; key: string }
  | { kind: 'adder'; parentId: string | null; ws: string; depth: number; key: string };

interface DropState {
  overId: string;
  pos: DropPosition;
  invalid: boolean;
}

export default function TasksView() {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const workstreams = useWorkstreams();
  const roll = useRollup();
  const byId = useTaskIndex();
  const today = useToday();
  const [filters] = useFilters();
  const openDrawer = useUI((s) => s.openDrawer);

  const [collapsedArr, setCollapsedArr] = usePersistentState<string[]>('tracker:collapsed', []);
  const collapsed = useMemo(() => new Set(collapsedArr), [collapsedArr]);
  const setCollapsed = (id: string, v: boolean) =>
    setCollapsedArr((prev) => (v ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));

  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ parentId: string | null; ws: string } | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocus = useRef(false);

  const groups = useMemo(() => buildGroups(tasks), [tasks]);
  const filtering = hasAnyFilter(filters);

  const { visible, matched } = useMemo(() => {
    if (!filtering) return { visible: null, matched: null };
    const m = new Set(tasks.filter((t) => matchesFilters(t, filters, roll, today, settings)).map((t) => t.id));
    const v = new Set(m);
    for (const id of m) for (const a of getAncestorIds(tasks, id)) v.add(a);
    return { visible: v, matched: m };
  }, [filtering, tasks, filters, roll, today, settings]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const wsOrder = [...workstreams].sort((a, b) => (a.code === 'INBOX' ? -1 : b.code === 'INBOX' ? 1 : a.order - b.order));
    for (const ws of wsOrder) {
      const roots = groups.get(`root:${ws.code}`) ?? [];
      if (visible && !roots.some((r) => visible.has(r.id))) continue;
      if (ws.code === 'INBOX' && roots.length === 0 && adding?.ws !== 'INBOX') continue;
      out.push({ kind: 'ws', ws, key: `ws:${ws.code}` });
      if (!filtering && collapsed.has(`ws:${ws.code}`)) continue;
      const walk = (list: Task[], depth: number) => {
        for (const t of list) {
          if (visible && !visible.has(t.id)) continue;
          const kids = groups.get(t.id) ?? [];
          const isCollapsed = !filtering && collapsed.has(t.id);
          out.push({
            kind: 'task',
            task: t,
            depth,
            hasChildren: kids.length > 0,
            collapsed: isCollapsed && kids.length > 0,
            context: !!matched && !matched.has(t.id),
            key: t.id,
          });
          if (!isCollapsed) walk(kids, depth + 1);
          if (adding?.parentId === t.id) out.push({ kind: 'adder', parentId: t.id, ws: t.workstream, depth: depth + 1, key: `add:${t.id}` });
        }
      };
      walk(roots, 0);
      if (adding && adding.parentId === null && adding.ws === ws.code) out.push({ kind: 'adder', parentId: null, ws: ws.code, depth: 0, key: `add:root:${ws.code}` });
    }
    return out;
  }, [workstreams, groups, visible, matched, filtering, collapsed, adding]);

  const taskRows = useMemo(() => rows.filter((r): r is Extract<Row, { kind: 'task' }> => r.kind === 'task'), [rows]);

  // Keep keyboard focus on the same task after it moves.
  useEffect(() => {
    if (!restoreFocus.current || !focusedId) return;
    restoreFocus.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(focusedId)}"]`)?.focus();
  }, [rows, focusedId]);

  const s = useData.getState;
  const expandFor = (id: string | null) => {
    if (!id) return;
    const ids = [id, ...getAncestorIds(useData.getState().tasks, id)];
    setCollapsedArr((prev) => prev.filter((x) => !ids.includes(x)));
  };

  const startAdding = (parentId: string | null, ws: string) => {
    if (parentId) expandFor(parentId);
    else setCollapsed(`ws:${ws}`, false);
    setAdding({ parentId, ws });
  };

  const onRowKey = (e: React.KeyboardEvent, row: Extract<Row, { kind: 'task' }>) => {
    if (e.target !== e.currentTarget) return; // ignore keys from inputs inside the row
    const id = row.task.id;
    const idx = taskRows.findIndex((r) => r.task.id === id);
    const focusRow = (i: number) => {
      const r = taskRows[Math.max(0, Math.min(i, taskRows.length - 1))];
      if (r) listRef.current?.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(r.task.id)}"]`)?.focus();
    };
    const mod = e.altKey || e.metaKey || e.ctrlKey;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (mod) {
          restoreFocus.current = true;
          s().shift(id, 1);
        } else focusRow(idx + 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (mod) {
          restoreFocus.current = true;
          s().shift(id, -1);
        } else focusRow(idx - 1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (row.collapsed) setCollapsed(id, false);
        else if (row.hasChildren) focusRow(idx + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (row.hasChildren && !row.collapsed) setCollapsed(id, true);
        else if (row.task.parentId) {
          const pi = taskRows.findIndex((r) => r.task.id === row.task.parentId);
          if (pi >= 0) focusRow(pi);
        }
        break;
      case 'Tab':
        e.preventDefault();
        restoreFocus.current = true;
        if (e.shiftKey) s().outdent(id);
        else {
          // indent under previous sibling: make sure it is expanded
          const sib = (groups.get(row.task.parentId ?? `root:${row.task.workstream}`) ?? []).filter((t) => t.id !== id);
          const me = (groups.get(row.task.parentId ?? `root:${row.task.workstream}`) ?? []).findIndex((t) => t.id === id);
          const prev = me > 0 ? sib[me - 1] : undefined;
          if (s().indent(id) && prev) setCollapsed(prev.id, false);
        }
        break;
      case 'Enter':
      case 'F2':
        e.preventDefault();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) openDrawer(id);
        else setEditingId(id);
        break;
      case ' ':
      case 'x':
        e.preventDefault();
        s().toggleDone(id);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        focusRow(idx + 1 < taskRows.length ? idx + 1 : idx - 1);
        void s().requestDelete(id);
        break;
      case 'o':
        e.preventDefault();
        openDrawer(id);
        break;
      case 'a':
        e.preventDefault();
        startAdding(id, row.task.workstream);
        break;
      case 'm':
        e.preventDefault();
        void moveUnderFlow([id]);
        break;
    }
  };

  // ---------- Drag and drop
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropState | null>(null);
  const startY = useRef(0);
  const dragSubtree = useMemo(() => (activeId ? new Set([activeId, ...getDescendantIds(tasks, activeId, groups)]) : new Set<string>()), [activeId, tasks, groups]);

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    setEditingId(null);
  };
  const onDragMove = (e: DragMoveEvent) => {
    const over = e.over;
    if (!over) return setDrop(null);
    const overId = String(over.id);
    if (overId.startsWith('ws:')) return setDrop({ overId, pos: 'inside', invalid: false });
    const ev = e.activatorEvent as MouseEvent | TouchEvent;
    startY.current = 'touches' in ev ? (ev.touches[0] ?? ev.changedTouches[0]).clientY : ev.clientY;
    const y = startY.current + e.delta.y;
    const rel = (y - over.rect.top) / over.rect.height;
    const pos: DropPosition = rel < 0.3 ? 'before' : rel > 0.7 ? 'after' : 'inside';
    setDrop({ overId, pos, invalid: dragSubtree.has(overId) });
  };
  const onDragEnd = () => {
    const id = activeId;
    const d = drop;
    setActiveId(null);
    setDrop(null);
    if (!id || !d) return;
    if (d.invalid) {
      if (d.overId !== id) useUI.getState().toast("Can't move a task under itself or one of its own subtasks.", { kind: 'error' });
      return;
    }
    if (d.overId.startsWith('ws:')) {
      s().moveToWorkstreamRoot(id, d.overId.slice(3));
      return;
    }
    const target = taskRows.find((r) => r.task.id === d.overId);
    if (d.pos === 'after' && target?.hasChildren && !target.collapsed) {
      // Dropping just below an expanded parent puts it first among its children.
      s().moveUnder(id, d.overId, 0);
    } else {
      if (s().moveRelative(id, d.overId, d.pos) && d.pos === 'inside') setCollapsed(d.overId, false);
    }
  };

  const activeTask = activeId ? byId.get(activeId) : undefined;

  // ---------- Bulk selection
  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  useEffect(() => {
    if (!selectMode) setSelected(new Set());
  }, [selectMode]);

  const allIds = useMemo(() => tasks.filter((t) => groups.has(t.id)).map((t) => t.id), [tasks, groups]);

  return (
    <div className={cx('space-y-3', selectMode && 'pb-28')}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Tasks</h1>
          <p className="text-sm text-ink-muted">
            {filtering ? `${matched!.size} matching · ancestors shown greyed for context` : `${tasks.length} tasks in ${workstreams.filter((w) => tasks.some((t) => t.workstream === w.code)).length} categories`}
          </p>
        </div>
      </div>
      <FilterBar>
        <div className="ml-auto flex items-center gap-1">
          <button className="icon-btn" title="Expand all" aria-label="Expand all" onClick={() => setCollapsedArr([])}>
            <ChevronsUpDown size={16} />
          </button>
          <button
            className="icon-btn"
            title="Collapse all"
            aria-label="Collapse all"
            onClick={() => setCollapsedArr([...allIds])}
          >
            <ChevronsDownUp size={16} />
          </button>
          <button className={cx('icon-btn', selectMode && 'bg-forest-50 text-forest')} title="Select multiple" aria-pressed={selectMode} aria-label="Select multiple" onClick={() => setSelectMode((v) => !v)}>
            <ListChecks size={16} />
          </button>
          <button className="icon-btn" title="Print checklist" aria-label="Print checklist" onClick={() => window.print()}>
            <Printer size={16} />
          </button>
        </div>
      </FilterBar>

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => (setActiveId(null), setDrop(null))}>
        <div ref={listRef} className="card overflow-hidden" role="tree" aria-label="Task outline">
          {rows.length === 0 && <Empty>No tasks match these filters.</Empty>}
          {rows.map((row) => {
            if (row.kind === 'ws')
              return (
                <WsHeader
                  key={row.key}
                  ws={row.ws}
                  collapsed={!filtering && collapsed.has(`ws:${row.ws.code}`)}
                  onToggle={() => setCollapsed(`ws:${row.ws.code}`, !collapsed.has(`ws:${row.ws.code}`))}
                  onAdd={() => startAdding(null, row.ws.code)}
                  drop={drop?.overId === `ws:${row.ws.code}`}
                  dragging={!!activeId}
                />
              );
            if (row.kind === 'adder')
              return (
                <AdderRow
                  key={row.key}
                  parentId={row.parentId}
                  ws={row.ws}
                  depth={row.depth}
                  onClose={() => setAdding(null)}
                />
              );
            const r = roll.get(row.task.id)!;
            return (
              <TaskRow
                key={row.key}
                row={row}
                r={r}
                today={today}
                overdue={isOverdue(row.task, r, today, settings)}
                unmet={unmetDependencies(row.task, byId, roll).length}
                focused={focusedId === row.task.id}
                tabbable={focusedId ? focusedId === row.task.id : row === taskRows[0]}
                editing={editingId === row.task.id}
                selectMode={selectMode}
                selected={selected.has(row.task.id)}
                drop={drop?.overId === row.task.id ? drop : null}
                dimmed={dragSubtree.has(row.task.id)}
                onFocus={() => setFocusedId(row.task.id)}
                onKeyDown={(e) => onRowKey(e, row)}
                onToggleCollapse={() => setCollapsed(row.task.id, !row.collapsed)}
                onStopEditing={() => {
                  setEditingId(null);
                  restoreFocus.current = true;
                }}
                onStartEditing={() => setEditingId(row.task.id)}
                onAddSub={() => startAdding(row.task.id, row.task.workstream)}
                onSelect={() => toggleSel(row.task.id)}
              />
            );
          })}
        </div>
        <DragOverlay dropAnimation={null}>
          {activeTask && (
            <div className="flex max-w-sm items-center gap-2 rounded-lg border border-forest/30 bg-white px-3 py-2 text-sm font-medium shadow-pop">
              <GripVertical size={14} className="text-ink-faint" />
              <span className="truncate">{activeTask.title}</span>
              {dragSubtree.size > 1 && <span className="chip bg-forest-50 text-forest">+{dragSubtree.size - 1}</span>}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <p className="hidden text-xs text-ink-faint sm:block">
        Keyboard: ↑↓ move · → ← expand/collapse · Tab / Shift+Tab indent/outdent · Alt+↑↓ reorder · Enter rename · Space done · o open · a add subtask · m move under · Del delete · drag the handle to move (drop on a task to nest it).
      </p>

      {selectMode && <BulkBar selected={selected} clear={() => setSelected(new Set())} close={() => setSelectMode(false)} />}
    </div>
  );
}

// ----------------------------------------------------------------------------

function WsHeader({
  ws,
  collapsed,
  onToggle,
  onAdd,
  drop,
  dragging,
}: {
  ws: Workstream;
  collapsed: boolean;
  onToggle: () => void;
  onAdd: () => void;
  drop: boolean;
  dragging: boolean;
}) {
  const { setNodeRef } = useDroppable({ id: `ws:${ws.code}` });
  const tasks = useData((s) => s.tasks);
  const roll = useRollup();
  const today = useToday();
  const settings = useData((s) => s.settings);
  const stat = useMemo(() => {
    let done = 0;
    let total = 0;
    let overdue = 0;
    for (const t of tasks) {
      if (t.workstream !== ws.code) continue;
      const r = roll.get(t.id);
      if (!r || r.excluded || !r.isLeaf) continue;
      total++;
      if (t.status === 'done') done++;
      if (isOverdue(t, r, today, settings)) overdue++;
    }
    return { done, total, overdue };
  }, [tasks, roll, ws.code, today, settings]);

  return (
    <div
      ref={setNodeRef}
      className={cx(
        'flex items-center gap-2 border-b border-line bg-stone-50/80 px-2 py-2 sm:px-3',
        drop && 'bg-forest-50 ring-2 ring-inset ring-forest',
        dragging && !drop && 'bg-stone-50',
      )}
      role="treeitem"
      aria-expanded={!collapsed}
    >
      <button className="icon-btn h-7 w-7" onClick={onToggle} aria-label={collapsed ? `Expand ${ws.name}` : `Collapse ${ws.name}`}>
        {collapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
      </button>
      <span className="h-4 w-1 rounded-full" style={{ background: ws.color }} aria-hidden />
      <button className="min-w-0 flex-1 text-left" onClick={onToggle}>
        <span className="text-sm font-semibold">{ws.name}</span>
        <span className="ml-2 text-xs font-medium text-ink-faint">{ws.code}</span>
      </button>
      {stat.overdue > 0 && (
        <span className="chip bg-danger-50 text-danger tabular" title={`${stat.overdue} overdue`}>
          <AlertTriangle size={10} />
          {stat.overdue}
        </span>
      )}
      <span className="tabular text-xs text-ink-muted">
        {stat.done}/{stat.total}
      </span>
      <ProgressBar done={stat.done} total={stat.total} color={ws.color} className="hidden w-20 sm:block" />
      <button className="icon-btn h-7 w-7" onClick={onAdd} aria-label={`Add main task to ${ws.name}`} title="Add main task">
        <Plus size={15} />
      </button>
    </div>
  );
}

interface TaskRowProps {
  row: Extract<Row, { kind: 'task' }>;
  r: Rollup;
  today: string;
  overdue: boolean;
  unmet: number;
  focused: boolean;
  tabbable: boolean;
  editing: boolean;
  selectMode: boolean;
  selected: boolean;
  drop: DropState | null;
  dimmed: boolean;
  onFocus: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onToggleCollapse: () => void;
  onStopEditing: () => void;
  onStartEditing: () => void;
  onAddSub: () => void;
  onSelect: () => void;
}

const TaskRow = memo(function TaskRow(p: TaskRowProps) {
  const { row, r } = p;
  const t = row.task;
  const s = useData.getState;
  const openDrawer = useUI((st) => st.openDrawer);
  const drag = useDraggable({ id: t.id, disabled: p.selectMode || p.editing });
  const dropRef = useDroppable({ id: t.id });
  const isDone = r.status === 'done';
  const indent = row.depth;

  return (
    <div
      ref={dropRef.setNodeRef}
      data-row-id={t.id}
      data-focused={p.focused}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.hasChildren ? !row.collapsed : undefined}
      aria-selected={p.selectMode ? p.selected : undefined}
      tabIndex={p.tabbable ? 0 : -1}
      onFocus={(e) => e.target === e.currentTarget && p.onFocus()}
      onKeyDown={p.onKeyDown}
      className={cx(
        'row relative flex items-start gap-1 border-b border-line/70 py-1.5 pr-1.5 outline-none sm:pr-2',
        'focus:bg-forest-50/70 hover:bg-stone-50',
        row.context && 'opacity-50',
        p.dimmed && 'opacity-40',
        p.selected && 'bg-forest-50',
        p.drop?.pos === 'inside' && (p.drop.invalid ? 'ring-2 ring-inset ring-danger bg-danger-50' : 'ring-2 ring-inset ring-forest bg-forest-50'),
      )}
      style={{ paddingLeft: `calc(0.25rem + ${indent} * var(--indent))` }}
    >
      {p.drop && p.drop.pos !== 'inside' && (
        <div
          className={cx('pointer-events-none absolute right-0 h-0.5', p.drop.invalid ? 'bg-danger' : 'bg-forest', p.drop.pos === 'before' ? '-top-px' : '-bottom-px')}
          style={{ left: `calc(1.5rem + ${indent} * var(--indent))` }}
        />
      )}
      {p.selectMode ? (
        <span className="flex h-7 w-6 items-center justify-center">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={p.selected} onChange={p.onSelect} aria-label={`Select ${t.title}`} />
        </span>
      ) : (
        <button
          ref={drag.setActivatorNodeRef}
          {...drag.listeners}
          {...drag.attributes}
          tabIndex={-1}
          aria-label={`Drag ${t.title}`}
          className="drag-handle row-actions flex h-7 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-black/5 hover:text-ink"
        >
          <span ref={drag.setNodeRef}>
            <GripVertical size={14} />
          </span>
        </button>
      )}
      <span className="flex h-7 w-5 shrink-0 items-center justify-center">
        {row.hasChildren && (
          <button className="rounded p-0.5 text-ink-muted hover:bg-black/5" onClick={p.onToggleCollapse} aria-label={row.collapsed ? 'Expand' : 'Collapse'} tabIndex={-1}>
            {row.collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        )}
      </span>
      <span className="flex h-7 shrink-0 items-center pr-1.5">
        <Checkbox
          checked={isDone}
          partial={!r.isLeaf && r.done > 0 && !isDone}
          onChange={() => s().toggleDone(t.id)}
          label={isDone ? `Mark "${t.title}" not done` : `Mark "${t.title}" done`}
        />
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 py-1">
        {p.editing ? (
          <input
            autoFocus
            defaultValue={t.title}
            className="input h-7 min-w-[12rem] flex-1 px-2"
            aria-label="Task title"
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                (e.target as HTMLInputElement).value = t.title;
                (e.target as HTMLInputElement).blur();
              }
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== t.title) s().updateTask(t.id, { title: v });
              p.onStopEditing();
            }}
          />
        ) : (
          <button
            tabIndex={-1}
            onClick={() => openDrawer(t.id)}
            onDoubleClick={(e) => {
              e.preventDefault();
              useUI.getState().openDrawer(null);
              p.onStartEditing();
            }}
            className={cx(
              'min-w-0 max-w-full text-left text-sm leading-snug hover:underline decoration-ink-faint underline-offset-2',
              row.depth === 0 && 'font-medium',
              isDone && 'text-ink-faint line-through',
              r.status === 'dropped' && 'text-ink-faint line-through',
            )}
          >
            {t.isMilestone && <span className="mr-1.5 inline-block h-2 w-2 rotate-45 bg-forest align-middle" aria-label="Milestone" />}
            {t.title}
          </button>
        )}

        <span className="ml-auto flex flex-wrap items-center gap-1">
          {!r.isLeaf && (
            <span className="flex items-center gap-1.5" title={`${r.done} of ${r.total} subtasks done`}>
              <span className="tabular text-[11px] text-ink-muted">
                {r.done}/{r.total}
              </span>
              <ProgressBar done={r.done} total={r.total} className="w-10 sm:w-14" height={3} />
            </span>
          )}
          {r.hasBlocked && !r.isLeaf && (
            <span className="chip bg-danger-50 text-danger" title="A subtask is blocked">
              Blocked
            </span>
          )}
          {r.isLeaf && r.status !== 'not_started' && r.status !== 'done' && <StatusMini status={r.status} />}
          {!r.isLeaf && t.statusManual && <StatusMini status={r.status} />}
          <DepChip count={p.unmet} />
          {r.childDueAfter && (
            <span className="text-ochre" title={`A subtask is due after this task (${r.childDueAfter})`}>
              <AlertTriangle size={13} />
            </span>
          )}
          <OwnerChips owners={t.owners} className="hidden sm:inline-flex" />
          <span className="hidden sm:inline-flex">
            <GateChip task={t} />
          </span>
          {t.priority === 'P0' ? (
            <PriorityChip p={t.priority} />
          ) : (
            <span className="hidden sm:inline-flex">
              <PriorityChip p={t.priority} />
            </span>
          )}
          <DueChip due={t.dueDate} today={p.today} overdue={p.overdue} closed={isDone} />
        </span>
      </div>

      <div className="row-actions flex shrink-0 items-center">
        <button className="icon-btn hidden h-7 w-7 sm:inline-flex" onClick={p.onAddSub} aria-label="Add subtask" title="Add subtask (a)" tabIndex={-1}>
          <Plus size={15} />
        </button>
        <Menu
          label={`Actions for ${t.title}`}
          className="h-7 w-7"
          trigger={<MoreHorizontal size={16} />}
          items={[
            { label: 'Open details', icon: <PanelRightOpen size={14} />, onSelect: () => openDrawer(t.id), hint: 'o' },
            { label: 'Rename', icon: <Pencil size={14} />, onSelect: p.onStartEditing, hint: 'Enter' },
            { label: 'Add subtask', icon: <Plus size={14} />, onSelect: p.onAddSub, hint: 'a' },
            'sep',
            { label: 'Make main task', icon: <ArrowUpToLine size={14} />, onSelect: () => s().moveToRoot(t.id), hidden: !t.parentId },
            { label: 'Move under…', icon: <CornerDownRight size={14} />, onSelect: () => void moveUnderFlow([t.id]), hint: 'm' },
            { label: 'Indent', icon: <IndentIncrease size={14} />, onSelect: () => s().indent(t.id), hint: 'Tab' },
            { label: 'Outdent', icon: <IndentDecrease size={14} />, onSelect: () => s().outdent(t.id), hidden: !t.parentId, hint: '⇧Tab' },
            { label: 'Move up', icon: <ArrowUp size={14} />, onSelect: () => s().shift(t.id, -1), hint: 'Alt↑' },
            { label: 'Move down', icon: <ArrowDown size={14} />, onSelect: () => s().shift(t.id, 1), hint: 'Alt↓' },
            'sep',
            { label: 'Delete', icon: <Trash2 size={14} />, onSelect: () => void s().requestDelete(t.id), danger: true, hint: 'Del' },
          ]}
        />
      </div>
    </div>
  );
});

function StatusMini({ status }: { status: Status }) {
  const cls: Record<Status, string> = {
    not_started: 'bg-stone-100 text-stone-600',
    in_progress: 'bg-info-50 text-info',
    waiting: 'bg-ochre-50 text-ochre-700',
    blocked: 'bg-danger-50 text-danger',
    done: 'bg-forest-50 text-forest',
    dropped: 'bg-stone-100 text-stone-500',
  };
  return <span className={cx('chip', cls[status])}>{STATUS_LABEL[status]}</span>;
}

function AdderRow({ parentId, ws, depth, onClose }: { parentId: string | null; ws: string; depth: number; onClose: () => void }) {
  const [v, setV] = useState('');
  const tasks = useData((s) => s.tasks);
  const workstreams = useWorkstreams();
  const owners = useOwners();
  const today = useToday();
  const parent = parentId ? tasks.find((t) => t.id === parentId) : undefined;

  const submit = () => {
    const p = parseQuickAdd(v, { today, workstreams: workstreams.map((w) => w.code), tasks, owners });
    if (!p.title) return;
    useData.getState().addTask({
      title: p.title,
      workstream: ws,
      parentId,
      owners: p.owners,
      priority: p.priority ?? parent?.priority ?? 'P1',
      dueDate: p.dueDate ?? parent?.dueDate,
      tags: parent?.tags?.filter((g) => /^G\d$/.test(g)),
    });
    setV('');
  };

  return (
    <div className="flex items-center gap-2 border-b border-line/70 bg-forest-50/40 py-1.5 pr-2" style={{ paddingLeft: `calc(3.25rem + ${depth} * var(--indent))` }}>
      <Plus size={14} className="shrink-0 text-forest" />
      <input
        autoFocus
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        placeholder={parent ? `New subtask of "${parent.title}" · Enter to add, Esc to stop` : `New main task in ${ws} · Enter to add, Esc to stop`}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onClose();
        }}
        onBlur={() => !v.trim() && onClose()}
      />
      <button className="icon-btn h-7 w-7" aria-label="Stop adding" onMouseDown={(e) => e.preventDefault()} onClick={onClose}>
        <X size={14} />
      </button>
    </div>
  );
}

function BulkBar({ selected, clear, close }: { selected: Set<string>; clear: () => void; close: () => void }) {
  const ids = [...selected];
  const s = useData.getState;
  const workstreams = useWorkstreams();
  const owners = useOwners();
  const [owner, setOwner] = useState('');
  const n = ids.length;
  const disabled = n === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-3 py-2.5 shadow-pop backdrop-blur pb-[max(0.625rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
        <span className="text-sm font-semibold tabular">{n} selected</span>
        <select className="input h-8 w-auto" disabled={disabled} value="" onChange={(e) => e.target.value && s().updateMany(ids, { status: e.target.value as Status }, `Updated ${n} tasks`)} aria-label="Set status">
          <option value="">Status…</option>
          {STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABEL[st]}
            </option>
          ))}
        </select>
        <select className="input h-8 w-auto" disabled={disabled} value="" onChange={(e) => e.target.value && s().updateMany(ids, { priority: e.target.value as Priority }, `Updated ${n} tasks`)} aria-label="Set priority">
          <option value="">Priority…</option>
          {PRIORITIES.map((pr) => (
            <option key={pr}>{pr}</option>
          ))}
        </select>
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (owner.trim()) s().addOwnerMany(ids, owner);
            setOwner('');
          }}
        >
          <input className="input h-8 w-32" list="bulk-owners" placeholder="Add person…" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={disabled} aria-label="Add person to selected tasks" />
          <datalist id="bulk-owners">
            {owners.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </form>
        <select className="input h-8 w-auto" disabled={disabled || owners.length === 0} value="" onChange={(e) => e.target.value && s().removeOwnerMany(ids, e.target.value)} aria-label="Remove person from selected tasks">
          <option value="">Remove person…</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <input type="date" className="input h-8 w-auto" disabled={disabled} onChange={(e) => e.target.value && s().updateMany(ids, { dueDate: e.target.value }, `Updated ${n} tasks`)} aria-label="Set due date" />
        <select className="input h-8 w-auto" disabled={disabled} value="" onChange={(e) => e.target.value && s().changeManyWorkstream(ids, e.target.value)} aria-label="Move to category">
          <option value="">Category…</option>
          {workstreams.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code}
            </option>
          ))}
        </select>
        <button className="btn-secondary h-8" disabled={disabled} onClick={() => void moveUnderFlow(ids)}>
          <CornerDownRight size={14} /> Parent…
        </button>
        <button className="btn-ghost h-8 text-danger hover:bg-danger-50 hover:text-danger" disabled={disabled} onClick={() => void s().deleteMany(ids).then(clear)}>
          <Trash2 size={14} /> Delete
        </button>
        <span className="ml-auto flex gap-1">
          <button className="btn-ghost h-8" onClick={clear} disabled={disabled}>
            Clear
          </button>
          <button className="btn-secondary h-8" onClick={close}>
            Done
          </button>
        </span>
      </div>
    </div>
  );
}
