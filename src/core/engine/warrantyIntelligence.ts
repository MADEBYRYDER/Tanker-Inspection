import { daysBetween, formatDate, today } from '../dates';
import type { HomeComponent, HomeRecord, ISODate } from '../types';
import { eventsForComponent } from './timeline';
import { componentWarrantyStatus, warrantyExpiry } from './warranty';

/**
 * Warranty intelligence.
 *
 * The point is not to list expiry dates — the equipment page already does that,
 * and nobody opens it. The point is to catch the one situation where a date is
 * worth money: coverage is about to end **and** there is already something wrong
 * with the item. That is the moment a homeowner can act and save the cost of the
 * repair, and it is invisible unless something is cross-referencing the warranty
 * against the history.
 *
 * So an alert is ranked by whether the record shows trouble, not by how soon the
 * date is. A dishwasher with a documented drainage complaint and six weeks of
 * coverage left outranks a furnace with a clean history and two weeks left,
 * because only one of them is a claim somebody could actually make.
 *
 * Everything asserted here comes from the record. Where a date was derived from
 * an install date and a stated term rather than read off paperwork, that is said
 * plainly — telling someone their coverage ends on a date you inferred, and
 * having them skip a repair over it, would be worse than saying nothing.
 */

export type WarrantyAlertKind =
  /** Coverage ending, and the record already shows a problem with this item. */
  | 'act_now'
  /** Coverage ending soon, nothing wrong on record. Worth a look before it lapses. */
  | 'ending'
  /** Coverage ran out recently, so a claim window has just closed. */
  | 'recently_lapsed';

export interface WarrantyAlert {
  componentId: string;
  componentName: string;
  kind: WarrantyAlertKind;
  expiresOn: ISODate;
  daysRemaining: number;
  provider: string;
  /** The headline. Short enough for a card, specific enough to act on. */
  title: string;
  /** Why this is being raised, in the homeowner's own facts. */
  detail: string;
  /** What to do, phrased as a next step rather than a diagnosis. */
  recommendation: string;
  /** Set when the expiry was calculated rather than documented. */
  derived: boolean;
  /** Timeline entries that made this an `act_now`. */
  supportingEventIds: string[];
}

/** How far ahead to look. A quarter is long enough to book someone and be seen. */
const HORIZON_DAYS = 120;

/** How far back a lapse is still worth mentioning. */
const LAPSE_GRACE_DAYS = 60;

/**
 * Words in a history entry that suggest the item has been misbehaving.
 *
 * Deliberately narrow. A false positive here tells someone to make a warranty
 * claim they have no grounds for, which wastes their afternoon and their
 * credibility with the manufacturer — so this matches complaints and repairs,
 * not routine service.
 */
const TROUBLE_PATTERN =
  /\b(leak\w*|drip\w*|noise|noisy|rattl\w*|intermittent|fault\w*|error|fail\w*|not\s+(?:draining|cooling|heating|working)|won'?t\s+\w+|stopped|clog\w*|overflow\w*|short\s?cycl\w*|repair\w*)\b/i;

function troubleEvents(record: HomeRecord, component: HomeComponent) {
  return eventsForComponent(record, component.id).filter((event) => {
    if (event.type === 'repair') return true;
    const haystack = `${event.title} ${event.description ?? ''}`;
    return TROUBLE_PATTERN.test(haystack);
  });
}

/**
 * Alerts worth a homeowner's attention right now, most actionable first.
 */
export function warrantyAlerts(record: HomeRecord, asOf: ISODate = today()): WarrantyAlert[] {
  const alerts: WarrantyAlert[] = [];

  for (const component of record.components) {
    if (component.retiredOn) continue;

    const status = componentWarrantyStatus(component, asOf);
    if (!status.warranty || !status.expiresOn) continue;

    const daysRemaining = daysBetween(asOf, status.expiresOn);
    if (daysRemaining > HORIZON_DAYS) continue;
    if (daysRemaining < -LAPSE_GRACE_DAYS) continue;

    const derived = !status.warranty.expiresOn;
    const provider = status.warranty.provider;
    const trouble = troubleEvents(record, component);
    const covers = status.warranty.covers;

    const derivedNote = derived
      ? ' This date is calculated from the install date and the stated term, so check the paperwork before relying on it.'
      : '';

    if (daysRemaining < 0) {
      alerts.push({
        componentId: component.id,
        componentName: component.name,
        kind: 'recently_lapsed',
        expiresOn: status.expiresOn,
        daysRemaining,
        provider,
        title: `${component.name} coverage has ended`,
        detail: `The ${provider} warranty ran out ${formatDate(status.expiresOn)}.${derivedNote}`,
        recommendation:
          'Repairs from here are yours. Worth factoring into whether the next fault is worth fixing or replacing.',
        derived,
        supportingEventIds: [],
      });
      continue;
    }

    if (trouble.length > 0) {
      const recent = trouble[0];
      alerts.push({
        componentId: component.id,
        componentName: component.name,
        kind: 'act_now',
        expiresOn: status.expiresOn,
        daysRemaining,
        provider,
        title: `${component.name}: use the warranty before it ends`,
        detail:
          `${provider} coverage ends ${formatDate(status.expiresOn)} — ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}. ` +
          `Your record already shows ${trouble.length === 1 ? 'an issue' : `${trouble.length} issues`} with this item` +
          (recent ? `, most recently "${recent.title}" on ${formatDate(recent.date)}` : '') +
          `.${derivedNote}`,
        recommendation: `Have it looked at while ${provider} is still paying${covers ? ` — the policy covers ${covers.toLowerCase()}` : ''}.`,
        derived,
        supportingEventIds: trouble.slice(0, 3).map((e) => e.id),
      });
      continue;
    }

    alerts.push({
      componentId: component.id,
      componentName: component.name,
      kind: 'ending',
      expiresOn: status.expiresOn,
      daysRemaining,
      provider,
      title: `${component.name} coverage ends ${formatDate(status.expiresOn)}`,
      detail: `${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} of ${provider} coverage left, and nothing on record needing attention.${derivedNote}`,
      recommendation:
        'If anything about it has been off — a noise, a cycle that takes longer than it used to — this is the moment to have it seen.',
      derived,
      supportingEventIds: [],
    });
  }

  /*
   * Ranked by what can still be acted on: a claim you could make today first,
   * then coverage about to lapse, then the ones already gone. Within a kind,
   * soonest first.
   */
  const rank: Record<WarrantyAlertKind, number> = { act_now: 0, ending: 1, recently_lapsed: 2 };
  return alerts.sort(
    (a, b) => rank[a.kind] - rank[b.kind] || a.daysRemaining - b.daysRemaining,
  );
}

/** The one-line summary for the dashboard. Undefined when there is nothing to say. */
export function warrantyHeadline(alerts: WarrantyAlert[]): string | undefined {
  const actionable = alerts.filter((a) => a.kind === 'act_now');
  if (actionable.length > 0) {
    return actionable.length === 1
      ? `${actionable[0]!.componentName} has a known issue and coverage running out.`
      : `${actionable.length} items have known issues and coverage running out.`;
  }
  const ending = alerts.filter((a) => a.kind === 'ending');
  if (ending.length > 0) {
    return ending.length === 1
      ? `${ending[0]!.componentName} coverage ends in ${ending[0]!.daysRemaining} days.`
      : `${ending.length} warranties end within four months.`;
  }
  return undefined;
}

/** Warranties with a usable expiry date, for the "what am I covered for" list. */
export function coverageSummary(
  record: HomeRecord,
  asOf: ISODate = today(),
): { component: HomeComponent; expiresOn: ISODate; daysRemaining: number; provider: string; derived: boolean }[] {
  const rows: {
    component: HomeComponent;
    expiresOn: ISODate;
    daysRemaining: number;
    provider: string;
    derived: boolean;
  }[] = [];
  for (const component of record.components) {
    if (component.retiredOn) continue;
    for (const warranty of component.warranties) {
      const expiresOn = warrantyExpiry(warranty, component);
      if (!expiresOn) continue;
      const daysRemaining = daysBetween(asOf, expiresOn);
      if (daysRemaining < 0) continue;
      rows.push({
        component,
        expiresOn,
        daysRemaining,
        provider: warranty.provider,
        derived: !warranty.expiresOn,
      });
    }
  }
  return rows.sort((a, b) => a.daysRemaining - b.daysRemaining);
}
