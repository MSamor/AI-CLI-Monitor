import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { LedCommand } from '../shared/types'
import { createBleTransport } from './ble/createBleTransport'
import { MockBleTransport } from './ble/mockBleTransport'
import type { DesktopIslandController } from './island/desktopIsland'
import type { StateManager } from './state/stateManager'

export function registerIpc(
  stateManager: StateManager,
  desktopIsland: DesktopIslandController
): void {
  // 渲染进程只通过这些 handler 通信，所有 Node/Electron 副作用都留在主进程。
  ipcMain.handle(IPC_CHANNELS.getSnapshot, () => stateManager.getSnapshot())

  ipcMain.handle(IPC_CHANNELS.setManualLed, async (_event, command: LedCommand) => {
    await stateManager.setManualLed(command)
  })

  ipcMain.handle(IPC_CHANNELS.reconnectBle, async () => {
    const ble = await createBleTransport(process.env.AI_MONITOR_BLE === 'mock')
    await stateManager.replaceBleTransport(ble, '蓝牙通道已重新创建。')
  })

  ipcMain.handle(IPC_CHANNELS.useMockBle, async () => {
    await stateManager.replaceBleTransport(
      new MockBleTransport('已从客户端切换到模拟蓝牙通道。'),
      '已切换为模拟蓝牙通道。'
    )
  })

  ipcMain.handle(IPC_CHANNELS.setDesktopIslandEnabled, async (_event, enabled: boolean) => {
    if (enabled) {
      desktopIsland.show()
      return
    }

    desktopIsland.hide()
  })

  ipcMain.handle(IPC_CHANNELS.setDesktopIslandExpanded, async (_event, expanded: boolean) => {
    desktopIsland.setExpanded(expanded)
  })

  ipcMain.handle(IPC_CHANNELS.minimizeWindow, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.closeWindow, async (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}
