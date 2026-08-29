import { formatDate, today } from '../dates';
import type {
  HomeComponent,
  HomeRecord,
  ISODateTime,
  Provider,
  ServiceRequest,
  ServiceRequestPacket,
} from '../types';
import { resolveComponentAge } from './age';
import { eventsForComponent } from './timeline';
import { componentWarrantyStatus } from './warranty';

/**
 * The launch provider. The marketplace is built to hold many contractors, but the
 * product is intended to prove itself with one real local partner before opening up.
 */
export const PROVIDERS: Provider[] = [
  {
    id: 'lowcountry',
    name: 'Lowcountry Home Maintenance',
    trades: ['hvac', 'water_heater', 'plumbing', 'electrical', 'appliance', 'exterior', 'roof'],
    serviceArea: 'Charleston Lowcountry',
    blurb: 'Launch partner. Receives your equipment details, history, and photos with the request.',
    isLaunchPartner: true,
  },
];

export function providersForCategory(category: HomeComponent['category']): Provider[] {
  return PROVIDERS.filter((p) => p.trades.includes(category));
}

/**
 * Assembles everything a contractor needs to quote the job without a phone call.
 *
 * This is the point of keeping the record in the first place: the homeowner has
 * already answered "what is it, how old is it, what has been done to it" once, at
 * scan time, and should never have to answer it again.
 *
 * The packet is a snapshot rather than a live view — it is stored on the request so
 * that months later it still shows what the contractor was actually told.
 */
export function buildServiceRequestPacket(params: {
  record: HomeRecord;
  component?: HomeComponent;
  problem: string;
  photoCount: number;
  generatedAt?: ISODateTime;
  historyLimit?: number;
}): ServiceRequestPacket {
  const { record, component, problem, photoCount } = params;
  const asOf = today();
  const home = record.home;

  const homeSummary = [
    home.yearBuilt ? `${home.yearBuilt}-built` : undefined,
    home.squareFeet ? `${home.squareFeet.toLocaleString('en-US')} sq ft` : undefined,
    [home.city, home.state].filter(Boolean).join(', ') || undefined,
  ]
    .filter(Boolean)
    .join(' · ') || 'Home details not recorded';

  let equipment: ServiceRequestPacket['equipment'];
  if (component) {
    const age = resolveComponentAge(component, home, asOf);
    const warranty = componentWarrantyStatus(component, asOf);
    equipment = {
      name: component.name,
      type: component.type,
      manufacturer: component.manufacturer,
      modelNumber: component.modelNumber,
      serialNumber: component.serialNumber,
      ageSummary:
        age.years === undefined
          ? 'Age unknown'
          : `${age.years} years (${age.provenance === 'documented' || age.provenance === 'contractor' ? 'documented' : 'estimated'})`,
      specs: component.specs.map((s) => ({
        label: s.label,
        value: s.value,
        provenance: s.provenance,
      })),
      warrantyStatus: warranty.summary,
    };
  }

  const history = component
    ? eventsForComponent(record, component.id)
        .slice(0, params.historyLimit ?? 6)
        .map((e) => ({ date: e.date, title: e.title, vendor: e.vendor }))
    : [];

  return {
    homeSummary,
    equipment,
    relevantHistory: history,
    problem,
    photoCount,
    generatedAt: params.generatedAt ?? new Date().toISOString(),
  };
}

/** Renders the packet as the plain-text brief a contractor actually receives. */
export function renderPacketText(packet: ServiceRequestPacket, title: string): string {
  const lines: string[] = [title, ''];
  lines.push(`Property: ${packet.homeSummary}`);
  lines.push('');

  if (packet.equipment) {
    const e = packet.equipment;
    lines.push('EQUIPMENT');
    lines.push(`  ${e.name} — ${e.type}`);
    if (e.manufacturer) lines.push(`  Manufacturer: ${e.manufacturer}`);
    if (e.modelNumber) lines.push(`  Model: ${e.modelNumber}`);
    if (e.serialNumber) lines.push(`  Serial: ${e.serialNumber}`);
    lines.push(`  Age: ${e.ageSummary}`);
    for (const spec of e.specs) {
      lines.push(`  ${spec.label}: ${spec.value}${spec.provenance === 'estimated' ? ' (estimated)' : ''}`);
    }
    lines.push(`  Warranty: ${e.warrantyStatus}`);
    lines.push('');
  }

  if (packet.relevantHistory.length > 0) {
    lines.push('SERVICE HISTORY');
    for (const h of packet.relevantHistory) {
      lines.push(`  ${formatDate(h.date)} — ${h.title}${h.vendor ? ` (${h.vendor})` : ''}`);
    }
    lines.push('');
  }

  lines.push('PROBLEM');
  lines.push(`  ${packet.problem}`);
  lines.push('');
  lines.push(`Photos attached: ${packet.photoCount}`);
  return lines.join('\n');
}

/**
 * Turns a completed job into a permanent record entry. Called when a contractor
 * uploads their invoice and completion photos — the work becomes part of the
 * home's history without the owner transcribing anything.
 */
export function completionEventFromRequest(params: {
  request: ServiceRequest;
  eventId: string;
  completedOn: string;
  costCents?: number;
  vendor: string;
  documentIds: string[];
  photoIds: string[];
  description?: string;
}): import('../types').TimelineEvent {
  return {
    id: params.eventId,
    homeId: params.request.homeId,
    componentId: params.request.componentId,
    date: params.completedOn,
    type: 'repair',
    title: params.request.title,
    description: params.description ?? params.request.problemDescription,
    costCents: params.costCents,
    vendor: params.vendor,
    documentIds: params.documentIds,
    photoIds: params.photoIds,
    source: 'contractor',
    // The work transfers with the house; what it cost is the owner's business.
    visibility: 'transferable',
    createdAt: new Date().toISOString(),
  };
}
