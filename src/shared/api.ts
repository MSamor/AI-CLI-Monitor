import type { LedCommand, MonitorSnapshot } from './types'

export type SnapshotListener = (snapshot: MonitorSnapshot) => void
export type DesktopIslandBlurListener = () => void

export type AiMonitorApi = {
  getSnapshot: () => Promise<MonitorSnapshot>
  onSnapshot: (listener: SnapshotListener) => () => void
  onDesktopIslandBlurred: (listener: DesktopIslandBlurListener) => () => void
  setManualLed: (command: LedCommand) => Promise<void>
  reconnectBle: () => Promise<void>
  useMockBle: () => Promise<void>
  setDesktopIslandEnabled: (enabled: boolean) => Promise<void>
  setDesktopIslandExpanded: (expanded: boolean) => Promise<void>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
}
