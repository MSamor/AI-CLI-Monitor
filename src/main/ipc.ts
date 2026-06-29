import { ipcMain } from 'electron'
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
  // The renderer only talks through these handlers; all Node/Electron side
  // effects stay in the main process.
  ipcMain.handle(IPC_CHANNELS.getSnapshot, () => stateManager.getSnapshot())

  ipcMain.handle(IPC_CHANNELS.setManualLed, async (_event, command: LedCommand) => {
    await stateManager.setManualLed(command)
  })

  ipcMain.handle(IPC_CHANNELS.reconnectBle, async () => {
    const ble = await createBleTransport(process.env.AI_MONITOR_BLE === 'mock')
    await stateManager.replaceBleTransport(ble, 'BLE transport recreated.')
  })

  ipcMain.handle(IPC_CHANNELS.useMockBle, async () => {
    await stateManager.replaceBleTransport(
      new MockBleTransport('Mock BLE transport was selected from the dashboard.'),
      'Switched to mock BLE transport.'
    )
  })

  ipcMain.handle(IPC_CHANNELS.setDesktopIslandEnabled, async (_event, enabled: boolean) => {
    if (enabled) {
      desktopIsland.show()
      return
    }

    desktopIsland.hide()
  })
}
