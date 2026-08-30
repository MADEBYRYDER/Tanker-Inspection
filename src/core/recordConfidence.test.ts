import { describe, expect, it } from 'vitest';
import { confidenceLabel, valueOrNotDetected, NOT_DETECTED } from './confidence';
import { computeHomeHealth } from './engine/health';
import { computeRecordConfidence } from './engine/recordConfidence';
import type { Charge } from './billing';
import { missingServiceEvents, timelineEventForCharge } from './serviceLedger';
import type { HomeComponent, HomeRecord, TimelineEvent } from './types';

const TODAY = '2026-08-30';

function component(over: Partial<HomeComponent> = {}): HomeComponent {
  return {
    id: over.id ?? 'c1',
    homeId: 'h1',
    category: 'water_heater',
    type: 'Gas water heater',
    name: 'Water heater',
    ageProvenance: 'documented',
    installedOn: '2015-04-01',
    manufacturer: 'Rheem',
    modelNumber: 'XG50',
    serialNumber: 'RH123',
    specs: [],
    warranties: [],
    photos: [],
    documentIds: [],
    identificationConfidence: 0.9,
    identificationSource: 'ai_scan',
    openQuestions: [],
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
    ...over,
  };
}

function record(over: Partial<HomeRecord> = {}): HomeRecord {
  return {
    home: {
      id: 'h1',
      publicId: 'DW-829173',
      propertyType: 'primary',
      nickname: 'Marsh Point',
      climate: 'coastal',
      yearBuilt: 1998,
      squareFeet: 2400,
      addressLine1: '12 Marsh Point',
      createdAt: `${TODAY}T00:00:00.000Z`,
    },
    components: [],
    events: [],
    documents: [],
    completions: [],
    serviceRequests: [],
    ...over,
  } as HomeRecord;
}

describe('confidence language', () => {
  it('never claims certainty, however high the score', () => {
    for (const value of [1, 0.999, 0.95, 0.86]) {
      const label = confidenceLabel(value);
      expect(label.label).toBe('High confidence');
      expect(label.label).not.toMatch(/100|certain|sure/i);
    }
  });

  it('never expresses confidence as a percentage', () => {
    for (const value of [0, 0.25, 0.6, 0.85, 1]) {
      const label = confidenceLabel(value);
      expect(label.label).not.toMatch(/%|\d/);
      expect(label.statement).not.toMatch(/%/);
    }
  });

  it('asks for a look only below the review threshold', () => {
    expect(confidenceLabel(0.59).needsReview).toBe(true);
    expect(confidenceLabel(0.6).needsReview).toBe(false);
  });

  it('distinguishes an unreadable field from an empty one', () => {
    expect(valueOrNotDetected(undefined)).toBe(NOT_DETECTED);
    expect(valueOrNotDetected('   ')).toBe(NOT_DETECTED);
    expect(valueOrNotDetected('XG50')).toBe('XG50');
  });
});

describe('record confidence', () => {
  it('is low when nothing is on record and rises as systems are added', () => {
    const empty = computeRecordConfidence(record(), { asOf: TODAY });
    const withOne = computeRecordConfidence(
      record({ components: [component()] }),
      { asOf: TODAY },
    );
    expect(empty.percent).toBeLessThan(withOne.percent);
    expect(empty.missingSystemCount).toBe(6);
  });

  it('names the missing systems as the next step', () => {
    const result = computeRecordConfidence(record(), { asOf: TODAY });
    expect(result.nextStep).toBe('Add 6 missing systems to improve your Home Record.');
    expect(result.headline).toBe(`Dwella knows ${result.percent}% of your home`);
  });

  it('does not ask a condo owner for a roof', () => {
    const condo = computeRecordConfidence(
      record({ home: { ...record().home, propertyType: 'condo' } }),
      { asOf: TODAY },
    );
    expect(condo.gaps.some((g) => g.category === 'roof')).toBe(false);
  });

  it('values a documented install date above an estimated one', () => {
    const documented = computeRecordConfidence(
      record({ components: [component({ ageProvenance: 'documented' })] }),
      { asOf: TODAY },
    );
    const estimated = computeRecordConfidence(
      record({ components: [component({ ageProvenance: 'estimated' })] }),
      { asOf: TODAY },
    );
    expect(documented.percent).toBeGreaterThan(estimated.percent);
  });

  it('reports an undated item as a gap the owner can close', () => {
    const result = computeRecordConfidence(
      record({
        components: [component({ installedOn: undefined, ageProvenance: 'unknown' })],
      }),
      { asOf: TODAY },
    );
    const gap = result.gaps.find((g) => g.kind === 'unknown_age');
    expect(gap?.label).toBe('Water heater');
    expect(gap?.detail).toBe('Install date not known');
  });

  it('orders gaps by what closing them is worth', () => {
    const result = computeRecordConfidence(record(), { asOf: TODAY });
    const worths = result.gaps.map((g) => g.worth);
    expect([...worths].sort((a, b) => b - a)).toEqual(worths);
  });

  it('never exceeds 100', () => {
    const full = computeRecordConfidence(
      record({
        components: [
          component({ id: 'a', category: 'hvac' }),
          component({ id: 'b', category: 'water_heater' }),
          component({ id: 'c', category: 'electrical' }),
          component({ id: 'd', category: 'roof' }),
          component({ id: 'e', category: 'plumbing' }),
          component({ id: 'f', category: 'safety' }),
        ],
      }),
      { asOf: TODAY },
    );
    expect(full.percent).toBeLessThanOrEqual(100);
  });
});

describe('health and record confidence are different measures', () => {
  /*
   * The distinction this whole separation exists to protect: a house in poor
   * condition that is thoroughly documented should score badly on health and
   * well on record confidence. If one number could stand in for the other, the
   * split would be cosmetic.
   */
  it('a well-documented old house scores low health and high confidence', () => {
    const old = record({
      components: [
        component({ id: 'a', category: 'hvac', installedOn: '1998-01-01' }),
        component({ id: 'b', category: 'water_heater', installedOn: '1999-01-01' }),
        component({ id: 'c', category: 'electrical', installedOn: '1998-01-01' }),
        component({ id: 'd', category: 'roof', installedOn: '1998-01-01' }),
        component({ id: 'e', category: 'plumbing', installedOn: '1998-01-01' }),
        component({ id: 'f', category: 'safety', installedOn: '1998-01-01' }),
      ],
    });
    const health = computeHomeHealth(old, { asOf: TODAY });
    const confidence = computeRecordConfidence(old, { asOf: TODAY });
    expect(health.score).toBeLessThan(60);
    expect(confidence.percent).toBeGreaterThan(85);
  });

  it('the health summary no longer asks the owner to add data', () => {
    const health = computeHomeHealth(
      record({ components: [component({ ageProvenance: 'estimated' })] }),
      { asOf: TODAY },
    );
    expect(health.summary).not.toMatch(/adding install dates|will make it more accurate/i);
  });
});

describe('a service charge becomes home history', () => {
  const charge: Charge = {
    id: 'chg_1',
    accountId: 'acct_1',
    propertyId: 'h1',
    date: '2026-08-14',
    description: 'Handyman visit — gutter downspout reattached',
    amountCents: 12_195,
    kind: 'service',
    status: 'paid',
    receiptNumber: 'DW-2026-08-0018',
  };

  it('derives a contractor-provenance entry carrying the amount', () => {
    const event = timelineEventForCharge(charge, `${TODAY}T00:00:00.000Z`)!;
    expect(event.source).toBe('contractor');
    expect(event.costCents).toBe(12_195);
    expect(event.date).toBe('2026-08-14');
    expect(event.sourceChargeId).toBe('chg_1');
    expect(event.description).toContain('DW-2026-08-0018');
  });

  it('ignores subscription charges — paying for the app is not maintenance', () => {
    expect(
      timelineEventForCharge({ ...charge, kind: 'subscription' }, `${TODAY}T00:00:00.000Z`),
    ).toBeUndefined();
  });

  it('ignores a charge that did not go through', () => {
    expect(
      timelineEventForCharge({ ...charge, status: 'failed' }, `${TODAY}T00:00:00.000Z`),
    ).toBeUndefined();
  });

  it('is idempotent — reconciling twice does not duplicate the job', () => {
    const first = missingServiceEvents([charge], [], `${TODAY}T00:00:00.000Z`);
    expect(first).toHaveLength(1);

    const stored: TimelineEvent[] = first.map(({ event }, i) => ({
      ...event,
      id: `evt_${i}`,
      homeId: 'h1',
    }));
    expect(missingServiceEvents([charge], stored, `${TODAY}T00:00:00.000Z`)).toHaveLength(0);
  });

  it('distinguishes two identical-looking visits in the same month', () => {
    const twin: Charge = { ...charge, id: 'chg_2', receiptNumber: 'DW-2026-08-0019' };
    const events = missingServiceEvents([charge, twin], [], `${TODAY}T00:00:00.000Z`);
    expect(events).toHaveLength(2);

    // Having entered only the first, the second must still be outstanding —
    // this is what matching on date and amount would get wrong.
    const stored: TimelineEvent[] = [{ ...events[0]!.event, id: 'evt_0', homeId: 'h1' }];
    const remaining = missingServiceEvents([charge, twin], stored, `${TODAY}T00:00:00.000Z`);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.event.sourceChargeId).toBe('chg_2');
  });
});
