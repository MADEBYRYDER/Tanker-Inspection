import { describe, expect, it } from 'vitest';
import {
  CARE_SEASONAL_VISITS,
  TIERS,
  careBenefits,
  cardExpiringSoon,
  chargesForProperty,
  freeSubscription,
  membershipYearStart,
  priceOfAdding,
  priceSubscriptions,
  startTrial,
  tierMove,
  statementFor,
  statementPeriods,
  tierFor,
  tierIncludesPlus,
  trialAvailable,
  trialDaysRemaining,
  type Charge,
  type PropertySubscription,
} from './billing';

const TODAY = '2026-08-30';

function sub(over: Partial<PropertySubscription> & { propertyId: string }): PropertySubscription {
  return { ...freeSubscription(over.propertyId, '2026-01-01'), ...over };
}

describe('a plan belongs to a property, not an account', () => {
  const subscriptions = [
    sub({ propertyId: 'p_home', tier: 'care', source: 'app_store', startedOn: '2026-03-30' }),
    sub({ propertyId: 'p_rental', tier: 'plus', source: 'app_store', startedOn: '2026-05-01' }),
    sub({ propertyId: 'p_beach' }),
  ];

  it('resolves a different tier per property', () => {
    expect(tierFor(subscriptions[0], TODAY)).toBe('care');
    expect(tierFor(subscriptions[1], TODAY)).toBe('plus');
    expect(tierFor(subscriptions[2], TODAY)).toBe('free');
  });

  it('treats a property with no subscription at all as free', () => {
    expect(tierFor(undefined, TODAY)).toBe('free');
  });

  it('gives a Care property everything a Plus property has', () => {
    expect(tierIncludesPlus('care')).toBe(true);
    expect(tierIncludesPlus('plus')).toBe(true);
    expect(tierIncludesPlus('free')).toBe(false);
  });
});

describe('expiry is by the clock, not a flag', () => {
  it('drops a lapsed paid subscription back to free', () => {
    const lapsed = sub({ propertyId: 'p', tier: 'plus', source: 'app_store', renewsOn: '2026-08-01' });
    expect(tierFor(lapsed, '2026-07-31')).toBe('plus');
    expect(tierFor(lapsed, TODAY)).toBe('free');
  });

  it('ends a trial on its date', () => {
    const trial = startTrial(freeSubscription('p', TODAY), TODAY);
    expect(tierFor(trial, TODAY)).toBe('plus');
    expect(tierFor(trial, '2026-09-28')).toBe('plus');
    expect(tierFor(trial, '2026-09-29')).toBe('free');
    expect(trialDaysRemaining(trial, TODAY)).toBe(30);
    expect(trialDaysRemaining(trial, '2026-10-01')).toBeUndefined();
  });

  it('offers the trial per property rather than per account', () => {
    // Somebody who tried Plus on their house last year has not yet seen what the
    // forecast says about the rental they just added.
    const used = startTrial(freeSubscription('p_home', '2025-01-01'), '2025-01-01');
    expect(trialAvailable(used)).toBe(false);
    expect(trialAvailable(freeSubscription('p_rental', TODAY))).toBe(true);
  });
});

describe('what the account pays', () => {
  it('charges full price for the first of a tier and the lower rate after', () => {
    const priced = priceSubscriptions(
      [
        sub({ propertyId: 'p1', tier: 'plus', source: 'app_store', startedOn: '2026-01-01' }),
        sub({ propertyId: 'p2', tier: 'plus', source: 'app_store', startedOn: '2026-02-01' }),
        sub({ propertyId: 'p3', tier: 'plus', source: 'app_store', startedOn: '2026-03-01' }),
      ],
      TODAY,
    );
    expect(priced.lines.map((l) => l.monthlyCents)).toEqual([799, 399, 399]);
    expect(priced.monthlyTotalCents).toBe(799 + 399 + 399);
    expect(priced.lines[0]?.discounted).toBe(false);
    expect(priced.lines[1]?.discounted).toBe(true);
  });

  it('gives the discount to the later subscription, so the figure is stable', () => {
    // Ordering by start date rather than by name means renaming a house does not
    // move which one is "the first" and silently change the bill.
    const a = priceSubscriptions(
      [
        sub({ propertyId: 'zzz', tier: 'plus', source: 'app_store', startedOn: '2026-01-01' }),
        sub({ propertyId: 'aaa', tier: 'plus', source: 'app_store', startedOn: '2026-02-01' }),
      ],
      TODAY,
    );
    expect(a.lines.find((l) => l.propertyId === 'zzz')?.monthlyCents).toBe(799);
    expect(a.lines.find((l) => l.propertyId === 'aaa')?.monthlyCents).toBe(399);
  });

  it('does not discount Care, because a van visiting an address does not get cheaper', () => {
    const priced = priceSubscriptions(
      [
        sub({ propertyId: 'p1', tier: 'care', source: 'app_store', startedOn: '2026-01-01' }),
        sub({ propertyId: 'p2', tier: 'care', source: 'app_store', startedOn: '2026-02-01' }),
      ],
      TODAY,
    );
    expect(priced.monthlyTotalCents).toBe(TIERS.care.monthlyCents * 2);
  });

  it('charges nothing for a trial', () => {
    const priced = priceSubscriptions([startTrial(freeSubscription('p', TODAY), TODAY)], TODAY);
    expect(priced.monthlyTotalCents).toBe(0);
    expect(priced.lines[0]?.trialing).toBe(true);
  });

  it('charges nothing for free properties', () => {
    expect(priceSubscriptions([sub({ propertyId: 'p' })], TODAY).monthlyTotalCents).toBe(0);
  });

  it('quotes the right price for one more property', () => {
    expect(priceOfAdding([], 'plus', TODAY)).toBe(799);
    expect(
      priceOfAdding([sub({ propertyId: 'p1', tier: 'plus', source: 'app_store' })], 'plus', TODAY),
    ).toBe(399);
    // A Care property does not make the first Plus cheaper: different tiers.
    expect(
      priceOfAdding([sub({ propertyId: 'p1', tier: 'care', source: 'app_store' })], 'plus', TODAY),
    ).toBe(799);
  });

  it('handles a landlord portfolio', () => {
    const rentals = Array.from({ length: 6 }, (_, i) =>
      sub({
        propertyId: `r${i}`,
        tier: i === 0 ? 'care' : 'plus',
        source: 'app_store',
        startedOn: `2026-0${i + 1}-01`,
      }),
    );
    const priced = priceSubscriptions(rentals, TODAY);
    // One Care at $39, one Plus at $7.99, four more Plus at $3.99.
    expect(priced.monthlyTotalCents).toBe(3_900 + 799 + 399 * 4);
  });
});

describe('the statement', () => {
  const charges: Charge[] = [
    { id: 'c1', accountId: 'a', propertyId: 'p_home', date: '2026-08-30', description: 'Dwella Care', amountCents: 3_900, kind: 'subscription', status: 'paid' },
    { id: 'c2', accountId: 'a', propertyId: 'p_r1', date: '2026-08-30', description: 'Dwella Care', amountCents: 3_900, kind: 'subscription', status: 'paid' },
    { id: 'c3', accountId: 'a', propertyId: 'p_r2', date: '2026-08-18', description: 'Dwella+', amountCents: 799, kind: 'subscription', status: 'paid' },
    { id: 'c4', accountId: 'a', propertyId: 'p_r2', date: '2026-08-14', description: 'Handyman service', amountCents: 12_195, kind: 'service', status: 'paid' },
    { id: 'c5', accountId: 'a', date: '2026-08-02', description: 'Account credit', amountCents: -500, kind: 'credit', status: 'paid' },
    { id: 'c6', accountId: 'a', propertyId: 'p_home', date: '2026-07-30', description: 'Dwella Care', amountCents: 3_900, kind: 'subscription', status: 'paid' },
    { id: 'c7', accountId: 'a', propertyId: 'p_home', date: '2026-08-05', description: 'Retry', amountCents: 3_900, kind: 'subscription', status: 'failed' },
  ];
  const nameOf = (id: string | undefined) =>
    ({ p_home: 'Main Residence', p_r1: 'Rental #1', p_r2: 'Rental #2' })[id ?? ''] ?? 'Account';

  it('groups a month by the property each charge was for', () => {
    const statement = statementFor(charges, '2026-08', nameOf);
    expect(statement.byProperty.map((l) => l.propertyName)).toEqual([
      'Rental #2',
      'Main Residence',
      'Rental #1',
      'Account',
    ]);
    expect(statement.byProperty[0]?.totalCents).toBe(799 + 12_195);
  });

  it('totals the month', () => {
    // 39 + 39 + 7.99 + 121.95 − 5.00
    expect(statementFor(charges, '2026-08', nameOf).totalCents).toBe(3_900 + 3_900 + 799 + 12_195 - 500);
  });

  it('leaves failed charges out of the total', () => {
    // A payment that did not go through is not money somebody spent.
    const august = statementFor(charges, '2026-08', nameOf);
    expect(august.byProperty.flatMap((l) => l.charges).some((c) => c.id === 'c7')).toBe(false);
  });

  it('keeps account-level charges separate from property ones', () => {
    const statement = statementFor(charges, '2026-08', nameOf);
    const accountLine = statement.byProperty.find((l) => l.propertyId === undefined);
    expect(accountLine?.propertyName).toBe('Account');
    expect(accountLine?.totalCents).toBe(-500);
  });

  it('labels the period in words', () => {
    expect(statementFor(charges, '2026-08', nameOf).label).toBe('August 2026');
  });

  it('lists every month with charges, newest first', () => {
    expect(statementPeriods(charges)).toEqual(['2026-08', '2026-07']);
  });

  it('pulls one property’s charges out for its expense history', () => {
    const forHome = chargesForProperty(charges, 'p_home');
    expect(forHome).toHaveLength(3);
    expect(forHome[0]?.date).toBe('2026-08-30');
    expect(forHome.every((c) => c.propertyId === 'p_home')).toBe(true);
  });
});

describe('Care benefits as credits', () => {
  const care = sub({ propertyId: 'p', tier: 'care', source: 'app_store', startedOn: '2026-03-30' });

  it('counts visits against the membership year, not the calendar year', () => {
    // Joining in November must not hand out four visits in five months.
    expect(membershipYearStart('2026-03-30', TODAY)).toBe('2026-03-30');
    expect(membershipYearStart('2024-03-30', TODAY)).toBe('2026-03-30');
  });

  it('reports what is left rather than what the terms say', () => {
    const benefits = careBenefits({
      subscription: care,
      visits: [{ id: 'v1', propertyId: 'p', usedOn: '2026-04-18' }],
      asOf: TODAY,
    })!;
    expect(benefits.seasonalVisitsUsed).toBe(1);
    expect(benefits.seasonalVisitsRemaining).toBe(CARE_SEASONAL_VISITS - 1);
  });

  it('spaces visits so two do not land in the same season', () => {
    const benefits = careBenefits({
      subscription: care,
      visits: [{ id: 'v1', propertyId: 'p', usedOn: '2026-08-01' }],
      asOf: TODAY,
    })!;
    expect(benefits.nextEligibleOn).toBe('2026-12-01');
  });

  it('points at next year once both are used', () => {
    const benefits = careBenefits({
      subscription: care,
      visits: [
        { id: 'v1', propertyId: 'p', usedOn: '2026-04-18' },
        { id: 'v2', propertyId: 'p', usedOn: '2026-08-18' },
      ],
      asOf: TODAY,
    })!;
    expect(benefits.seasonalVisitsRemaining).toBe(0);
    expect(benefits.nextEligibleOn).toBe('2027-03-30');
  });

  it('ignores visits belonging to another property', () => {
    const benefits = careBenefits({
      subscription: care,
      visits: [{ id: 'v1', propertyId: 'other', usedOn: '2026-04-18' }],
      asOf: TODAY,
    })!;
    expect(benefits.seasonalVisitsUsed).toBe(0);
  });

  it('does not exist off Care', () => {
    expect(careBenefits({ subscription: sub({ propertyId: 'p' }), visits: [], asOf: TODAY })).toBeUndefined();
    expect(
      careBenefits({
        subscription: sub({ propertyId: 'p', tier: 'plus', source: 'app_store' }),
        visits: [],
        asOf: TODAY,
      }),
    ).toBeUndefined();
  });
});

describe('payment methods', () => {
  const card = {
    id: 'pm1',
    brand: 'visa' as const,
    last4: '4821',
    expMonth: 8,
    expYear: 2029,
    isDefault: true,
    addedAt: '2026-01-01T00:00:00.000Z',
  };

  it('warns before a card expires rather than after a payment fails', () => {
    expect(cardExpiringSoon(card, TODAY)).toBe(false);
    expect(cardExpiringSoon({ ...card, expMonth: 9, expYear: 2026 }, TODAY)).toBe(true);
  });
});


describe('the direction of a plan change', () => {
  it('reads up from free', () => {
    expect(tierMove('free', 'plus')).toBe('upgrade');
    expect(tierMove('free', 'care')).toBe('upgrade');
  });

  it('reads up from plus to care, and down the other way', () => {
    expect(tierMove('plus', 'care')).toBe('upgrade');
    expect(tierMove('care', 'plus')).toBe('downgrade');
  });

  it('treats dropping to free as a downgrade', () => {
    expect(tierMove('plus', 'free')).toBe('downgrade');
    expect(tierMove('care', 'free')).toBe('downgrade');
  });

  it('has no direction to itself', () => {
    for (const tier of ['free', 'plus', 'care'] as const) {
      expect(tierMove(tier, tier)).toBe('same');
    }
  });

  /*
   * The ordering is the contract the labels rest on: Care contains Plus which
   * contains free. If a tier were ever inserted out of order, every Upgrade and
   * Downgrade label in the app would silently invert.
   */
  it('agrees with what each tier costs', () => {
    expect(TIERS.free.monthlyCents).toBeLessThan(TIERS.plus.monthlyCents);
    expect(TIERS.plus.monthlyCents).toBeLessThan(TIERS.care.monthlyCents);
  });
});
