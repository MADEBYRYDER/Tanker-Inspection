import { useMemo } from 'react';
import { today } from '../core/dates';
import {
  checkUsage,
  hasFeature,
  homeAllowance,
  planFor,
  trialAvailable,
  trialDaysRemaining,
  type FeatureKey,
  type MeteredKey,
  type Plan,
  type HomeAllowance,
  type Subscription,
  type UsageVerdict,
} from '../core/entitlements';
import { useStore } from './store';

/**
 * The one hook that answers "what does this household have?".
 *
 * Every gate in the app goes through here, so there is exactly one place that
 * can be wrong, and no screen has to know how trials, billing, or period resets
 * work. Selectors are per-slice and the result is memoised — zustand v5 compares
 * snapshots with `Object.is`, and returning a fresh object per render is how the
 * whole app loops until it blanks.
 */

export interface PlanState {
  plan: Plan;
  isPlus: boolean;
  subscription: Subscription;
  /** Days left if a trial is running. */
  trialDaysLeft?: number;
  /** Whether a first trial can still be offered. */
  canStartTrial: boolean;
  /** Whether a feature is available on the current plan. */
  can: (feature: FeatureKey) => boolean;
  /** Whether a metered action has headroom, and how much. */
  usage: (key: MeteredKey) => UsageVerdict;
  /** How many properties this plan covers, and what another would cost. */
  homes: HomeAllowance;
}

export function usePlan(): PlanState {
  const subscription = useStore((s) => s.subscription);
  const usageState = useStore((s) => s.usage);
  const documentCount = useStore((s) => s.documents.length);
  const propertyCount = useStore((s) => s.properties.length);

  return useMemo(() => {
    const asOf = today();
    const plan = planFor(subscription, asOf);
    const period = asOf.slice(0, 7);

    /*
     * A stored period from a previous month means the counters have not been
     * rolled yet — the roll happens on the next write. Reading them as zero here
     * keeps the displayed allowance correct the moment the month turns, rather
     * than on the next action.
     */
    const monthly = usageState.period === period ? usageState.monthly : undefined;

    return {
      plan,
      isPlus: plan !== 'free',
      subscription,
      trialDaysLeft: trialDaysRemaining(subscription, asOf),
      canStartTrial: trialAvailable(subscription),
      can: (feature: FeatureKey) => hasFeature(plan, feature),
      homes: homeAllowance(plan, propertyCount),
      usage: (key: MeteredKey) =>
        checkUsage(
          plan,
          key,
          // Documents are a standing cap on what is stored, so the count is the
          // record itself rather than a counter that could drift from it.
          key === 'documents' ? documentCount : (monthly?.[key] ?? 0),
        ),
    };
  }, [subscription, usageState, documentCount, propertyCount]);
}
