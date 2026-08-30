import { addMonths, addYears, monthOf, today, yearOf } from './dates';
import type { Cents, ISODate, ISODateTime } from './types';

/**
 * Billing.
 *
 * The split that governs this whole file: **billing is account-level;
 * memberships are property-level.** One card, one payment history, one person
 * responsible — but a plan per house. Somebody can hold Dwella Care on their
 * residence, Dwella+ on a rental, and nothing at all on the beach house, and
 * that has to be legible rather than arriving as a single undifferentiated
 * charge at the end of the month.
 *
 * So every charge carries an account id and, where the charge is about a
 * building rather than the account, a property id. That one field is what turns
 * a Stripe-style transaction list into something a landlord with six rentals can
 * actually read — "Rental #2 — $39.00" instead of "DWELLA SUBSCRIPTION x6".
 */

/* -------------------------------------------------------------------------
 * Tiers
 * ---------------------------------------------------------------------- */

/** What a single property is signed up to. Not an account-wide setting. */
export type Tier = 'free' | 'plus' | 'care';

export interface TierDefinition {
  key: Tier;
  name: string;
  /** Monthly price for a first paid property, in cents. */
  monthlyCents: Cents;
  /**
   * Monthly price for each further property on the same tier.
   *
   * Only Dwella+ is discounted this way: the marginal cost of forecasting a
   * second house is small, so the second one is cheaper. Care is not, because
   * its cost is two people in a van visiting a specific address twice a year,
   * and that does not get cheaper because you own more houses.
   */
  additionalMonthlyCents: Cents;
  annualCents?: Cents;
  blurb: string;
  includes: string[];
}

export const TIERS: Record<Tier, TierDefinition> = {
  free: {
    key: 'free',
    name: 'Dwella Free',
    monthlyCents: 0,
    additionalMonthlyCents: 0,
    blurb: 'The home record, the schedule, and the reminders. Free forever.',
    includes: ['Home record and timeline', 'Maintenance schedule and reminders', 'Home scan'],
  },
  plus: {
    key: 'plus',
    name: 'Dwella+',
    monthlyCents: 799,
    additionalMonthlyCents: 399,
    annualCents: 6999,
    blurb: 'Knows what is coming: the forecast, warranty alerts, and the full health breakdown.',
    includes: [
      'Home Forecast — 1, 3, and 5 years',
      'Replacement planning and monthly reserve',
      'Warranty intelligence',
      'Every system’s health, with reasons',
      'Unlimited Ask Dwella',
      'Household sharing',
    ],
  },
  care: {
    key: 'care',
    name: 'Dwella Care',
    monthlyCents: 3_900,
    additionalMonthlyCents: 3_900,
    annualCents: 42_900,
    blurb: 'Everything in Dwella+, plus people who actually turn up twice a year.',
    includes: [
      'Everything in Dwella+',
      '2 seasonal care visits a year',
      'Priority booking',
      'Member service pricing',
      'Home Record maintained for you',
      'Annual maintenance plan',
    ],
  },
};

/** Care includes Plus, so anything gated on Plus is on for a Care property too. */
export function tierIncludesPlus(tier: Tier): boolean {
  return tier === 'plus' || tier === 'care';
}

export const TIER_ORDER: Tier[] = ['free', 'plus', 'care'];

/**
 * Which direction a plan change goes.
 *
 * The tiers are strictly ordered — free, then Plus, then Care, each containing
 * the one below — so "upgrade" and "downgrade" are facts about the pair rather
 * than marketing words. A screen that says "Switch to Dwella+" is making the
 * owner work out which way they are moving from the prices; naming the
 * direction is the difference between a menu and an answer.
 */
export type TierMove = 'upgrade' | 'downgrade' | 'same';

export function tierMove(from: Tier, to: Tier): TierMove {
  const a = TIER_ORDER.indexOf(from);
  const b = TIER_ORDER.indexOf(to);
  if (a === b) return 'same';
  return b > a ? 'upgrade' : 'downgrade';
}

/* -------------------------------------------------------------------------
 * Subscriptions — one per property
 * ---------------------------------------------------------------------- */

export type SubscriptionSource = 'none' | 'trial' | 'app_store' | 'play_store' | 'promo';
export type BillingCycle = 'monthly' | 'annual';

export interface PropertySubscription {
  id: string;
  propertyId: string;
  tier: Tier;
  source: SubscriptionSource;
  cycle: BillingCycle;
  startedOn: ISODate;
  /** When the next payment is taken. Absent on free and on a trial. */
  renewsOn?: ISODate;
  trialStartedOn?: ISODate;
  trialEndsOn?: ISODate;
  /** Set when cancelled; access continues to `renewsOn`. */
  cancelledOn?: ISODate;
  billingReference?: string;
}

export const TRIAL_DAYS = 30;

export function freeSubscription(propertyId: string, on: ISODate): PropertySubscription {
  return {
    id: `sub_${propertyId}`,
    propertyId,
    tier: 'free',
    source: 'none',
    cycle: 'monthly',
    startedOn: on,
  };
}

/**
 * The tier a property is actually on right now.
 *
 * Expiry is evaluated against the clock, never a stored flag: a trial that ran
 * out while the phone was off has run out, and a paid subscription whose
 * renewal date has passed without the store confirming a payment drops back to
 * free rather than continuing on trust.
 */
export function tierFor(subscription: PropertySubscription | undefined, asOf: ISODate): Tier {
  if (!subscription) return 'free';
  if (subscription.source === 'trial') {
    return subscription.trialEndsOn && asOf < subscription.trialEndsOn ? subscription.tier : 'free';
  }
  if (subscription.source === 'none') return 'free';
  if (subscription.renewsOn && asOf >= subscription.renewsOn) return 'free';
  return subscription.tier;
}

export function trialDaysRemaining(
  subscription: PropertySubscription | undefined,
  asOf: ISODate,
): number | undefined {
  if (!subscription?.trialEndsOn || subscription.source !== 'trial') return undefined;
  if (asOf >= subscription.trialEndsOn) return undefined;
  const ms = new Date(subscription.trialEndsOn).getTime() - new Date(asOf).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/**
 * Whether a trial can still be offered for this property.
 *
 * Per property rather than per account, on purpose: somebody who tried Dwella+
 * on their house last year and is now adding a rental has not yet seen what the
 * forecast says about the rental, and that is a different question.
 */
export function trialAvailable(subscription: PropertySubscription | undefined): boolean {
  return !subscription?.trialStartedOn;
}

export function startTrial(
  subscription: PropertySubscription,
  asOf: ISODate,
  tier: Exclude<Tier, 'free'> = 'plus',
): PropertySubscription {
  return {
    ...subscription,
    tier,
    source: 'trial',
    trialStartedOn: asOf,
    trialEndsOn: addDaysISO(asOf, TRIAL_DAYS),
    renewsOn: undefined,
  };
}

function addDaysISO(date: ISODate, days: number): ISODate {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------
 * Pricing across a portfolio
 * ---------------------------------------------------------------------- */

export interface PricedSubscription {
  propertyId: string;
  tier: Tier;
  cycle: BillingCycle;
  monthlyCents: Cents;
  /** True when this one got the additional-property rate. */
  discounted: boolean;
  renewsOn?: ISODate;
  trialing: boolean;
}

/**
 * What the account pays each month, and which property each part is for.
 *
 * The additional-property discount goes to the *later* subscriptions rather
 * than the cheapest, so the figure does not silently change when somebody
 * renames a house or a sort order shifts. First one signed up is the full-price
 * one, and it stays that way.
 */
export function priceSubscriptions(
  subscriptions: PropertySubscription[],
  asOf: ISODate = today(),
): { lines: PricedSubscription[]; monthlyTotalCents: Cents } {
  const seen: Record<Tier, number> = { free: 0, plus: 0, care: 0 };
  const lines = [...subscriptions]
    .sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id.localeCompare(b.id))
    .map((subscription) => {
      const tier = tierFor(subscription, asOf);
      const definition = TIERS[tier];
      const index = seen[tier];
      seen[tier] += 1;
      const trialing = subscription.source === 'trial' && tier !== 'free';
      const base = index === 0 ? definition.monthlyCents : definition.additionalMonthlyCents;
      return {
        propertyId: subscription.propertyId,
        tier,
        cycle: subscription.cycle,
        // A trial costs nothing, and showing it as $7.99 "coming" would be a
        // charge somebody has not agreed to.
        monthlyCents: trialing ? 0 : base,
        discounted: index > 0 && definition.additionalMonthlyCents < definition.monthlyCents,
        renewsOn: subscription.renewsOn,
        trialing,
      };
    });
  return {
    lines,
    monthlyTotalCents: lines.reduce((total, line) => total + line.monthlyCents, 0),
  };
}

/** What adding this tier to one more property would cost, given what is already held. */
export function priceOfAdding(
  subscriptions: PropertySubscription[],
  tier: Exclude<Tier, 'free'>,
  asOf: ISODate = today(),
): Cents {
  const onTier = subscriptions.filter((s) => tierFor(s, asOf) === tier).length;
  return onTier === 0 ? TIERS[tier].monthlyCents : TIERS[tier].additionalMonthlyCents;
}

/* -------------------------------------------------------------------------
 * Payment methods
 * ---------------------------------------------------------------------- */

export interface PaymentMethod {
  id: string;
  brand: 'visa' | 'mastercard' | 'amex' | 'discover' | 'other';
  /** Only ever the last four. A full number never enters this app. */
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
  addedAt: ISODateTime;
}

export const CARD_LABEL: Record<PaymentMethod['brand'], string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  discover: 'Discover',
  other: 'Card',
};

export function cardSummary(method: PaymentMethod): string {
  return `${CARD_LABEL[method.brand]} •••• ${method.last4}`;
}

/** A card that will stop working before the next renewal is worth saying so about. */
export function cardExpiringSoon(method: PaymentMethod, asOf: ISODate = today()): boolean {
  const expiry = new Date(Date.UTC(method.expYear, method.expMonth, 1));
  const soon = new Date(`${addMonths(asOf, 2)}T00:00:00.000Z`);
  return expiry <= soon;
}

/**
 * Which card a given property bills to.
 *
 * The account owns the cards; a property may point at one of them. V1 shows a
 * single default and never offers the choice, but the resolution goes through
 * here from the start, because the alternative is a schema where "the card" is
 * an account-level singleton — and unpicking that later, once real charges have
 * been written against it, is a migration with money attached.
 *
 * The shape it is built for is the landlord: a personal card on the house they
 * live in, a business card on the three they let. That is not an edge case, it
 * is the customer most likely to be paying for several properties at once.
 *
 * Falls back to the account default so a property that has never been given a
 * card still bills correctly, and returns undefined only when there is no card
 * at all.
 */
export function paymentMethodFor(
  methods: PaymentMethod[],
  options: { defaultPaymentMethodId?: string } = {},
): PaymentMethod | undefined {
  const assigned = options.defaultPaymentMethodId
    ? methods.find((m) => m.id === options.defaultPaymentMethodId)
    : undefined;
  return assigned ?? methods.find((m) => m.isDefault) ?? methods[0];
}

/**
 * Every property that bills to a given card.
 *
 * The question to answer before letting someone remove one: a card quietly
 * detached from three rentals is three failed renewals next month.
 */
export function propertiesOnCard(
  methodId: string,
  properties: { id: string; defaultPaymentMethodId?: string }[],
  methods: PaymentMethod[],
): string[] {
  return properties
    .filter((p) => paymentMethodFor(methods, p)?.id === methodId)
    .map((p) => p.id);
}

/* -------------------------------------------------------------------------
 * Charges
 * ---------------------------------------------------------------------- */

export type ChargeKind = 'subscription' | 'service' | 'refund' | 'credit';
export type ChargeStatus = 'paid' | 'pending' | 'failed' | 'refunded';

export interface Charge {
  id: string;
  accountId: string;
  /** The building this charge is about. Absent for account-level charges. */
  propertyId?: string;
  date: ISODate;
  description: string;
  amountCents: Cents;
  kind: ChargeKind;
  status: ChargeStatus;
  /** Which card it went to, for the receipt. */
  paymentMethodId?: string;
  receiptNumber?: string;
  /** Who did the work, for a service charge. Defaults to Dwella on the record. */
  vendor?: string;
  /** The equipment the work was on, when dispatch knew it. */
  componentId?: string;
}

export interface StatementLine {
  propertyId?: string;
  propertyName: string;
  charges: Charge[];
  totalCents: Cents;
}

export interface Statement {
  /** `YYYY-MM`. */
  period: string;
  label: string;
  totalCents: Cents;
  byProperty: StatementLine[];
}

/**
 * A month's charges, grouped by the property they were for.
 *
 * This is the shape the whole feature exists to produce. "August Dwella
 * charges — $246.94" broken into Main Residence, Rental #1, Rental #2 is
 * something a landlord can reconcile against their own books; the same six
 * charges in a flat list is something they have to decode first.
 */
export function statementFor(
  charges: Charge[],
  period: string,
  nameOf: (propertyId: string | undefined) => string,
): Statement {
  const inPeriod = charges.filter((c) => c.date.startsWith(period) && c.status !== 'failed');
  const groups = new Map<string, Charge[]>();
  for (const charge of inPeriod) {
    const key = charge.propertyId ?? '';
    groups.set(key, [...(groups.get(key) ?? []), charge]);
  }
  const byProperty = [...groups.entries()]
    .map(([propertyId, group]) => ({
      propertyId: propertyId || undefined,
      propertyName: nameOf(propertyId || undefined),
      charges: [...group].sort((a, b) => b.date.localeCompare(a.date)),
      totalCents: group.reduce((total, c) => total + c.amountCents, 0),
    }))
    .sort((a, b) => b.totalCents - a.totalCents);

  const [year, month] = period.split('-').map(Number);
  return {
    period,
    label: new Date(Date.UTC(year!, (month ?? 1) - 1, 1)).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    totalCents: byProperty.reduce((total, line) => total + line.totalCents, 0),
    byProperty,
  };
}

/** Every month that has charges, newest first. */
export function statementPeriods(charges: Charge[]): string[] {
  return [...new Set(charges.map((c) => c.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a));
}

/** All charges for one property, newest first — feeds that home's expense history. */
export function chargesForProperty(charges: Charge[], propertyId: string): Charge[] {
  return charges
    .filter((c) => c.propertyId === propertyId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/* -------------------------------------------------------------------------
 * Care benefits
 * ---------------------------------------------------------------------- */

/**
 * What a Care member has used and what is still available.
 *
 * Shown as remaining credits rather than as terms, because nobody remembers
 * "two seasonal visits per membership year" — they remember "one visit left".
 * A benefit somebody forgets they have is a benefit they did not buy.
 */
export interface CareBenefits {
  seasonalVisitsIncluded: number;
  seasonalVisitsUsed: number;
  seasonalVisitsRemaining: number;
  /** When the next included visit can be booked. */
  nextEligibleOn?: ISODate;
  handymanDiscountPercent: number;
  priorityBooking: boolean;
  /** The membership year rolls here, and the counters reset. */
  renewsOn: ISODate;
  planReviewOn: ISODate;
}

export const CARE_SEASONAL_VISITS = 2;
export const CARE_HANDYMAN_DISCOUNT = 10;
/** A seasonal visit is seasonal: two of them a fortnight apart is not the product. */
export const CARE_VISIT_SPACING_MONTHS = 4;

export interface CareVisit {
  id: string;
  propertyId: string;
  usedOn: ISODate;
  note?: string;
}

export function careBenefits(params: {
  subscription: PropertySubscription;
  visits: CareVisit[];
  asOf?: ISODate;
}): CareBenefits | undefined {
  const asOf = params.asOf ?? today();
  if (tierFor(params.subscription, asOf) !== 'care') return undefined;

  /*
   * The membership year, not the calendar year. Counting visits per calendar
   * year would hand somebody who joined in November four visits in five months
   * and then nothing for a year.
   */
  const yearStart = membershipYearStart(params.subscription.startedOn, asOf);
  const yearEnd = addYears(yearStart, 1);
  const used = params.visits
    .filter((v) => v.propertyId === params.subscription.propertyId)
    .filter((v) => v.usedOn >= yearStart && v.usedOn < yearEnd)
    .sort((a, b) => a.usedOn.localeCompare(b.usedOn));

  const last = used[used.length - 1];
  const remaining = Math.max(0, CARE_SEASONAL_VISITS - used.length);
  const spacedFrom = last ? addMonths(last.usedOn, CARE_VISIT_SPACING_MONTHS) : asOf;

  return {
    seasonalVisitsIncluded: CARE_SEASONAL_VISITS,
    seasonalVisitsUsed: used.length,
    seasonalVisitsRemaining: remaining,
    nextEligibleOn: remaining === 0 ? yearEnd : spacedFrom > asOf ? spacedFrom : asOf,
    handymanDiscountPercent: CARE_HANDYMAN_DISCOUNT,
    priorityBooking: true,
    renewsOn: yearEnd,
    planReviewOn: yearEnd,
  };
}

/** The anniversary on or before `asOf`. */
export function membershipYearStart(startedOn: ISODate, asOf: ISODate): ISODate {
  let start = startedOn;
  while (addYears(start, 1) <= asOf) start = addYears(start, 1);
  return start;
}

/** Current billing month, for the statement header. */
export function currentPeriod(asOf: ISODate = today()): string {
  return `${yearOf(asOf)}-${String(monthOf(asOf)).padStart(2, '0')}`;
}
