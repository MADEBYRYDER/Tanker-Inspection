import { materialWarning } from '../catalog/lifespans';
import { daysBetween, today } from '../dates';
import type {
  ComponentCategory,
  ComponentHealth,
  HealthReason,
  HealthStatus,
  HomeHealth,
  HomeRecord,
  ISODate,
  ScheduledTask,
} from '../types';
import { resolveComponentAge } from './age';
import { generateTasks } from './schedule';

/**
 * How much each system moves the overall number.
 *
 * These are judgement calls about consequence, not about cost. A failed roof or
 * panel puts the house and the people in it at risk; a failed microwave is an
 * inconvenience. Weighting purely by replacement price would rank a $12,000 roof
 * and a $12,000 window job identically, which is not how anyone actually thinks
 * about the health of a house.
 */
const CATEGORY_WEIGHT: Record<ComponentCategory, number> = {
  structure: 3,
  roof: 3,
  electrical: 3,
  hvac: 3,
  plumbing: 2.5,
  water_heater: 2,
  safety: 2,
  windows: 1.5,
  exterior: 1.5,
  appliance: 1,
  flooring: 1,
  other: 1,
};

const OVERDUE_PENALTY: Record<ScheduledTask['criticality'], number> = {
  safety: 7,
  high: 5,
  medium: 3,
  low: 1,
};

const MAX_OVERDUE_PENALTY = 20;
const RECENT_SERVICE_WINDOW_DAYS = 550; // ~18 months
const RECENT_SERVICE_BONUS = 4;
/** Score assigned when age is unknown: deliberately mid-scale, never reassuring. */
const UNKNOWN_AGE_SCORE = 60;

/** Maps how much of the expected life has been used to a 0–100 condition score. */
export function scoreFromLifeUsed(lifeUsed: number): number {
  if (lifeUsed <= 0.5) return 100 - lifeUsed * 20; // 100 → 90
  if (lifeUsed <= 0.8) return 90 - ((lifeUsed - 0.5) / 0.3) * 20; // 90 → 70
  if (lifeUsed <= 1.0) return 70 - ((lifeUsed - 0.8) / 0.2) * 25; // 70 → 45
  return Math.max(20, 45 - (lifeUsed - 1) * 50); // past expected life, floors at 20
}

function statusFor(score: number, ageKnown: boolean): HealthStatus {
  if (!ageKnown) return 'unknown';
  if (score >= 80) return 'good';
  if (score >= 65) return 'monitor';
  if (score >= 45) return 'aging';
  return 'plan_replacement';
}

export const STATUS_LABEL: Record<HealthStatus, string> = {
  good: 'Good',
  monitor: 'Monitor',
  aging: 'Aging',
  plan_replacement: 'Replacement planning recommended',
  unknown: 'Not enough information',
};

export interface HealthOptions {
  asOf?: ISODate;
  /** Pass a precomputed schedule to avoid regenerating it. */
  tasks?: ScheduledTask[];
}

/**
 * Scores the condition of the house.
 *
 * Every reason returned is tagged `fact` or `estimate`, and the UI renders those
 * differently. A component sitting at "Replacement planning recommended" because
 * of a documented 2009 install date is a very different claim from one sitting
 * there because the app guessed from the age of the house, and the product's whole
 * credibility rests on not blurring the two.
 */
export function computeHomeHealth(record: HomeRecord, options: HealthOptions = {}): HomeHealth {
  const asOf = options.asOf ?? today();
  const tasks = options.tasks ?? generateTasks(record, { asOf });
  const active = record.components.filter((c) => !c.retiredOn);

  const components: ComponentHealth[] = active.map((component) => {
    const age = resolveComponentAge(component, record.home, asOf);
    const reasons: HealthReason[] = [];
    const ageKnown = age.years !== undefined && age.lifeUsedFraction !== undefined;

    let score = ageKnown ? scoreFromLifeUsed(age.lifeUsedFraction!) : UNKNOWN_AGE_SCORE;

    if (ageKnown) {
      const documented = age.provenance === 'documented' || age.provenance === 'contractor';
      reasons.push({
        text: `About ${age.years} years old against a typical ${age.expectedLifeYears}-year service life. ${age.basis}`,
        basis: documented ? 'fact' : 'estimate',
      });
      if (age.lifeUsedFraction! > 1) {
        reasons.push({
          text: 'Past the typical service life for this type of equipment. It may well still be working — this is a planning signal, not a diagnosis.',
          basis: 'estimate',
        });
      }
    } else {
      reasons.push({ text: age.basis, basis: 'estimate' });
    }

    // Overdue maintenance is a fact about this home, so it outranks lifespan tables.
    const componentOverdue = tasks.filter(
      (t) => t.componentId === component.id && t.urgency === 'overdue',
    );
    let penalty = 0;
    for (const task of componentOverdue) penalty += OVERDUE_PENALTY[task.criticality];
    penalty = Math.min(penalty, MAX_OVERDUE_PENALTY);
    if (penalty > 0) {
      score -= penalty;
      reasons.push({
        text: `${componentOverdue.length} overdue maintenance ${
          componentOverdue.length === 1 ? 'task' : 'tasks'
        }: ${componentOverdue.map((t) => t.title).join(', ')}.`,
        basis: 'fact',
      });
    }

    // Documented recent service is real evidence and earns a modest lift.
    const recentService = record.events.find(
      (e) =>
        e.componentId === component.id &&
        (e.type === 'service' || e.type === 'repair') &&
        daysBetween(e.date, asOf) >= 0 &&
        daysBetween(e.date, asOf) <= RECENT_SERVICE_WINDOW_DAYS,
    );
    if (recentService) {
      score += RECENT_SERVICE_BONUS;
      reasons.push({
        text: `Serviced ${recentService.date}${recentService.vendor ? ` by ${recentService.vendor}` : ''}, on record.`,
        basis: 'fact',
      });
    }

    // Known-defective materials override the arithmetic entirely.
    const warning = age.entry
      ? materialWarning(age.entry, `${component.type} ${component.name} ${component.manufacturer ?? ''}`)
      : undefined;
    if (warning) {
      score = Math.min(score, 40);
      reasons.push({ text: warning, basis: 'fact' });
    }

    if (component.identificationConfidence < 0.6) {
      reasons.push({
        text: 'Identification is low confidence — confirming the model and install date will sharpen this.',
        basis: 'estimate',
      });
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    return {
      componentId: component.id,
      name: component.name,
      category: component.category,
      status: statusFor(score, ageKnown),
      score,
      weight: CATEGORY_WEIGHT[component.category],
      ageYears: age.years,
      expectedLifeYears: age.expectedLifeYears,
      lifeUsedFraction: age.lifeUsedFraction,
      ageProvenance: age.provenance,
      reasons,
      overdueTaskCount: componentOverdue.length,
    };
  });

  // Whole-home overdue work (detectors, shutoff valve, GFCIs) belongs to no single
  // component, so it is applied to the overall score rather than being lost.
  const homeLevelOverdue = tasks.filter((t) => !t.componentId && t.urgency === 'overdue');
  const homePenalty = Math.min(
    MAX_OVERDUE_PENALTY,
    homeLevelOverdue.reduce((sum, t) => sum + OVERDUE_PENALTY[t.criticality], 0),
  );

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weighted = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  const base = totalWeight > 0 ? weighted / totalWeight : UNKNOWN_AGE_SCORE;
  const score = Math.max(0, Math.min(100, Math.round(base - homePenalty)));

  const documentedWeight = components
    .filter((c) => c.ageProvenance === 'documented' || c.ageProvenance === 'contractor')
    .reduce((sum, c) => sum + c.weight, 0);
  const dataConfidence = totalWeight > 0 ? Math.round((documentedWeight / totalWeight) * 100) / 100 : 0;

  return {
    score,
    dataConfidence,
    components: components.sort((a, b) => a.score - b.score || b.weight - a.weight),
    unknownComponentIds: components.filter((c) => c.status === 'unknown').map((c) => c.componentId),
    summary: buildSummary(score, components, dataConfidence, homeLevelOverdue.length),
    generatedOn: asOf,
  };
}

function buildSummary(
  score: number,
  components: ComponentHealth[],
  dataConfidence: number,
  homeOverdueCount: number,
): string {
  if (components.length === 0) {
    return 'No equipment on record yet. Scan your home to get a health score.';
  }
  const attention = components.filter(
    (c) => c.status === 'plan_replacement' || c.status === 'aging',
  );
  const headline =
    score >= 85
      ? 'This home is in good shape.'
      : score >= 70
        ? 'This home is in reasonable shape with a few things worth planning for.'
        : score >= 50
          ? 'Several systems are near the end of their expected life.'
          : 'Multiple major systems need a replacement plan.';

  const parts = [headline];
  if (attention.length > 0) {
    const names = attention.slice(0, 3).map((c) => c.name).join(', ');
    parts.push(`Watch: ${names}${attention.length > 3 ? `, and ${attention.length - 3} more` : ''}.`);
  }
  if (homeOverdueCount > 0) {
    parts.push(
      `${homeOverdueCount} whole-home ${homeOverdueCount === 1 ? 'task is' : 'tasks are'} overdue.`,
    );
  }
  /*
   * A caveat on how the score was reached, not a request for more data.
   *
   * "Adding install dates will make this more accurate" used to live here, and
   * it was the wrong place for it: it implied the owner could raise the health
   * of the building by typing, when what they would actually be raising is our
   * confidence in the estimate. That prompt now belongs to Record Confidence,
   * which is the number it is honestly about.
   */
  const pct = Math.round(dataConfidence * 100);
  parts.push(
    pct >= 70
      ? `${pct}% of this rests on documented dates.`
      : `${pct}% of this rests on documented dates; the rest is estimated from typical service life.`,
  );
  return parts.join(' ');
}

export { CATEGORY_WEIGHT };
