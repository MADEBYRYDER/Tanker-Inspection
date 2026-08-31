import { formatDate, today, yearOf } from '../dates';
import { formatMoney } from '../money';
import type {
  Cents,
  HomeRecord,
  ISODate,
  TimelineEvent,
} from '../types';
import { resolveComponentAge } from './age';
import { groupEventsByYear } from './timeline';
import { componentWarrantyStatus } from './warranty';

/**
 * Producing the record that goes to a buyer — and deciding what does not go with it.
 *
 * The rule the product commits to: the *work* transfers, the *money* does not.
 * A buyer inheriting the home is entitled to know the roof was replaced in 2025 and
 * by whom, and needs the warranty to make a claim against it. They are not entitled
 * to know what the seller paid, what the seller wrote in a private note, or which
 * insurance claims the seller filed.
 *
 * `redactForTransfer` is the only path by which a record leaves the owner's account,
 * and it drops private entries entirely rather than blanking fields on them — a
 * redacted-but-present row still leaks that something happened.
 */

export interface TransferOptions {
  /** Include per-item costs. Off by default and only ever set by the owner explicitly. */
  includeCosts?: boolean;
}

export function redactForTransfer(record: HomeRecord, options: TransferOptions = {}): HomeRecord {
  const includeCosts = options.includeCosts ?? false;

  const events: TimelineEvent[] = record.events
    .filter((e) => e.visibility === 'transferable')
    .map((e) => ({
      ...e,
      costCents: includeCosts ? e.costCents : undefined,
      // Free-text notes are where personal detail leaks; keep only what the owner
      // wrote as a description of the work itself.
      description: e.description,
      // The job transfers; the seller's receipt for it does not. This is a
      // pointer into their billing history, and it is only here because Dwella
      // generated the entry from a charge — the buyer inherits the work and who
      // did it, not a handle on somebody else's account.
      sourceChargeId: undefined,
    }));

  const keptEventIds = new Set(events.map((e) => e.id));
  const documents = record.documents.filter((d) => d.visibility === 'transferable');
  const keptDocumentIds = new Set(documents.map((d) => d.id));

  return {
    /*
     * The building's facts transfer. Two things attached to the seller rather
     * than to the house do not: the photograph they took of it, which can hold
     * whoever was standing on the porch that afternoon, and where they have
     * their post sent — frequently an office, a second home, or a PO box, and
     * nobody else's business at all.
     */
    home: { ...record.home, photoUri: undefined, mailingAddress: undefined },
    components: record.components.map((c) => ({
      ...c,
      notes: undefined, // owner's private annotations
      documentIds: c.documentIds.filter((id) => keptDocumentIds.has(id)),
    })),
    events: events.map((e) => ({
      ...e,
      documentIds: e.documentIds.filter((id) => keptDocumentIds.has(id)),
    })),
    documents,
    completions: record.completions.map((c) => ({
      ...c,
      costCents: includeCosts ? c.costCents : undefined,
      notes: undefined,
    })),
    // Service requests carry the owner's problem descriptions and are not transferred.
    serviceRequests: [],
  };
}

export interface HomeRecordReportSection {
  heading: string;
  lines: string[];
}

export interface HomeRecordReport {
  title: string;
  subtitle: string;
  generatedOn: ISODate;
  sections: HomeRecordReportSection[];
  /** Total documented investment. Present only when costs are included. */
  documentedInvestmentCents?: Cents;
  transferable: boolean;
}

/**
 * Builds the Home Record — the document a seller hands to a buyer or an agent.
 *
 * It leads with what is documented, because that is what makes it worth anything.
 * Estimates are still shown, but always marked, so the document never overstates
 * what is actually known about the house.
 */
export function buildHomeRecordReport(
  record: HomeRecord,
  options: { forTransfer?: boolean; includeCosts?: boolean; asOf?: ISODate } = {},
): HomeRecordReport {
  const asOf = options.asOf ?? today();
  const forTransfer = options.forTransfer ?? false;
  const includeCosts = options.includeCosts ?? !forTransfer;
  const source = forTransfer ? redactForTransfer(record, { includeCosts }) : record;
  const home = source.home;

  const sections: HomeRecordReportSection[] = [];

  /* --- Property ------------------------------------------------------- */
  sections.push({
    heading: 'Property',
    lines: [
      [home.addressLine1, home.city, home.state, home.postalCode].filter(Boolean).join(', ') ||
        home.nickname,
      home.yearBuilt ? `Built ${home.yearBuilt}` : 'Build year not recorded',
      home.squareFeet ? `${home.squareFeet.toLocaleString('en-US')} sq ft` : 'Size not recorded',
      `Record maintained since ${formatDate(home.ownedSince ?? home.createdAt.slice(0, 10))}`,
    ],
  });

  /* --- Systems and equipment ------------------------------------------ */
  const equipmentLines: string[] = [];
  for (const component of source.components.filter((c) => !c.retiredOn)) {
    const age = resolveComponentAge(component, home, asOf);
    const documented = age.provenance === 'documented' || age.provenance === 'contractor';
    const idParts = [component.manufacturer, component.modelNumber].filter(Boolean).join(' ');
    const ageText =
      age.years === undefined
        ? 'age not recorded'
        : documented
          ? `${age.years} yrs, documented`
          : `~${age.years} yrs, estimated`;
    equipmentLines.push(
      `${component.name}${idParts ? ` — ${idParts}` : ''} (${ageText})`,
    );
    const warranty = componentWarrantyStatus(component, asOf);
    if (warranty.state === 'active' || warranty.state === 'expiring_soon') {
      equipmentLines.push(`    Warranty: ${warranty.summary}`);
    }
  }
  sections.push({
    heading: 'Systems and equipment',
    lines: equipmentLines.length > 0 ? equipmentLines : ['No equipment recorded.'],
  });

  /* --- Documented work ------------------------------------------------- */
  const workLines: string[] = [];
  for (const group of groupEventsByYear(source.events)) {
    workLines.push(`${group.year}`);
    for (const event of group.events) {
      const cost = includeCosts && event.costCents !== undefined ? ` — ${formatMoney(event.costCents)}` : '';
      const vendor = event.vendor ? ` (${event.vendor})` : '';
      workLines.push(`    ${formatDate(event.date)}  ${event.title}${vendor}${cost}`);
    }
  }
  sections.push({
    heading: 'Documented work',
    lines: workLines.length > 0 ? workLines : ['No work recorded.'],
  });

  /* --- Improvements ---------------------------------------------------- */
  const improvements = source.events.filter(
    (e) => e.type === 'improvement' || e.type === 'replacement',
  );
  if (improvements.length > 0) {
    sections.push({
      heading: 'Capital improvements',
      lines: improvements.map(
        (e) =>
          `${yearOf(e.date)}  ${e.title}${e.vendor ? ` (${e.vendor})` : ''}${
            includeCosts && e.costCents !== undefined ? ` — ${formatMoney(e.costCents)}` : ''
          }`,
      ),
    });
  }

  /* --- Documents -------------------------------------------------------- */
  sections.push({
    heading: 'Attached documents',
    lines:
      source.documents.length > 0
        ? source.documents.map((d) => `${d.kind}: ${d.title} (added ${formatDate(d.addedAt.slice(0, 10))})`)
        : ['No documents attached.'],
  });

  if (forTransfer) {
    sections.push({
      heading: 'What is not included',
      lines: [
        'Purchase prices and amounts paid by the previous owner are excluded.',
        'Private notes, service requests, and any insurance detail are excluded.',
        'Every claim above is drawn from this home’s own record. Items marked "estimated" were derived from typical service life, not from a document.',
      ],
    });
  }

  const documentedInvestmentCents = includeCosts
    ? source.events.reduce((sum, e) => sum + (e.costCents ?? 0), 0)
    : undefined;

  return {
    title: forTransfer ? 'Home Record — Transfer Copy' : 'Home Record',
    subtitle: home.addressLine1 ?? home.nickname,
    generatedOn: asOf,
    sections,
    documentedInvestmentCents,
    transferable: forTransfer,
  };
}

/** Flattens a report to plain text for sharing or export. */
export function renderReportText(report: HomeRecordReport): string {
  const out: string[] = [report.title, report.subtitle, `Generated ${formatDate(report.generatedOn)}`, ''];
  for (const section of report.sections) {
    out.push(section.heading.toUpperCase());
    for (const line of section.lines) out.push(`  ${line}`);
    out.push('');
  }
  if (report.documentedInvestmentCents !== undefined) {
    out.push(`DOCUMENTED INVESTMENT: ${formatMoney(report.documentedInvestmentCents)}`);
  }
  return out.join('\n');
}
