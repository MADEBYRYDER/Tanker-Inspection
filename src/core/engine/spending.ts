import { today, yearOf } from '../dates';
import type { Cents, HomeRecord, ISODate, TimelineEvent } from '../types';
import { summarizeSpend } from './timeline';

/**
 * Homeownership spending intelligence.
 *
 * Not accounting. Accounting tells you what you spent; this is meant to answer
 * the questions a homeowner actually asks out loud — is this house costing more
 * than last year, which appliance has eaten the most money, what should I put
 * aside for next year.
 *
 * Every figure here is derived from entries the owner or a contractor actually
 * recorded. Nothing is estimated, inferred, or filled in from averages. A
 * spending screen that quietly mixes real receipts with national averages is
 * worse than no spending screen, because it looks authoritative and is not.
 * Where coverage is thin, the honest response is to say how thin — which is what
 * `undocumentedEventCount` is for.
 */

/** What each kind of work costs. Maintenance and repair are different questions. */
export type SpendBucket = 'maintenance' | 'repairs' | 'improvements';

const BUCKET_OF: Record<TimelineEvent['type'], SpendBucket | undefined> = {
  service: 'maintenance',
  inspection: 'maintenance',
  repair: 'repairs',
  replacement: 'repairs',
  installation: 'improvements',
  improvement: 'improvements',
  // An issue is something noticed, not work done. Any cost belongs to the repair
  // that follows it, so counting it here would double-count the same problem.
  issue: undefined,
};

export interface YearSpending {
  year: number;
  totalCents: Cents;
  buckets: { bucket: SpendBucket; totalCents: Cents }[];
  eventCount: number;
  /** Events dated in this year that carry no cost, so coverage is legible. */
  undocumentedEventCount: number;
}

export interface SpendingReport {
  current: YearSpending;
  previous?: YearSpending;
  /** Signed percentage change against the previous year. Undefined without a base. */
  changePercent?: number;
  /** Whether the current year is complete, so a partial year is never compared as if whole. */
  currentYearComplete: boolean;
  /** Every year with recorded spend, newest first. */
  history: YearSpending[];
  /** Where money has gone, per item, biggest first. */
  byComponent: {
    componentId: string;
    name: string;
    totalCents: Cents;
    eventCount: number;
  }[];
  lifetimeCents: Cents;
}

export const BUCKET_LABEL: Record<SpendBucket, string> = {
  maintenance: 'Maintenance',
  repairs: 'Repairs',
  improvements: 'Improvements',
};

function yearSpending(record: HomeRecord, year: number): YearSpending {
  const inYear = record.events.filter((e) => yearOf(e.date) === year);
  const totals = new Map<SpendBucket, Cents>();
  let eventCount = 0;
  let undocumentedEventCount = 0;

  for (const event of inYear) {
    if (event.costCents === undefined) {
      undocumentedEventCount += 1;
      continue;
    }
    eventCount += 1;
    const bucket = BUCKET_OF[event.type];
    if (!bucket) continue;
    totals.set(bucket, (totals.get(bucket) ?? 0) + event.costCents);
  }

  const buckets = (['maintenance', 'repairs', 'improvements'] as SpendBucket[])
    .map((bucket) => ({ bucket, totalCents: totals.get(bucket) ?? 0 }))
    .filter((b) => b.totalCents > 0);

  return {
    year,
    totalCents: buckets.reduce((sum, b) => sum + b.totalCents, 0),
    buckets,
    eventCount,
    undocumentedEventCount,
  };
}

export function spendingReport(record: HomeRecord, asOf: ISODate = today()): SpendingReport {
  const thisYear = yearOf(asOf);
  const years = [...new Set(record.events.filter((e) => e.costCents !== undefined).map((e) => yearOf(e.date)))]
    .sort((a, b) => b - a);

  const current = yearSpending(record, thisYear);
  const previous = years.includes(thisYear - 1) ? yearSpending(record, thisYear - 1) : undefined;

  /*
   * Only compare when there is something to compare against. A year with no
   * recorded spend produces a division by zero, and "up ∞%" is not an insight.
   */
  const changePercent =
    previous && previous.totalCents > 0
      ? Math.round(((current.totalCents - previous.totalCents) / previous.totalCents) * 100)
      : undefined;

  const perComponent = new Map<string, { totalCents: Cents; eventCount: number }>();
  for (const event of record.events) {
    if (event.costCents === undefined || !event.componentId) continue;
    const entry = perComponent.get(event.componentId) ?? { totalCents: 0, eventCount: 0 };
    entry.totalCents += event.costCents;
    entry.eventCount += 1;
    perComponent.set(event.componentId, entry);
  }

  const nameOf = new Map(record.components.map((c) => [c.id, c.name]));

  return {
    current,
    previous,
    changePercent,
    currentYearComplete: asOf >= `${thisYear}-12-31`,
    history: years.map((year) => yearSpending(record, year)),
    byComponent: [...perComponent.entries()]
      .map(([componentId, entry]) => ({
        componentId,
        name: nameOf.get(componentId) ?? 'Removed equipment',
        ...entry,
      }))
      .sort((a, b) => b.totalCents - a.totalCents),
    lifetimeCents: summarizeSpend(record).totalCents,
  };
}

/**
 * The sentence under the year-over-year figure.
 *
 * Refuses to draw a conclusion a partial year cannot support. Nine months into a
 * year, "down 14%" is not a fact about the year, and saying it would train
 * someone to under-budget every autumn.
 */
export function comparisonNote(report: SpendingReport): string {
  const { current, previous, changePercent, currentYearComplete } = report;
  if (!previous || changePercent === undefined) {
    return current.totalCents > 0
      ? 'No earlier year to compare against yet. Next year this becomes a trend.'
      : 'Nothing with a cost recorded this year yet.';
  }
  const direction = changePercent === 0 ? 'level with' : changePercent > 0 ? 'up on' : 'down on';
  const magnitude = changePercent === 0 ? '' : `${Math.abs(changePercent)}% `;
  const base = `${magnitude}${direction} ${previous.year}`;
  return currentYearComplete
    ? `${base}.`
    : `${base} so far — ${current.year} is not over, so the full year will land higher.`;
}

/** Per-item answer to "how much has this cost me?". */
export function spendForComponent(record: HomeRecord, componentId: string): {
  totalCents: Cents;
  eventCount: number;
  firstDate?: ISODate;
} {
  const events = record.events
    .filter((e) => e.componentId === componentId && e.costCents !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalCents: events.reduce((sum, e) => sum + (e.costCents ?? 0), 0),
    eventCount: events.length,
    firstDate: events[0]?.date,
  };
}
