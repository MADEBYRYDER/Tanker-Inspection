import { useMemo } from 'react';
import { today } from '../core/dates';
import {
  careBenefits,
  priceOfAdding,
  priceSubscriptions,
  tierFor,
  tierIncludesPlus,
  trialAvailable,
  trialDaysRemaining,
  type CareBenefits,
  type PropertySubscription,
  type Tier,
} from '../core/billing';
import {
  checkUsage,
  hasFeature,
  type FeatureKey,
  type MeteredKey,
  type Plan,
  type UsageVerdict,
} from '../core/entitlements';
import { subscriptionFor, useStore } from './store';

/**
 * What this household has, on the property they are currently looking at.
 *
 * Plans are per property now, so this hook is inherently about the *active*
 * one: switching from a Care residence to a free rental has to change what the
 * app offers, immediately and everywhere, or somebody sees a forecast for a
 * house they are not paying to forecast.
 *
 * Selectors are per-slice and the result is memoised — zustand v5 compares
 * snapshots with `Object.is`, and returning a fresh object per render is how
 * the whole app loops until it blanks.
 */

export interface PlanState {
  /** The feature tier this property is on. `care` implies everything `plus` has. */
  tier: Tier;
  plan: Plan;
  isPlus: boolean;
  isCare: boolean;
  subscription?: PropertySubscription;
  trialDaysLeft?: number;
  canStartTrial: boolean;
  can: (feature: FeatureKey) => boolean;
  usage: (key: MeteredKey) => UsageVerdict;
  /** Care visits and discounts left this membership year. Undefined off Care. */
  benefits?: CareBenefits;
  /** What the whole account pays each month, across every property. */
  monthlyTotalCents: number;
  /** What adding this tier to one more property would cost. */
  priceOfAdding: (tier: Exclude<Tier, 'free'>) => number;
}

export function usePlan(): PlanState {
  const subscriptions = useStore((s) => s.subscriptions);
  const careVisits = useStore((s) => s.careVisits);
  const activePropertyId = useStore((s) => s.activePropertyId);
  const usageState = useStore((s) => s.usage);
  const documents = useStore((s) => s.documents);

  return useMemo(() => {
    const asOf = today();
    const subscription = activePropertyId ? subscriptionFor(subscriptions, activePropertyId) : undefined;
    const tier = tierFor(subscription, asOf);

    /*
     * `Plan` is still the feature vocabulary — free vs plus — because that is
     * what the entitlement tables are keyed on. Care is a commercial tier that
     * happens to include everything Plus has, so it maps onto the same features
     * rather than duplicating them.
     */
    const plan: Plan = tierIncludesPlus(tier) ? 'plus' : 'free';
    const period = asOf.slice(0, 7);
    const monthly = usageState.period === period ? usageState.monthly : undefined;

    // Documents are a standing cap on what is stored *for this property*, so
    // the count is scoped rather than being the whole account's filing cabinet.
    const documentCount = documents.filter((d) => d.homeId === activePropertyId).length;

    return {
      tier,
      plan,
      isPlus: tierIncludesPlus(tier),
      isCare: tier === 'care',
      subscription,
      trialDaysLeft: trialDaysRemaining(subscription, asOf),
      canStartTrial: trialAvailable(subscription),
      can: (feature: FeatureKey) => hasFeature(plan, feature),
      usage: (key: MeteredKey) =>
        checkUsage(plan, key, key === 'documents' ? documentCount : (monthly?.[key] ?? 0)),
      benefits: subscription
        ? careBenefits({ subscription, visits: careVisits, asOf })
        : undefined,
      monthlyTotalCents: priceSubscriptions(subscriptions, asOf).monthlyTotalCents,
      priceOfAdding: (next: Exclude<Tier, 'free'>) => priceOfAdding(subscriptions, next, asOf),
    };
  }, [subscriptions, careVisits, activePropertyId, usageState, documents]);
}

/** The plan on a property that is not the active one — for My Homes and Billing. */
export function useTierOf(propertyId: string): Tier {
  const subscriptions = useStore((s) => s.subscriptions);
  return useMemo(() => tierFor(subscriptionFor(subscriptions, propertyId), today()), [
    subscriptions,
    propertyId,
  ]);
}
