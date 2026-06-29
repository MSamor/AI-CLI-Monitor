import type { LedCommand, MonitorSnapshot } from './types'

export type SnapshotListener = (snapshot: MonitorSnapshot) => void

export type AiMonitorApi = {
  getSnapshot: () => Promise<MonitorSnapshot>
  onSnapshot: (listener: SnapshotListener) => () => void
  setManualLed: (command: LedCommand) => Promise<void>
  reconnectBle: () => Promise<void>
  useMockBle: () => Promise<void>
  setDesktopIslandEnabled: (enabled: boolean) => Promise<void>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
}
