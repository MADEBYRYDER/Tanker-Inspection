import { describe, expect, it } from 'vitest';
import { buildSampleRecord } from '../../data/sampleHome';
import type { HomeRecord } from '../types';
import { GUIDED_STEPS, guidedProgress } from './guided';

function sample(): HomeRecord {
  return buildSampleRecord().record;
}

describe('guided whole-home scan', () => {
  it('reports nothing done for an empty record', () => {
    const empty: HomeRecord = { ...sample(), components: [] };
    const progress = guidedProgress(empty);
    expect(progress.percent).toBe(0);
    expect(progress.done).toHaveLength(0);
    expect(progress.next?.id).toBe(GUIDED_STEPS[0]!.id);
  });

  it('infers completion from equipment already on record', () => {
    // Nothing was scanned "through" the guided flow, but the record has the items,
    // so the steps must already be ticked rather than asking for them again.
    const progress = guidedProgress(sample());
    const done = new Set(progress.done.map((s) => s.id));
    expect(done.has('hvac')).toBe(true);
    expect(done.has('water_heater')).toBe(true);
    expect(done.has('electrical')).toBe(true);
    expect(done.has('roof')).toBe(true);
    expect(done.has('kitchen')).toBe(true);
    expect(done.has('laundry')).toBe(true);
    expect(done.has('safety')).toBe(true);
  });

  it('does not tick laundry from a kitchen appliance', () => {
    const record = sample();
    // A dishwasher and nothing else. "dishwasher" contains "washer", so a substring
    // match would mark the laundry step complete and skip the washer and dryer.
    const dishwasherOnly: HomeRecord = {
      ...record,
      components: record.components.filter((c) => c.id === 'cmp_dishwasher'),
    };
    const progress = guidedProgress(dishwasherOnly);
    const done = new Set(progress.done.map((s) => s.id));
    expect(done.has('kitchen')).toBe(true);
    expect(done.has('laundry')).toBe(false);
  });

  it('points at the first incomplete area and counts progress', () => {
    const record = sample();
    // The sample has no exterior or plumbing equipment recorded.
    const progress = guidedProgress(record);
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.percent).toBeLessThan(100);
    expect(progress.next).toBeDefined();
    expect(progress.next!.done).toBe(false);
    expect(progress.done.length + progress.remaining.length).toBe(progress.steps.length);
  });

  it('every step names what to photograph', () => {
    for (const step of GUIDED_STEPS) {
      expect(step.prompt.length).toBeGreaterThan(30);
      expect(step.satisfiedBy.length).toBeGreaterThan(0);
    }
  });

  it('ignores retired equipment', () => {
    const record = sample();
    const retired: HomeRecord = {
      ...record,
      components: record.components.map((c) =>
        c.category === 'roof' ? { ...c, retiredOn: '2026-01-01' } : c,
      ),
    };
    expect(guidedProgress(retired).done.some((s) => s.id === 'roof')).toBe(false);
  });
});
