import { contextBridge, ipcRenderer } from 'electron'
import type { AiMonitorApi, SnapshotListener } from '../shared/api'
import { IPC_CHANNELS } from '../shared/ipc'
import type { LedCommand, MonitorSnapshot } from '../shared/types'

// Keep the renderer sandboxed: expose a small typed API instead of Node or
// Electron primitives.
const api: AiMonitorApi = {
  getSnapshot: () => ipcRenderer.invoke(IPC_CHANNELS.getSnapshot) as Promise<MonitorSnapshot>,
  onSnapshot: (listener: SnapshotListener) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: MonitorSnapshot): void => {
      listener(snapshot)
    }

    ipcRenderer.on(IPC_CHANNELS.snapshotChanged, handler)

    return () => {
      ipcRenderer.off(IPC_CHANNELS.snapshotChanged, handler)
    }
  },
  setManualLed: (command: LedCommand) => ipcRenderer.invoke(IPC_CHANNELS.setManualLed, command),
  reconnectBle: () => ipcRenderer.invoke(IPC_CHANNELS.reconnectBle),
  useMockBle: () => ipcRenderer.invoke(IPC_CHANNELS.useMockBle),
  setDesktopIslandEnabled: (enabled: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setDesktopIslandEnabled, enabled)
}

contextBridge.exposeInMainWorld('aiMonitor', api)
