import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { today } from '../core/dates';
import {
  freeSubscription,
  startTrial,
  trialAvailable,
  type BillingCycle,
  type Charge,
  type CareVisit,
  type PaymentMethod,
  type PropertySubscription,
  type SubscriptionSource,
  type Tier,
} from '../core/billing';
import type { MeteredKey } from '../core/entitlements';
import {
  canRemoveMember,
  generatePublicId,
  opensOwnershipPeriod,
  roleForRelationship,
  householdFor,
  ownershipHistory,
  permissionsFor,
  type Account,
  type Membership,
  type OwnershipPeriod,
  type Permission,
  type Relationship,
  type Role,
} from '../core/account';
import { buildServiceRequestPacket } from '../core/engine/serviceRequest';
import type {
  DispatchStatus,
  DocumentRef,
  Home,
  HomeComponent,
  HomeRecord,
  ISODate,
  ISODateTime,
  MaintenanceCompletion,
  MediaRef,
  ScheduledTask,
  ServiceRequest,
  ServiceRequestDelivery,
  TimelineEvent,
} from '../core/types';
import { missingServiceEvents } from '../core/serviceLedger';
import {
  buildWaitlistEntry,
  type WaitlistDraft,
  type WaitlistEntry,
} from '../core/waitlist';
import { SAMPLE_HOME_PHOTO } from '../data/sampleHomePhoto';
import { newId, nowISO } from './ids';

/**
 * Marsh Point's record ID, quoted here so the v4 migration can recognise the
 * sample home without importing the whole sample dataset into the store.
 * A property ID belongs to the building for good, which is what makes it safe
 * to match on.
 */
const SAMPLE_PUBLIC_ID = 'DW-829173';

/**
 * The home record store.
 *
 * Everything lives on the device. That is a deliberate starting point for a product
 * whose whole promise is a permanent record: it works offline, in a basement, with
 * no account, and nothing leaves the phone until the owner chooses to send it — to
 * the AI gateway for a single scan, or to a contractor as a service request.
 *
 * The schedule, the health score, and the forecast are never stored. They are pure
 * functions of this state, recomputed on read, so a single logged completion
 * immediately and consistently reshapes everything downstream of it. Persisting
 * them would create two sources of truth that drift.
 */

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  /** Set when the answer came from the record rather than the model. */
  fromRecord?: boolean;
  citations?: { label: string; detail: string; componentId?: string }[];
  isGeneralKnowledge?: boolean;
  /** Set when the reply is the free plan's monthly allowance running out. */
  atAllowanceLimit?: boolean;
  followUps?: string[];
  error?: boolean;
}

interface StoreState {
  /** Who is signed in. One account, many properties. */
  account?: Account;
  /** Every property this device knows about. */
  properties: Home[];
  /** Who may do what, on which property. */
  memberships: Membership[];
  /** Who held each property, and when. Append-only. */
  ownership: OwnershipPeriod[];
  /** Which property the app is currently showing. */
  activePropertyId?: string;

  /*
   * Child records stay in flat arrays keyed by `homeId` rather than nested per
   * property. They already carried a `homeId`, the arrays stay small, and one
   * shape means one migration and one persistence format — nesting would mean
   * every action learning which bucket to write into.
   */
  components: HomeComponent[];
  events: TimelineEvent[];
  documents: DocumentRef[];
  completions: MaintenanceCompletion[];
  serviceRequests: ServiceRequest[];
  media: MediaRef[];
  assistantMessages: AssistantMessage[];
  hydrated: boolean;

  /* Account */
  signIn: (account: Account) => void;
  signOut: () => void;
  updateAccount: (patch: Partial<Account>) => void;

  /* Properties */
  addProperty: (
    input: Omit<Home, 'id' | 'publicId' | 'createdAt'> & { relationship?: Relationship },
  ) => Home;
  updateHome: (patch: Partial<Home>) => void;
  /**
   * Set or clear a property's photograph.
   *
   * Takes the property explicitly rather than patching the active one, because
   * My Homes lists every property and adding a picture there should not first
   * make you switch to that house.
   */
  setHomePhoto: (propertyId: string, photoUri: string | undefined) => void;
  setActiveProperty: (propertyId: string) => void;
  removeProperty: (propertyId: string) => void;
  resetEverything: () => void;
  loadRecord: (
    record: HomeRecord,
    media?: MediaRef[],
    billing?: {
      subscription: PropertySubscription;
      paymentMethod: Omit<PaymentMethod, 'id' | 'addedAt' | 'isDefault'>;
      careVisits: CareVisit[];
      charges: Omit<Charge, 'accountId'>[];
    },
  ) => void;

  /* Household */
  addMember: (input: {
    displayName: string;
    email?: string;
    role: Role;
    expiresAt?: ISODateTime;
  }) => Membership;
  updateMemberRole: (membershipId: string, role: Role) => void;
  removeMember: (membershipId: string) => void;

  /* Ownership */
  transferProperty: (params: { toName: string; on: ISODate }) => void;

  /* Components */
  addComponent: (input: Omit<HomeComponent, 'id' | 'homeId' | 'createdAt' | 'updatedAt'>) => HomeComponent;
  updateComponent: (id: string, patch: Partial<HomeComponent>) => void;
  removeComponent: (id: string) => void;
  retireComponent: (id: string, on: ISODate) => void;

  /* Timeline */
  addEvent: (input: Omit<TimelineEvent, 'id' | 'homeId' | 'createdAt'>) => TimelineEvent;
  updateEvent: (id: string, patch: Partial<TimelineEvent>) => void;
  removeEvent: (id: string) => void;
  /** Writes the Home Record entry for any Dwella service charge that lacks one. */
  reconcileServiceCharges: () => void;

  /* Documents & media */
  addDocument: (input: Omit<DocumentRef, 'id' | 'homeId' | 'addedAt'>) => DocumentRef;
  addMedia: (input: Omit<MediaRef, 'id' | 'homeId' | 'capturedAt'>) => MediaRef;

  /* Maintenance */
  completeTask: (params: {
    task: ScheduledTask;
    completedOn: ISODate;
    performedBy: 'diy' | 'pro';
    costCents?: number;
    vendor?: string;
    notes?: string;
    /** Log it on the timeline too. Defaults to true when there is a cost or a vendor. */
    addToTimeline?: boolean;
  }) => void;
  undoCompletion: (completionId: string) => void;

  /* Service requests */
  createServiceRequest: (params: {
    componentId?: string;
    taskKey?: string;
    title: string;
    problemDescription: string;
    urgency: ServiceRequest['urgency'];
    photoIds?: string[];
    providerId?: string;
  }) => ServiceRequest;
  submitServiceRequest: (id: string) => void;
  recordDelivery: (id: string, delivery: ServiceRequestDelivery) => void;
  applyRemoteStatus: (
    id: string,
    remote: {
      status: DispatchStatus;
      providerNote?: string;
      quotedCents?: number;
      scheduledFor?: string;
    },
  ) => void;
  completeServiceRequest: (params: {
    id: string;
    completedOn: ISODate;
    vendor: string;
    costCents?: number;
    description?: string;
    documentIds?: string[];
    photoIds?: string[];
  }) => void;
  cancelServiceRequest: (id: string) => void;

  /* Assistant */
  appendAssistantMessage: (message: Omit<AssistantMessage, 'id' | 'createdAt'>) => AssistantMessage;
  clearAssistant: () => void;

  /*
   * Billing is account-level; memberships are property-level.
   *
   * One card and one payment history for the person, one subscription per
   * building. Somebody can hold Care on their residence, Plus on a rental, and
   * nothing on the beach house — which is impossible to express if the plan is
   * a single field on the account.
   */
  subscriptions: PropertySubscription[];
  paymentMethods: PaymentMethod[];
  charges: Charge[];
  careVisits: CareVisit[];
  usage: UsageState;

  /**
   * People whose area Dwella has not opened yet.
   *
   * Kept in the record rather than fired off and forgotten, because until an
   * accounts server is configured there is nowhere to fire it off *to* — and a
   * waitlist that silently drops the entry is worse than no waitlist. Each entry
   * carries whether it actually reached Dwella, so the screen can say which.
   */
  waitlist: WaitlistEntry[];
  /** Records a waitlist entry. Returns undefined if the address had no ZIP. */
  joinWaitlist: (draft: WaitlistDraft) => WaitlistEntry | undefined;

  /** Starts the one-time trial on a property. */
  beginTrial: (propertyId?: string) => void;
  /** Records a real store purchase against one property. Called by the billing layer. */
  activateSubscription: (params: {
    propertyId: string;
    tier: Exclude<Tier, 'free'>;
    source: Extract<SubscriptionSource, 'app_store' | 'play_store' | 'promo'>;
    cycle?: BillingCycle;
    renewsOn?: ISODate;
    billingReference?: string;
  }) => void;
  changeTier: (propertyId: string, tier: Tier) => void;
  cancelSubscription: (propertyId: string) => void;
  /** Undoes a pending cancellation before the period it was paid for runs out. */
  resumeSubscription: (propertyId: string) => void;
  setPaymentMethod: (method: Omit<PaymentMethod, 'id' | 'addedAt' | 'isDefault'>) => void;
  removePaymentMethod: (id: string) => void;
  recordCareVisit: (propertyId: string, on: ISODate, note?: string) => void;
  /** Increments a metered counter, rolling the period first if the month has turned. */
  countUsage: (key: MeteredKey) => void;
}

/**
 * Metered usage, with the period stamped on it.
 *
 * The reset is computed from the stored month rather than scheduled, because a
 * phone that was off on the first of the month would otherwise never roll over,
 * and a homeowner would open the app to find their questions still spent.
 */
export interface UsageState {
  /** `YYYY-MM` the monthly counters belong to. */
  period: string;
  monthly: Record<MeteredKey, number>;
}

function currentPeriod(asOf: ISODate): string {
  return asOf.slice(0, 7);
}

const EMPTY_USAGE = (asOf: ISODate): UsageState => ({
  period: currentPeriod(asOf),
  monthly: { documents: 0, assistant: 0, problem_scan: 0 },
});

/** Rolls the monthly counters forward when the calendar month has changed. */
function rolled(usage: UsageState, asOf: ISODate): UsageState {
  const period = currentPeriod(asOf);
  return usage.period === period ? usage : EMPTY_USAGE(asOf);
}

/** One subscription per property, replaced rather than appended. */
function upsertSubscription(
  subscriptions: PropertySubscription[],
  next: PropertySubscription,
): PropertySubscription[] {
  const index = subscriptions.findIndex((s) => s.propertyId === next.propertyId);
  if (index === -1) return [...subscriptions, next];
  const copy = [...subscriptions];
  copy[index] = next;
  return copy;
}

export function subscriptionFor(
  subscriptions: PropertySubscription[],
  propertyId: string,
): PropertySubscription | undefined {
  return subscriptions.find((s) => s.propertyId === propertyId);
}

const EMPTY = {
  properties: [] as Home[],
  subscriptions: [] as PropertySubscription[],
  charges: [] as Charge[],
  careVisits: [] as CareVisit[],
  memberships: [] as Membership[],
  ownership: [] as OwnershipPeriod[],
  activePropertyId: undefined as string | undefined,
  components: [] as HomeComponent[],
  events: [] as TimelineEvent[],
  documents: [] as DocumentRef[],
  completions: [] as MaintenanceCompletion[],
  serviceRequests: [] as ServiceRequest[],
  media: [] as MediaRef[],
  assistantMessages: [] as AssistantMessage[],
};

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      account: undefined,
      ...EMPTY,
      // Deliberately not in EMPTY: `resetEverything` clears the home record,
      // and somebody's request to be told when Dwella reaches their street is
      // not part of it.
      waitlist: [],
      hydrated: false,

      signIn: (account) => set({ account }),

      /*
       * Signing out clears the session, not the records. On a device-local
       * build there is nowhere else for the record to live, and wiping a
       * homeowner's entire history because they tapped "sign out" would be
       * indefensible. Deleting data is `resetEverything`, which says so.
       */
      signOut: () => set({ account: undefined }),

      updateAccount: (patch) =>
        set((state) => (state.account ? { account: { ...state.account, ...patch } } : state)),

      addProperty: ({ relationship = 'owner', ...input }) => {
        const state = get();
        const account = state.account;
        const home: Home = {
          ...input,
          id: newId('home'),
          publicId: generatePublicId(),
          createdAt: nowISO(),
        };
        /*
         * Adding a property creates two things beside it: the membership that
         * makes it reachable, and the ownership period that starts its history.
         * A property with neither is orphaned the moment it exists.
         */
        const membership: Membership | undefined = account
          ? {
              id: newId('mem'),
              accountId: account.id,
              propertyId: home.id,
              role: roleForRelationship(relationship),
              relationship,
              displayName: account.displayName,
              email: account.email,
              addedAt: nowISO(),
            }
          : undefined;
        /*
         * Only an owner's tenure is a period of ownership. A renter or a letting
         * agent creating the record is not part of the building's chain of title
         * and must not appear in it — that history outlives all of them and is
         * what the next owner inherits.
         */
        const period: OwnershipPeriod | undefined = opensOwnershipPeriod(relationship)
          ? {
              id: newId('own'),
              propertyId: home.id,
              accountId: account?.id,
              ownerLabel: account?.displayName ?? 'Current owner',
              startedOn: input.ownedSince ?? today(),
            }
          : undefined;
        set((s) => ({
          properties: [...s.properties, home],
          memberships: membership ? [...s.memberships, membership] : s.memberships,
          ownership: period ? [...s.ownership, period] : s.ownership,
          activePropertyId: home.id,
        }));
        return home;
      },

      updateHome: (patch) =>
        set((state) => ({
          properties: state.properties.map((p) =>
            p.id === state.activePropertyId ? { ...p, ...patch } : p,
          ),
        })),

      setHomePhoto: (propertyId, photoUri) =>
        set((state) => ({
          properties: state.properties.map((p) => (p.id === propertyId ? { ...p, photoUri } : p)),
        })),

      setActiveProperty: (propertyId) =>
        set((state) =>
          state.properties.some((p) => p.id === propertyId)
            ? { activePropertyId: propertyId, assistantMessages: [] }
            : state,
        ),

      removeProperty: (propertyId) =>
        set((state) => {
          const remaining = state.properties.filter((p) => p.id !== propertyId);
          return {
            properties: remaining,
            memberships: state.memberships.filter((m) => m.propertyId !== propertyId),
            ownership: state.ownership.filter((o) => o.propertyId !== propertyId),
            components: state.components.filter((c) => c.homeId !== propertyId),
            events: state.events.filter((e) => e.homeId !== propertyId),
            documents: state.documents.filter((d) => d.homeId !== propertyId),
            completions: state.completions.filter((c) => c.homeId !== propertyId),
            serviceRequests: state.serviceRequests.filter((r) => r.homeId !== propertyId),
            media: state.media.filter((m) => m.homeId !== propertyId),
            activePropertyId:
              state.activePropertyId === propertyId ? remaining[0]?.id : state.activePropertyId,
          };
        }),

      resetEverything: () => set({ account: undefined, ...EMPTY }),

      loadRecord: (record, media = [], billing) =>
        set((state) => {
          const account =
            state.account ??
            (record.viewer
              ? {
                  id: record.viewer.accountId,
                  displayName: record.viewer.displayName,
                  phone: record.viewer.phone,
                  createdAt: nowISO(),
                }
              : undefined);
          // Charges carry the account id so a receipt can always be traced to
          // the person billed, not just the building it was for.
          const loadedCharges =
            billing && account
              ? billing.charges.map((c) => ({ ...c, accountId: account.id }))
              : state.charges;
          const membership: Membership | undefined = account
            ? {
                id: newId('mem'),
                accountId: account.id,
                propertyId: record.home.id,
                role: record.viewer?.role ?? 'owner',
                displayName: account.displayName,
                email: account.email,
                addedAt: nowISO(),
              }
            : undefined;
          return {
            account,
            properties: [...state.properties.filter((p) => p.id !== record.home.id), record.home],
            memberships: [
              ...state.memberships.filter((m) => m.propertyId !== record.home.id),
              ...(membership ? [membership] : []),
            ],
            ownership: [
              ...state.ownership.filter((o) => o.propertyId !== record.home.id),
              {
                id: newId('own'),
                propertyId: record.home.id,
                accountId: account?.id,
                ownerLabel: account?.displayName ?? 'Current owner',
                startedOn: record.home.ownedSince ?? today(),
              },
            ],
            activePropertyId: record.home.id,
            components: [...state.components.filter((c) => c.homeId !== record.home.id), ...record.components],
            /*
             * Work Dwella did and billed for becomes home history here rather
             * than being written into the fixture twice. The charge is the
             * origin; the timeline entry is derived from it, so the two can
             * never disagree about what happened or what it cost.
             */
            events: [
              ...state.events.filter((e) => e.homeId !== record.home.id),
              ...record.events,
              ...missingServiceEvents(loadedCharges, record.events, nowISO()).map(
                ({ propertyId, event }) => ({ ...event, id: newId('evt'), homeId: propertyId }),
              ),
            ],
            documents: [...state.documents.filter((d) => d.homeId !== record.home.id), ...record.documents],
            completions: [...state.completions.filter((c) => c.homeId !== record.home.id), ...record.completions],
            serviceRequests: [
              ...state.serviceRequests.filter((r) => r.homeId !== record.home.id),
              ...record.serviceRequests,
            ],
            media: [...state.media.filter((m) => m.homeId !== record.home.id), ...media],
            assistantMessages: [],
            // Charges carry the account id so a receipt can always be traced to
            // the person who was billed, not just the building it was for.
            subscriptions: billing
              ? upsertSubscription(state.subscriptions, billing.subscription)
              : state.subscriptions,
            paymentMethods: billing
              ? [{ ...billing.paymentMethod, id: newId('pm'), isDefault: true, addedAt: nowISO() }]
              : state.paymentMethods,
            careVisits: billing ? billing.careVisits : state.careVisits,
            charges: loadedCharges,
          };
        }),

      addMember: (input) => {
        const state = get();
        const propertyId = state.activePropertyId;
        if (!propertyId) throw new Error('Select a home before adding someone to it.');
        const membership: Membership = {
          id: newId('mem'),
          // Until there is a server to resolve an invitation, the person exists
          // only as a row on this property. `pending` says so honestly.
          accountId: newId('acct'),
          propertyId,
          role: input.role,
          displayName: input.displayName,
          email: input.email,
          addedAt: nowISO(),
          expiresAt: input.expiresAt,
          pending: true,
        };
        set((s) => ({ memberships: [...s.memberships, membership] }));
        return membership;
      },

      updateMemberRole: (membershipId, role) =>
        set((state) => ({
          memberships: state.memberships.map((m) => (m.id === membershipId ? { ...m, role } : m)),
        })),

      removeMember: (membershipId) =>
        set((state) =>
          canRemoveMember(state.memberships, membershipId).allowed
            ? { memberships: state.memberships.filter((m) => m.id !== membershipId) }
            : state,
        ),

      /*
       * A sale. The property object is untouched — same id, same public id, same
       * equipment and history. What changes is who can reach it and whose
       * ownership period is open. Nothing is copied between accounts, which is
       * the entire reason the record can outlive an owner.
       */
      transferProperty: ({ toName, on }) =>
        set((state) => {
          const propertyId = state.activePropertyId;
          if (!propertyId) return state;
          return {
            ownership: [
              ...state.ownership.map((o) =>
                o.propertyId === propertyId && !o.endedOn ? { ...o, endedOn: on } : o,
              ),
              {
                id: newId('own'),
                propertyId,
                ownerLabel: toName,
                startedOn: on,
              },
            ],
            // The seller's access ends with their ownership. On a device-local
            // build that means the property leaves this device.
            memberships: state.memberships.filter((m) => m.propertyId !== propertyId),
            properties: state.properties.filter((p) => p.id !== propertyId),
            activePropertyId: state.properties.find((p) => p.id !== propertyId)?.id,
          };
        }),

      addComponent: (input) => {
        const homeId = get().activePropertyId;
        if (!homeId) throw new Error('Select a home before adding equipment.');
        const component: HomeComponent = {
          ...input,
          id: newId('cmp'),
          homeId,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        };
        set((state) => ({ components: [...state.components, component] }));
        return component;
      },

      updateComponent: (id, patch) =>
        set((state) => ({
          components: state.components.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: nowISO() } : c,
          ),
        })),

      removeComponent: (id) =>
        set((state) => ({
          components: state.components.filter((c) => c.id !== id),
          // Detach history rather than deleting it — the work still happened to this house.
          events: state.events.map((e) => (e.componentId === id ? { ...e, componentId: undefined } : e)),
          completions: state.completions.filter((c) => c.componentId !== id),
        })),

      retireComponent: (id, on) =>
        set((state) => ({
          components: state.components.map((c) =>
            c.id === id ? { ...c, retiredOn: on, updatedAt: nowISO() } : c,
          ),
        })),

      addEvent: (input) => {
        const homeId = get().activePropertyId;
        if (!homeId) throw new Error('Select a home before adding history.');
        const event: TimelineEvent = {
          ...input,
          id: newId('evt'),
          homeId,
          createdAt: nowISO(),
        };
        set((state) => ({ events: [...state.events, event] }));
        return event;
      },

      /*
       * Turns Dwella's own completed work into home history.
       *
       * Called wherever charges can arrive — on load, after a migration — and
       * safe to call repeatedly: `missingServiceEvents` keys off
       * `sourceChargeId`, so a job already in the timeline is skipped rather
       * than entered again.
       */
      reconcileServiceCharges: () =>
        set((state) => {
          const pending = missingServiceEvents(state.charges, state.events, nowISO());
          if (pending.length === 0) return state;
          return {
            events: [
              ...state.events,
              ...pending.map(({ propertyId, event }) => ({
                ...event,
                id: newId('evt'),
                homeId: propertyId,
              })),
            ],
          };
        }),

      updateEvent: (id, patch) =>
        set((state) => ({ events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      removeEvent: (id) => set((state) => ({ events: state.events.filter((e) => e.id !== id) })),

      addDocument: (input) => {
        const homeId = get().activePropertyId;
        if (!homeId) throw new Error('Select a home before filing a document.');
        const doc: DocumentRef = { ...input, id: newId('doc'), homeId, addedAt: nowISO() };
        set((state) => ({ documents: [...state.documents, doc] }));
        return doc;
      },

      addMedia: (input) => {
        const homeId = get().activePropertyId;
        if (!homeId) throw new Error('Select a home before attaching a photo.');
        const media: MediaRef = { ...input, id: newId('med'), homeId, capturedAt: nowISO() };
        set((state) => ({ media: [...state.media, media] }));
        return media;
      },

      completeTask: ({ task, completedOn, performedBy, costCents, vendor, notes, addToTimeline }) => {
        const homeId = get().activePropertyId;
        if (!homeId) return;
        const completionId = newId('cpl');
        const shouldLog = addToTimeline ?? (costCents !== undefined || vendor !== undefined);

        let timelineEventId: string | undefined;
        if (shouldLog) {
          const event: TimelineEvent = {
            id: newId('evt'),
            homeId,
            componentId: task.componentId,
            date: completedOn,
            type: 'service',
            title: task.title,
            description: notes,
            costCents,
            vendor,
            documentIds: [],
            photoIds: [],
            source: performedBy === 'pro' ? 'contractor' : 'owner',
            visibility: 'transferable',
            createdAt: nowISO(),
          };
          timelineEventId = event.id;
          set((state) => ({ events: [...state.events, event] }));
        }

        const completion: MaintenanceCompletion = {
          id: completionId,
          homeId,
          templateId: task.templateId,
          componentId: task.componentId,
            completedOn,
          performedBy,
          costCents,
          vendor,
          notes,
          timelineEventId,
        };
        set((state) => ({ completions: [...state.completions, completion] }));
      },

      undoCompletion: (completionId) =>
        set((state) => {
          const completion = state.completions.find((c) => c.id === completionId);
          return {
            completions: state.completions.filter((c) => c.id !== completionId),
            events: completion?.timelineEventId
              ? state.events.filter((e) => e.id !== completion.timelineEventId)
              : state.events,
          };
        }),

      createServiceRequest: ({
        componentId,
        taskKey,
        title,
        problemDescription,
        urgency,
        photoIds = [],
        providerId,
      }) => {
        const state = get();
        const record = selectRecord(state);
        if (!record) throw new Error('Select a home before requesting service.');
        const homeId = record.home.id;
        const component = componentId ? state.components.find((c) => c.id === componentId) : undefined;
        const request: ServiceRequest = {
          id: newId('req'),
          homeId,
          componentId,
          taskKey,
          title,
          problemDescription,
          urgency,
          status: 'draft',
          providerId,
          photoIds,
          packet: buildServiceRequestPacket({
            record,
            component,
            problem: problemDescription,
            photoCount: photoIds.length,
          }),
          createdAt: nowISO(),
        };
        set((s) => ({ serviceRequests: [...s.serviceRequests, request] }));
        return request;
      },

      submitServiceRequest: (id) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) =>
            r.id === id ? { ...r, status: 'submitted' as const, submittedAt: nowISO() } : r,
          ),
        })),

      recordDelivery: (id, delivery) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) =>
            r.id === id ? { ...r, delivery: { ...r.delivery, ...delivery } } : r,
          ),
        })),

      /**
       * Folds a status read from the provider back into the local request.
       *
       * The provider's view is authoritative for the provider's own states, but
       * it never rewrites the local status wholesale: a request the owner has
       * cancelled on the phone stays cancelled, and only a real completion moves
       * the local copy to done. Everything else lives in `delivery`, so the two
       * sides can disagree without either silently overwriting the other.
       */
      applyRemoteStatus: (id, remote) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) => {
            if (r.id !== id || !r.delivery) return r;
            const local =
              r.status === 'cancelled' || r.status === 'completed'
                ? r.status
                : remote.status === 'completed'
                  ? ('completed' as const)
                  : remote.status === 'scheduled'
                    ? ('scheduled' as const)
                    : r.status;
            return {
              ...r,
              status: local,
              delivery: {
                ...r.delivery,
                remoteStatus: remote.status,
                providerNote: remote.providerNote,
                quotedCents: remote.quotedCents,
                scheduledFor: remote.scheduledFor,
                lastPolledAt: nowISO(),
              },
            };
          }),
        })),

      cancelServiceRequest: (id) =>
        set((state) => ({
          serviceRequests: state.serviceRequests.map((r) =>
            r.id === id ? { ...r, status: 'cancelled' as const } : r,
          ),
        })),

      completeServiceRequest: ({
        id,
        completedOn,
        vendor,
        costCents,
        description,
        documentIds = [],
        photoIds = [],
      }) => {
        const state = get();
        const request = state.serviceRequests.find((r) => r.id === id);
        const homeId = state.activePropertyId;
        if (!request || !homeId) return;

        // The contractor's completed work becomes a permanent part of the record —
        // this is the loop that keeps the history growing without owner data entry.
        const event: TimelineEvent = {
          id: newId('evt'),
          homeId,
          componentId: request.componentId,
          date: completedOn,
          type: 'repair',
          title: request.title,
          description: description ?? request.problemDescription,
          costCents,
          vendor,
          documentIds,
          photoIds,
          source: 'contractor',
          visibility: 'transferable',
          createdAt: nowISO(),
        };

        set((s) => ({
          events: [...s.events, event],
          serviceRequests: s.serviceRequests.map((r) =>
            r.id === id ? { ...r, status: 'completed' as const, completedAt: nowISO() } : r,
          ),
        }));
      },

      appendAssistantMessage: (message) => {
        const full: AssistantMessage = { ...message, id: newId('msg'), createdAt: nowISO() };
        set((state) => ({ assistantMessages: [...state.assistantMessages, full] }));
        return full;
      },

      clearAssistant: () => set({ assistantMessages: [] }),

      paymentMethods: [],
      usage: EMPTY_USAGE(today()),

      beginTrial: (propertyId) =>
        set((state) => {
          const id = propertyId ?? state.activePropertyId;
          if (!id) return state;
          const existing = subscriptionFor(state.subscriptions, id);
          // One trial per property, ever. Checked here rather than only at the
          // button, so no screen can hand out a second by calling this twice.
          if (!trialAvailable(existing)) return state;
          const started = startTrial(existing ?? freeSubscription(id, today()), today());
          return { subscriptions: upsertSubscription(state.subscriptions, started) };
        }),

      activateSubscription: ({ propertyId, tier, source, cycle = 'monthly', renewsOn, billingReference }) =>
        set((state) => {
          const existing = subscriptionFor(state.subscriptions, propertyId) ?? freeSubscription(propertyId, today());
          const updated: PropertySubscription = {
            ...existing,
            tier,
            source,
            cycle,
            renewsOn,
            billingReference,
            cancelledOn: undefined,
            startedOn: existing.tier === 'free' ? today() : existing.startedOn,
          };
          return { subscriptions: upsertSubscription(state.subscriptions, updated) };
        }),

      changeTier: (propertyId, tier) =>
        set((state) => {
          const existing = subscriptionFor(state.subscriptions, propertyId) ?? freeSubscription(propertyId, today());
          return {
            subscriptions: upsertSubscription(state.subscriptions, {
              ...existing,
              tier,
              // Moving between paid tiers keeps whatever is paying for it;
              // moving to free ends the billing relationship for this property.
              source: tier === 'free' ? 'none' : existing.source === 'none' ? 'promo' : existing.source,
              cancelledOn: undefined,
            }),
          };
        }),

      /*
       * Cancelling keeps the trial history, so it cannot be used to farm a
       * second free month, and keeps `renewsOn` so access continues to the end
       * of the period already paid for. Taking away what somebody has already
       * paid for on the day they cancel would be theft dressed as a feature.
       */
      cancelSubscription: (propertyId) =>
        set((state) => {
          const existing = subscriptionFor(state.subscriptions, propertyId);
          if (!existing) return state;
          return {
            subscriptions: upsertSubscription(state.subscriptions, {
              ...existing,
              source: existing.source === 'trial' ? 'none' : existing.source,
              tier: existing.source === 'trial' ? 'free' : existing.tier,
              cancelledOn: today(),
            }),
          };
        }),

      /*
       * Changing your mind before the period ends. Nothing lapsed, so nothing
       * needs to be re-bought: clearing the cancellation date is the whole
       * operation. A trial that was cancelled has already been moved to free and
       * cannot be resumed this way — `trialAvailable` still sees it as used.
       */
      resumeSubscription: (propertyId) =>
        set((state) => {
          const existing = subscriptionFor(state.subscriptions, propertyId);
          if (!existing?.cancelledOn) return state;
          return {
            subscriptions: upsertSubscription(state.subscriptions, {
              ...existing,
              cancelledOn: undefined,
            }),
          };
        }),

      setPaymentMethod: (method) =>
        set((state) => ({
          paymentMethods: [
            ...state.paymentMethods.map((m) => ({ ...m, isDefault: false })),
            { ...method, id: newId('pm'), isDefault: true, addedAt: nowISO() },
          ],
        })),

      removePaymentMethod: (id) =>
        set((state) => {
          const remaining = state.paymentMethods.filter((m) => m.id !== id);
          // Something has to be the default, or the next renewal has nowhere to go.
          if (remaining.length > 0 && !remaining.some((m) => m.isDefault)) {
            remaining[0] = { ...remaining[0]!, isDefault: true };
          }
          return { paymentMethods: remaining };
        }),

      /*
       * A waitlist entry is not part of any home's record — it belongs to a
       * house Dwella has no record of — so it sits beside them rather than in
       * one, and survives `resetEverything`'s account wipe for the same reason
       * it survives signing out: the person asked to be told when their area
       * opens, and forgetting that because they cleared an account they never
       * finished making would be losing the one thing they gave us.
       */
      joinWaitlist: (draft) => {
        const entry = buildWaitlistEntry(draft, newId('wl'), nowISO());
        if (!entry) return undefined;
        // Same email, same area, twice: keep the newer consents, not a duplicate
        // that would count as two homes when deciding where to open next.
        set((state) => ({
          waitlist: [
            ...state.waitlist.filter(
              (e) => !(e.email === entry.email && e.postalCode === entry.postalCode),
            ),
            entry,
          ],
        }));
        return entry;
      },

      recordCareVisit: (propertyId, on, note) =>
        set((state) => ({
          careVisits: [...state.careVisits, { id: newId('visit'), propertyId, usedOn: on, note }],
        })),

      countUsage: (key) =>
        set((state) => {
          const usage = rolled(state.usage, today());
          return { usage: { ...usage, monthly: { ...usage.monthly, [key]: usage.monthly[key] + 1 } } };
        }),
    }),
    {
      name: 'dwella-record-v1',
      version: 5,
      storage: createJSONStorage(() => AsyncStorage),
      // Conversation scrollback is not part of the home's permanent record.
      partialize: (state) => ({
        account: state.account,
        properties: state.properties,
        memberships: state.memberships,
        ownership: state.ownership,
        activePropertyId: state.activePropertyId,
        components: state.components,
        events: state.events,
        documents: state.documents,
        completions: state.completions,
        serviceRequests: state.serviceRequests,
        media: state.media,
        subscriptions: state.subscriptions,
        paymentMethods: state.paymentMethods,
        charges: state.charges,
        careVisits: state.careVisits,
        waitlist: state.waitlist,
        usage: state.usage,
      }),
      /**
       * v1 → v2: one home becomes one account with one property.
       *
       * The old shape held a single `home` and assumed everything belonged to
       * it. Nothing here is thrown away: the property keeps its id, so every
       * child record's `homeId` still points at it, and it gains the public id,
       * type, membership, and ownership period the new model requires. Someone
       * who had a house before this change opens the app and finds the same
       * house, now switchable.
       */
      migrate: (persisted, version) => {
        /*
         * v2 → v3: the single account-wide subscription becomes a subscription
         * on the one property that existed when it was bought. Billing is now
         * account-level and plans are property-level, so an account-wide plan
         * has no home to belong to — and the only honest answer to "which house
         * was this for" is the one they had.
         */
        if (version === 2) {
          const v2 = persisted as {
            subscription?: {
              source?: string;
              trialStartedOn?: string;
              trialEndsOn?: string;
              renewsOn?: string;
              billingReference?: string;
            };
            properties?: Home[];
            [key: string]: unknown;
          };
          const target = v2.properties?.[0];
          const old = v2.subscription;
          const { subscription: _dropped, ...rest } = v2;
          return {
            ...rest,
            subscriptions:
              target && old && old.source !== 'none'
                ? [
                    {
                      id: `sub_${target.id}`,
                      propertyId: target.id,
                      tier: 'plus',
                      source: old.source,
                      cycle: 'monthly',
                      startedOn: old.trialStartedOn ?? target.createdAt.slice(0, 10),
                      renewsOn: old.renewsOn,
                      trialStartedOn: old.trialStartedOn,
                      trialEndsOn: old.trialEndsOn,
                      billingReference: old.billingReference,
                    },
                  ]
                : [],
            paymentMethods: [],
            charges: [],
            careVisits: [],
          } as never;
        }
        /*
         * v3 → v4: back-fill the Home Record entries for service work Dwella
         * had already carried out and billed. Those charges existed before the
         * timeline knew about them, so an account upgrading from v3 would
         * otherwise have a receipt for a job with no record of the job.
         */
        if (version === 3) {
          const v3 = persisted as { charges?: Charge[]; events?: TimelineEvent[]; [k: string]: unknown };
          const pending = missingServiceEvents(v3.charges ?? [], v3.events ?? [], nowISO());
          return {
            ...v3,
            events: [
              ...(v3.events ?? []),
              ...pending.map(({ propertyId, event }) => ({
                ...event,
                id: newId('evt'),
                homeId: propertyId,
              })),
            ],
          } as never;
        }
        /*
         * v4 → v5: give the sample home its picture.
         *
         * Only the sample, and only if it has none. A record written before
         * `photoUri` existed is otherwise stuck without one forever — the
         * sample data is read at load time, not merged into what is already
         * stored — so anybody who explored Marsh Point before this change would
         * keep looking at a house with no photograph and reasonably conclude
         * the feature had not shipped. A real property is left alone: an empty
         * photo there is a photo its owner has not taken yet, not a gap to fill.
         */
        if (version === 4) {
          const v4 = persisted as { properties?: Home[]; [k: string]: unknown };
          return {
            ...v4,
            properties: (v4.properties ?? []).map((p) =>
              p.publicId === SAMPLE_PUBLIC_ID && !p.photoUri
                ? { ...p, photoUri: SAMPLE_HOME_PHOTO }
                : p,
            ),
          } as never;
        }
        if (version >= 5) return persisted as never;
        const old = persisted as {
          home?: Home & { ownerName?: string; contactPhone?: string };
          documents?: DocumentRef[];
          media?: MediaRef[];
          [key: string]: unknown;
        };
        if (!old?.home) return { ...old, ...EMPTY } as never;

        const account: Account = {
          id: newId('acct'),
          displayName: old.home.ownerName?.trim() || 'You',
          phone: old.home.contactPhone,
          createdAt: nowISO(),
        };
        const { ownerName: _name, contactPhone: _phone, ...rest } = old.home;
        const property: Home = {
          ...rest,
          publicId: generatePublicId(),
          propertyType: 'primary',
        };
        return {
          ...old,
          home: undefined,
          account,
          properties: [property],
          activePropertyId: property.id,
          memberships: [
            {
              id: newId('mem'),
              accountId: account.id,
              propertyId: property.id,
              role: 'owner',
              displayName: account.displayName,
              addedAt: nowISO(),
            },
          ],
          ownership: [
            {
              id: newId('own'),
              propertyId: property.id,
              accountId: account.id,
              ownerLabel: account.displayName,
              startedOn: property.ownedSince ?? today(),
            },
          ],
          // Documents and media predate being property-scoped; they can only
          // have belonged to the one home that existed.
          documents: (old.documents ?? []).map((d) => ({ ...d, homeId: property.id })),
          media: (old.media ?? []).map((m) => ({ ...m, homeId: property.id })),
          subscriptions: [],
          paymentMethods: [],
          charges: [],
          careVisits: [],
        } as never;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/**
 * Assembles the store into the shape every engine expects.
 *
 * Only for non-reactive reads (inside actions, via `get()`). Do not pass this to
 * `useStore` — see `useHomeRecord` for why.
 */
export function selectRecord(state: StoreState): HomeRecord | undefined {
  const home = state.properties.find((p) => p.id === state.activePropertyId);
  if (!home) return undefined;
  const scoped = <T extends { homeId: string }>(rows: T[]) => rows.filter((r) => r.homeId === home.id);
  return {
    home,
    viewer: selectViewer(state, home.id),
    components: scoped(state.components),
    events: scoped(state.events),
    documents: scoped(state.documents),
    completions: scoped(state.completions),
    serviceRequests: scoped(state.serviceRequests),
  };
}

/** Who is looking, and what they may do here. Undefined when nobody is signed in. */
function selectViewer(state: StoreState, propertyId: string): HomeRecord['viewer'] {
  const account = state.account;
  if (!account) return undefined;
  const { role } = permissionsFor(state.memberships, {
    accountId: account.id,
    propertyId,
    now: nowISO(),
  });
  if (!role) return undefined;
  return { accountId: account.id, displayName: account.displayName, phone: account.phone, role };
}

/**
 * The home record, as a reference that only changes when the record actually does.
 *
 * Each slice is selected separately and reassembled under `useMemo`. Handing
 * `selectRecord` straight to `useStore` looks equivalent and is not: it builds a
 * fresh object on every call, and zustand v5 compares snapshots with `Object.is`,
 * so every render would produce a "new" value, re-render, and loop until React
 * gives up with "maximum update depth exceeded" — a blank screen.
 *
 * The stable reference matters downstream too. Every screen feeds this record into
 * a `useMemo` that recomputes the schedule, health score, and forecast; a new
 * identity each render would recompute all three on every keystroke.
 */
export function useHomeRecord(): HomeRecord | undefined {
  const account = useStore((s) => s.account);
  const properties = useStore((s) => s.properties);
  const memberships = useStore((s) => s.memberships);
  const activePropertyId = useStore((s) => s.activePropertyId);
  const components = useStore((s) => s.components);
  const events = useStore((s) => s.events);
  const documents = useStore((s) => s.documents);
  const completions = useStore((s) => s.completions);
  const serviceRequests = useStore((s) => s.serviceRequests);

  return useMemo(() => {
    const home = properties.find((p) => p.id === activePropertyId);
    if (!home) return undefined;
    const scoped = <T extends { homeId: string }>(rows: T[]) => rows.filter((r) => r.homeId === home.id);
    const role = account
      ? permissionsFor(memberships, { accountId: account.id, propertyId: home.id, now: nowISO() }).role
      : undefined;
    return {
      home,
      viewer:
        account && role
          ? { accountId: account.id, displayName: account.displayName, phone: account.phone, role }
          : undefined,
      components: scoped(components),
      events: scoped(events),
      documents: scoped(documents),
      completions: scoped(completions),
      serviceRequests: scoped(serviceRequests),
    };
  }, [
    account,
    properties,
    memberships,
    activePropertyId,
    components,
    events,
    documents,
    completions,
    serviceRequests,
  ]);
}

/** Waitlist entries recorded on this device. */
export function useWaitlist(): WaitlistEntry[] {
  return useStore((s) => s.waitlist);
}

/**
 * Every property this device holds, with the viewer's role on each.
 *
 * Feeds the home switcher. Sorted so the active one is findable and the rest are
 * in the order they were added, which is the order somebody thinks of them in.
 */
export function useProperties(): { home: Home; role?: Role; isActive: boolean }[] {
  const account = useStore((s) => s.account);
  const properties = useStore((s) => s.properties);
  const memberships = useStore((s) => s.memberships);
  const activePropertyId = useStore((s) => s.activePropertyId);

  return useMemo(
    () =>
      properties.map((home) => ({
        home,
        role: account
          ? permissionsFor(memberships, { accountId: account.id, propertyId: home.id, now: nowISO() })
              .role
          : undefined,
        isActive: home.id === activePropertyId,
      })),
    [properties, memberships, account, activePropertyId],
  );
}

/** What the signed-in viewer may do on the active property. */
/**
 * What the signed-in account is to the active property.
 *
 * Undefined when there is no membership, and treated as `owner` by callers when
 * a membership predates the field — that was the only thing the app could
 * create before relationships existed.
 */
export function useRelationship(): Relationship | undefined {
  const account = useStore((s) => s.account);
  const memberships = useStore((s) => s.memberships);
  const activePropertyId = useStore((s) => s.activePropertyId);
  return useMemo(() => {
    if (!account || !activePropertyId) return undefined;
    const mine = memberships.find(
      (m) => m.accountId === account.id && m.propertyId === activePropertyId,
    );
    return mine ? (mine.relationship ?? 'owner') : undefined;
  }, [account, memberships, activePropertyId]);
}

export function usePermissions(): { role?: Role; can: (permission: Permission) => boolean } {
  const account = useStore((s) => s.account);
  const memberships = useStore((s) => s.memberships);
  const activePropertyId = useStore((s) => s.activePropertyId);

  return useMemo(() => {
    if (!account || !activePropertyId) return { can: () => false };
    return permissionsFor(memberships, {
      accountId: account.id,
      propertyId: activePropertyId,
      now: nowISO(),
    });
  }, [account, memberships, activePropertyId]);
}

/** Everyone with access to the active property. */
export function useHousehold(): Membership[] {
  const memberships = useStore((s) => s.memberships);
  const activePropertyId = useStore((s) => s.activePropertyId);
  return useMemo(
    () => (activePropertyId ? householdFor(memberships, activePropertyId) : []),
    [memberships, activePropertyId],
  );
}

/** The ownership history of the active property, oldest first. */
export function useOwnership(): OwnershipPeriod[] {
  const ownership = useStore((s) => s.ownership);
  const activePropertyId = useStore((s) => s.activePropertyId);
  return useMemo(
    () => (activePropertyId ? ownershipHistory(ownership, activePropertyId) : []),
    [ownership, activePropertyId],
  );
}

export function useToday(): ISODate {
  return today();
}
