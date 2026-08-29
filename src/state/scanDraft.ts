import { create } from 'zustand';
import type { ComponentIdentification } from '../ai/schemas';
import type { CapturedImage } from '../ui/capture';

/**
 * In-flight scan state, held separately from the persisted record.
 *
 * A scan is not part of the home's history until the owner has reviewed it and
 * saved it. Keeping the draft out of the persisted store means an abandoned scan
 * leaves nothing behind, and — more importantly — that nothing the model produced
 * can reach the permanent record without passing through the review screen.
 */
/**
 * A model identification plus the fields the owner fills in during review. The
 * install date is not something a photograph can establish — a date code on a
 * nameplate is when the unit was built, not when it was fitted — so it only ever
 * comes from the person.
 */
export type DraftIdentification = ComponentIdentification & { installedOn?: string };

interface ScanDraftState {
  images: CapturedImage[];
  categoryHint?: string;
  locationHint?: string;
  results: DraftIdentification[];
  guidance: string;
  unreadable: boolean;

  addImages: (images: CapturedImage[]) => void;
  removeImage: (uri: string) => void;
  setHints: (hints: { categoryHint?: string; locationHint?: string }) => void;
  setResults: (payload: { results: DraftIdentification[]; guidance: string; unreadable: boolean }) => void;
  updateResult: (index: number, patch: Partial<DraftIdentification>) => void;
  removeResult: (index: number) => void;
  reset: () => void;
}

export const useScanDraft = create<ScanDraftState>((set) => ({
  images: [],
  results: [],
  guidance: '',
  unreadable: false,

  addImages: (images) =>
    set((state) => ({
      images: [
        ...state.images,
        ...images.filter((next) => !state.images.some((existing) => existing.uri === next.uri)),
      ].slice(0, 6),
    })),

  removeImage: (uri) => set((state) => ({ images: state.images.filter((i) => i.uri !== uri) })),

  setHints: (hints) => set((state) => ({ ...state, ...hints })),

  setResults: ({ results, guidance, unreadable }) => set({ results, guidance, unreadable }),

  updateResult: (index, patch) =>
    set((state) => ({
      results: state.results.map((result, i) => (i === index ? { ...result, ...patch } : result)),
    })),

  removeResult: (index) => set((state) => ({ results: state.results.filter((_, i) => i !== index) })),

  reset: () => set({ images: [], results: [], guidance: '', unreadable: false, categoryHint: undefined, locationHint: undefined }),
}));
