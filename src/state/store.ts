import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { today } from '../core/dates';
import {
  NO_SUBSCRIPTION,
  startTrial,
  trialAvailable,
  type MeteredKey,
  type Subscription,
  type SubscriptionSource,
} from '../core/entitlements';
import { buildServiceRequestPacket } from '../core/engine/serviceRequest';
import type {
  DispatchStatus,
  DocumentRef,
  Home,
  HomeComponent,
  HomeRecord,
  ISODate,
  MaintenanceCompletion,
  MediaRef,
  ScheduledTask,
  ServiceRequest,
  ServiceRequestDelivery,
  TimelineEvent,
} from '../core/types';
import { newId, nowISO } from './ids';

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
  home?: Home;
  components: HomeComponent[];
  events: TimelineEvent[];
  documents: DocumentRef[];
  completions: MaintenanceCompletion[];
  serviceRequests: ServiceRequest[];
  media: MediaRef[];
  assistantMessages: AssistantMessage[];
  hydrated: boolean;

  /* Home */
  createHome: (input: Omit<Home, 'id' | 'createdAt'>) => Home;
  updateHome: (patch: Partial<Home>) => void;
  resetEverything: () => void;
  loadRecord: (record: HomeRecord, media?: MediaRef[]) => void;

  /* Components */
  addComponent: (input: Omit<HomeComponent, 'id' | 'homeId' | 'createdAt' | 'updatedAt'>) => HomeComponent;
  updateComponent: (id: string, patch: Partial<HomeComponent>) => void;
  removeComponent: (id: string) => void;
  retireComponent: (id: string, on: ISODate) => void;

  /* Timeline */
  addEvent: (input: Omit<TimelineEvent, 'id' | 'homeId' | 'createdAt'>) => TimelineEvent;
  updateEvent: (id: string, patch: Partial<TimelineEvent>) => void;
  removeEvent: (id: string) => void;

  /* Documents & media */
  addDocument: (input: Omit<DocumentRef, 'id' | 'addedAt'>) => DocumentRef;
  addMedia: (input: Omit<MediaRef, 'id' | 'capturedAt'>) => MediaRef;

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

  /* Plan */
  subscription: Subscription;
  usage: UsageState;
  beginTrial: () => void;
  /** Records a real store purchase. Called by the billing layer, not by a screen. */
  activateSubscription: (params: {
    source: Extract<SubscriptionSource, 'app_store' | 'play_store' | 'promo'>;
    renewsOn?: ISODate;
    billingReference?: string;
  }) => void;
  cancelSubscription: () => void;
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

const EMPTY = {
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
      home: undefined,
      ...EMPTY,
      hydrated: false,

      createHome: (input) => {
        const home: Home = { ...input, id: newId('home'), createdAt: nowISO() };
        set({ home });
        return home;
      },

      updateHome: (patch) =>
        set((state) => (state.home ? { home: { ...state.home, ...patch } } : state)),

      resetEverything: () => set({ home: undefined, ...EMPTY }),

      loadRecord: (record, media = []) =>
        set({
          home: record.home,
          components: record.components,
          events: record.events,
          documents: record.documents,
          completions: record.completions,
          serviceRequests: record.serviceRequests,
          media,
          assistantMessages: [],
        }),

      addComponent: (input) => {
        const home = get().home;
        if (!home) throw new Error('Create a home before adding equipment.');
        const component: HomeComponent = {
          ...input,
          id: newId('cmp'),
          homeId: home.id,
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
        const home = get().home;
        if (!home) throw new Error('Create a home before adding history.');
        const event: TimelineEvent = {
          ...input,
          id: newId('evt'),
          homeId: home.id,
          createdAt: nowISO(),
        };
        set((state) => ({ events: [...state.events, event] }));
        return event;
      },

      updateEvent: (id, patch) =>
        set((state) => ({ events: state.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),

      removeEvent: (id) => set((state) => ({ events: state.events.filter((e) => e.id !== id) })),

      addDocument: (input) => {
        const doc: DocumentRef = { ...input, id: newId('doc'), addedAt: nowISO() };
        set((state) => ({ documents: [...state.documents, doc] }));
        return doc;
      },

      addMedia: (input) => {
        const media: MediaRef = { ...input, id: newId('med'), capturedAt: nowISO() };
        set((state) => ({ media: [...state.media, media] }));
        return media;
      },

      completeTask: ({ task, completedOn, performedBy, costCents, vendor, notes, addToTimeline }) => {
        const home = get().home;
        if (!home) return;
        const completionId = newId('cpl');
        const shouldLog = addToTimeline ?? (costCents !== undefined || vendor !== undefined);

        let timelineEventId: string | undefined;
        if (shouldLog) {
          const event: TimelineEvent = {
            id: newId('evt'),
            homeId: home.id,
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
          homeId: home.id,
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
        const home = state.home;
        if (!home) throw new Error('Create a home before requesting service.');
        const record: HomeRecord = {
          home,
          components: state.components,
          events: state.events,
          documents: state.documents,
          completions: state.completions,
          serviceRequests: state.serviceRequests,
        };
        const component = componentId ? state.components.find((c) => c.id === componentId) : undefined;
        const request: ServiceRequest = {
          id: newId('req'),
          homeId: home.id,
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
        const home = state.home;
        if (!request || !home) return;

        // The contractor's completed work becomes a permanent part of the record —
        // this is the loop that keeps the history growing without owner data entry.
        const event: TimelineEvent = {
          id: newId('evt'),
          homeId: home.id,
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

      subscription: NO_SUBSCRIPTION,
      usage: EMPTY_USAGE(today()),

      beginTrial: () =>
        set((state) =>
          // One trial per household, ever. Checked here rather than only at the
          // button, so no screen can hand out a second by calling this twice.
          trialAvailable(state.subscription) ? { subscription: startTrial(today()) } : state,
        ),

      activateSubscription: ({ source, renewsOn, billingReference }) =>
        set((state) => ({
          subscription: {
            ...state.subscription,
            source,
            renewsOn,
            billingReference,
          },
        })),

      /*
       * Drops back to whatever the trial history was, so cancelling a paid plan
       * does not hand out a fresh trial. The store remains the authority on
       * whether the subscription is live; this only reflects that locally.
       */
      cancelSubscription: () =>
        set((state) => ({
          subscription: {
            source: 'none',
            trialStartedOn: state.subscription.trialStartedOn,
            trialEndsOn: state.subscription.trialEndsOn,
          },
        })),

      countUsage: (key) =>
        set((state) => {
          const usage = rolled(state.usage, today());
          return { usage: { ...usage, monthly: { ...usage.monthly, [key]: usage.monthly[key] + 1 } } };
        }),
    }),
    {
      name: 'dwella-record-v1',
      storage: createJSONStorage(() => AsyncStorage),
      // Conversation scrollback is not part of the home's permanent record.
      partialize: (state) => ({
        home: state.home,
        components: state.components,
        events: state.events,
        documents: state.documents,
        completions: state.completions,
        serviceRequests: state.serviceRequests,
        media: state.media,
        subscription: state.subscription,
        usage: state.usage,
      }),
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
  if (!state.home) return undefined;
  return {
    home: state.home,
    components: state.components,
    events: state.events,
    documents: state.documents,
    completions: state.completions,
    serviceRequests: state.serviceRequests,
  };
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
  const home = useStore((s) => s.home);
  const components = useStore((s) => s.components);
  const events = useStore((s) => s.events);
  const documents = useStore((s) => s.documents);
  const completions = useStore((s) => s.completions);
  const serviceRequests = useStore((s) => s.serviceRequests);

  return useMemo(
    () =>
      home ? { home, components, events, documents, completions, serviceRequests } : undefined,
    [home, components, events, documents, completions, serviceRequests],
  );
}

export function useToday(): ISODate {
  return today();
}
