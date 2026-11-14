/**
 * All dates in the app are local calendar dates stored as `yyyy-mm-dd` strings.
 * Arithmetic is done in UTC on those calendar dates so the browser's timezone can
 * never shift a due date by a day. "Today" is the calendar date in Asia/Kolkata.
 */

export const TZ = 'Asia/Kolkata';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(s: string | undefined | null): s is string {
  if (!s) return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

export function todayIST(now: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function nowIso(): string {
  return new Date().toISOString();
}

function toUtc(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function makeIso(y: number, month: number, day: number): string | null {
  const s = `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return isIsoDate(s) ? s : null;
}

export function addDays(iso: string, n: number): string {
  return fromUtc(toUtc(iso) + n * 86_400_000);
}

/** b - a in whole days */
export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MONTH_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS.map((m, i) => [m.toLowerCase(), i + 1]),
);
export const DAY_INDEX: Record<string, number> = Object.fromEntries(DAYS.map((d, i) => [d.toLowerCase(), i]));

/** "14 Nov" */
export function fmtShort(iso: string | undefined): string {
  if (!iso || !isIsoDate(iso)) return '';
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Sat 14 Nov" */
export function fmtDay(iso: string | undefined): string {
  if (!iso || !isIsoDate(iso)) return '';
  return `${DAYS[weekday(iso)]} ${fmtShort(iso)}`;
}

/** "Sat 14 Nov 2026" */
export function fmtLong(iso: string | undefined): string {
  if (!iso || !isIsoDate(iso)) return '';
  return `${fmtDay(iso)} ${iso.slice(0, 4)}`;
}

/** Relative label for a due date: "today", "tomorrow", "in 3 d", "2 d late" */
export function fmtRelative(iso: string, today: string): string {
  const n = diffDays(today, iso);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n < 0) return `${-n} d late`;
  return `in ${n} d`;
}

export function dayName(iso: string): string {
  return DAYS[weekday(iso)];
}
