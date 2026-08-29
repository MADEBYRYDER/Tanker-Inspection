import type { ISODate } from './types';

/**
 * Date helpers built on plain 'YYYY-MM-DD' strings.
 *
 * Everything here is deliberately UTC-anchored. Home maintenance is a calendar-day
 * concept, not an instant, and running the schedule through local `Date` parsing
 * shifts due dates by a day for anyone west of UTC.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toISODate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

/** Parses 'YYYY-MM-DD' into a UTC-midnight Date. Throws on malformed input. */
export function parseISODate(value: ISODate): Date {
  const m = DATE_RE.exec(value);
  if (!m) throw new Error(`Not an ISO date: ${value}`);
  const [, y, mo, d] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)));
}

export function yearOf(value: ISODate): number {
  return Number(value.slice(0, 4));
}

export function monthOf(value: ISODate): number {
  return Number(value.slice(5, 7));
}

export function addDays(value: ISODate, days: number): ISODate {
  const d = parseISODate(value);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

/**
 * Adds calendar months, clamping the day to the end of the target month so that
 * 'Jan 31' + 1 month is 'Feb 28', not 'Mar 3'.
 */
export function addMonths(value: ISODate, months: number): ISODate {
  const d = parseISODate(value);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth() + 1)));
  return toISODate(d);
}

export function addYears(value: ISODate, years: number): ISODate {
  return addMonths(value, years * 12);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

export function yearsBetween(from: ISODate, to: ISODate): number {
  return daysBetween(from, to) / 365.25;
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: ISODate, b: ISODate): boolean {
  return a < b;
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? '';
}

/** 'September 2026' */
export function monthLabel(value: ISODate): string {
  return `${monthName(monthOf(value))} ${yearOf(value)}`;
}

/** 'Sep 12, 2026' */
export function formatDate(value: ISODate): string {
  const name = monthName(monthOf(value)).slice(0, 3);
  return `${name} ${Number(value.slice(8, 10))}, ${yearOf(value)}`;
}

/** 'in 3 weeks' / '5 days ago' / 'today' */
export function relativeDayLabel(from: ISODate, to: ISODate): string {
  const days = daysBetween(from, to);
  if (days === 0) return 'today';
  const abs = Math.abs(days);
  const unit =
    abs < 14
      ? { n: abs, word: abs === 1 ? 'day' : 'days' }
      : abs < 60
        ? { n: Math.round(abs / 7), word: Math.round(abs / 7) === 1 ? 'week' : 'weeks' }
        : abs < 730
          ? { n: Math.round(abs / 30.4), word: Math.round(abs / 30.4) === 1 ? 'month' : 'months' }
          : { n: Math.round(abs / 365.25), word: Math.round(abs / 365.25) === 1 ? 'year' : 'years' };
  return days > 0 ? `in ${unit.n} ${unit.word}` : `${unit.n} ${unit.word} ago`;
}

/** Nearest date on/after `from` that falls in one of `months` (1–12). */
export function nextDateInMonths(from: ISODate, months: number[]): ISODate {
  if (months.length === 0) return from;
  const sorted = [...months].sort((a, b) => a - b);
  const fromYear = yearOf(from);
  const fromMonth = monthOf(from);
  for (const m of sorted) {
    if (m >= fromMonth) {
      const candidate = `${fromYear}-${String(m).padStart(2, '0')}-01`;
      if (!isBefore(candidate, from)) return candidate;
    }
  }
  const first = sorted[0]!;
  return `${fromYear + 1}-${String(first).padStart(2, '0')}-01`;
}
