import type { Charge } from './billing';
import type { ISODateTime, TimelineEvent } from './types';

/**
 * One transaction, one truth.
 *
 * A Dwella handyman visit is two things at once: a charge on the account and a
 * piece of work done to the building. The temptation is to store it twice —
 * once in billing, once in the home record — and the cost of that is a house
 * whose maintenance history disagrees with its own receipts, which is exactly
 * the thing the Home Record exists to stop.
 *
 * So the charge is the origin and the timeline entry is derived from it, linked
 * by `sourceChargeId`. The owner never has to log work Dwella did for them, the
 * money screen totals the same figure the receipt shows, and a buyer reading the
 * record sees the job with contractor provenance rather than an owner's claim.
 *
 * What deliberately does not become history: subscription charges. Paying for
 * Dwella+ in March is not maintenance performed on the building, and putting it
 * in the timeline would pad the work history with the cost of the software that
 * keeps it.
 */

/** Whether this charge represents work done to the property. */
export function isServiceWork(charge: Charge): boolean {
  return charge.kind === 'service' && charge.status === 'paid' && Boolean(charge.propertyId);
}

/**
 * The timeline entry a service charge implies.
 *
 * Marked `contractor` rather than `owner`: this is a job a service provider
 * completed and invoiced, which is a stronger claim than a homeowner's note and
 * should be labelled as one everywhere provenance is shown.
 */
export function timelineEventForCharge(
  charge: Charge,
  now: ISODateTime,
): Omit<TimelineEvent, 'id' | 'homeId'> | undefined {
  if (!isServiceWork(charge)) return undefined;
  return {
    componentId: charge.componentId,
    date: charge.date,
    type: 'service',
    title: charge.description,
    description: charge.receiptNumber
      ? `Completed by Dwella. Receipt ${charge.receiptNumber}.`
      : 'Completed by Dwella.',
    costCents: charge.amountCents,
    vendor: charge.vendor ?? 'Dwella',
    documentIds: [],
    photoIds: [],
    source: 'contractor',
    // The work transfers with the building; the price is stripped from the
    // buyer's copy by the report builder, as with any other cost.
    visibility: 'transferable',
    sourceChargeId: charge.id,
    createdAt: now,
  };
}

/**
 * Which service charges have no timeline entry yet.
 *
 * Idempotent by `sourceChargeId`, so running it twice — on load, after a
 * migration, after a charge arrives — cannot double-enter a job. That property
 * is the whole reason the link is stored rather than matched on date and
 * amount, which would collide the moment somebody has two $39 visits in a
 * month.
 */
export function missingServiceEvents(
  charges: Charge[],
  events: TimelineEvent[],
  now: ISODateTime,
): { propertyId: string; event: Omit<TimelineEvent, 'id' | 'homeId'> }[] {
  const linked = new Set(events.map((e) => e.sourceChargeId).filter(Boolean));
  const out: { propertyId: string; event: Omit<TimelineEvent, 'id' | 'homeId'> }[] = [];
  for (const charge of charges) {
    if (linked.has(charge.id)) continue;
    const event = timelineEventForCharge(charge, now);
    if (event && charge.propertyId) out.push({ propertyId: charge.propertyId, event });
  }
  return out;
}
