import type { PropertyType } from '../account';
import { today } from '../dates';
import type { ComponentCategory, HomeRecord, ISODate } from '../types';

/**
 * How much of this house Dwella actually knows.
 *
 * Deliberately not Home Health. Health is an estimate of the building's
 * condition; this is an estimate of our own knowledge, and the two move for
 * completely different reasons. Photographing a water heater does not improve
 * the water heater — it improves the record. Attaching "add three more systems"
 * to a condition score would make the condition score dishonest, because the
 * only way to raise it would be to tell us things, and a house does not get
 * healthier by being described.
 *
 * So the gamification lives here, where earning the number up genuinely means
 * what it says: the record got more complete.
 *
 * The corollary matters too. Home Health *can* move when a fact arrives — a
 * documented 2006 install date replacing a guess is new evidence about the
 * building, and an estimate that ignored evidence would be worse. What it must
 * never do is present that as the owner having improved anything.
 */

/** What a complete record covers, weighted by how much of the house it represents. */
const SYSTEM_WEIGHT: Partial<Record<ComponentCategory, number>> = {
  hvac: 3,
  roof: 3,
  electrical: 3,
  plumbing: 2.5,
  water_heater: 2,
  safety: 2,
  windows: 1.5,
  exterior: 1.5,
  appliance: 1,
};

/**
 * Which systems it is fair to expect on record for this kind of property.
 *
 * A condo owner is not responsible for the roof and should not be told their
 * record is incomplete because it is missing one. Asking for something the
 * owner cannot answer teaches them to ignore the prompt.
 */
const EXPECTED_BY_TYPE: Record<PropertyType, ComponentCategory[]> = {
  primary: ['hvac', 'water_heater', 'electrical', 'roof', 'plumbing', 'safety'],
  secondary: ['hvac', 'water_heater', 'electrical', 'roof', 'plumbing', 'safety'],
  rental: ['hvac', 'water_heater', 'electrical', 'roof', 'plumbing', 'safety'],
  condo: ['hvac', 'water_heater', 'electrical', 'plumbing', 'safety'],
  renovation: ['hvac', 'water_heater', 'electrical', 'roof', 'plumbing', 'safety'],
};

/**
 * What we want to know about a piece of equipment, and what each fact is worth.
 *
 * The install date dominates on purpose: it is the fact every forecast, warranty
 * window and lifespan estimate is built on. A serial number is nice; a date is
 * the difference between a projection and a guess.
 */
const FACT_WEIGHT = {
  installDate: 0.45,
  model: 0.2,
  manufacturer: 0.15,
  serial: 0.1,
  evidence: 0.1,
} as const;

/** Property-level facts, worth a fixed slice of the whole. */
const PROPERTY_FACT_WEIGHT = 2;

export type RecordGapKind =
  | 'missing_system'
  | 'unknown_age'
  | 'thin_identification'
  | 'property_detail';

export interface RecordGap {
  id: string;
  kind: RecordGapKind;
  /** What to add, in the owner's words. */
  label: string;
  detail: string;
  /** How much of the percentage closing this gap would recover. */
  worth: number;
  componentId?: string;
  category?: ComponentCategory;
}

export interface RecordConfidence {
  /** 0–100, rounded. The number shown as "Dwella knows N% of your home". */
  percent: number;
  known: number;
  total: number;
  /** Ordered by what would move the number most. */
  gaps: RecordGap[];
  missingSystemCount: number;
  headline: string;
  /** The single next action, or undefined when the record is as complete as it gets. */
  nextStep?: string;
  generatedOn: ISODate;
}

function hasEvidence(record: HomeRecord, componentId: string): boolean {
  const component = record.components.find((c) => c.id === componentId);
  if (component && (component.photos.length > 0 || component.documentIds.length > 0)) return true;
  return record.events.some(
    (e) => e.componentId === componentId && (e.documentIds.length > 0 || e.photoIds.length > 0),
  );
}

/**
 * Scores the record against what a complete one would contain.
 *
 * Every gap it reports is something the owner can actually do, which is the
 * test for whether a completeness metric is useful or merely judgemental.
 */
export function computeRecordConfidence(
  record: HomeRecord,
  options: { asOf?: ISODate } = {},
): RecordConfidence {
  const asOf = options.asOf ?? today();
  const gaps: RecordGap[] = [];
  let known = 0;
  let total = 0;

  const live = record.components.filter((c) => !c.retiredOn);

  /* --- The systems we would expect to see at all --------------------- */
  const expected = EXPECTED_BY_TYPE[record.home.propertyType] ?? EXPECTED_BY_TYPE.primary;
  const present = new Set(live.map((c) => c.category));
  for (const category of expected) {
    const weight = SYSTEM_WEIGHT[category] ?? 1;
    total += weight;
    if (present.has(category)) {
      known += weight;
    } else {
      gaps.push({
        id: `missing:${category}`,
        kind: 'missing_system',
        label: CATEGORY_NOUN[category] ?? category,
        detail: 'Not on record yet',
        worth: weight,
        category,
      });
    }
  }

  /* --- How well we know each thing that is on record ----------------- */
  for (const component of live) {
    const weight = SYSTEM_WEIGHT[component.category] ?? 1;
    total += weight;

    // A documented date is worth full marks; a manufacture year or an estimate
    // is real but weaker evidence, and the number should say so.
    const dated = Boolean(component.installedOn) || Boolean(component.manufacturedYear);
    const age = !dated
      ? 0
      : component.ageProvenance === 'documented' || component.ageProvenance === 'contractor'
        ? 1
        : 0.5;

    let fraction = age * FACT_WEIGHT.installDate;
    if (component.modelNumber) fraction += FACT_WEIGHT.model;
    if (component.manufacturer) fraction += FACT_WEIGHT.manufacturer;
    if (component.serialNumber) fraction += FACT_WEIGHT.serial;
    if (hasEvidence(record, component.id)) fraction += FACT_WEIGHT.evidence;

    known += weight * fraction;

    // One gap per component, naming the most valuable missing fact rather than
    // listing every blank — a checklist of five blanks per item reads as nagging
    // and gets dismissed wholesale.
    if (age === 0) {
      gaps.push({
        id: `age:${component.id}`,
        kind: 'unknown_age',
        label: component.name,
        detail: 'Install date not known',
        worth: weight * FACT_WEIGHT.installDate,
        componentId: component.id,
        category: component.category,
      });
    } else if (!component.modelNumber && !component.serialNumber) {
      gaps.push({
        id: `ident:${component.id}`,
        kind: 'thin_identification',
        label: component.name,
        detail: 'No model or serial on record',
        worth: weight * (FACT_WEIGHT.model + FACT_WEIGHT.serial),
        componentId: component.id,
        category: component.category,
      });
    }
  }

  /* --- The property itself -------------------------------------------- */
  total += PROPERTY_FACT_WEIGHT;
  const propertyFacts = [
    Boolean(record.home.yearBuilt),
    Boolean(record.home.squareFeet),
    Boolean(record.home.addressLine1),
  ];
  known += PROPERTY_FACT_WEIGHT * (propertyFacts.filter(Boolean).length / propertyFacts.length);
  if (!record.home.yearBuilt) {
    gaps.push({
      id: 'property:yearBuilt',
      kind: 'property_detail',
      label: 'Year built',
      detail: 'Sets the baseline age for anything undated',
      worth: PROPERTY_FACT_WEIGHT / propertyFacts.length,
    });
  }

  const percent = total > 0 ? Math.round((known / total) * 100) : 0;
  gaps.sort((a, b) => b.worth - a.worth);
  const missingSystemCount = gaps.filter((g) => g.kind === 'missing_system').length;

  return {
    percent,
    known: Math.round(known * 100) / 100,
    total,
    gaps,
    missingSystemCount,
    headline: `Dwella knows ${percent}% of your home`,
    nextStep: nextStepFor(gaps, missingSystemCount),
    generatedOn: asOf,
  };
}

function nextStepFor(gaps: RecordGap[], missingSystemCount: number): string | undefined {
  if (gaps.length === 0) return undefined;
  if (missingSystemCount > 0) {
    return `Add ${missingSystemCount} missing ${
      missingSystemCount === 1 ? 'system' : 'systems'
    } to improve your Home Record.`;
  }
  const undated = gaps.filter((g) => g.kind === 'unknown_age').length;
  if (undated > 0) {
    return `Add an install date to ${undated} ${undated === 1 ? 'item' : 'items'} to improve your Home Record.`;
  }
  return `Fill in ${gaps.length} ${gaps.length === 1 ? 'detail' : 'details'} to improve your Home Record.`;
}

const CATEGORY_NOUN: Partial<Record<ComponentCategory, string>> = {
  hvac: 'Heating and cooling',
  water_heater: 'Water heater',
  electrical: 'Electrical panel',
  roof: 'Roof',
  plumbing: 'Plumbing',
  safety: 'Smoke and CO alarms',
  windows: 'Windows',
  exterior: 'Exterior',
  appliance: 'Appliances',
};
