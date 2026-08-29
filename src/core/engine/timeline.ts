import { compareDates, today, yearOf } from '../dates';
import { sumCents } from '../money';
import type {
  Cents,
  ComponentCategory,
  HomeRecord,
  ISODate,
  SpendSummary,
  TimelineEvent,
} from '../types';

export interface TimelineYearGroup {
  year: number;
  totalCents: Cents;
  events: TimelineEvent[];
}

/** Newest first, which is how the Home Timeline reads. */
export function sortEventsDescending(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => compareDates(b.date, a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function groupEventsByYear(events: TimelineEvent[]): TimelineYearGroup[] {
  const groups = new Map<number, TimelineEvent[]>();
  for (const event of sortEventsDescending(events)) {
    const year = yearOf(event.date);
    const bucket = groups.get(year);
    if (bucket) bucket.push(event);
    else groups.set(year, [event]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearEvents]) => ({
      year,
      totalCents: sumCents(yearEvents.map((e) => e.costCents)),
      events: yearEvents,
    }));
}

export interface SpendQuery {
  from?: ISODate;
  to?: ISODate;
  componentId?: string;
  types?: TimelineEvent['type'][];
}

/** What has actually been spent, by category. Only counts events that carry a cost. */
export function summarizeSpend(record: HomeRecord, query: SpendQuery = {}): SpendSummary {
  const componentCategory = new Map<string, ComponentCategory>(
    record.components.map((c) => [c.id, c.category]),
  );

  const matching = record.events.filter((e) => {
    if (query.from && compareDates(e.date, query.from) < 0) return false;
    if (query.to && compareDates(e.date, query.to) > 0) return false;
    if (query.componentId && e.componentId !== query.componentId) return false;
    if (query.types && !query.types.includes(e.type)) return false;
    return e.costCents !== undefined;
  });

  const byCategory = new Map<ComponentCategory | 'unassigned', Cents>();
  for (const event of matching) {
    const category = event.componentId
      ? (componentCategory.get(event.componentId) ?? 'unassigned')
      : 'unassigned';
    byCategory.set(category, (byCategory.get(category) ?? 0) + (event.costCents ?? 0));
  }

  return {
    totalCents: sumCents(matching.map((e) => e.costCents)),
    byCategory: [...byCategory.entries()]
      .map(([category, totalCents]) => ({ category, totalCents }))
      .sort((a, b) => b.totalCents - a.totalCents),
    eventCount: matching.length,
  };
}

/** Calendar-year spend, for "how much have I spent on repairs this year?" */
export function spendForYear(record: HomeRecord, year: number): SpendSummary {
  return summarizeSpend(record, { from: `${year}-01-01`, to: `${year}-12-31` });
}

export function eventsForComponent(record: HomeRecord, componentId: string): TimelineEvent[] {
  return sortEventsDescending(record.events.filter((e) => e.componentId === componentId));
}

export function mostRecentEvent(
  record: HomeRecord,
  predicate: (event: TimelineEvent) => boolean,
): TimelineEvent | undefined {
  return sortEventsDescending(record.events).find(predicate);
}

/** Events in the last N days — feeds the dashboard's "recently" strip. */
export function recentEvents(record: HomeRecord, limit = 5, asOf: ISODate = today()): TimelineEvent[] {
  return sortEventsDescending(record.events.filter((e) => compareDates(e.date, asOf) <= 0)).slice(
    0,
    limit,
  );
}
