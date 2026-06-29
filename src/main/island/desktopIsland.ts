import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { MonitorSnapshot } from '../../shared/types'
import type { StateManager } from '../state/stateManager'

const ISLAND_WIDTH = 430
const ISLAND_HEIGHT = 118
const TOP_OFFSET = 18

export class DesktopIslandController {
  private window?: BrowserWindow

  constructor(private stateManager: StateManager) {}

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      this.stateManager.setDesktopIslandEnabled(true, true)
      return
    }

    this.window = new BrowserWindow({
      ...this.bounds(),
      show: false,
      frame: false,
      resizable: false,
      movable: true,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: 'AI CLI Monitor Island',
      webPreferences: {
        // The island is a second renderer route that uses the same safe IPC
        // surface as the main dashboard.
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.window.setAlwaysOnTop(true, 'floating')
    this.window.once('ready-to-show', () => {
      this.window?.showInactive()
      this.stateManager.setDesktopIslandEnabled(true, true)
    })
    this.window.on('closed', () => {
      this.window = undefined
      this.stateManager.setDesktopIslandEnabled(false, false)
    })

    void this.loadIslandRoute(this.window)
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
      return
    }

    this.stateManager.setDesktopIslandEnabled(false, false)
  }

  broadcast(snapshot: MonitorSnapshot): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.snapshotChanged, snapshot)
    }
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close()
    }
  }

  private async loadIslandRoute(window: BrowserWindow): Promise<void> {
    if (process.env.ELECTRON_RENDERER_URL) {
      await window.loadURL(`${process.env.ELECTRON_RENDERER_URL}?view=island`)
      return
    }

    await window.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { view: 'island' }
    })
  }

  private bounds(): Electron.Rectangle {
    const display = screen.getPrimaryDisplay()
    const { x, y, width } = display.workArea

    return {
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
      x: Math.round(x + width / 2 - ISLAND_WIDTH / 2),
      y: y + TOP_OFFSET
    }
  }
}
