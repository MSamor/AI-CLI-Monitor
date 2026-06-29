import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createBleTransport } from './ble/createBleTransport'
import { CodexProcessWatcher } from './cli/codexProcessWatcher'
import { ClaudeHookServer } from './hooks/claudeHookServer'
import { DesktopIslandController } from './island/desktopIsland'
import { registerIpc } from './ipc'
import { StateManager } from './state/stateManager'
import { IPC_CHANNELS } from '../shared/ipc'

const preloadPath = join(__dirname, '../preload/index.mjs')

let mainWindow: BrowserWindow | undefined
let stateManager: StateManager | undefined
let claudeHookServer: ClaudeHookServer | undefined
let codexWatcher: CodexProcessWatcher | undefined
let desktopIsland: DesktopIslandController | undefined

function createWindow(): void {
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

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function bootstrap(): Promise<void> {
  const ble = await createBleTransport(process.env.AI_MONITOR_BLE === 'mock')
  stateManager = new StateManager(ble)
  desktopIsland = new DesktopIslandController(stateManager)
  registerIpc(stateManager, desktopIsland)

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

  createWindow()
}

app.whenReady().then(() => {
  void bootstrap()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  codexWatcher?.stop()
  desktopIsland?.dispose()
  void claudeHookServer?.stop()
  void stateManager?.dispose()
})
