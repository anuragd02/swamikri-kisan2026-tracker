import type { Task, Workstream } from '../types';
import { STATUS_LABEL } from '../types';
import { buildGroups } from './tree';

const esc = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Flat CSV in outline order with a `path` column like "ASTRA Mechanical > Boom > Weld frame". */
export function toCsv(tasks: Task[], workstreams: Workstream[]): string {
  const groups = buildGroups(tasks);
  const wsName = new Map(workstreams.map((w) => [w.code, w.name]));
  const header = [
    'id', 'path', 'title', 'workstream', 'level', 'parentId', 'status', 'priority', 'owners', 'startDate', 'dueDate',
    'gate', 'milestone', 'estCost', 'actualCost', 'vendor', 'blockedBy', 'tags', 'notes', 'completedAt',
  ];
  const rows: string[] = [header.join(',')];
  const walk = (list: Task[], path: string[], level: number) => {
    for (const t of list) {
      const p = [...path, t.title];
      const gate = t.tags?.find((g) => /^G\d$/.test(g)) ?? '';
      rows.push(
        [
          t.id, p.join(' > '), t.title, t.workstream, level, t.parentId ?? '', STATUS_LABEL[t.status], t.priority,
          (t.owners ?? []).join('; '), t.startDate, t.dueDate, gate, t.isMilestone ? 'yes' : '', t.estCost, t.actualCost, t.vendor,
          (t.blockedBy ?? []).join(' '), (t.tags ?? []).join(' '), t.notes, t.completedAt,
        ]
          .map(esc)
          .join(','),
      );
      walk(groups.get(t.id) ?? [], p, level + 1);
    }
  };
  const seen = new Set<string>();
  for (const w of [...workstreams].sort((a, b) => a.order - b.order)) {
    seen.add(w.code);
    walk(groups.get(`root:${w.code}`) ?? [], [wsName.get(w.code) ?? w.code], 0);
  }
  for (const [k, list] of groups) {
    if (k.startsWith('root:') && !seen.has(k.slice(5))) walk(list, [k.slice(5)], 0);
  }
  return rows.join('\r\n');
}
