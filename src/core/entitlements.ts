import type { ISODate } from './types';
import { addDays, daysBetween } from './dates';

/**
 * What each plan gets, in one place.
 *
 * The rule this file exists to enforce: **Dwella Free is a real product, not a
 * demo.** A homeowner can create their house, scan every system in it, keep the
 * history, and get the reminders that stop a water heater rusting through —
 * forever, without paying. The property record is worth more to the business
 * than eight dollars squeezed out of someone who would otherwise never start one.
 *
 * Dwella+ is not "the same app with a bigger number attached". It is the
 * forward-looking half: what is coming, what it will cost, what is about to run
 * out of warranty, and what to do about it. Free remembers your home. Plus knows
 * what is coming.
 *
 * Everything here is pure and synchronous so the rules are testable and the same
 * answer comes back everywhere — a gate that disagrees with the paywall screen
 * about what someone paid for is how you lose a subscriber in one tap.
 */

export type Plan = 'free' | 'plus' | 'portfolio';

/** Features that are either on or off for a plan. */
export type FeatureKey =
  /** The 1/3/5-year cost projection and the monthly reserve figure. */
  | 'forecast'
  /** Per-item replacement windows and what to set aside for each. */
  | 'replacement_planning'
  /** Warranties about to expire, cross-referenced with reported trouble. */
  | 'warranty_intelligence'
  /** Per-system health with the reasoning behind each status. */
  | 'health_detail'
  /** Year-over-year spending, per-item totals, and budget answers. */
  | 'cost_insights'
  /** A seasonal plan built from this home's actual equipment and climate. */
  | 'seasonal_personalized'
  /** DIY steps adapted to the specific model, age, and service history. */
  | 'diy_personalized'
  /** The full record export, including documents and per-item history. */
  | 'export_complete'
  /** Everyone in the household shares one subscription and one record. */
  | 'family_sharing'
  /** Requests go out flagged, and reach the launch partner's queue first. */
  | 'priority_service';

/** Features that are allowanced rather than switched off. */
export type MeteredKey = 'documents' | 'assistant' | 'problem_scan';

export interface Allowance {
  /** How many. `undefined` means no limit. */
  limit?: number;
  /** `monthly` resets on the billing-period boundary; `total` is a standing cap. */
  period: 'monthly' | 'total';
}

export interface PlanDefinition {
  key: Plan;
  name: string;
  features: Record<FeatureKey, boolean>;
  allowances: Record<MeteredKey, Allowance>;
  /**
   * Properties covered by the base price. Beyond this, each one is billed at
   * `EXTRA_HOME_PRICE_CENTS` — because a landlord with thirty-seven rentals
   * getting the same $7.99 as a single homeowner is not a pricing model, and
   * because thirty-seven records genuinely cost thirty-seven times as much to
   * hold, scan against, and forecast.
   */
  includedHomes: number;
  /** Hard ceiling. `undefined` means as many as they want to pay for. */
  maxHomes?: number;
}

/*
 * Free allowances are set to be genuinely usable rather than teasing. Five
 * assistant questions a month is enough to answer the things people actually
 * ask; two problem scans covers the ordinary "what is this stain" moment. The
 * document cap is a standing one because receipts accumulate for the life of the
 * house — twenty is enough to hold the paperwork that matters on a starter
 * record without becoming the free tier's filing cabinet.
 */
const ALL_FEATURES_ON: Record<FeatureKey, boolean> = {
  forecast: true,
  replacement_planning: true,
  warranty_intelligence: true,
  health_detail: true,
  cost_insights: true,
  seasonal_personalized: true,
  diy_personalized: true,
  export_complete: true,
  family_sharing: true,
  priority_service: true,
};

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    key: 'free',
    name: 'Dwella',
    features: {
      forecast: false,
      replacement_planning: false,
      warranty_intelligence: false,
      health_detail: false,
      cost_insights: false,
      seasonal_personalized: false,
      diy_personalized: false,
      export_complete: false,
      family_sharing: false,
      priority_service: false,
    },
    allowances: {
      documents: { limit: 20, period: 'total' },
      assistant: { limit: 5, period: 'monthly' },
      problem_scan: { limit: 2, period: 'monthly' },
    },
    includedHomes: 1,
    maxHomes: 1,
  },
  plus: {
    key: 'plus',
    name: 'Dwella+',
    features: { ...ALL_FEATURES_ON },
    allowances: {
      documents: { period: 'total' },
      /*
       * "Unlimited, subject to reasonable use" has to mean a real number
       * somewhere, and it is more honest to publish it than to let someone
       * discover an invisible ceiling mid-conversation. These are set far above
       * what any household hits and exist to stop a runaway loop, not a person.
       */
      assistant: { limit: 400, period: 'monthly' },
      problem_scan: { limit: 40, period: 'monthly' },
    },
    includedHomes: 1,
  },
  /*
   * For landlords and property managers. Someone with six rentals has a harder
   * version of the same problem a homeowner has — which HVAC is at which
   * address, which lease property needs filters, what Oak Street cost last year
   * — and the architecture already answers it. The price is per-home rather
   * than a flat fee so it scales with what they actually hold.
   */
  portfolio: {
    key: 'portfolio',
    name: 'Dwella Portfolio',
    features: { ...ALL_FEATURES_ON },
    allowances: {
      documents: { period: 'total' },
      assistant: { limit: 2_000, period: 'monthly' },
      problem_scan: { limit: 200, period: 'monthly' },
    },
    includedHomes: 5,
  },
};

/* -------------------------------------------------------------------------
 * Subscription state
 * ---------------------------------------------------------------------- */

export type SubscriptionSource = 'none' | 'trial' | 'app_store' | 'play_store' | 'promo';

export interface Subscription {
  /** What the owner has actually paid for. A trial resolves to `plus` while it runs. */
  source: SubscriptionSource;
  /** Set when a trial is running or has run. A second trial is never offered. */
  trialStartedOn?: ISODate;
  trialEndsOn?: ISODate;
  /** Set for a real paid subscription. */
  renewsOn?: ISODate;
  /** Which store transaction backs this, once billing is wired up. */
  billingReference?: string;
}

export const TRIAL_DAYS = 30;

export const NO_SUBSCRIPTION: Subscription = { source: 'none' };

/** Whether a trial is running as of `asOf`. Expiry is by date, never by a stored flag. */
export function trialActive(subscription: Subscription, asOf: ISODate): boolean {
  if (subscription.source !== 'trial' || !subscription.trialEndsOn) return false;
  return asOf < subscription.trialEndsOn;
}

/** Days left in a running trial, or undefined when none is running. */
export function trialDaysRemaining(subscription: Subscription, asOf: ISODate): number | undefined {
  if (!trialActive(subscription, asOf) || !subscription.trialEndsOn) return undefined;
  return Math.max(0, daysBetween(asOf, subscription.trialEndsOn));
}

/** A trial is a one-time offer: having started one, ever, disqualifies a second. */
export function trialAvailable(subscription: Subscription): boolean {
  return subscription.trialStartedOn === undefined && subscription.source === 'none';
}

export function startTrial(asOf: ISODate): Subscription {
  return {
    source: 'trial',
    trialStartedOn: asOf,
    trialEndsOn: addDays(asOf, TRIAL_DAYS),
  };
}

/** The effective plan right now. The only function anything else should ask. */
export function planFor(subscription: Subscription, asOf: ISODate): Plan {
  if (subscription.source === 'app_store' || subscription.source === 'play_store' || subscription.source === 'promo') {
    // A paid subscription that has lapsed falls back to free rather than
    // silently continuing — the store is the authority on whether it renewed.
    if (subscription.renewsOn && asOf >= subscription.renewsOn) return 'free';
    return 'plus';
  }
  return trialActive(subscription, asOf) ? 'plus' : 'free';
}

/* -------------------------------------------------------------------------
 * Checks
 * ---------------------------------------------------------------------- */

export function hasFeature(plan: Plan, feature: FeatureKey): boolean {
  return PLANS[plan].features[feature];
}

export function allowanceFor(plan: Plan, key: MeteredKey): Allowance {
  return PLANS[plan].allowances[key];
}

export interface UsageVerdict {
  allowed: boolean;
  limit?: number;
  used: number;
  remaining?: number;
  /** True when this plan has no ceiling for this action. */
  unlimited: boolean;
  /** Carried through so the UI can say "this month" or "in total" correctly. */
  period: Allowance['period'];
}

export function checkUsage(plan: Plan, key: MeteredKey, used: number): UsageVerdict {
  const allowance = allowanceFor(plan, key);
  if (allowance.limit === undefined) {
    return { allowed: true, used, unlimited: true, period: allowance.period };
  }
  return {
    allowed: used < allowance.limit,
    limit: allowance.limit,
    used,
    remaining: Math.max(0, allowance.limit - used),
    unlimited: false,
    period: allowance.period,
  };
}

/**
 * The line shown beside a metered action.
 *
 * Always states the real number. A gauge that says "running low" without saying
 * how low is a nudge toward upgrading rather than information, and this product
 * does not do that.
 */
export function usageLabel(verdict: UsageVerdict, noun: { one: string; many: string }): string {
  if (verdict.unlimited) return 'Unlimited on Dwella+';
  const scope = verdict.period === 'monthly' ? ' this month' : '';
  const remaining = verdict.remaining ?? 0;
  if (remaining === 0) return `No ${noun.many} left${scope}`;
  return `${remaining} of ${verdict.limit} ${remaining === 1 ? noun.one : noun.many} left${scope}`;
}

/* -------------------------------------------------------------------------
 * Pricing
 * ---------------------------------------------------------------------- */

export interface PriceOption {
  id: 'monthly' | 'annual';
  label: string;
  priceCents: number;
  /** What it works out to per month, for honest comparison. */
  perMonthCents: number;
  savingPercent?: number;
}

/** Each property past what the plan includes. */
export const EXTRA_HOME_PRICE_CENTS = 399;

export interface HomeAllowance {
  count: number;
  included: number;
  limit?: number;
  canAddAnother: boolean;
  /** Properties currently being paid for beyond the base price. */
  billableExtras: number;
  extraPriceCents: number;
  extraPriceLabel: string;
  /** What the subscription actually costs this month, given the property count. */
  monthlyTotalCents: number;
}

/**
 * How many properties this plan covers, and what the next one costs.
 *
 * Free is capped at one rather than charged for extras: someone who has not paid
 * has no billing relationship to extend, and the honest answer is "this needs a
 * plan" rather than a charge they never agreed to.
 */
export function homeAllowance(plan: Plan, count: number): HomeAllowance {
  const definition = PLANS[plan];
  const base = PRICES.find((p) => p.id === 'monthly')?.priceCents ?? 0;
  const billableExtras = Math.max(0, count - definition.includedHomes);
  return {
    count,
    included: definition.includedHomes,
    limit: definition.maxHomes,
    canAddAnother: definition.maxHomes === undefined || count < definition.maxHomes,
    billableExtras,
    extraPriceCents: EXTRA_HOME_PRICE_CENTS,
    extraPriceLabel: `$${(EXTRA_HOME_PRICE_CENTS / 100).toFixed(2)}`,
    monthlyTotalCents:
      plan === 'free' ? 0 : base + billableExtras * EXTRA_HOME_PRICE_CENTS,
  };
}

export const PRICES: PriceOption[] = [
  { id: 'monthly', label: 'Monthly', priceCents: 799, perMonthCents: 799 },
  {
    id: 'annual',
    label: 'Annual',
    priceCents: 6999,
    perMonthCents: Math.round(6999 / 12),
    savingPercent: Math.round((1 - 6999 / 12 / 799) * 100),
  },
];

/* -------------------------------------------------------------------------
 * The comparison table
 * ---------------------------------------------------------------------- */

export interface ComparisonRow {
  label: string;
  free: string;
  plus: string;
  /** Set when this row is one of the reasons to pay, so the UI can lead with it. */
  headline?: boolean;
}

/**
 * The published difference between the tiers.
 *
 * Kept next to the rules it describes rather than in a screen, so a change to
 * one is a change to the other. The wording is deliberately plain: "Not included"
 * rather than a dash, because a dash in a pricing table is how people end up
 * surprised by what they did not buy.
 */
export const COMPARISON: ComparisonRow[] = [
  { label: 'Home profile', free: 'Included', plus: 'Included' },
  { label: 'Home scan', free: 'Included', plus: 'Included' },
  { label: 'Equipment records', free: 'Unlimited', plus: 'Unlimited' },
  { label: 'Maintenance schedule', free: 'Included', plus: 'Included' },
  { label: 'Reminders', free: 'Included', plus: 'Included' },
  { label: 'Home timeline', free: 'Included', plus: 'Included' },
  { label: 'Receipts and documents', free: '20 stored', plus: 'Unlimited' },
  { label: 'DIY guides', free: 'Standard steps', plus: 'Matched to your equipment', headline: true },
  { label: 'Ask Dwella', free: '5 questions a month', plus: 'Unlimited', headline: true },
  { label: 'Home health', free: 'Overall status', plus: 'Every system, with reasons', headline: true },
  { label: 'Home forecast', free: 'Not included', plus: '1, 3, and 5 years ahead', headline: true },
  { label: 'Replacement planning', free: 'Not included', plus: 'Per item, with reserve', headline: true },
  { label: 'Problem scanner', free: '2 scans a month', plus: '40 scans a month', headline: true },
  { label: 'Warranty intelligence', free: 'Not included', plus: 'Included', headline: true },
  { label: 'Spending insights', free: 'This year’s total', plus: 'Trends and per-item totals', headline: true },
  { label: 'Seasonal plans', free: 'Standard checklist', plus: 'Built from your home' },
  /*
   * Labelled by what is actually shipped. Sharing a record between people needs
   * accounts and sync, which this build does not have — everything lives on the
   * device. Advertising it as included, and then having someone pay and find an
   * invite button that does nothing, is exactly the kind of thing that makes a
   * subscription feel like a con. It stays on the roadmap and says so.
   */
  { label: 'Family sharing', free: 'Not included', plus: 'Coming — one plan covers the household' },
  { label: 'Record export', free: 'Summary', plus: 'Complete, with documents' },
  { label: 'Priority service requests', free: 'Not included', plus: 'Included' },
];
