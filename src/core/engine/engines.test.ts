import { describe, expect, it } from 'vitest';
import { buildSampleRecord } from '../../data/sampleHome';
import { findLifespan, expectedLifeYears, replacementCostRange } from '../catalog/lifespans';
import { MAINTENANCE_TEMPLATES } from '../catalog/maintenance';
import type { HomeRecord } from '../types';
import { resolveComponentAge } from './age';
import { computeForecast, failureCdf, replacementProbability } from './forecast';
import { computeHomeHealth, scoreFromLifeUsed } from './health';
import { answerFromRecord, buildGroundingContext, resolveComponent } from './query';
import { generateTasks, groupTasksByMonth, overdueTasks } from './schedule';
import { buildServiceRequestPacket, renderPacketText } from './serviceRequest';
import { groupEventsByYear, spendForYear, summarizeSpend } from './timeline';
import { buildHomeRecordReport, redactForTransfer } from './transfer';
import { componentWarrantyStatus } from './warranty';

/** Fixed reference date so every assertion here is reproducible. */
const TODAY = '2026-08-29';

function sample(): HomeRecord {
  return buildSampleRecord().record;
}

describe('lifespan catalog', () => {
  it('matches most-specific-first inside a category', () => {
    expect(findLifespan('water_heater', 'Tankless water heater')?.id).toBe('water_heater.tankless');
    expect(findLifespan('water_heater', 'Heat pump water heater')?.id).toBe('water_heater.heat_pump');
    expect(findLifespan('water_heater', 'Tank water heater (gas)')?.id).toBe('water_heater.tank');
    expect(findLifespan('hvac', 'Heat pump')?.id).toBe('hvac.heat_pump');
    expect(findLifespan('hvac', 'Gas furnace / air handler')?.id).toBe('hvac.furnace');
  });

  it('falls back within the category rather than returning nothing', () => {
    expect(findLifespan('appliance', 'some unusual gadget')).toBeDefined();
  });

  it('shortens coastal lifespans for equipment the salt air attacks', () => {
    const entry = findLifespan('hvac', 'Central air conditioner (condenser)')!;
    const coastal = expectedLifeYears(entry, { ...sample().home, climate: 'coastal' });
    const temperate = expectedLifeYears(entry, { ...sample().home, climate: 'temperate' });
    expect(coastal).toBeLessThan(temperate);
    expect(temperate).toBe(15);
  });

  it('scales area-dependent costs with home size, sub-linearly', () => {
    const entry = findLifespan('roof', 'Architectural asphalt shingle roof')!;
    const home = sample().home;
    const small = replacementCostRange(entry, { ...home, squareFeet: 1200 });
    const big = replacementCostRange(entry, { ...home, squareFeet: 4000 });
    expect(big[0]).toBeGreaterThan(small[0]);
    // Doubling the area must not double the price.
    const mid = replacementCostRange(entry, { ...home, squareFeet: 2000 });
    expect(big[0]).toBeLessThan(mid[0] * 2);
  });

  it('leaves non-area costs alone', () => {
    const entry = findLifespan('water_heater', 'Tank water heater')!;
    const home = sample().home;
    expect(replacementCostRange(entry, { ...home, squareFeet: 1000 })).toEqual(
      replacementCostRange(entry, { ...home, squareFeet: 5000 }),
    );
  });
});

describe('age resolution', () => {
  it('prefers a documented install date and says so', () => {
    const record = sample();
    const hvac = record.components.find((c) => c.id === 'cmp_hvac')!;
    const age = resolveComponentAge(hvac, record.home, TODAY);
    expect(age.provenance).toBe('documented');
    expect(age.years).toBeCloseTo(13.2, 1);
    expect(age.basis).toContain('2013-06-14');
  });

  it('ties long-lived original equipment to the home build year', () => {
    const record = sample();
    const panel = record.components.find((c) => c.id === 'cmp_panel')!;
    const age = resolveComponentAge(panel, record.home, TODAY);
    expect(age.provenance).toBe('estimated');
    expect(age.years).toBe(28); // 2026 - 1998
  });

  it('does not assume an appliance is as old as the house', () => {
    const record = sample();
    const dishwasher = { ...record.components.find((c) => c.id === 'cmp_dishwasher')!, installedOn: undefined };
    const age = resolveComponentAge(dishwasher, record.home, TODAY);
    // A 28-year-old house does not imply a 28-year-old dishwasher.
    expect(age.years).toBeLessThan(10);
    expect(age.provenance).toBe('estimated');
  });

  it('returns unknown rather than inventing a number', () => {
    const record = sample();
    const orphan = {
      ...record.components[0]!,
      installedOn: undefined,
      manufacturedYear: undefined,
    };
    const age = resolveComponentAge(orphan, { ...record.home, yearBuilt: undefined }, TODAY);
    expect(age.years).toBeUndefined();
    expect(age.provenance).toBe('unknown');
  });
});

describe('maintenance scheduling', () => {
  it('only creates tasks for equipment the home actually has', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    // No septic system on record, so no septic pumping task.
    expect(tasks.some((t) => t.templateId === 'plumbing.septic_pump')).toBe(false);
    // There is a dryer, so the vent task exists.
    expect(tasks.some((t) => t.templateId === 'appliance.dryer_vent')).toBe(true);
  });

  it('matches equipment types as whole words, not substrings', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    const hoseTasks = tasks.filter((t) => t.templateId === 'appliance.washer_hoses');
    // "dishwasher" contains "washer". A substring match puts washing-machine hose
    // inspections on the dishwasher, which is a wrong task on the wrong appliance.
    expect(hoseTasks).toHaveLength(1);
    expect(hoseTasks[0]!.componentId).toBe('cmp_washer');

    // And the tank-specific tasks must not attach themselves to a tankless unit.
    const tankless = {
      ...record.components.find((c) => c.id === 'cmp_water_heater')!,
      id: 'cmp_tankless',
      type: 'Tankless water heater',
      name: 'Tankless heater',
    };
    const withTankless = generateTasks(
      { ...record, components: [...record.components, tankless] },
      { asOf: TODAY },
    );
    const flushes = withTankless.filter((t) => t.templateId === 'water_heater.flush');
    expect(flushes.map((t) => t.componentId)).toEqual(['cmp_water_heater']);
    expect(
      withTankless.some(
        (t) => t.templateId === 'water_heater.tankless_descale' && t.componentId === 'cmp_tankless',
      ),
    ).toBe(true);
  });

  it('creates one system-level task, not one per box in the system', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    // The condenser and the furnace are one system sharing one filter and one
    // condensate drain, so each of these is a single task.
    for (const id of ['hvac.filter', 'hvac.condensate', 'hvac.service_cooling', 'hvac.service_heating']) {
      expect(tasks.filter((t) => t.templateId === id)).toHaveLength(1);
    }
    // And each hangs off the right box: heating on the furnace, cooling on the condenser.
    expect(tasks.find((t) => t.templateId === 'hvac.service_heating')!.componentId).toBe('cmp_furnace');
    expect(tasks.find((t) => t.templateId === 'hvac.service_cooling')!.componentId).toBe('cmp_hvac');
    expect(tasks.find((t) => t.templateId === 'hvac.filter')!.componentId).toBe('cmp_furnace');
  });

  it('still schedules a system task when no anchor component is on record', () => {
    const record = sample();
    // Only the outdoor condenser was scanned; there is no furnace to anchor to.
    const condenserOnly = {
      ...record,
      components: record.components.filter((c) => c.id === 'cmp_hvac'),
    };
    const tasks = generateTasks(condenserOnly, { asOf: TODAY });
    const filter = tasks.filter((t) => t.templateId === 'hvac.filter');
    expect(filter).toHaveLength(1);
    expect(filter[0]!.componentId).toBe('cmp_hvac');
  });

  it('creates exactly one whole-home task, not one per unit', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    expect(tasks.filter((t) => t.templateId === 'safety.detectors')).toHaveLength(1);
    expect(tasks.filter((t) => t.templateId === 'plumbing.shutoff')).toHaveLength(1);
  });

  it('advances the due date from the last completion', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    // Filter changed 2026-06-15, 3 month interval → due 2026-09-15.
    const filter = tasks.find((t) => t.templateId === 'hvac.filter')!;
    expect(filter.dueDate).toBe('2026-09-15');
    expect(filter.urgency).toBe('due_soon');
    expect(filter.lastCompletedOn).toBe('2026-06-15');
  });

  it('snaps seasonal work to its intended month', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    const heating = tasks.find((t) => t.templateId === 'hvac.service_heating')!;
    // Seasonal months are September and October — never the middle of summer.
    expect(['09', '10']).toContain(heating.dueDate.slice(5, 7));
  });

  it('marks work whose interval has elapsed as overdue', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    // Water heater flushed 2025-09-30 on a 12-month interval → due 2026-09-30, not yet overdue.
    const flush = tasks.find((t) => t.templateId === 'water_heater.flush')!;
    expect(flush.urgency).toBe('upcoming');

    const later = generateTasks(record, { asOf: '2027-01-01' });
    expect(later.find((t) => t.templateId === 'water_heater.flush')!.urgency).toBe('overdue');
  });

  it('shows never-logged tasks as due now rather than overdue', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    const neverLogged = tasks.find(
      (t) => t.templateId === 'appliance.washer_hoses' && !t.lastCompletedOn,
    )!;
    expect(neverLogged.dueDate).toBe(TODAY);
    expect(neverLogged.urgency).toBe('due_soon');
  });

  it('sorts by due date then by consequence', () => {
    const record = sample();
    const tasks = generateTasks(record, { asOf: TODAY });
    for (let i = 1; i < tasks.length; i += 1) {
      expect(tasks[i]!.dueDate >= tasks[i - 1]!.dueDate).toBe(true);
    }
  });

  it('groups into a month-by-month calendar', () => {
    const record = sample();
    const groups = groupTasksByMonth(generateTasks(record, { asOf: TODAY }), 12);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups[0]!.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    for (let i = 1; i < groups.length; i += 1) {
      expect(groups[i]!.monthStart > groups[i - 1]!.monthStart).toBe(true);
    }
  });

  it('every template has a DIY path or a stated reason it has none', () => {
    for (const template of MAINTENANCE_TEMPLATES) {
      const hasSteps = template.diy.steps.length > 0;
      expect(hasSteps || Boolean(template.diy.proOnlyReason)).toBe(true);
      expect(template.hireCostRangeCents[0]).toBeLessThanOrEqual(template.hireCostRangeCents[1]);
    }
  });
});

describe('health scoring', () => {
  it('maps life used to a score monotonically', () => {
    expect(scoreFromLifeUsed(0)).toBeCloseTo(100, 6);
    expect(scoreFromLifeUsed(0.5)).toBeCloseTo(90, 6);
    expect(scoreFromLifeUsed(0.8)).toBeCloseTo(70, 6);
    expect(scoreFromLifeUsed(1.0)).toBeCloseTo(45, 6);
    expect(scoreFromLifeUsed(1.5)).toBeLessThan(scoreFromLifeUsed(1.1));
    expect(scoreFromLifeUsed(3)).toBeGreaterThanOrEqual(20);
  });

  it('rates a nearly-new roof well and an old water heater poorly', () => {
    const health = computeHomeHealth(sample(), { asOf: TODAY });
    const roof = health.components.find((c) => c.componentId === 'cmp_roof')!;
    const waterHeater = health.components.find((c) => c.componentId === 'cmp_water_heater')!;
    expect(roof.status).toBe('good');
    expect(waterHeater.score).toBeLessThan(roof.score);
    expect(['aging', 'plan_replacement']).toContain(waterHeater.status);
  });

  it('produces a score in range with a readable summary', () => {
    const health = computeHomeHealth(sample(), { asOf: TODAY });
    expect(health.score).toBeGreaterThan(0);
    expect(health.score).toBeLessThanOrEqual(100);
    expect(health.summary.length).toBeGreaterThan(20);
  });

  it('tags every reason as fact or estimate', () => {
    const health = computeHomeHealth(sample(), { asOf: TODAY });
    for (const component of health.components) {
      expect(component.reasons.length).toBeGreaterThan(0);
      for (const reason of component.reasons) {
        expect(['fact', 'estimate']).toContain(reason.basis);
      }
    }
  });

  it('never labels an estimated age as documented', () => {
    const health = computeHomeHealth(sample(), { asOf: TODAY });
    const panel = health.components.find((c) => c.componentId === 'cmp_panel')!;
    expect(panel.ageProvenance).toBe('estimated');
    const ageReason = panel.reasons[0]!;
    expect(ageReason.basis).toBe('estimate');
  });

  it('reports how much of the score rests on documented dates', () => {
    const health = computeHomeHealth(sample(), { asOf: TODAY });
    expect(health.dataConfidence).toBeGreaterThan(0);
    expect(health.dataConfidence).toBeLessThanOrEqual(1);
  });

  it('penalises overdue maintenance', () => {
    const record = sample();
    const clean = computeHomeHealth(record, { asOf: TODAY }).score;
    // Two years on, several intervals have lapsed.
    const neglected = computeHomeHealth(record, { asOf: '2028-08-29' }).score;
    expect(neglected).toBeLessThan(clean);
  });

  it('caps the score for known-defective materials regardless of age', () => {
    const record = sample();
    record.components.push({
      ...record.components.find((c) => c.id === 'cmp_panel')!,
      id: 'cmp_fpe',
      name: 'Sub panel',
      type: 'Federal Pacific Stab-Lok panel',
      manufacturer: 'Federal Pacific',
      installedOn: '2024-01-01',
      ageProvenance: 'documented',
      manufacturedYear: undefined,
    });
    const health = computeHomeHealth(record, { asOf: TODAY });
    const fpe = health.components.find((c) => c.componentId === 'cmp_fpe')!;
    // Two years old, but the panel type is the problem.
    expect(fpe.score).toBeLessThanOrEqual(40);
    expect(fpe.reasons.some((r) => /Stab-Lok/i.test(r.text))).toBe(true);
  });
});

describe('financial forecast', () => {
  it('has a well-formed failure distribution', () => {
    expect(failureCdf(0.5)).toBe(0);
    expect(failureCdf(2)).toBe(1);
    expect(failureCdf(1.0)).toBeCloseTo(0.385, 2);
    // Monotonic.
    let previous = 0;
    for (let x = 0.7; x <= 1.5; x += 0.05) {
      const value = failureCdf(x);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it('raises replacement probability as equipment ages', () => {
    const young = replacementProbability(0.2, 15, 5);
    const middle = replacementProbability(0.8, 15, 5);
    const old = replacementProbability(1.1, 15, 5);
    expect(young).toBeLessThan(middle);
    expect(middle).toBeLessThan(old);
    expect(replacementProbability(1.5, 15, 1)).toBe(1);
  });

  it('grows monotonically with the horizon', () => {
    const one = replacementProbability(0.7, 15, 1);
    const three = replacementProbability(0.7, 15, 3);
    const five = replacementProbability(0.7, 15, 5);
    expect(one).toBeLessThan(three);
    expect(three).toBeLessThan(five);
  });

  it('produces increasing totals across horizons', () => {
    const forecast = computeForecast(sample(), { asOf: TODAY });
    const { oneYear, threeYear, fiveYear } = forecast.horizons;
    expect(oneYear.totalCents).toBeLessThan(threeYear.totalCents);
    expect(threeYear.totalCents).toBeLessThan(fiveYear.totalCents);
  });

  it('suggests a monthly reserve derived from the five-year figure', () => {
    const forecast = computeForecast(sample(), { asOf: TODAY });
    const expected = forecast.horizons.fiveYear.totalCents / 60;
    expect(forecast.suggestedMonthlyReserveCents).toBeGreaterThan(expected * 0.9);
    expect(forecast.suggestedMonthlyReserveCents).toBeLessThan(expected * 1.1);
    // Rounded to a whole $10.
    expect(forecast.suggestedMonthlyReserveCents % 1000).toBe(0);
  });

  it('flags the aging water heater as a near-term expense', () => {
    const forecast = computeForecast(sample(), { asOf: TODAY });
    const item = forecast.horizons.fiveYear.items.find((i) => i.componentId === 'cmp_water_heater');
    expect(item).toBeDefined();
    expect(item!.probability).toBeGreaterThan(0.5);
    expect(item!.basis).toBe('fact'); // documented install date
  });

  it('does not project a replacement for the new roof inside a year', () => {
    const forecast = computeForecast(sample(), { asOf: TODAY });
    const roof = forecast.horizons.oneYear.items.find((i) => i.componentId === 'cmp_roof');
    expect(roof).toBeUndefined();
  });

  it('costs maintenance higher when everything is hired out', () => {
    const record = sample();
    const diy = computeForecast(record, { asOf: TODAY, maintenanceMode: 'mixed' });
    const hire = computeForecast(record, { asOf: TODAY, maintenanceMode: 'hire' });
    expect(hire.horizons.fiveYear.totalCents).toBeGreaterThan(diy.horizons.fiveYear.totalCents);
  });

  it('returns an empty forecast for a home with no equipment', () => {
    const record = sample();
    const empty: HomeRecord = { ...record, components: [], completions: [] };
    const forecast = computeForecast(empty, { asOf: TODAY });
    expect(forecast.confidence).toBe(0);
    // Whole-home maintenance still applies to a house with nothing scanned.
    expect(forecast.horizons.oneYear.items.every((i) => i.kind === 'maintenance')).toBe(true);
  });
});

describe('timeline and spend', () => {
  it('groups by year, newest first, with yearly totals', () => {
    const groups = groupEventsByYear(sample().events);
    expect(groups[0]!.year).toBe(2026);
    expect(groups[0]!.totalCents).toBe(18900 + 48700 + 17500);
    expect(groups[1]!.year).toBe(2025);
    expect(groups[1]!.totalCents).toBe(1280000 + 22000);
  });

  it('totals a calendar year', () => {
    expect(spendForYear(sample(), 2026).totalCents).toBe(85100);
    expect(spendForYear(sample(), 2025).totalCents).toBe(1302000);
    expect(spendForYear(sample(), 2020).eventCount).toBe(0);
  });

  it('breaks spend down by system', () => {
    const summary = summarizeSpend(sample());
    const roof = summary.byCategory.find((b) => b.category === 'roof');
    expect(roof?.totalCents).toBe(1280000);
    // The kitchen plumbing repair is not linked to a component.
    expect(summary.byCategory.find((b) => b.category === 'unassigned')?.totalCents).toBe(48700);
  });
});

describe('warranty', () => {
  it('picks the longest-running coverage when several apply', () => {
    const record = sample();
    const dishwasher = record.components.find((c) => c.id === 'cmp_dishwasher')!;
    const status = componentWarrantyStatus(dishwasher, TODAY);
    // The 5-year extended plan outlasts the 1-year manufacturer warranty, and both
    // have run out by 2026-11.
    expect(status.state).toBe('expiring_soon');
    expect(status.expiresOn).toBe('2026-11-06');
  });

  it('reports active coverage on the roof', () => {
    const record = sample();
    const roof = record.components.find((c) => c.id === 'cmp_roof')!;
    const status = componentWarrantyStatus(roof, TODAY);
    expect(status.state).toBe('active');
    expect(status.expiresOn).toBe('2055-04-18');
  });

  it('reports expiry rather than silence for lapsed coverage', () => {
    const record = sample();
    const heater = record.components.find((c) => c.id === 'cmp_water_heater')!;
    const status = componentWarrantyStatus(heater, TODAY);
    expect(status.state).toBe('expired');
    expect(status.summary).toMatch(/expired/i);
  });

  it('says so plainly when nothing is on record', () => {
    const record = sample();
    const dryer = record.components.find((c) => c.id === 'cmp_dryer')!;
    expect(componentWarrantyStatus(dryer, TODAY).state).toBe('unknown');
  });
});

describe('record query — the questions the product promises to answer', () => {
  const record = sample();

  it('"What size HVAC filter do I need?"', () => {
    const answer = answerFromRecord(record, 'What size HVAC filter do I need?', TODAY);
    expect(answer.answer).toContain('20x25x1');
    expect(answer.confidence).toBe('high');
    // Every air filter in the house, not just the one the phrasing matched — a home
    // with two air handlers on different sizes needs both sizes. The dishwasher's
    // cleanable cylinder filter is not something you buy, so it stays out.
    expect(answer.citations.map((c) => c.componentId).sort()).toEqual(['cmp_furnace', 'cmp_hvac']);
    expect(answer.answer).not.toMatch(/dishwasher/i);
  });

  it('answers a cleanable filter as a cleanable filter, not a size', () => {
    const answer = answerFromRecord(record, 'What size dishwasher filter do I need?', TODAY);
    expect(answer.answer).toMatch(/Removable cylinder filter/);
    expect(answer.answer).toMatch(/cleaned rather than replaced/);
  });

  it('"When was my roof replaced?"', () => {
    const answer = answerFromRecord(record, 'When was my roof replaced?', TODAY);
    expect(answer.answer).toContain('Apr 18, 2025');
    expect(answer.citations.some((c) => c.componentId === 'cmp_roof')).toBe(true);
  });

  it('"Who repaired the kitchen plumbing?"', () => {
    const answer = answerFromRecord(record, 'Who repaired the kitchen plumbing?', TODAY);
    expect(answer.answer).toContain('Tidewater Plumbing');
  });

  it('"Is my dishwasher still under warranty?"', () => {
    const answer = answerFromRecord(record, 'Is my dishwasher still under warranty?', TODAY);
    expect(answer.answer).toMatch(/Dishwasher/);
    expect(answer.answer).toMatch(/Nov 6, 2026/);
  });

  it('"How much have I spent on repairs this year?"', () => {
    const answer = answerFromRecord(record, 'How much have I spent on repairs this year?', TODAY);
    expect(answer.answer).toContain('$851');
    expect(answer.confidence).toBe('high');
  });

  it('"What maintenance am I behind on?"', () => {
    const answer = answerFromRecord(record, 'What maintenance am I behind on?', TODAY);
    expect(answer.confidence).toBe('high');
    expect(answer.answer.length).toBeGreaterThan(10);
  });

  it('"How old is my water heater?"', () => {
    const answer = answerFromRecord(record, 'How old is my water heater?', TODAY);
    expect(answer.answer).toMatch(/12\.\d years old/);
    expect(answer.confidence).toBe('high');
  });

  it('hands open-ended questions to the model instead of guessing', () => {
    const answer = answerFromRecord(record, 'Why does the house smell musty after it rains?', TODAY);
    expect(answer.needsModel).toBe(true);
  });

  it('resolves which component a question is about', () => {
    expect(resolveComponent(record, 'when was the roof done')?.id).toBe('cmp_roof');
    expect(resolveComponent(record, 'is the dishwasher covered')?.id).toBe('cmp_dishwasher');
    expect(resolveComponent(record, 'tell me about the moon')).toBeUndefined();
  });

  it('says the record is empty rather than fabricating an answer', () => {
    const empty: HomeRecord = { ...record, components: [], events: [], completions: [] };
    const answer = answerFromRecord(empty, 'What size HVAC filter do I need?', TODAY);
    expect(answer.confidence).toBe('low');
    expect(answer.answer).toMatch(/no HVAC equipment/i);
  });
});

describe('grounding context', () => {
  it('carries provenance through to the model', () => {
    const context = buildGroundingContext(sample(), { asOf: TODAY });
    expect(context).toContain('[documented]');
    expect(context).toContain('[estimated]');
    expect(context).toContain('cmp_water_heater');
    expect(context).toContain('MAINTENANCE STATUS');
    expect(context).toContain('COST PROJECTIONS');
  });

  it('describes an empty record honestly', () => {
    const record = sample();
    const empty: HomeRecord = { ...record, components: [], events: [] };
    const context = buildGroundingContext(empty, { asOf: TODAY });
    expect(context).toContain('(none recorded yet)');
    expect(context).toContain('(nothing recorded yet)');
  });
});

describe('service request packet', () => {
  it('assembles equipment, history, and warranty without the owner retyping anything', () => {
    const record = sample();
    const component = record.components.find((c) => c.id === 'cmp_water_heater')!;
    const packet = buildServiceRequestPacket({
      record,
      component,
      problem: 'No hot water since this morning. Pilot appears to be lit.',
      photoCount: 2,
    });
    expect(packet.equipment?.manufacturer).toBe('Rheem');
    expect(packet.equipment?.serialNumber).toBe('Q331410023');
    expect(packet.equipment?.ageSummary).toContain('documented');
    expect(packet.relevantHistory.some((h) => h.title === 'Water heater serviced')).toBe(true);

    const text = renderPacketText(packet, 'Water Heater Service Request');
    expect(text).toContain('Rheem');
    expect(text).toContain('SERVICE HISTORY');
    expect(text).toContain('Photos attached: 2');
  });
});

describe('transfer to a new owner', () => {
  it('drops private entries entirely rather than blanking them', () => {
    const record = sample();
    record.events.push({
      id: 'evt_private',
      homeId: record.home.id,
      date: '2026-05-01',
      type: 'repair',
      title: 'Insurance claim — storm damage',
      costCents: 500000,
      documentIds: [],
      photoIds: [],
      source: 'owner',
      visibility: 'private',
      createdAt: '2026-05-01T00:00:00.000Z',
    });

    const transferred = redactForTransfer(record);
    expect(transferred.events.some((e) => e.id === 'evt_private')).toBe(false);
    expect(transferred.serviceRequests).toHaveLength(0);
  });

  it('withholds the seller’s photograph and where their post goes', () => {
    const record = sample();
    record.home.photoUri = 'data:image/jpeg;base64,AAAA';
    record.home.mailingAddress = { line1: 'PO Box 40', city: 'Charleston', state: 'SC' };
    const transferred = redactForTransfer(record);
    // Where the seller has post sent is an office, a second home or a box —
    // attached to them, not to the building the buyer is inheriting.
    expect(transferred.home.mailingAddress).toBeUndefined();
    // The building's facts transfer; a picture somebody took of it does not —
    // it is not documented about the house, and it can hold whoever was
    // standing on the porch. The address and the record ID must survive it.
    expect(transferred.home.photoUri).toBeUndefined();
    expect(transferred.home.publicId).toBe(record.home.publicId);
    expect(transferred.home.addressLine1).toBe(record.home.addressLine1);
    // And redaction must not mutate the owner's own copy.
    expect(record.home.photoUri).toBe('data:image/jpeg;base64,AAAA');
  });

  it('withholds what the previous owner paid by default', () => {
    const transferred = redactForTransfer(sample());
    expect(transferred.events.every((e) => e.costCents === undefined)).toBe(true);
  });

  it('keeps the work itself, which is what the buyer inherits', () => {
    const transferred = redactForTransfer(sample());
    const roofWork = transferred.events.find((e) => e.id === 'evt_roof_2025');
    expect(roofWork).toBeDefined();
    expect(roofWork!.vendor).toBe('Palmetto Roofing Co.');
    expect(transferred.components.find((c) => c.id === 'cmp_roof')?.warranties).toHaveLength(2);
  });

  it('strips the owner’s private notes from equipment', () => {
    const transferred = redactForTransfer(sample());
    expect(transferred.components.every((c) => c.notes === undefined)).toBe(true);
  });

  it('includes costs only when the owner opts in', () => {
    const transferred = redactForTransfer(sample(), { includeCosts: true });
    expect(transferred.events.find((e) => e.id === 'evt_roof_2025')?.costCents).toBe(1280000);
  });

  it('builds an owner report with costs and a transfer report without', () => {
    const owner = buildHomeRecordReport(sample(), { asOf: TODAY });
    expect(owner.documentedInvestmentCents).toBeGreaterThan(0);
    expect(owner.transferable).toBe(false);

    const buyer = buildHomeRecordReport(sample(), { forTransfer: true, asOf: TODAY });
    expect(buyer.documentedInvestmentCents).toBeUndefined();
    expect(buyer.sections.some((s) => s.heading === 'What is not included')).toBe(true);
    const joined = buyer.sections.flatMap((s) => s.lines).join('\n');
    expect(joined).not.toContain('$12,800');
  });

  it('marks estimated ages as estimated in the buyer-facing document', () => {
    const buyer = buildHomeRecordReport(sample(), { forTransfer: true, asOf: TODAY });
    const equipment = buyer.sections.find((s) => s.heading === 'Systems and equipment')!;
    expect(equipment.lines.some((l) => l.includes('estimated'))).toBe(true);
    expect(equipment.lines.some((l) => l.includes('documented'))).toBe(true);
  });
});

describe('end-to-end: logging work reshapes everything downstream', () => {
  it('moves a due date, clears the overdue penalty, and lifts the score', () => {
    const record = sample();
    const asOf = '2027-06-01';

    const before = generateTasks(record, { asOf });
    const beforeFlush = before.find((t) => t.templateId === 'water_heater.flush')!;
    expect(beforeFlush.urgency).toBe('overdue');
    const beforeHealth = computeHomeHealth(record, { asOf });
    const beforeHeater = beforeHealth.components.find((c) => c.componentId === 'cmp_water_heater')!;
    expect(beforeHeater.overdueTaskCount).toBeGreaterThan(0);

    record.completions.push({
      id: 'cpl_new',
      homeId: record.home.id,
      templateId: 'water_heater.flush',
      componentId: 'cmp_water_heater',
      completedOn: '2027-05-20',
      performedBy: 'diy',
    });

    const after = generateTasks(record, { asOf });
    const afterFlush = after.find((t) => t.templateId === 'water_heater.flush')!;
    expect(afterFlush.dueDate).toBe('2028-05-20');
    expect(afterFlush.urgency).toBe('scheduled');
    expect(overdueTasks(after).length).toBeLessThan(overdueTasks(before).length);

    // The component that was neglected recovers. The whole-home score moves only
    // slightly, and that is correct: one flush on a 13-year-old tank is real but
    // small, and a score that jumped on it would not be worth trusting.
    const afterHealth = computeHomeHealth(record, { asOf });
    const afterHeater = afterHealth.components.find((c) => c.componentId === 'cmp_water_heater')!;
    expect(afterHeater.overdueTaskCount).toBe(0);
    expect(afterHeater.score).toBeGreaterThan(beforeHeater.score);
    expect(afterHealth.score).toBeGreaterThanOrEqual(beforeHealth.score);
  });
});
