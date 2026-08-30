import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Light or dark, or whatever the phone is doing.
 *
 * Kept in its own store rather than in the home record's, on purpose. This is a
 * preference about *this device* — it does not belong to the property, it does
 * not transfer when the house is sold, and it should survive erasing the record
 * as readily as it survives adding a second home. Folding it into the record
 * store would put it inside the same persisted blob that gets migrated,
 * transferred and reset, and it has nothing to do with any of that.
 *
 * `system` is the default and stays an explicit option rather than being implied
 * by the absence of a choice: somebody who has picked dark and later wants their
 * phone to decide again needs a way back.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_OPTIONS: { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

interface AppearanceState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const useAppearance = create<AppearanceState>()(
  persist(
    (set) => ({
      preference: 'system',
      setPreference: (preference) => set({ preference }),
    }),
    {
      name: 'dwella.appearance.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/**
 * The preference alone, selected narrowly.
 *
 * Every themed component in the app calls `useTheme`, which calls this. Handing
 * back the whole store object would re-render all of them whenever any field
 * changed; zustand compares with `Object.is`, so the selector has to return the
 * primitive.
 */
export function useThemePreference(): ThemePreference {
  return useAppearance((s) => s.preference);
}
