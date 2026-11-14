import { useMemo, useState } from 'react';
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { useData, useRollup, useTaskIndex, useToday, useWorkstreamMap } from '../store';
import { useUI } from '../store/ui';
import { FilterBar, useFilters } from '../components/FilterBar';
import { matchesFilters } from '../lib/filters';
import { byDueThenPriority, isOverdue, unmetDependencies } from '../lib/progress';
import { usePersistentState } from '../lib/usePersistent';
import type { Status, Task } from '../types';
import { STATUSES, STATUS_LABEL } from '../types';
import { cx, DepChip, DueChip, OwnerChips, PriorityChip, STATUS_STYLE, StatusSelect, WsDot } from '../components/ui';

export default function Board() {
  const tasks = useData((s) => s.tasks);
  const settings = useData((s) => s.settings);
  const roll = useRollup();
  const today = useToday();
  const [filters] = useFilters();
  const [showMain, setShowMain] = usePersistentState('tracker:board-main', false);
  const [showDropped, setShowDropped] = usePersistentState('tracker:board-dropped', false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  const columns = useMemo(() => {
    const cols = new Map<Status, Task[]>(STATUSES.map((s) => [s, []]));
    for (const t of tasks) {
      const r = roll.get(t.id);
      if (!r) continue;
      if (!r.isLeaf && !showMain) continue;
      if (r.excluded && t.status !== 'dropped') continue; // under a dropped parent
      if (!matchesFilters(t, filters, roll, today, settings)) continue;
      cols.get(r.status)!.push(t);
    }
    for (const list of cols.values()) list.sort(byDueThenPriority);
    return cols;
  }, [tasks, roll, filters, today, settings, showMain]);

  const visibleStatuses = STATUSES.filter((s) => s !== 'dropped' || showDropped);
  const active = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Board</h1>
        <p className="text-sm text-ink-muted">Drag cards between columns to change status. {showMain ? 'Showing main tasks and subtasks.' : 'Showing actionable tasks (no parents).'}</p>
      </div>
      <FilterBar>
        <label className="ml-auto flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={showMain} onChange={(e) => setShowMain(e.target.checked)} />
          Main tasks
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-forest" checked={showDropped} onChange={(e) => setShowDropped(e.target.checked)} />
          Dropped
        </label>
      </FilterBar>

      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={(e) => {
          setActiveId(null);
          const to = e.over?.id as Status | undefined;
          const id = String(e.active.id);
          if (!to) return;
          const r = roll.get(id);
          if (r?.status === to) return;
          useData.getState().setStatus(id, to);
        }}
      >
        <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
          {visibleStatuses.map((s) => (
            <Column key={s} status={s} tasks={columns.get(s)!} today={today} activeId={activeId} />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{active && <Card task={active} today={today} overlay />}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, tasks, today, activeId }: { status: Status; tasks: Task[]; today: string; activeId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const [limit, setLimit] = useState(40);
  return (
    <section
      ref={setNodeRef}
      className={cx('flex w-[85vw] max-w-[320px] shrink-0 snap-start flex-col rounded-xl bg-stone-100/70 sm:w-[300px]', isOver && 'ring-2 ring-forest bg-forest-50')}
      aria-label={STATUS_LABEL[status]}
    >
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_STYLE[status].dot }} aria-hidden />
        <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
        <span className="text-xs text-ink-faint tabular">{tasks.length}</span>
      </header>
      <div className="flex max-h-[calc(100vh-280px)] min-h-[120px] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.slice(0, limit).map((t) => (
          <DraggableCard key={t.id} task={t} today={today} hidden={activeId === t.id} />
        ))}
        {tasks.length > limit && (
          <button className="rounded-lg py-2 text-xs font-medium text-forest hover:bg-white" onClick={() => setLimit((l) => l + 60)}>
            Show {Math.min(60, tasks.length - limit)} more of {tasks.length - limit}
          </button>
        )}
        {tasks.length === 0 && <p className="py-6 text-center text-xs text-ink-faint">Drop here</p>}
      </div>
    </section>
  );
}

function DraggableCard({ task, today, hidden }: { task: Task; today: string; hidden: boolean }) {
  const { setNodeRef, listeners, attributes } = useDraggable({ id: task.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cx('touch-manipulation', hidden && 'opacity-30')}>
      <Card task={task} today={today} />
    </div>
  );
}

function Card({ task, today, overlay }: { task: Task; today: string; overlay?: boolean }) {
  const wsMap = useWorkstreamMap();
  const roll = useRollup();
  const byId = useTaskIndex();
  const settings = useData((s) => s.settings);
  const openDrawer = useUI((s) => s.openDrawer);
  const r = roll.get(task.id)!;
  const ws = wsMap.get(task.workstream);
  const parent = task.parentId ? byId.get(task.parentId) : undefined;
  const unmet = unmetDependencies(task, byId, roll).length;
  return (
    <article
      className={cx('cursor-grab rounded-lg border border-line bg-white p-3 shadow-card active:cursor-grabbing', overlay && 'rotate-1 shadow-pop')}
      onClick={() => openDrawer(task.id)}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <WsDot color={ws?.color ?? '#999'} size={6} />
        <span className="font-medium">{task.workstream}</span>
        {parent && <span className="min-w-0 truncate">› {parent.title}</span>}
      </div>
      <p className="text-sm leading-snug">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {!r.isLeaf && (
          <span className="chip bg-stone-100 tabular text-ink-muted">
            {r.done}/{r.total}
          </span>
        )}
        <PriorityChip p={task.priority} />
        <DueChip due={task.dueDate} today={today} overdue={isOverdue(task, r, today, settings)} closed={r.status === 'done'} />
        <DepChip count={unmet} />
        <OwnerChips owners={task.owners} />
        {/* Touch-friendly status change without dragging */}
        <span className="ml-auto" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
          <StatusSelect value={r.status} onChange={(s) => useData.getState().setStatus(task.id, s)} className="h-6 max-w-[7.5rem] text-[11px]" />
        </span>
      </div>
    </article>
  );
}
