import { contextBridge, ipcRenderer } from 'electron'
import type { AiMonitorApi, SnapshotListener } from '../shared/api'
import { IPC_CHANNELS } from '../shared/ipc'
import type { LedCommand, MonitorSnapshot } from '../shared/types'

// 渲染进程保持沙箱化，只暴露最小 IPC API，不直接暴露 Node/Electron 能力。
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
    ipcRenderer.invoke(IPC_CHANNELS.setDesktopIslandEnabled, enabled),
  setDesktopIslandExpanded: (expanded: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.setDesktopIslandExpanded, expanded),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.minimizeWindow),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.closeWindow)
}

contextBridge.exposeInMainWorld('aiMonitor', api)
