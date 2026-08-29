import { formatDate, relativeDayLabel, today, yearOf } from '../dates';
import { formatMoney } from '../money';
import type {
  ComponentCategory,
  HomeComponent,
  HomeRecord,
  ISODate,
  ScheduledTask,
} from '../types';
import { resolveComponentAge } from './age';
import { computeForecast } from './forecast';
import { generateTasks } from './schedule';
import { eventsForComponent, spendForYear, summarizeSpend } from './timeline';
import { componentWarrantyStatus } from './warranty';

/**
 * A deterministic question-answering layer over the home record.
 *
 * This exists for two reasons, and the second is the important one.
 *
 * First, it makes the assistant work with no network and no API key — the
 * questions in the product brief ("what size filter", "when was my roof replaced",
 * "how much have I spent") are lookups against structured data, and answering them
 * by calling a language model would be slower, costlier, and less reliable than
 * reading the record.
 *
 * Second, when the model *is* available, this module builds the grounding context
 * it sees. The model is never asked to recall facts about the house; it is handed
 * them. That is the difference between an assistant that knows this home and one
 * that produces plausible-sounding advice about homes in general.
 */

export interface RecordCitation {
  label: string;
  detail: string;
  componentId?: string;
  eventId?: string;
}

export interface RecordAnswer {
  answer: string;
  citations: RecordCitation[];
  confidence: 'high' | 'medium' | 'low';
  /** Set when the record can't answer and the question should go to the model. */
  needsModel?: boolean;
  suggestedFollowUps?: string[];
}

const CATEGORY_KEYWORDS: { category: ComponentCategory; words: string[] }[] = [
  { category: 'hvac', words: ['hvac', 'furnace', 'air condition', 'ac', 'a/c', 'heat pump', 'heating', 'cooling', 'condenser', 'air handler'] },
  { category: 'water_heater', words: ['water heater', 'hot water', 'tankless'] },
  { category: 'roof', words: ['roof', 'shingle', 'gutter'] },
  { category: 'electrical', words: ['electric', 'panel', 'breaker', 'outlet', 'wiring', 'gfci'] },
  { category: 'plumbing', words: ['plumb', 'pipe', 'faucet', 'toilet', 'drain', 'sewer', 'septic', 'sump', 'softener', 'well'] },
  { category: 'appliance', words: ['dishwasher', 'refrigerator', 'fridge', 'washer', 'dryer', 'oven', 'range', 'stove', 'microwave', 'disposal', 'appliance'] },
  { category: 'windows', words: ['window'] },
  { category: 'exterior', words: ['siding', 'paint', 'deck', 'garage', 'exterior', 'caulk'] },
  { category: 'flooring', words: ['floor', 'carpet', 'hardwood', 'tile'] },
  { category: 'safety', words: ['smoke', 'carbon monoxide', 'co detector', 'extinguisher', 'alarm'] },
];

/** Finds the component a question is about, preferring a name match over a category match. */
export function resolveComponent(
  record: HomeRecord,
  question: string,
): HomeComponent | undefined {
  const q = question.toLowerCase();
  const active = record.components.filter((c) => !c.retiredOn);

  // Direct name or model hit wins.
  let best: { component: HomeComponent; score: number } | undefined;
  for (const component of active) {
    const name = component.name.toLowerCase();
    const type = component.type.toLowerCase();
    let score = 0;
    if (q.includes(name)) score = name.length + 10;
    else if (q.includes(type)) score = type.length;
    else if (component.modelNumber && q.includes(component.modelNumber.toLowerCase())) score = 100;
    if (score > 0 && (!best || score > best.score)) best = { component, score };
  }
  if (best) return best.component;

  // Otherwise fall back to category keywords.
  for (const { category, words } of CATEGORY_KEYWORDS) {
    if (words.some((w) => q.includes(w))) {
      const inCategory = active.filter((c) => c.category === category);
      if (inCategory.length > 0) {
        // Prefer the highest-consequence item in the category.
        return inCategory[0];
      }
    }
  }
  return undefined;
}

function citeComponent(component: HomeComponent): RecordCitation {
  return {
    label: component.name,
    detail: [component.manufacturer, component.modelNumber].filter(Boolean).join(' ') || component.type,
    componentId: component.id,
  };
}

/**
 * Attempts to answer a question purely from the record. Returns `needsModel: true`
 * when the question is not a lookup — a "why is it doing that" or "should I" question
 * belongs to the model, with this record as its context.
 */
export function answerFromRecord(
  record: HomeRecord,
  question: string,
  asOf: ISODate = today(),
): RecordAnswer {
  const q = question.toLowerCase().trim();
  const tasks = generateTasks(record, { asOf });
  const component = resolveComponent(record, q);

  /* --- Filter sizes ---------------------------------------------------- */
  if (/\bfilter\b/.test(q) && /(size|what|which|need|buy)/.test(q)) {
    return answerFilterSize(record, component);
  }

  /* --- Warranty --------------------------------------------------------- */
  if (/warrant|covered|coverage/.test(q)) {
    if (component) {
      const status = componentWarrantyStatus(component, asOf);
      return {
        answer: status.summary,
        citations: [citeComponent(component)],
        confidence: status.state === 'unknown' ? 'low' : 'high',
      };
    }
    const covered = record.components
      .map((c) => ({ c, s: componentWarrantyStatus(c, asOf) }))
      .filter((r) => r.s.state === 'active' || r.s.state === 'expiring_soon');
    if (covered.length === 0) {
      return {
        answer: 'Nothing in your record is showing active warranty coverage right now. If you have warranty paperwork, photograph it and it will be filed against the right equipment.',
        citations: [],
        confidence: 'medium',
      };
    }
    return {
      answer: `${covered.length} ${covered.length === 1 ? 'item is' : 'items are'} still under warranty:\n\n${covered
        .map((r) => `• ${r.s.summary}`)
        .join('\n')}`,
      citations: covered.map((r) => citeComponent(r.c)),
      confidence: 'high',
    };
  }

  /* --- Spending --------------------------------------------------------- */
  if (/(how much|what).*(spent|spend|cost|paid)/.test(q) || /total.*(cost|spend)/.test(q)) {
    return answerSpend(record, q, asOf);
  }

  /* --- Overdue / upcoming maintenance ----------------------------------- */
  if (/behind|overdue|owe|neglect|what.*(maintenance|due|need to do)|due (now|soon|this)/.test(q)) {
    return answerMaintenance(tasks, asOf);
  }

  /* --- When was it done / who did it ------------------------------------ */
  if (/^when|when (was|did|were)|last (time|serviced|replaced)/.test(q)) {
    return answerWhen(record, component, q, asOf);
  }
  if (/^who|who (repaired|fixed|serviced|installed|did|replaced)/.test(q)) {
    return answerWho(record, component, q);
  }

  /* --- How old / when will it need replacing ---------------------------- */
  if (/how old|age of/.test(q)) {
    if (!component) return unknownComponent(record, 'how old something is');
    const age = resolveComponentAge(component, record.home, asOf);
    if (age.years === undefined) {
      return {
        answer: `${component.name}: ${age.basis}`,
        citations: [citeComponent(component)],
        confidence: 'low',
      };
    }
    const documented = age.provenance === 'documented' || age.provenance === 'contractor';
    return {
      answer: `${component.name} is about ${age.years} years old. ${age.basis}${
        age.expectedLifeYears ? ` Typical service life for this type is around ${age.expectedLifeYears} years.` : ''
      }`,
      citations: [citeComponent(component)],
      confidence: documented ? 'high' : 'medium',
    };
  }

  if (/when will|how long.*(last|left)|need (replacing|replaced)|life left|replace/.test(q)) {
    return answerReplacement(record, component, asOf);
  }

  /* --- Model / serial --------------------------------------------------- */
  if (/model|serial|make|manufacturer|brand/.test(q)) {
    if (!component) return unknownComponent(record, 'a model or serial number');
    const bits = [
      component.manufacturer ? `Manufacturer: ${component.manufacturer}` : undefined,
      component.modelNumber ? `Model: ${component.modelNumber}` : undefined,
      component.serialNumber ? `Serial: ${component.serialNumber}` : undefined,
    ].filter(Boolean);
    return {
      answer:
        bits.length > 0
          ? `${component.name}\n${bits.join('\n')}`
          : `No manufacturer or model is on record for ${component.name}. Photograph the nameplate and it will be read in automatically.`,
      citations: [citeComponent(component)],
      confidence: bits.length > 0 ? 'high' : 'low',
    };
  }

  /* --- Anything else belongs to the model ------------------------------- */
  return {
    answer: '',
    citations: [],
    confidence: 'low',
    needsModel: true,
  };
}

function unknownComponent(record: HomeRecord, what: string): RecordAnswer {
  const names = record.components.slice(0, 6).map((c) => c.name);
  return {
    answer:
      names.length > 0
        ? `I'm not sure which item you mean. Your record has: ${names.join(', ')}${
            record.components.length > 6 ? ', and more' : ''
          }. Ask again naming one and I can tell you ${what}.`
        : `There's no equipment in your record yet. Run Scan My Home and I'll be able to answer ${what}.`,
    citations: [],
    confidence: 'low',
    suggestedFollowUps: names.slice(0, 3).map((n) => `How old is my ${n}?`),
  };
}

/** A filter spec, and whether it names a size you buy or a part you clean. */
function filterSpecOf(component: HomeComponent) {
  return component.specs.find((s) => /filter/i.test(s.key) || /filter/i.test(s.label));
}

function isPurchasableSize(spec: { key: string; label: string; value: string }): boolean {
  // A size is either explicitly labelled as one, or reads like dimensions ("20x25x1").
  return (
    /size/i.test(spec.key) ||
    /size/i.test(spec.label) ||
    /\d+\s*[x×]\s*\d+/i.test(spec.value)
  );
}

function answerFilterSize(record: HomeRecord, hinted?: HomeComponent): RecordAnswer {
  const active = record.components.filter((c) => !c.retiredOn);

  // Every filter in the house that you buy by size — not just the one the question
  // happened to name. Someone asking what size filter to get is standing in a
  // hardware store, and a house with two air handlers on different sizes needs both.
  const candidates = active.filter((c) => {
    const spec = filterSpecOf(c);
    return spec !== undefined && isPurchasableSize(spec);
  });

  // Unless they asked about a specific appliance whose filter is cleaned rather than
  // bought — a dishwasher's cylinder filter has no size and belongs to that question,
  // not to the list of air filters.
  if (hinted) {
    const spec = filterSpecOf(hinted);
    if (spec && !isPurchasableSize(spec)) {
      return {
        answer: `${hinted.name}: ${spec.value}. That one is cleaned rather than replaced by size — there is nothing to buy.`,
        citations: [citeComponent(hinted)],
        confidence: spec.provenance === 'documented' ? 'high' : 'medium',
      };
    }
  }
  if (candidates.length === 0) {
    const hvac = record.components.filter((c) => c.category === 'hvac');
    if (hvac.length === 0) {
      return {
        answer: 'There is no HVAC equipment in your record yet, so I do not have a filter size. Scan the unit and the nameplate and I will pick it up.',
        citations: [],
        confidence: 'low',
      };
    }
    return {
      answer: `No filter size is recorded for ${hvac.map((c) => c.name).join(' or ')} yet. The quickest fix: pull the current filter out and photograph the size printed on its cardboard frame — that is the authoritative source, not the unit's model number.`,
      citations: hvac.map(citeComponent),
      confidence: 'low',
    };
  }
  const lines = candidates.map((c) => {
    const spec = filterSpecOf(c);
    const estimated =
      spec?.provenance === 'estimated' ? ' (estimated — confirm against the old filter)' : '';
    return `• ${c.name}: ${spec?.value}${estimated}`;
  });
  const distinctSizes = new Set(candidates.map((c) => filterSpecOf(c)?.value));
  const note =
    distinctSizes.size === 1 && candidates.length > 1
      ? '\n\nBoth take the same size, so one pack covers the house.'
      : '';
  return {
    answer: `${lines.join('\n')}${note}\n\nFilters are sized nominally, so a "16x25x1" filter actually measures slightly under that. Buy by the printed size.`,
    citations: candidates.map(citeComponent),
    confidence: candidates.some((c) => filterSpecOf(c)?.provenance === 'documented')
      ? 'high'
      : 'medium',
  };
}

function answerSpend(record: HomeRecord, q: string, asOf: ISODate): RecordAnswer {
  const currentYear = yearOf(asOf);
  const yearMatch = /\b(20\d{2})\b/.exec(q);
  const thisYear = /this year|ytd|year to date/.test(q);
  const lastYear = /last year/.test(q);

  let year: number | undefined;
  if (yearMatch?.[1]) year = Number(yearMatch[1]);
  else if (thisYear) year = currentYear;
  else if (lastYear) year = currentYear - 1;

  const summary = year ? spendForYear(record, year) : summarizeSpend(record);
  const scope = year ? `in ${year}` : 'across your whole record';

  if (summary.eventCount === 0) {
    return {
      answer: `No costs are recorded ${scope}. Photograph an invoice and I will file it against the right equipment with the amount.`,
      citations: [],
      confidence: 'high',
    };
  }

  const breakdown = summary.byCategory
    .slice(0, 5)
    .map((b) => `• ${labelForCategory(b.category)}: ${formatMoney(b.totalCents)}`)
    .join('\n');

  return {
    answer: `${formatMoney(summary.totalCents)} ${scope}, across ${summary.eventCount} ${
      summary.eventCount === 1 ? 'entry' : 'entries'
    }.\n\n${breakdown}\n\nThis counts only entries that have a cost recorded — work logged without an amount is not in the total.`,
    citations: [],
    confidence: 'high',
  };
}

function labelForCategory(category: ComponentCategory | 'unassigned'): string {
  const map: Record<string, string> = {
    hvac: 'HVAC',
    water_heater: 'Water heater',
    roof: 'Roof',
    electrical: 'Electrical',
    plumbing: 'Plumbing',
    appliance: 'Appliances',
    windows: 'Windows',
    exterior: 'Exterior',
    flooring: 'Flooring',
    safety: 'Safety',
    structure: 'Structure',
    other: 'Other',
    unassigned: 'Not linked to equipment',
  };
  return map[category] ?? category;
}

function answerMaintenance(tasks: ScheduledTask[], asOf: ISODate): RecordAnswer {
  const overdue = tasks.filter((t) => t.urgency === 'overdue');
  const soon = tasks.filter((t) => t.urgency === 'due_soon');

  if (overdue.length === 0 && soon.length === 0) {
    const next = tasks[0];
    return {
      answer: next
        ? `Nothing is overdue. Your next task is "${next.title}"${
            next.componentName ? ` for the ${next.componentName}` : ''
          }, due ${formatDate(next.dueDate)} (${relativeDayLabel(asOf, next.dueDate)}).`
        : 'Nothing is scheduled yet. Scan your home and a maintenance calendar will be built from the equipment you have.',
      citations: [],
      confidence: 'high',
    };
  }

  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push(`Overdue (${overdue.length}):`);
    for (const t of overdue) {
      lines.push(
        `• ${t.title}${t.componentName ? ` — ${t.componentName}` : ''}, due ${formatDate(t.dueDate)} (${relativeDayLabel(asOf, t.dueDate)})${
          t.criticality === 'safety' ? '  ⚠ safety item' : ''
        }`,
      );
    }
  }
  if (soon.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push(`Due within 30 days (${soon.length}):`);
    for (const t of soon) {
      lines.push(`• ${t.title}${t.componentName ? ` — ${t.componentName}` : ''}, ${formatDate(t.dueDate)}`);
    }
  }

  const neverLogged = overdue.concat(soon).filter((t) => !t.lastCompletedOn).length;
  if (neverLogged > 0) {
    lines.push('');
    lines.push(
      `${neverLogged} of these have never been logged, so they are showing due by default. If you have already done one recently, mark it complete and the schedule will correct itself.`,
    );
  }

  return { answer: lines.join('\n'), citations: [], confidence: 'high' };
}

function answerWhen(
  record: HomeRecord,
  component: HomeComponent | undefined,
  q: string,
  asOf: ISODate,
): RecordAnswer {
  if (!component) return unknownComponent(record, 'when something was done');

  const wantsReplacement = /replac|install|new/.test(q);
  const events = eventsForComponent(record, component.id);
  const match = wantsReplacement
    ? events.find((e) => e.type === 'replacement' || e.type === 'installation')
    : events[0];

  if (match) {
    return {
      answer: `${match.title} — ${formatDate(match.date)} (${relativeDayLabel(asOf, match.date)})${
        match.vendor ? `, by ${match.vendor}` : ''
      }${match.costCents !== undefined ? `, ${formatMoney(match.costCents)}` : ''}.${
        match.description ? `\n\n${match.description}` : ''
      }`,
      citations: [citeComponent(component), { label: 'Timeline entry', detail: match.title, eventId: match.id }],
      confidence: 'high',
    };
  }

  if (component.installedOn) {
    return {
      answer: `There is no service entry for ${component.name}, but the record has it installed ${formatDate(component.installedOn)} (${relativeDayLabel(asOf, component.installedOn)}).`,
      citations: [citeComponent(component)],
      confidence: 'high',
    };
  }

  const age = resolveComponentAge(component, record.home, asOf);
  return {
    answer: `Nothing is recorded for ${component.name} yet. ${age.basis}`,
    citations: [citeComponent(component)],
    confidence: 'low',
  };
}

function answerWho(record: HomeRecord, component: HomeComponent | undefined, q: string): RecordAnswer {
  const events = component
    ? eventsForComponent(record, component.id)
    : record.events.filter((e) => e.vendor);
  const withVendor = events.filter((e) => e.vendor);

  if (withVendor.length === 0) {
    return {
      answer: component
        ? `No contractor is recorded against ${component.name}. If you have the invoice, photograph it and the company name will be filed with it.`
        : 'No contractors are recorded yet.',
      citations: component ? [citeComponent(component)] : [],
      confidence: 'low',
    };
  }

  const first = withVendor[0]!;
  if (withVendor.length === 1 || component) {
    return {
      answer: `${first.vendor} — ${first.title}, ${formatDate(first.date)}.${
        withVendor.length > 1
          ? `\n\nEarlier work on this item:\n${withVendor
              .slice(1, 4)
              .map((e) => `• ${e.vendor} — ${e.title}, ${formatDate(e.date)}`)
              .join('\n')}`
          : ''
      }`,
      citations: [{ label: 'Timeline entry', detail: first.title, eventId: first.id }],
      confidence: 'high',
    };
  }

  return {
    answer: `Contractors in your record:\n${withVendor
      .slice(0, 6)
      .map((e) => `• ${e.vendor} — ${e.title}, ${formatDate(e.date)}`)
      .join('\n')}`,
    citations: [],
    confidence: 'high',
  };
}

function answerReplacement(
  record: HomeRecord,
  component: HomeComponent | undefined,
  asOf: ISODate,
): RecordAnswer {
  const forecast = computeForecast(record, { asOf });
  if (!component) {
    const items = forecast.horizons.fiveYear.items.filter((i) => i.kind === 'replacement').slice(0, 4);
    if (items.length === 0) {
      return {
        answer: 'Nothing in your record is projected to need replacing in the next five years.',
        citations: [],
        confidence: 'medium',
      };
    }
    return {
      answer: `Most likely replacements in the next five years:\n${items
        .map((i) => `• ${i.label} — likely around ${i.likelyYear}, ${formatMoney(i.fullCostCents)} (${Math.round(i.probability * 100)}% chance in that window)`)
        .join('\n')}\n\nThese are projections from equipment age and typical service life, not inspections.`,
      citations: [],
      confidence: 'medium',
    };
  }

  const age = resolveComponentAge(component, record.home, asOf);
  if (age.years === undefined || age.expectedLifeYears === undefined) {
    return {
      answer: `I can't project a replacement for ${component.name} without an age. ${age.basis}`,
      citations: [citeComponent(component)],
      confidence: 'low',
    };
  }
  const remaining = Math.max(0, Math.round(age.expectedLifeYears - age.years));
  const item = forecast.horizons.fiveYear.items.find((i) => i.componentId === component.id);
  const documented = age.provenance === 'documented' || age.provenance === 'contractor';
  return {
    answer: `${component.name} is about ${age.years} years old against a typical ${age.expectedLifeYears}-year life, so roughly ${remaining} ${remaining === 1 ? 'year' : 'years'} of expected life remain — around ${yearOf(asOf) + remaining}.${
      item ? ` Budget about ${formatMoney(item.fullCostCents)} when it goes; there's a ${Math.round(item.probability * 100)}% chance that falls inside the next five years.` : ''
    }\n\n${documented ? 'This is based on a documented age.' : 'The age here is estimated, so treat the year as a planning range rather than a date.'} Plenty of equipment outlives the table, and some fails early — this is for budgeting, not diagnosis.`,
    citations: [citeComponent(component)],
    confidence: documented ? 'medium' : 'low',
  };
}

/* -------------------------------------------------------------------------
 * Grounding context for the model
 * ---------------------------------------------------------------------- */

export interface GroundingOptions {
  asOf?: ISODate;
  maxEvents?: number;
}

/**
 * Renders the home record as compact text for the model's context.
 *
 * Two deliberate choices here. Provenance is carried through into the text, so the
 * model can see which facts are documented and which the app estimated — it is
 * explicitly instructed not to present the latter as the former. And costs are
 * included, because the owner asking the question is the person who paid them.
 */
export function buildGroundingContext(record: HomeRecord, options: GroundingOptions = {}): string {
  const asOf = options.asOf ?? today();
  const maxEvents = options.maxEvents ?? 40;
  const home = record.home;
  const tasks = generateTasks(record, { asOf });
  const forecast = computeForecast(record, { asOf });

  const lines: string[] = [];
  lines.push(`TODAY: ${asOf}`);
  lines.push('');
  lines.push('## PROPERTY');
  lines.push(
    [
      home.nickname,
      home.addressLine1,
      [home.city, home.state, home.postalCode].filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join(' | '),
  );
  if (home.yearBuilt) lines.push(`Year built: ${home.yearBuilt}`);
  if (home.squareFeet) lines.push(`Size: ${home.squareFeet} sq ft`);
  lines.push(`Climate: ${home.climate}`);
  lines.push('');

  lines.push('## EQUIPMENT ON RECORD');
  if (record.components.length === 0) {
    lines.push('(none recorded yet)');
  }
  for (const component of record.components) {
    if (component.retiredOn) continue;
    const age = resolveComponentAge(component, home, asOf);
    const warranty = componentWarrantyStatus(component, asOf);
    lines.push(`### ${component.name} [id=${component.id}]`);
    lines.push(`  category: ${component.category} | type: ${component.type}`);
    if (component.location) lines.push(`  location: ${component.location}`);
    if (component.manufacturer) lines.push(`  manufacturer: ${component.manufacturer}`);
    if (component.modelNumber) lines.push(`  model: ${component.modelNumber}`);
    if (component.serialNumber) lines.push(`  serial: ${component.serialNumber}`);
    lines.push(
      `  age: ${age.years ?? 'unknown'} yrs [${age.provenance}] | typical life: ${age.expectedLifeYears ?? 'n/a'} yrs`,
    );
    for (const spec of component.specs) {
      lines.push(`  spec ${spec.label}: ${spec.value} [${spec.provenance}]`);
    }
    lines.push(`  warranty: ${warranty.summary}`);
    if (component.openQuestions.length > 0) {
      lines.push(`  unresolved: ${component.openQuestions.join('; ')}`);
    }
  }
  lines.push('');

  lines.push('## WORK HISTORY (most recent first)');
  const events = [...record.events].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, maxEvents);
  if (events.length === 0) lines.push('(nothing recorded yet)');
  for (const event of events) {
    const component = record.components.find((c) => c.id === event.componentId);
    lines.push(
      `- ${event.date} | ${event.type} | ${event.title}${component ? ` | on: ${component.name}` : ''}${
        event.vendor ? ` | by: ${event.vendor}` : ''
      }${event.costCents !== undefined ? ` | cost: ${formatMoney(event.costCents)}` : ''}${
        event.description ? ` | notes: ${event.description}` : ''
      }`,
    );
  }
  lines.push('');

  lines.push('## MAINTENANCE STATUS');
  const overdue = tasks.filter((t) => t.urgency === 'overdue');
  const soon = tasks.filter((t) => t.urgency === 'due_soon');
  lines.push(`Overdue: ${overdue.length === 0 ? 'none' : ''}`);
  for (const t of overdue) {
    lines.push(`- ${t.title}${t.componentName ? ` (${t.componentName})` : ''} due ${t.dueDate} [${t.criticality}]`);
  }
  lines.push(`Due within 30 days: ${soon.length === 0 ? 'none' : ''}`);
  for (const t of soon) {
    lines.push(`- ${t.title}${t.componentName ? ` (${t.componentName})` : ''} due ${t.dueDate}`);
  }
  lines.push('');

  lines.push('## COST PROJECTIONS (app estimates, not quotes)');
  lines.push(`Next 12 months: ${formatMoney(forecast.horizons.oneYear.totalCents)}`);
  lines.push(`Next 3 years: ${formatMoney(forecast.horizons.threeYear.totalCents)}`);
  lines.push(`Next 5 years: ${formatMoney(forecast.horizons.fiveYear.totalCents)}`);
  lines.push(
    `Suggested monthly reserve: ${formatMoney(forecast.suggestedMonthlyReserveCents)}`,
  );
  for (const item of forecast.horizons.fiveYear.items.slice(0, 6)) {
    lines.push(`- ${item.label}: ${formatMoney(item.fullCostCents)} full cost, ${Math.round(item.probability * 100)}% within 5 yrs [${item.basis}]`);
  }

  return lines.join('\n');
}
