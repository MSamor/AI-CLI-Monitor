import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc'
import type { LedCommand } from '../shared/types'
import { createBleTransport } from './ble/createBleTransport'
import { MockBleTransport } from './ble/mockBleTransport'
import type { ToolIntegrationManager } from './integrations/toolIntegrationManager'
import type { DesktopIslandController } from './island/desktopIsland'
import type { StateManager } from './state/stateManager'
import type { MonitoredTool } from '../shared/types'

export function registerIpc(
  stateManager: StateManager,
  desktopIsland: DesktopIslandController,
  toolIntegrationManager: ToolIntegrationManager
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

  ipcMain.handle(IPC_CHANNELS.refreshToolIntegrations, async () => {
    const integrations = await toolIntegrationManager.refresh()
    stateManager.setToolIntegrations(integrations)
  })

  ipcMain.handle(
    IPC_CHANNELS.setToolHookEnabled,
    async (_event, tool: MonitoredTool, enabled: boolean) => {
      if (tool !== 'claude' && tool !== 'codex') {
        throw new Error(`不支持的工具：${String(tool)}`)
      }

      const integrations = await toolIntegrationManager.setHookEnabled(tool, enabled)
      const integration = integrations[tool]
      const toolLabel = tool === 'claude' ? 'Claude' : 'Codex'
      const message =
        integration.hookStatus === 'error'
          ? `${toolLabel} hook 配置失败：${integration.diagnostic ?? '未知错误'}`
          : `${toolLabel} hook 已${enabled ? '开启' : '关闭'}。`

      stateManager.setToolIntegrations(
        integrations,
        message
      )
    }
  )

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
