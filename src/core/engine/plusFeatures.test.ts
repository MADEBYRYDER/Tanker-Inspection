import { describe, expect, it } from 'vitest';
import { buildSampleRecord } from '../../data/sampleHome';
import type { HomeRecord } from '../types';
import { personalDiyNotes, personalNotesSummary } from './diyPersonal';
import { comparisonNote, spendForComponent, spendingReport } from './spending';
import { warrantyAlerts, warrantyHeadline } from './warrantyIntelligence';

const TODAY = '2026-08-30';

function sample(): HomeRecord {
  return buildSampleRecord().record;
}

/**
 * These cover the three engines Dwella+ is actually sold on. Each one asserts
 * the same underlying property in its own domain: the output may only contain
 * things the record supports, and anything inferred has to say so.
 */

describe('warranty intelligence', () => {
  it('ranks an item with a known issue above one that is merely expiring', () => {
    const record = sample();
    const dishwasher = record.components.find((c) => /dishwasher/i.test(c.name))!;
    const furnace = record.components.find((c) => /furnace/i.test(c.name))!;

    // Both expiring; only one has trouble on record.
    dishwasher.warranties = [
      { provider: 'Samsung', kind: 'manufacturer', expiresOn: '2026-11-17', provenance: 'documented' },
    ];
    furnace.warranties = [
      { provider: 'Carrier', kind: 'manufacturer', expiresOn: '2026-09-20', provenance: 'documented' },
    ];
    record.events.push({
      id: 'evt_drain',
      homeId: record.home.id,
      componentId: dishwasher.id,
      date: '2026-07-02',
      type: 'issue',
      title: 'Intermittent drainage problem',
      documentIds: [],
      photoIds: [],
      source: 'owner',
      visibility: 'transferable',
      createdAt: '2026-07-02T00:00:00.000Z',
    });

    const alerts = warrantyAlerts(record, TODAY);
    expect(alerts[0]?.componentId).toBe(dishwasher.id);
    expect(alerts[0]?.kind).toBe('act_now');
    // Even though the furnace expires sooner.
    expect(alerts[1]?.componentId).toBe(furnace.id);
    expect(alerts[1]?.kind).toBe('ending');
  });

  it('quotes the owner’s own words back rather than inventing a diagnosis', () => {
    const record = sample();
    const dishwasher = record.components.find((c) => /dishwasher/i.test(c.name))!;
    dishwasher.warranties = [
      { provider: 'Samsung', kind: 'manufacturer', expiresOn: '2026-11-17', provenance: 'documented' },
    ];
    record.events.push({
      id: 'evt_drain',
      homeId: record.home.id,
      componentId: dishwasher.id,
      date: '2026-07-02',
      type: 'issue',
      title: 'Intermittent drainage problem',
      documentIds: [],
      photoIds: [],
      source: 'owner',
      visibility: 'transferable',
      createdAt: '2026-07-02T00:00:00.000Z',
    });
    const alert = warrantyAlerts(record, TODAY).find((a) => a.componentId === dishwasher.id)!;
    expect(alert.detail).toContain('Intermittent drainage problem');
    expect(alert.recommendation).toContain('Samsung');
  });

  it('says so when the expiry was calculated rather than read off paperwork', () => {
    const record = sample();
    const dryer = record.components.find((c) => /dryer/i.test(c.name))!;
    dryer.installedOn = '2024-10-01';
    dryer.warranties = [
      // No expiresOn: derived from install date plus term.
      { provider: 'LG', kind: 'manufacturer', termYears: 2, provenance: 'documented' },
    ];
    const alert = warrantyAlerts(record, TODAY).find((a) => a.componentId === dryer.id);
    expect(alert?.derived).toBe(true);
    expect(alert?.detail).toContain('calculated from the install date');
  });

  it('ignores anything expiring beyond the horizon', () => {
    const record = sample();
    for (const component of record.components) {
      component.warranties = [
        { provider: 'Acme', kind: 'manufacturer', expiresOn: '2031-01-01', provenance: 'documented' },
      ];
    }
    expect(warrantyAlerts(record, TODAY)).toHaveLength(0);
    expect(warrantyHeadline([])).toBeUndefined();
  });

  it('does not raise alerts for retired equipment', () => {
    const record = sample();
    const heater = record.components.find((c) => /water heater/i.test(c.name))!;
    heater.warranties = [
      { provider: 'Rheem', kind: 'manufacturer', expiresOn: '2026-10-01', provenance: 'documented' },
    ];
    heater.retiredOn = '2026-06-01';
    expect(warrantyAlerts(record, TODAY).some((a) => a.componentId === heater.id)).toBe(false);
  });

  it('treats routine service as routine, not as trouble', () => {
    const record = sample();
    const heater = record.components.find((c) => /water heater/i.test(c.name))!;
    heater.warranties = [
      { provider: 'Rheem', kind: 'manufacturer', expiresOn: '2026-10-01', provenance: 'documented' },
    ];
    // The sample record's heater has a routine "Water heater serviced" entry.
    const alert = warrantyAlerts(record, TODAY).find((a) => a.componentId === heater.id);
    expect(alert?.kind).toBe('ending');
  });
});

describe('spending insights', () => {
  it('separates maintenance from repairs from improvements', () => {
    const report = spendingReport(sample(), TODAY);
    const buckets = report.history.flatMap((y) => y.buckets.map((b) => b.bucket));
    expect(new Set(buckets).size).toBeGreaterThan(0);
    for (const year of report.history) {
      const summed = year.buckets.reduce((total, b) => total + b.totalCents, 0);
      expect(year.totalCents).toBe(summed);
    }
  });

  it('refuses to compute a change against a year with no spend', () => {
    const record = sample();
    record.events = record.events.filter((e) => e.date < '2000-01-01');
    const report = spendingReport(record, TODAY);
    expect(report.changePercent).toBeUndefined();
    expect(comparisonNote(report)).not.toContain('%');
  });

  it('warns that a partial year is not a full-year comparison', () => {
    const record = sample();
    const thisYear = TODAY.slice(0, 4);
    const lastYear = String(Number(thisYear) - 1);
    record.events.push(
      {
        id: 'evt_a',
        homeId: record.home.id,
        date: `${lastYear}-03-01`,
        type: 'repair',
        title: 'Repair',
        costCents: 100_000,
        documentIds: [],
        photoIds: [],
        source: 'owner',
        visibility: 'transferable',
        createdAt: '2025-03-01T00:00:00.000Z',
      },
      {
        id: 'evt_b',
        homeId: record.home.id,
        date: `${thisYear}-03-01`,
        type: 'repair',
        title: 'Repair',
        costCents: 50_000,
        documentIds: [],
        photoIds: [],
        source: 'owner',
        visibility: 'transferable',
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    );
    const report = spendingReport(record, TODAY);
    expect(report.currentYearComplete).toBe(false);
    expect(comparisonNote(report)).toContain('not over');
  });

  it('counts only entries that carry a cost, and says how many it skipped', () => {
    const record = sample();
    const year = Number(TODAY.slice(0, 4));
    record.events.push({
      id: 'evt_nocost',
      homeId: record.home.id,
      date: `${year}-04-01`,
      type: 'service',
      title: 'Serviced, no invoice kept',
      documentIds: [],
      photoIds: [],
      source: 'owner',
      visibility: 'transferable',
      createdAt: '2026-04-01T00:00:00.000Z',
    });
    const report = spendingReport(record, TODAY);
    expect(report.current.undocumentedEventCount).toBeGreaterThan(0);
  });

  it('answers "how much has this cost me" per item', () => {
    const record = sample();
    const heater = record.components.find((c) => /water heater/i.test(c.name))!;
    const perItem = spendForComponent(record, heater.id);
    const fromReport = spendingReport(record, TODAY).byComponent.find(
      (c) => c.componentId === heater.id,
    );
    // The two paths must agree; a dashboard that disagrees with its own drill-down
    // is worse than one that has no drill-down.
    expect(perItem.totalCents).toBe(fromReport?.totalCents ?? 0);
  });
});

describe('personalised DIY notes', () => {
  it('never withholds safety guidance behind the paid tier', () => {
    // The gated notes must not be where a hazard warning lives. proOnlyReason
    // comes from the catalog and renders on both plans; nothing here may
    // duplicate that role.
    const record = sample();
    const component = record.components.find((c) => /furnace/i.test(c.name))!;
    const notes = personalDiyNotes({
      record,
      task: {
        key: 'hvac.filter',
        title: 'Replace the filter',
        componentId: component.id,
        componentName: component.name,
      } as never,
      component,
      asOf: TODAY,
    });
    for (const note of notes) {
      expect(['spec', 'history', 'age', 'warranty']).toContain(note.kind);
      expect(note.text).not.toMatch(/\b(gas leak|carbon monoxide|electrocut|shut off the gas)\b/i);
    }
  });

  it('surfaces the consumable size, which is the whole point', () => {
    const record = sample();
    const component = record.components.find((c) => c.specs.some((s) => /size/i.test(s.label)));
    if (!component) return;
    const notes = personalDiyNotes({
      record,
      task: { key: 't', title: 'T', componentId: component.id, componentName: component.name } as never,
      component,
      asOf: TODAY,
    });
    expect(notes.some((n) => n.kind === 'spec')).toBe(true);
  });

  it('marks an estimated spec as estimated', () => {
    const record = sample();
    const component = record.components.find((c) =>
      c.specs.some((s) => s.provenance === 'estimated' && /size|thread|capacity/i.test(s.label)),
    );
    if (!component) return;
    const notes = personalDiyNotes({
      record,
      task: { key: 't', title: 'T', componentId: component.id, componentName: component.name } as never,
      component,
      asOf: TODAY,
    });
    expect(notes.some((n) => n.basis === 'estimate')).toBe(true);
  });

  it('describes what is withheld without giving it away', () => {
    const record = sample();
    const component = record.components.find((c) => /water heater/i.test(c.name))!;
    const notes = personalDiyNotes({
      record,
      task: { key: 't', title: 'T', componentId: component.id, componentName: component.name } as never,
      component,
      asOf: TODAY,
    });
    const summary = personalNotesSummary(notes);
    expect(summary).toBeDefined();
    // The teaser names the categories, never the values themselves.
    expect(summary).not.toContain(component.modelNumber ?? '@@none@@');
  });

  it('returns nothing for a task with no equipment attached', () => {
    const record = sample();
    expect(
      personalDiyNotes({ record, task: { key: 't', title: 'T' } as never, asOf: TODAY }),
    ).toHaveLength(0);
  });
});
