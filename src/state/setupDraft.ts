import { create } from 'zustand';
import type { AddressSuggestion } from '../core/address';
import type { Relationship } from '../core/account';

/**
 * The half-finished property, between screens.
 *
 * Deliberately not persisted. Setup is a sixty-second walk from an address to a
 * first scan; if somebody abandons it halfway, the right thing on their return
 * is a clean start rather than a resurrected fragment of a building they thought
 * better of adding. Nothing here has been committed to the record yet — the
 * property is created in one go at the end of the relationship step.
 */
interface SetupDraft {
  address?: AddressSuggestion;
  relationship?: Relationship;
  setAddress: (address: AddressSuggestion) => void;
  setRelationship: (relationship: Relationship) => void;
  reset: () => void;
}

const useDraft = create<SetupDraft>((set) => ({
  address: undefined,
  relationship: undefined,
  setAddress: (address) => set({ address }),
  setRelationship: (relationship) => set({ relationship }),
  reset: () => set({ address: undefined, relationship: undefined }),
}));

export function useSetupDraft() {
  const address = useDraft((s) => s.address);
  const relationship = useDraft((s) => s.relationship);
  const setAddress = useDraft((s) => s.setAddress);
  const setRelationship = useDraft((s) => s.setRelationship);
  const reset = useDraft((s) => s.reset);
  return {
    address,
    relationship,
    addressLine1: address?.line1,
    setAddress,
    setRelationship,
    reset,
  };
}
