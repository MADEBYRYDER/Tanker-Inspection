import { describe, expect, it } from 'vitest';
import { addDays, today } from './dates';
import {
  COMPARISON,
  PLANS,
  PRICES,
  TRIAL_DAYS,
  checkUsage,
  hasFeature,
  planFor,
  startTrial,
  trialActive,
  trialAvailable,
  trialDaysRemaining,
  usageLabel,
  type Subscription,
} from './entitlements';

const TODAY = '2026-08-30';

describe('what the free plan keeps', () => {
  /*
   * The load-bearing product promise: someone who never pays still has a real
   * home record. If one of these ever flips to false, the free tier has become
   * a demo and this test is the thing that should stop it.
   */
  it('never gates the home record itself', () => {
    const free = PLANS.free;
    // Equipment, history, and scheduling are not features in the gated set at all.
    expect(Object.keys(free.features)).not.toContain('home_record');
    expect(Object.keys(free.features)).not.toContain('maintenance_schedule');
    expect(Object.keys(free.features)).not.toContain('timeline');
  });

  it('gives free users a usable allowance rather than a taste', () => {
    expect(PLANS.free.allowances.assistant.limit).toBeGreaterThanOrEqual(5);
    expect(PLANS.free.allowances.problem_scan.limit).toBeGreaterThanOrEqual(2);
    expect(PLANS.free.allowances.documents.limit).toBeGreaterThanOrEqual(20);
  });

  it('publishes a real number for every "unlimited" claim', () => {
    // "Unlimited, subject to reasonable use" has to mean something. Either the
    // limit is genuinely absent or it is a number — never an undisclosed ceiling.
    for (const allowance of Object.values(PLANS.plus.allowances)) {
      expect(allowance.limit === undefined || allowance.limit > 0).toBe(true);
    }
    expect(PLANS.plus.allowances.assistant.limit).toBeGreaterThan(
      PLANS.free.allowances.assistant.limit! * 10,
    );
  });

  it('gives Dwella+ every gated feature', () => {
    for (const key of Object.keys(PLANS.plus.features) as (keyof typeof PLANS.plus.features)[]) {
      expect(hasFeature('plus', key)).toBe(true);
      expect(hasFeature('free', key)).toBe(false);
    }
  });
});

describe('trials', () => {
  it('runs for the advertised number of days', () => {
    const sub = startTrial(TODAY);
    expect(sub.trialEndsOn).toBe(addDays(TODAY, TRIAL_DAYS));
    expect(planFor(sub, TODAY)).toBe('plus');
  });

  it('expires by date rather than by a stored flag', () => {
    const sub = startTrial(TODAY);
    const dayBefore = addDays(TODAY, TRIAL_DAYS - 1);
    const dayAfter = addDays(TODAY, TRIAL_DAYS + 1);
    expect(planFor(sub, dayBefore)).toBe('plus');
    expect(planFor(sub, addDays(TODAY, TRIAL_DAYS))).toBe('free');
    expect(planFor(sub, dayAfter)).toBe('free');
    expect(trialActive(sub, dayAfter)).toBe(false);
  });

  it('counts down honestly', () => {
    const sub = startTrial(TODAY);
    expect(trialDaysRemaining(sub, TODAY)).toBe(TRIAL_DAYS);
    expect(trialDaysRemaining(sub, addDays(TODAY, 29))).toBe(1);
    expect(trialDaysRemaining(sub, addDays(TODAY, 31))).toBeUndefined();
  });

  it('is offered once and never again', () => {
    expect(trialAvailable({ source: 'none' })).toBe(true);
    const used = startTrial(TODAY);
    expect(trialAvailable(used)).toBe(false);
    // Even after it lapses and the plan is back to free.
    expect(planFor(used, addDays(TODAY, 60))).toBe('free');
    expect(trialAvailable(used)).toBe(false);
  });
});

describe('paid subscriptions', () => {
  it('is plus while it runs', () => {
    const sub: Subscription = { source: 'app_store', renewsOn: addDays(TODAY, 30) };
    expect(planFor(sub, TODAY)).toBe('plus');
  });

  it('falls back to free once the renewal date has passed', () => {
    // The store is the authority on whether money changed hands. A lapsed
    // subscription must not silently keep working off a stale local flag.
    const sub: Subscription = { source: 'app_store', renewsOn: addDays(TODAY, 30) };
    expect(planFor(sub, addDays(TODAY, 31))).toBe('free');
  });

  it('treats a subscription with no known renewal date as active', () => {
    // Better to over-serve someone who has paid than to lock out a subscriber
    // because a receipt has not been refreshed yet.
    expect(planFor({ source: 'app_store' }, TODAY)).toBe('plus');
  });
});

describe('allowances', () => {
  it('allows up to, but not past, the limit', () => {
    expect(checkUsage('free', 'assistant', 4).allowed).toBe(true);
    expect(checkUsage('free', 'assistant', 5).allowed).toBe(false);
    expect(checkUsage('free', 'assistant', 99).remaining).toBe(0);
  });

  it('reports unlimited without inventing a remaining count', () => {
    const verdict = checkUsage('plus', 'documents', 4_000);
    expect(verdict.unlimited).toBe(true);
    expect(verdict.allowed).toBe(true);
    expect(verdict.remaining).toBeUndefined();
  });

  it('words the label for the right period', () => {
    // Documents are a standing cap; saying "this month" would be a lie.
    expect(usageLabel(checkUsage('free', 'documents', 5), { one: 'document', many: 'documents' })).not.toContain('this month');
    expect(usageLabel(checkUsage('free', 'assistant', 1), { one: 'question', many: 'questions' })).toContain('this month');
  });

  it('states the real remaining number rather than a vague warning', () => {
    expect(usageLabel(checkUsage('free', 'assistant', 3), { one: 'question', many: 'questions' })).toBe(
      '2 of 5 questions left this month',
    );
    expect(usageLabel(checkUsage('free', 'assistant', 4), { one: 'question', many: 'questions' })).toBe(
      '1 of 5 question left this month',
    );
  });
});

describe('pricing', () => {
  it('matches the published figures', () => {
    const monthly = PRICES.find((p) => p.id === 'monthly')!;
    const annual = PRICES.find((p) => p.id === 'annual')!;
    expect(monthly.priceCents).toBe(799);
    expect(annual.priceCents).toBe(6999);
  });

  it('states a saving the annual price actually delivers', () => {
    const monthly = PRICES.find((p) => p.id === 'monthly')!;
    const annual = PRICES.find((p) => p.id === 'annual')!;
    // The advertised percentage has to be arithmetic, not marketing.
    const real = Math.round((1 - annual.priceCents / 12 / monthly.priceCents) * 100);
    expect(annual.savingPercent).toBe(real);
    expect(annual.perMonthCents).toBeLessThan(monthly.perMonthCents);
  });
});

describe('the published comparison', () => {
  it('spells out exclusions rather than leaving a dash', () => {
    for (const row of COMPARISON) {
      expect(row.free.length).toBeGreaterThan(0);
      expect(row.plus.length).toBeGreaterThan(0);
      expect(row.free).not.toBe('—');
      expect(row.plus).not.toBe('—');
    }
  });

  it('agrees with the allowances it advertises', () => {
    const assistant = COMPARISON.find((r) => r.label === 'Ask Dwella')!;
    expect(assistant.free).toContain(String(PLANS.free.allowances.assistant.limit));
    const scans = COMPARISON.find((r) => r.label === 'Problem scanner')!;
    expect(scans.free).toContain(String(PLANS.free.allowances.problem_scan.limit));
    const documents = COMPARISON.find((r) => r.label === 'Receipts and documents')!;
    expect(documents.free).toContain(String(PLANS.free.allowances.documents.limit));
  });

  it('never claims the free plan lacks the home record', () => {
    const alwaysFree = ['Home profile', 'Home scan', 'Equipment records', 'Maintenance schedule', 'Reminders', 'Home timeline'];
    for (const label of alwaysFree) {
      const row = COMPARISON.find((r) => r.label === label);
      expect(row, `missing comparison row: ${label}`).toBeDefined();
      expect(row!.free).not.toBe('Not included');
    }
  });
});

describe('today is a real date', () => {
  it('so trial arithmetic is not being tested against a frozen clock only', () => {
    const sub = startTrial(today());
    expect(planFor(sub, today())).toBe('plus');
  });
});
