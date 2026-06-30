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
import { UpdateManager } from './update/updateManager'
import { IPC_CHANNELS } from '../shared/ipc'

const preloadPath = join(__dirname, '../preload/index.mjs')
const trayFallbackIcon =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAjElEQVR42mNgoBLgYWBgcCAR8yBrfs7AwPCfRPwcZogDVABEKxCJkfXAOREkOD8CmwGPGRgY7hOJH2MzAOQ0DuTAwQMUcBnQz8DAcJuBgUGDXAMkGBgYjjMwMLxmYGCwIccABqgh76HRRBUXJACJBih2ICcMQGL7oTgBnwEOUI06pCYkipMyxZmJIgAAr/Fa0HL/Na8AAAAASUVORK5CYII='

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let stateManager: StateManager | undefined
let preferences: PreferencesStore | undefined
let toolIntegrationManager: ToolIntegrationManager | undefined
let claudeHookServer: ClaudeHookServer | undefined
let codexWatcher: CodexProcessWatcher | undefined
let desktopIsland: DesktopIslandController | undefined
let updateManager: UpdateManager | undefined
let isQuitting = false

function loadImageAsset(fileName: string): Electron.NativeImage | undefined {
  const candidatePaths = app.isPackaged
    ? [join(process.resourcesPath, fileName), join(app.getAppPath(), 'build', fileName)]
    : [join(app.getAppPath(), 'build', fileName), join(__dirname, '../../build', fileName)]

  for (const candidatePath of candidatePaths) {
    if (!existsSync(candidatePath)) {
      continue
    }

    const image = nativeImage.createFromPath(candidatePath)

    if (!image.isEmpty()) {
      return image
    }
  }

  return undefined
}

function setDockIcon(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const icon = loadImageAsset('icon.icns')

  if (icon) {
    app.dock.setIcon(icon)
  }
}

function createWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow
  }

  const appIcon = loadImageAsset('icon.icns')

  mainWindow = new BrowserWindow({
    width: 760,
    height: 440,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    frame: false,
    title: 'AI 命令行监听器',
    ...(appIcon ? { icon: appIcon } : {}),
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
  const icon =
    loadImageAsset('trayTemplate.png') ??
    nativeImage.createFromBuffer(Buffer.from(trayFallbackIcon, 'base64'))

  if (process.platform === 'darwin') {
    icon.setTemplateImage(true)
  }

  return icon
}

async function bootstrap(): Promise<void> {
  setDockIcon()

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

  updateManager = new UpdateManager(
    () => mainWindow,
    () => {
      isQuitting = true
      app.quit()
    }
  )
  void updateManager.checkOnStartup()
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
