import { create } from 'zustand'
import type { MonitorSnapshot } from '../../shared/types'

type MonitorStore = {
  snapshot?: MonitorSnapshot
  error?: string
  load: () => Promise<void>
  setSnapshot: (snapshot: MonitorSnapshot) => void
}

export const useMonitorStore = create<MonitorStore>((set) => ({
  snapshot: undefined,
  error: undefined,
  load: async () => {
    if (!window.aiMonitor) {
      set({
        error:
          'Electron preload API is unavailable. Restart the app after rebuilding the preload bundle.'
      })
      return
    }

    try {
      const snapshot = await window.aiMonitor.getSnapshot()
      set({ snapshot, error: undefined })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : String(error)
      })
    }
  },
  setSnapshot: (snapshot) => set({ snapshot, error: undefined })
}))
