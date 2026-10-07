import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface PrintStationState {
  /** This device prints queued jobs (it must be on the shop WiFi). */
  enabled: boolean;
  setEnabled: (v: boolean) => void;
}

/** Per-device switch: only phones that sit on the shop's WiFi should pick up
 * print jobs — a phone on 4G would just fail them. */
export const usePrintStation = create<PrintStationState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'pos-print-station', storage: createJSONStorage(() => AsyncStorage as StateStorage) }
  )
);
