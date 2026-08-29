import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { today } from '../core/dates';
import { buildServiceRequestPacket } from '../core/engine/serviceRequest';
import type {
  DocumentRef,
  Home,
  HomeComponent,
  HomeRecord,
  ISODate,
  MaintenanceCompletion,
  MediaRef,
  ScheduledTask,
  ServiceRequest,
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
    }),
    {
      name: 'homestead-record-v1',
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
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

/** Assembles the store into the shape every engine expects. */
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

export function useHomeRecord(): HomeRecord | undefined {
  return useStore(selectRecord);
}

export function useToday(): ISODate {
  return today();
}
