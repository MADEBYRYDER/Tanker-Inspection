import { formatDate, today, yearsBetween } from '../dates';
import type { HomeComponent, HomeRecord, ISODate, ScheduledTask } from '../types';
import { resolveComponentAge } from './age';
import { mostRecentEvent } from './timeline';
import { componentWarrantyStatus } from './warranty';

/**
 * DIY guidance narrowed to the specific item in this house.
 *
 * The catalog's steps are correct for the job in general. What they cannot know
 * is that *this* furnace takes a 16×25×1 filter, that it was last serviced 94
 * days ago, that it is nineteen years old, or that touching it yourself would
 * void a warranty with four months left on it. That is the difference between a
 * printed manual and knowing your own house, and it is what Dwella+ adds here.
 *
 * One rule governs what may appear in this list: **nothing safety-critical.**
 * `proOnlyReason`, the gas and electrical warnings, and every catalogued
 * hazard are shown to every homeowner on every plan, always. A person is not
 * more entitled to not be hurt because they subscribed. What is paid for here is
 * knowing your filter size without going to look — convenience and money, never
 * safety.
 */

export interface DiyNote {
  /** What kind of thing this is, so the UI can order and icon it. */
  kind: 'spec' | 'history' | 'age' | 'warranty';
  text: string;
  /** Whether this rests on something documented or on an estimate. */
  basis: 'fact' | 'estimate';
}

export function personalDiyNotes(params: {
  record: HomeRecord;
  task: ScheduledTask;
  component?: HomeComponent;
  asOf?: ISODate;
}): DiyNote[] {
  const { record, task, component } = params;
  const asOf = params.asOf ?? today();
  const notes: DiyNote[] = [];
  if (!component) return notes;

  /*
   * Specs that are consumable sizes — a filter, a belt, an anode rod thread.
   * These are the single most useful thing to have in hand before starting,
   * because the alternative is a second trip to the hardware store.
   */
  for (const spec of component.specs) {
    const relevant =
      /size|capacity|thread|voltage|amperage|belt|fuel|refrigerant/i.test(spec.label) ||
      /\d+\s*[x×]\s*\d+/.test(spec.value);
    if (!relevant) continue;
    notes.push({
      kind: 'spec',
      text: `${spec.label}: ${spec.value}${
        spec.provenance === 'estimated' ? ' — estimated, worth confirming before you buy' : ''
      }`,
      basis: spec.provenance === 'documented' || spec.provenance === 'contractor' ? 'fact' : 'estimate',
    });
  }

  if (component.modelNumber) {
    notes.push({
      kind: 'spec',
      text: `Model ${component.modelNumber}${component.manufacturer ? ` (${component.manufacturer})` : ''} — worth having to hand when buying parts.`,
      basis: 'fact',
    });
  }

  // The last time this specific job was done on this specific item.
  const last = mostRecentEvent(
    record,
    (event) => event.componentId === component.id && event.date <= asOf,
  );
  if (last) {
    const days = Math.round(
      (new Date(asOf).getTime() - new Date(last.date).getTime()) / 86_400_000,
    );
    notes.push({
      kind: 'history',
      text: `Last recorded work on this item was "${last.title}" on ${formatDate(last.date)} — ${days} days ago${last.vendor ? `, by ${last.vendor}` : ''}.`,
      basis: 'fact',
    });
  }

  const age = resolveComponentAge(component, record.home, asOf);
  if (age.years !== undefined && age.years >= 12) {
    notes.push({
      kind: 'age',
      text: `This unit is ${age.years.toFixed(0)} years old${
        age.provenance === 'documented' || age.provenance === 'contractor'
          ? ''
          : ' by estimate'
      }. Fasteners, gaskets, and plastic housings on equipment this age break rather than bend — allow for replacing anything you disturb.`,
      basis: age.provenance === 'documented' || age.provenance === 'contractor' ? 'fact' : 'estimate',
    });
  }

  /*
   * The expensive mistake this catches: doing a job yourself on something still
   * under warranty, and voiding the coverage to save an afternoon's labour.
   */
  const warranty = componentWarrantyStatus(component, asOf);
  if (warranty.state === 'active' || warranty.state === 'expiring_soon') {
    notes.push({
      kind: 'warranty',
      text: `Still covered by ${warranty.warranty?.provider ?? 'a warranty'}${
        warranty.expiresOn ? ` until ${formatDate(warranty.expiresOn)}` : ''
      }. Routine maintenance is normally fine, but anything that opens the unit can void coverage — check the terms before you start, or have it done under the warranty.`,
      basis: warranty.warranty?.expiresOn ? 'fact' : 'estimate',
    });
  }

  // Anything the task itself flags for this equipment type.
  if (task.componentName && component.installedOn) {
    const years = yearsBetween(component.installedOn, asOf);
    if (years < 1) {
      notes.push({
        kind: 'age',
        text: 'Installed within the last year, so this may still be the installer’s responsibility rather than yours.',
        basis: 'fact',
      });
    }
  }

  return notes;
}

/** The one-line teaser shown to free users. Says what exists without giving it away. */
export function personalNotesSummary(notes: DiyNote[]): string | undefined {
  if (notes.length === 0) return undefined;
  const kinds = new Set(notes.map((n) => n.kind));
  const parts: string[] = [];
  if (kinds.has('spec')) parts.push('the exact sizes and model for this unit');
  if (kinds.has('history')) parts.push('when it was last done');
  if (kinds.has('age')) parts.push('what its age means for this job');
  if (kinds.has('warranty')) parts.push('whether doing it yourself risks the warranty');
  if (parts.length === 0) return undefined;
  const last = parts.pop()!;
  return parts.length > 0 ? `${parts.join(', ')}, and ${last}` : last;
}
