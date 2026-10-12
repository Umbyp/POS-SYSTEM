import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface KdsAlertState {
  /** Mutes the new-order chime + vibration (the on-screen flash always shows). */
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

export const useKdsAlert = create<KdsAlertState>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: 'pos-kds-alert', storage: createJSONStorage(() => AsyncStorage as StateStorage) }
  )
);
