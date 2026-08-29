import { MAINTENANCE_TEMPLATES, diyMaterialsCostCents, hireCostMidpoint } from '../catalog/maintenance';
import { replacementCostMidpoint } from '../catalog/lifespans';
import { today, yearOf } from '../dates';
import type {
  Cents,
  FinancialForecast,
  ForecastHorizon,
  ForecastLineItem,
  HomeComponent,
  HomeRecord,
  ISODate,
  MaintenanceTemplate,
} from '../types';
import { resolveComponentAge } from './age';
import { componentsForTemplate } from './schedule';

/**
 * Failure timing model.
 *
 * Equipment does not all fail on the day the lifespan table says it will. Treating
 * the replacement year as a point estimate produces a forecast that swings wildly
 * from one year to the next — $0, then suddenly $9,000 — which is exactly the
 * planning failure this feature exists to prevent.
 *
 * So replacement is modelled as a distribution over the fraction of expected life
 * consumed: a triangular distribution from 0.75 to 1.40 of the rated life, peaking
 * at 1.00. The forecast then asks a conditional question — given this unit has
 * already survived to where it is now, what is the chance it needs replacing inside
 * the horizon — and charges the cost in proportion to that probability. The result
 * moves smoothly as equipment ages, which is what makes a monthly reserve figure
 * meaningful.
 */
const FAILURE_MIN = 0.75;
const FAILURE_MODE = 1.0;
const FAILURE_MAX = 1.4;

/** Triangular CDF over [FAILURE_MIN, FAILURE_MAX] with the peak at FAILURE_MODE. */
export function failureCdf(x: number): number {
  const a = FAILURE_MIN;
  const b = FAILURE_MAX;
  const c = FAILURE_MODE;
  if (x <= a) return 0;
  if (x >= b) return 1;
  if (x <= c) return ((x - a) * (x - a)) / ((b - a) * (c - a));
  return 1 - ((b - x) * (b - x)) / ((b - a) * (b - c));
}

/**
 * Probability that a component at `lifeUsed` of its rated life needs replacing
 * within `horizonYears`, conditional on it having survived this far.
 */
export function replacementProbability(
  lifeUsed: number,
  expectedLifeYears: number,
  horizonYears: number,
): number {
  if (expectedLifeYears <= 0) return 0;
  if (lifeUsed >= FAILURE_MAX) return 1; // past every reasonable expectation
  const survived = 1 - failureCdf(lifeUsed);
  if (survived <= 1e-6) return 1;
  const end = lifeUsed + horizonYears / expectedLifeYears;
  const p = (failureCdf(end) - failureCdf(lifeUsed)) / survived;
  return Math.max(0, Math.min(1, p));
}

export interface ForecastOptions {
  asOf?: ISODate;
  /**
   * How recurring maintenance is priced.
   * - `hire`: contractor rates for everything.
   * - `diy`: materials only, except for jobs the catalog marks pro-only.
   * - `mixed` (default): DIY where the catalog says a homeowner can safely do it,
   *   contractor rates where it says they should not.
   */
  maintenanceMode?: 'hire' | 'diy' | 'mixed';
}

function maintenanceAnnualCost(
  template: MaintenanceTemplate,
  mode: NonNullable<ForecastOptions['maintenanceMode']>,
): Cents {
  const perOccurrence =
    mode === 'hire'
      ? hireCostMidpoint(template)
      : template.diy.proOnlyReason
        ? hireCostMidpoint(template) // no safe DIY path, so it is a contractor cost either way
        : mode === 'diy'
          ? diyMaterialsCostCents(template)
          : diyMaterialsCostCents(template);
  const perYear = 12 / template.intervalMonths;
  return Math.round(perOccurrence * perYear);
}

/**
 * Templates that actually apply to this home.
 *
 * Counts come from the same matcher the scheduler uses, so the recurring cost in the
 * forecast is exactly the cost of the tasks on the calendar. Computing them
 * independently is how a forecast quietly stops agreeing with the app it is in.
 */
function activeMaintenance(record: HomeRecord): { template: MaintenanceTemplate; count: number }[] {
  const out: { template: MaintenanceTemplate; count: number }[] = [];
  for (const template of MAINTENANCE_TEMPLATES) {
    if (template.wholeHome) {
      out.push({ template, count: 1 });
      continue;
    }
    const count = componentsForTemplate(record.components, template).length;
    if (count > 0) out.push({ template, count });
  }
  return out;
}

function replacementItem(
  component: HomeComponent,
  record: HomeRecord,
  asOf: ISODate,
  horizonYears: number,
): ForecastLineItem | undefined {
  const age = resolveComponentAge(component, record.home, asOf);
  if (!age.entry || age.lifeUsedFraction === undefined || age.expectedLifeYears === undefined) {
    return undefined;
  }
  const probability = replacementProbability(
    age.lifeUsedFraction,
    age.expectedLifeYears,
    horizonYears,
  );
  if (probability <= 0.005) return undefined;

  const fullCostCents = replacementCostMidpoint(age.entry, record.home);
  const remainingYears = Math.max(0, age.expectedLifeYears - (age.years ?? 0));
  const documented = age.provenance === 'documented' || age.provenance === 'contractor';

  return {
    kind: 'replacement',
    componentId: component.id,
    label: `${component.name} replacement`,
    expectedCents: Math.round(fullCostCents * probability),
    fullCostCents,
    probability,
    likelyYear: yearOf(asOf) + Math.round(remainingYears),
    basis: documented ? 'fact' : 'estimate',
    note: documented
      ? `${Math.round(probability * 100)}% chance inside ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}, based on a documented age of ${age.years} years against a ${age.expectedLifeYears}-year typical life.`
      : `${Math.round(probability * 100)}% chance inside ${horizonYears} ${horizonYears === 1 ? 'year' : 'years'}. Age is estimated, so treat this as a planning range rather than a prediction.`,
  };
}

function buildHorizon(
  record: HomeRecord,
  asOf: ISODate,
  years: number,
  mode: NonNullable<ForecastOptions['maintenanceMode']>,
): ForecastHorizon {
  const items: ForecastLineItem[] = [];

  for (const component of record.components) {
    if (component.retiredOn) continue;
    const item = replacementItem(component, record, asOf, years);
    if (item) items.push(item);
  }

  const annualMaintenance = activeMaintenance(record).reduce(
    (sum, { template, count }) => sum + maintenanceAnnualCost(template, mode) * count,
    0,
  );
  if (annualMaintenance > 0) {
    items.push({
      kind: 'maintenance',
      label: 'Routine maintenance',
      expectedCents: Math.round(annualMaintenance * years),
      fullCostCents: Math.round(annualMaintenance * years),
      probability: 1,
      basis: 'estimate',
      note:
        mode === 'hire'
          ? 'Every recurring task on your calendar, priced at contractor rates.'
          : 'Recurring tasks priced as DIY where that is safe, and at contractor rates where the job needs a licensed trade.',
    });
  }

  items.sort((a, b) => b.expectedCents - a.expectedCents);

  return {
    years,
    totalCents: items.reduce((sum, i) => sum + i.expectedCents, 0),
    items,
  };
}

/** Rounds a monthly reserve to the nearest $10, which is how people actually budget. */
function roundReserve(cents: Cents): Cents {
  return Math.round(cents / 1000) * 1000;
}

/**
 * Projects likely home spending over one, three, and five years, and turns the
 * five-year figure into a monthly set-aside.
 *
 * The reserve is deliberately derived from the five-year number rather than the
 * one-year number: the point is to have the money already there when a water
 * heater goes, not to discover the gap in the month it happens.
 */
export function computeForecast(record: HomeRecord, options: ForecastOptions = {}): FinancialForecast {
  const asOf = options.asOf ?? today();
  const mode = options.maintenanceMode ?? 'mixed';

  const oneYear = buildHorizon(record, asOf, 1, mode);
  const threeYear = buildHorizon(record, asOf, 3, mode);
  const fiveYear = buildHorizon(record, asOf, 5, mode);

  const documented = record.components.filter((c) => {
    if (c.retiredOn) return false;
    const age = resolveComponentAge(c, record.home, asOf);
    return age.provenance === 'documented' || age.provenance === 'contractor';
  }).length;
  const active = record.components.filter((c) => !c.retiredOn).length;

  return {
    horizons: { oneYear, threeYear, fiveYear },
    suggestedMonthlyReserveCents: roundReserve(fiveYear.totalCents / 60),
    confidence: active > 0 ? Math.round((documented / active) * 100) / 100 : 0,
    generatedOn: asOf,
  };
}

/** The single largest projected expense — what the dashboard leads with. */
export function biggestUpcomingExpense(forecast: FinancialForecast): ForecastLineItem | undefined {
  return forecast.horizons.fiveYear.items.find((i) => i.kind === 'replacement');
}
