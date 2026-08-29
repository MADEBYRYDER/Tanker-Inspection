import { addYears, compareDates, daysBetween, formatDate, today } from '../dates';
import type { HomeComponent, ISODate, Warranty } from '../types';

export interface WarrantyStatus {
  state: 'active' | 'expiring_soon' | 'expired' | 'unknown';
  expiresOn?: ISODate;
  daysRemaining?: number;
  warranty?: Warranty;
  /** One sentence the assistant and the UI both use verbatim. */
  summary: string;
}

const EXPIRING_SOON_DAYS = 90;

/** Resolves an expiry date from whichever fields the warranty actually has. */
export function warrantyExpiry(warranty: Warranty, component?: HomeComponent): ISODate | undefined {
  if (warranty.expiresOn) return warranty.expiresOn;
  const start = warranty.startDate ?? component?.installedOn;
  if (start && warranty.termYears) return addYears(start, warranty.termYears);
  return undefined;
}

/**
 * The answer to "is my dishwasher still under warranty?".
 *
 * When several warranties cover one component (manufacturer plus an extended plan),
 * the one that runs longest wins, because that is the one that still helps.
 */
export function componentWarrantyStatus(
  component: HomeComponent,
  asOf: ISODate = today(),
): WarrantyStatus {
  if (component.warranties.length === 0) {
    return {
      state: 'unknown',
      summary: `No warranty on record for ${component.name}. If you have the paperwork, photograph it and it will be filed here.`,
    };
  }

  let best: { warranty: Warranty; expiresOn: ISODate } | undefined;
  let undatedCount = 0;
  for (const warranty of component.warranties) {
    const expiresOn = warrantyExpiry(warranty, component);
    if (!expiresOn) {
      undatedCount += 1;
      continue;
    }
    if (!best || compareDates(expiresOn, best.expiresOn) > 0) best = { warranty, expiresOn };
  }

  if (!best) {
    return {
      state: 'unknown',
      warranty: component.warranties[0],
      summary: `${component.name} has ${undatedCount} warranty ${
        undatedCount === 1 ? 'record' : 'records'
      } on file, but no start or expiry date, so coverage can't be confirmed.`,
    };
  }

  const daysRemaining = daysBetween(asOf, best.expiresOn);
  const derived = !best.warranty.expiresOn;
  const caveat = derived
    ? ' (calculated from the install date and the stated term — check the paperwork before relying on it)'
    : '';

  if (daysRemaining < 0) {
    return {
      state: 'expired',
      expiresOn: best.expiresOn,
      daysRemaining,
      warranty: best.warranty,
      summary: `${component.name}: the ${best.warranty.provider} ${best.warranty.kind.replace('_', ' ')} warranty expired ${formatDate(best.expiresOn)}${caveat}.`,
    };
  }
  if (daysRemaining <= EXPIRING_SOON_DAYS) {
    return {
      state: 'expiring_soon',
      expiresOn: best.expiresOn,
      daysRemaining,
      warranty: best.warranty,
      summary: `${component.name}: still covered, but the ${best.warranty.provider} warranty runs out ${formatDate(best.expiresOn)} — ${daysRemaining} days${caveat}. Worth using it now if something is off.`,
    };
  }
  return {
    state: 'active',
    expiresOn: best.expiresOn,
    daysRemaining,
    warranty: best.warranty,
    summary: `${component.name}: covered by the ${best.warranty.provider} ${best.warranty.kind.replace('_', ' ')} warranty until ${formatDate(best.expiresOn)}${caveat}.`,
  };
}

export function activeWarranties(
  components: HomeComponent[],
  asOf: ISODate = today(),
): { component: HomeComponent; status: WarrantyStatus }[] {
  return components
    .map((component) => ({ component, status: componentWarrantyStatus(component, asOf) }))
    .filter((r) => r.status.state === 'active' || r.status.state === 'expiring_soon')
    .sort((a, b) => (a.status.daysRemaining ?? 0) - (b.status.daysRemaining ?? 0));
}
