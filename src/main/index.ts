import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { createBleTransport } from './ble/createBleTransport'
import { CodexProcessWatcher } from './cli/codexProcessWatcher'
import { ClaudeHookServer } from './hooks/claudeHookServer'
import { ToolIntegrationManager } from './integrations/toolIntegrationManager'
import { DesktopIslandController } from './island/desktopIsland'
import { registerIpc } from './ipc'
import { PreferencesStore } from './preferences'
import { StateManager } from './state/stateManager'
import { IPC_CHANNELS } from '../shared/ipc'

const preloadPath = join(__dirname, '../preload/index.mjs')
const trayFallbackIcon =
  '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'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let stateManager: StateManager | undefined
let preferences: PreferencesStore | undefined
let toolIntegrationManager: ToolIntegrationManager | undefined
let claudeHookServer: ClaudeHookServer | undefined
let codexWatcher: CodexProcessWatcher | undefined
let desktopIsland: DesktopIslandController | undefined
let isQuitting = false

function createWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  mainWindow = new BrowserWindow({
    width: 760,
    height: 440,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: 'AI 命令行监听器',
    backgroundColor: '#071016',
    webPreferences: {
      // electron-vite 会把 preload 输出为 ESM 文件，必须加载 index.mjs。
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    mainWindow?.hide()
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

function showMainWindow(): void {
  const window = createWindow()

  if (window.isMinimized()) {
    window.restore()
  }

  window.show()
  window.focus()
}

function createTray(): void {
  if (tray) {
    return
  }

  tray = new Tray(createTrayIcon())
  tray.setToolTip('AI CLI Monitor')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '打开窗口',
        click: showMainWindow
      },
      {
        label: '显示灵动岛',
        click: () => desktopIsland?.show()
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showMainWindow)
}

function createTrayIcon(): Electron.NativeImage {
  const iconPath = join(__dirname, '../../build/generated/icon.svg.png')

  if (existsSync(iconPath)) {
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })

    if (!icon.isEmpty()) {
      return icon
    }
  }

  const fallbackIcon = nativeImage.createFromBuffer(Buffer.from(trayFallbackIcon, 'base64')).resize({
    width: 16,
    height: 16
  })
  fallbackIcon.setTemplateImage(true)
  return fallbackIcon
}

async function bootstrap(): Promise<void> {
  const ble = await createBleTransport(process.env.AI_MONITOR_BLE === 'mock')
  preferences = new PreferencesStore()
  toolIntegrationManager = new ToolIntegrationManager()
  stateManager = new StateManager(ble)
  desktopIsland = new DesktopIslandController(stateManager, preferences)
  registerIpc(stateManager, desktopIsland, toolIntegrationManager)
  stateManager.setToolIntegrations(await toolIntegrationManager.refresh())

  stateManager.onSnapshot((snapshot) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.snapshotChanged, snapshot)
    }
  })

  await stateManager.start()

  claudeHookServer = new ClaudeHookServer(stateManager)
  await claudeHookServer.start()

  codexWatcher = new CodexProcessWatcher(stateManager)
  codexWatcher.start()

  createTray()
  createWindow()
  desktopIsland.show()
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    showMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (isQuitting && process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  codexWatcher?.stop()
  desktopIsland?.dispose()
  void claudeHookServer?.stop()
  void stateManager?.dispose()
})
