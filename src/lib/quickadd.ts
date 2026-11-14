/**
 * Quick-add parser (A7).
 *   Print QR stickers #brand @Anurag !p1 due:nov30 ^brand-02
 * Tokens: #workstream  @person, repeatable (or @"Full Name")  !p0/!p1/!p2  due:<date>  ^taskId or ^"title fragment"
 */
import type { Priority, Task } from '../types';
import { DAY_INDEX, MONTH_INDEX, addDays, diffDays, isIsoDate, makeIso, weekday } from './dates';

export interface QuickAddContext {
  today: string;
  workstreams: string[];
  tasks: Pick<Task, 'id' | 'title' | 'workstream'>[];
  owners?: string[];
}

export interface QuickAddResult {
  title: string;
  workstream: string;
  workstreamGiven: boolean;
  owners: string[];
  priority?: Priority;
  dueDate?: string;
  parentId?: string;
  /** Problems the user should see; the task can still be created. */
  warnings: string[];
}

export const INBOX = 'INBOX';

/** Parse a date token relative to `today` (yyyy-mm-dd). Returns null if not understood. */
export function parseDueToken(raw: string, today: string): string | null {
  const s = raw.trim().toLowerCase().replace(/[,.]$/, '');
  if (!s) return null;
  if (isIsoDate(s as string | undefined)) return s;
  if (s === 'today' || s === 'tod') return today;
  if (s === 'tomorrow' || s === 'tmr' || s === 'tom') return addDays(today, 1);
  if (s === 'yesterday') return addDays(today, -1);

  const plus = /^\+(\d{1,3})d?$/.exec(s);
  if (plus) return addDays(today, Number(plus[1]));

  // weekday: next occurrence after today
  const wd = s.slice(0, 3);
  if (wd in DAY_INDEX && ('sunday monday tuesday wednesday thursday friday saturday'.includes(s) || s.length === 3)) {
    const ahead = (DAY_INDEX[wd] - weekday(today) + 7) % 7 || 7;
    return addDays(today, ahead);
  }

  const year = Number(today.slice(0, 4));
  const withYear = (month: number, day: number, y?: number): string | null => {
    if (y !== undefined) return makeIso(y < 100 ? 2000 + y : y, month, day);
    const cand = makeIso(year, month, day);
    if (!cand) return null;
    // A date far in the past most likely means next year (e.g. "jan5" typed in December).
    return diffDays(today, cand) < -60 ? makeIso(year + 1, month, day) : cand;
  };

  // dd/mm or dd/mm/yyyy (also dd-mm)
  const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(s);
  if (dm) return withYear(Number(dm[2]), Number(dm[1]), dm[3] ? Number(dm[3]) : undefined);

  // nov30, nov-30, november30
  const md = /^([a-z]{3,9})-?(\d{1,2})$/.exec(s);
  if (md && md[1].slice(0, 3) in MONTH_INDEX) return withYear(MONTH_INDEX[md[1].slice(0, 3)], Number(md[2]));
  // 30nov, 30-nov
  const dmn = /^(\d{1,2})-?([a-z]{3,9})$/.exec(s);
  if (dmn && dmn[2].slice(0, 3) in MONTH_INDEX) return withYear(MONTH_INDEX[dmn[2].slice(0, 3)], Number(dmn[1]));

  return null;
}

export function findParent(
  ref: string,
  tasks: QuickAddContext['tasks'],
): { id?: string; warning?: string } {
  const q = ref.trim().toLowerCase();
  if (!q) return {};
  const byId = tasks.find((t) => t.id.toLowerCase() === q);
  if (byId) return { id: byId.id };
  const matches = tasks.filter((t) => t.title.toLowerCase().includes(q));
  if (matches.length === 1) return { id: matches[0].id };
  const exact = matches.filter((t) => t.title.toLowerCase() === q);
  if (exact.length === 1) return { id: exact[0].id };
  if (matches.length === 0) return { warning: `No task matches ^${ref}. Added without a parent.` };
  return {
    warning: `^${ref} matches ${matches.length} tasks (${matches
      .slice(0, 3)
      .map((m) => m.id)
      .join(', ')}${matches.length > 3 ? ', ...' : ''}). Use the task id.`,
  };
}

export function parseQuickAdd(input: string, ctx: QuickAddContext): QuickAddResult {
  let text = ` ${input} `;
  const warnings: string[] = [];
  const res: QuickAddResult = { title: '', workstream: INBOX, workstreamGiven: false, owners: [], warnings };
  const addOwner = (n: string) => {
    const o = canonicalOwner(n, ctx.owners);
    if (!res.owners.some((x) => x.toLowerCase() === o.toLowerCase())) res.owners.push(o);
  };

  const take = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      fn(m);
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
      re.lastIndex = 0;
    }
  };

  // ^"title fragment" before ^id so the quoted form wins.
  take(/\s\^"([^"]*)"(?=\s)/g, (m) => {
    const r = findParent(m[1], ctx.tasks);
    if (r.id) res.parentId = r.id;
    if (r.warning) warnings.push(r.warning);
  });
  take(/\s\^(\S+)(?=\s)/g, (m) => {
    const r = findParent(m[1], ctx.tasks);
    if (r.id) res.parentId = r.id;
    if (r.warning) warnings.push(r.warning);
  });
  take(/\s#([A-Za-z][\w-]*)(?=\s)/g, (m) => {
    const code = ctx.workstreams.find((w) => w.toLowerCase() === m[1].toLowerCase());
    if (code) {
      res.workstream = code;
      res.workstreamGiven = true;
    } else warnings.push(`Unknown category #${m[1]}. Saved to INBOX.`);
  });
  // One pass for @Name and @"Full Name" so people keep the order they were typed in.
  take(/\s@(?:"([^"]+)"|(\S+))(?=\s)/g, (m) => addOwner(m[1] ?? m[2]));
  take(/\s!(p[012])(?=\s)/gi, (m) => {
    res.priority = m[1].toUpperCase() as Priority;
  });
  take(/\sdue:(\S+)(?=\s)/gi, (m) => {
    const d = parseDueToken(m[1], ctx.today);
    if (d) res.dueDate = d;
    else warnings.push(`Could not read date "${m[1]}". Try nov30, 30/11, 2026-11-30, tomorrow or mon.`);
  });

  if (res.parentId) {
    const parent = ctx.tasks.find((t) => t.id === res.parentId)!;
    if (res.workstreamGiven && parent.workstream !== res.workstream) {
      warnings.push(`Subtasks follow their parent, so this goes to ${parent.workstream}.`);
    }
    res.workstream = parent.workstream;
    res.workstreamGiven = true;
  }
  res.title = text.replace(/\s+/g, ' ').trim();
  return res;
}

function canonicalOwner(name: string, owners: string[] = []): string {
  const hit = owners.find((o) => o.toLowerCase() === name.toLowerCase());
  return hit ?? name;
}
