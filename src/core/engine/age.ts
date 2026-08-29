import { expectedLifeYears, findLifespan, type LifespanEntry } from '../catalog/lifespans';
import { today, yearsBetween } from '../dates';
import type { Home, HomeComponent, ISODate, Provenance } from '../types';

export interface ResolvedAge {
  /** Age in years. Undefined when nothing supports even an estimate. */
  years?: number;
  provenance: Provenance;
  /** One line explaining where the number came from, shown verbatim in the UI. */
  basis: string;
  expectedLifeYears?: number;
  /** Age ÷ expected life. Undefined when either side is unknown. */
  lifeUsedFraction?: number;
  entry?: LifespanEntry;
}

/**
 * Works out how old a component is, and — just as importantly — how much that
 * answer should be trusted.
 *
 * The order matters. A documented install date beats a decoded manufacture year,
 * which beats an inference from the age of the house. The last of those is weak
 * enough that it is deliberately pulled toward mid-life rather than assuming the
 * equipment is original: in a 60-year-old house the water heater is certainly not
 * 60 years old, and pretending otherwise would put a false emergency on the
 * dashboard.
 */
export function resolveComponentAge(
  component: HomeComponent,
  home: Home,
  asOf: ISODate = today(),
): ResolvedAge {
  const entry = findLifespan(component.category, `${component.type} ${component.name}`);
  const expected = entry ? expectedLifeYears(entry, home) : undefined;

  const finish = (years: number | undefined, provenance: Provenance, basis: string): ResolvedAge => ({
    years: years === undefined ? undefined : Math.round(years * 10) / 10,
    provenance,
    basis,
    expectedLifeYears: expected,
    lifeUsedFraction:
      years !== undefined && expected !== undefined && expected > 0 ? years / expected : undefined,
    entry,
  });

  if (component.installedOn) {
    const years = yearsBetween(component.installedOn, asOf);
    return finish(years, 'documented', `Installed ${component.installedOn}, per the home record.`);
  }

  if (component.manufacturedYear) {
    const years = Number(asOf.slice(0, 4)) - component.manufacturedYear;
    const provenance: Provenance =
      component.ageProvenance === 'documented' || component.ageProvenance === 'contractor'
        ? component.ageProvenance
        : 'estimated';
    return finish(
      years,
      provenance,
      `Built in ${component.manufacturedYear} — read from the nameplate or serial number. The install date may be later.`,
    );
  }

  if (home.yearBuilt) {
    const homeAge = Number(asOf.slice(0, 4)) - home.yearBuilt;
    if (homeAge >= 0) {
      // Long-lived items that are normally original to the house can be tied to it.
      const originalToHouse =
        component.category === 'structure' ||
        component.category === 'electrical' ||
        component.category === 'plumbing';
      if (originalToHouse && expected !== undefined && homeAge <= expected) {
        return finish(
          homeAge,
          'estimated',
          `No date on record. Estimated from the home's ${home.yearBuilt} build year, since this is usually original to the house.`,
        );
      }
      // Everything else: if the house has outlived the equipment's typical life,
      // it has almost certainly been replaced at least once. Assume mid-life.
      const guess = expected !== undefined ? Math.min(homeAge, expected * 0.6) : homeAge;
      return finish(
        guess,
        'estimated',
        `No date on record. This is a rough mid-life placeholder — scan the nameplate or add the install date to replace it with a real number.`,
      );
    }
  }

  return finish(
    undefined,
    'unknown',
    'Age unknown. Add an install date or photograph the nameplate to fill this in.',
  );
}
