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
          '预加载通信接口不可用。请重新构建并重启应用。'
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
