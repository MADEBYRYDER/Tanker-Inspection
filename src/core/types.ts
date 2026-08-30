import type { PropertyType, Role } from './account';
/**
 * Core domain model for the home record.
 *
 * Two ideas run through every type here and are load-bearing for the whole app:
 *
 * 1. `Provenance` — every fact carries where it came from. A serial number read
 *    off a nameplate photo is not the same kind of fact as a model year the app
 *    guessed from a style of equipment, and the UI is required to say which is
 *    which. Nothing in the scoring or forecasting engines is allowed to quietly
 *    launder an estimate into a documented fact.
 *
 * 2. `Visibility` — records split into what transfers with the house and what
 *    stays with the person. When the home is sold, `private` entries never leave
 *    the seller's account.
 */

export type ISODate = string; // 'YYYY-MM-DD'
export type ISODateTime = string; // full ISO-8601 timestamp
export type Cents = number;

/** Where a piece of information came from. Drives the "documented vs estimated" labelling. */
export type Provenance =
  | 'documented' // read off a nameplate, invoice, warranty card, or entered by the owner as a known fact
  | 'contractor' // supplied by a service provider completing a job
  | 'estimated' // derived by the app (typical lifespan, home age, category defaults)
  | 'unknown';

export type Visibility =
  | 'transferable' // moves to the next owner: equipment, work performed, warranties
  | 'private'; // stays with the current owner: prices they paid, personal notes, claims

export type ComponentCategory =
  | 'hvac'
  | 'water_heater'
  | 'roof'
  | 'electrical'
  | 'plumbing'
  | 'appliance'
  | 'windows'
  | 'exterior'
  | 'flooring'
  | 'safety'
  | 'structure'
  | 'other';

export interface MediaRef {
  id: string;
  /** Which property this belongs to. Every record in the app is property-scoped. */
  homeId: string;
  uri: string;
  kind: 'photo' | 'video';
  /** What the photo is of — nameplates are treated specially by the scanner. */
  role: 'nameplate' | 'overview' | 'detail' | 'issue' | 'completion';
  capturedAt: ISODateTime;
  caption?: string;
}

export interface DocumentRef {
  id: string;
  /** Which property this belongs to. Every record in the app is property-scoped. */
  homeId: string;
  title: string;
  uri?: string;
  kind: 'invoice' | 'receipt' | 'warranty' | 'manual' | 'permit' | 'inspection' | 'other';
  addedAt: ISODateTime;
  visibility: Visibility;
  /** Structured fields pulled out of the document, if any. */
  extracted?: Record<string, string>;
}

export interface Warranty {
  provider: string;
  kind: 'manufacturer' | 'extended' | 'workmanship' | 'home_warranty';
  termYears?: number;
  startDate?: ISODate;
  expiresOn?: ISODate;
  covers?: string;
  provenance: Provenance;
  documentId?: string;
}

/** A specification read from a nameplate or manual, e.g. filter size, tonnage, tank capacity. */
export interface Spec {
  key: string;
  label: string;
  value: string;
  provenance: Provenance;
}

export interface HomeComponent {
  id: string;
  homeId: string;
  category: ComponentCategory;
  /** Free-text sub-type, e.g. 'Gas furnace', 'Asphalt shingle roof', 'Dishwasher'. */
  type: string;
  name: string;
  location?: string;

  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;

  /** Install/manufacture date when known. */
  installedOn?: ISODate;
  /** Year of manufacture when only the year is known (common from serial decoding). */
  manufacturedYear?: number;
  ageProvenance: Provenance;

  specs: Spec[];
  warranties: Warranty[];
  photos: MediaRef[];
  documentIds: string[];

  /** 0–1. How sure the identification is. Below 0.6 the UI asks the owner to confirm. */
  identificationConfidence: number;
  identificationSource: 'ai_scan' | 'manual' | 'contractor';
  /** Anything the identifier could not resolve and wants a human to fill in. */
  openQuestions: string[];

  notes?: string;
  retiredOn?: ISODate;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type TimelineEventType =
  | 'installation'
  | 'service'
  | 'repair'
  | 'replacement'
  | 'inspection'
  | 'improvement'
  | 'issue';

export interface TimelineEvent {
  id: string;
  homeId: string;
  componentId?: string;
  date: ISODate;
  type: TimelineEventType;
  title: string;
  description?: string;
  /** What the owner paid. Always `private` — the next owner inherits the work, not the price. */
  costCents?: Cents;
  vendor?: string;
  documentIds: string[];
  photoIds: string[];
  source: 'owner' | 'ai_document' | 'contractor' | 'system';
  visibility: Visibility;
  createdAt: ISODateTime;
}

export type TaskUrgency = 'overdue' | 'due_soon' | 'upcoming' | 'scheduled';

export interface MaintenanceStep {
  text: string;
  caution?: string;
}

export interface DiyGuidance {
  difficulty: 'easy' | 'moderate' | 'advanced';
  estimatedMinutes: number;
  materials: string[];
  tools: string[];
  steps: MaintenanceStep[];
  /** Set when the task should not be attempted without a licensed trade. */
  proOnlyReason?: string;
}

export interface MaintenanceTemplate {
  id: string;
  title: string;
  appliesTo: ComponentCategory[];
  /**
   * Narrows which components this applies to, matched against `type` and `name` as
   * whole words (case-insensitive). Whole words matter: a plain substring match
   * makes "washer" hit "dishwasher" and puts washing-machine hose inspections on
   * the dishwasher. Alternation is allowed, e.g. `'furnace|air handler'`.
   */
  typeMatch?: string;
  /**
   * Which component a system-level task should hang off.
   *
   * Some jobs belong to a system rather than to each part of it: one filter serves
   * the furnace and the condenser together, and one gutter cleaning covers the roof.
   * When set, the task is created only for components matching this pattern, so a
   * two-system home still gets two filter reminders while a one-system home gets one
   * instead of one per box. If nothing matches the anchor, a single task is created
   * against the first matching component rather than none.
   */
  anchorType?: string;
  /** How often the task recurs. */
  intervalMonths: number;
  /** Preferred calendar months (1–12) to schedule in, for seasonal work. */
  seasonalMonths?: number[];
  /** Consequence of skipping it — drives priority and the health penalty. */
  criticality: 'safety' | 'high' | 'medium' | 'low';
  why: string;
  diy: DiyGuidance;
  /** Typical range a contractor charges, in cents. */
  hireCostRangeCents: [Cents, Cents];
  /** True when this task exists for every home, with or without a matching component. */
  wholeHome?: boolean;
}

export interface MaintenanceCompletion {
  id: string;
  homeId: string;
  templateId: string;
  componentId?: string;
  completedOn: ISODate;
  performedBy: 'diy' | 'pro';
  costCents?: Cents;
  vendor?: string;
  notes?: string;
  timelineEventId?: string;
}

/** A task instance produced by the scheduler. Not persisted — derived from components + completions. */
export interface ScheduledTask {
  /** Stable across regenerations: `${templateId}:${componentId ?? 'home'}`. */
  key: string;
  templateId: string;
  componentId?: string;
  componentName?: string;
  title: string;
  why: string;
  dueDate: ISODate;
  urgency: TaskUrgency;
  criticality: MaintenanceTemplate['criticality'];
  lastCompletedOn?: ISODate;
  daysUntilDue: number;
  diy: DiyGuidance;
  hireCostRangeCents: [Cents, Cents];
}

export type ServiceRequestStatus =
  | 'draft'
  | 'submitted'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export interface ServiceRequest {
  id: string;
  homeId: string;
  componentId?: string;
  taskKey?: string;
  title: string;
  problemDescription: string;
  urgency: 'emergency' | 'soon' | 'routine';
  status: ServiceRequestStatus;
  providerId?: string;
  photoIds: string[];
  /** Snapshot of the record shared with the provider, so the packet is reproducible later. */
  packet: ServiceRequestPacket;
  createdAt: ISODateTime;
  submittedAt?: ISODateTime;
  completedAt?: ISODateTime;
  /** Set once a dispatch server has acknowledged it. Absent means it never left the phone. */
  delivery?: ServiceRequestDelivery;
}

/**
 * Where a request sits on the provider's side.
 *
 * A superset of `ServiceRequestStatus`: the phone only ever needed draft →
 * submitted → done, but a dispatcher works a queue and needs the states in
 * between to be distinguishable — acknowledged is not quoted, and quoted is not
 * scheduled.
 */
export type DispatchStatus =
  | 'submitted'
  | 'acknowledged'
  | 'quoted'
  | 'scheduled'
  | 'completed'
  | 'declined'
  | 'cancelled';

/** What happened when the request was sent to a provider's dispatch server. */
export interface ServiceRequestDelivery {
  /** The id the dispatch server filed it under. */
  remoteId: string;
  /** Secret for reading this one request back. Stays on the device. */
  trackingToken: string;
  deliveredAt: ISODateTime;
  /** Status as of the last poll, which can move ahead of the local copy. */
  remoteStatus?: DispatchStatus;
  /** What the provider has said back: a quote, a scheduled window, a note. */
  providerNote?: string;
  scheduledFor?: ISODateTime;
  quotedCents?: number;
  lastPolledAt?: ISODateTime;
}

export interface ServiceRequestPacket {
  homeSummary: string;
  /**
   * Where to send the truck, and who to ask for. Present only because the owner
   * pressed send on this specific request — everything here is spelled out on the
   * compose screen before it goes.
   */
  contact: {
    /** Street, city, state, postal code — as much as the record holds. */
    address?: string;
    ownerName?: string;
    phone?: string;
  };
  equipment?: {
    name: string;
    type: string;
    manufacturer?: string;
    modelNumber?: string;
    serialNumber?: string;
    ageSummary: string;
    specs: { label: string; value: string; provenance: Provenance }[];
    warrantyStatus: string;
  };
  relevantHistory: { date: ISODate; title: string; vendor?: string }[];
  problem: string;
  photoCount: number;
  generatedAt: ISODateTime;
}

export interface Provider {
  id: string;
  name: string;
  trades: ComponentCategory[];
  serviceArea: string;
  phone?: string;
  blurb?: string;
  isLaunchPartner?: boolean;
}

/**
 * A property.
 *
 * Deliberately holds nothing about a person. Who lives here, who owns it, and
 * who may see it are memberships and ownership periods in `account.ts` — which
 * is what lets this object survive being sold rather than being copied between
 * two people's accounts.
 */
export interface Home {
  id: string;
  /** Quotable identifier, stable for the life of the building. `DW-829173`. */
  publicId: string;
  propertyType: PropertyType;
  nickname: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  yearBuilt?: number;
  squareFeet?: number;
  /** Rough climate bucket; nudges seasonal scheduling and corrosion-sensitive lifespans. */
  climate: 'humid_subtropical' | 'temperate' | 'cold' | 'arid' | 'coastal';
  /** Start of the current ownership period. Mirrored here so age maths stays local. */
  ownedSince?: ISODate;
  createdAt: ISODateTime;
}

/** Everything about one property, as held in the app. */
export interface HomeRecord {
  home: Home;
  /**
   * Who is looking at this record, and what they may do with it.
   *
   * Not part of the property. It rides along because two things need it: a
   * service request needs a name and a callback number for the contractor, and
   * screens need to know whether this viewer may see costs or manage members.
   * When the house is sold, none of it goes with the property.
   */
  viewer?: {
    accountId: string;
    displayName: string;
    phone?: string;
    role: Role;
  };
  components: HomeComponent[];
  events: TimelineEvent[];
  documents: DocumentRef[];
  completions: MaintenanceCompletion[];
  serviceRequests: ServiceRequest[];
}

/* ---------------------------------------------------------------------------
 * Engine output types
 * ------------------------------------------------------------------------- */

export type HealthStatus = 'good' | 'monitor' | 'aging' | 'plan_replacement' | 'unknown';

export interface ComponentHealth {
  componentId: string;
  name: string;
  category: ComponentCategory;
  status: HealthStatus;
  /** 0–100 for this component. */
  score: number;
  /** How much this component moved the overall number. */
  weight: number;
  ageYears?: number;
  expectedLifeYears?: number;
  /** Age ÷ expected life. Undefined when age is unknown. */
  lifeUsedFraction?: number;
  ageProvenance: Provenance;
  /** Plain-language reasons, each tagged fact vs estimate. */
  reasons: HealthReason[];
  overdueTaskCount: number;
}

export interface HealthReason {
  text: string;
  basis: 'fact' | 'estimate';
}

export interface HomeHealth {
  /** 0–100. */
  score: number;
  /** 0–1: how much of the score rests on documented facts rather than defaults. */
  dataConfidence: number;
  components: ComponentHealth[];
  /** Components with no usable age or identification. */
  unknownComponentIds: string[];
  summary: string;
  generatedOn: ISODate;
}

export interface ForecastLineItem {
  kind: 'replacement' | 'maintenance';
  componentId?: string;
  label: string;
  /** Expected (probability-weighted) cost inside the horizon, in cents. */
  expectedCents: Cents;
  /** Full cost if the work happens, in cents. */
  fullCostCents: Cents;
  /** Probability the replacement lands inside the horizon (1 for recurring maintenance). */
  probability: number;
  /** Most likely year the replacement is needed. */
  likelyYear?: number;
  basis: 'fact' | 'estimate';
  note: string;
}

export interface ForecastHorizon {
  years: number;
  totalCents: Cents;
  items: ForecastLineItem[];
}

export interface FinancialForecast {
  horizons: { oneYear: ForecastHorizon; threeYear: ForecastHorizon; fiveYear: ForecastHorizon };
  /** Suggested monthly set-aside, in cents, rounded to a friendly number. */
  suggestedMonthlyReserveCents: Cents;
  /** How much of the forecast rests on documented equipment ages. */
  confidence: number;
  generatedOn: ISODate;
}

export interface SpendSummary {
  totalCents: Cents;
  byCategory: { category: ComponentCategory | 'unassigned'; totalCents: Cents }[];
  eventCount: number;
}
