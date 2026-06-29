import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { StateManager } from '../state/stateManager'

const ISLAND_WIDTH = 238
const ISLAND_HEIGHT = 24
const RIGHT_OFFSET = 10
const TOP_OFFSET = 1

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
      backgroundColor: '#00000000',
      hasShadow: false,
      roundedCorners: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      title: 'AI 状态灵动岛',
      webPreferences: {
        // 灵动岛复用同一个渲染入口，只通过 query 参数切换成小窗视图。
        preload: join(__dirname, '../preload/index.mjs'),
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false
      }
    })

    this.window.setAlwaysOnTop(true, 'screen-saver')
    this.window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })
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
    const { x, y, width } = display.bounds

    return {
      width: ISLAND_WIDTH,
      height: ISLAND_HEIGHT,
      x: Math.round(x + width - ISLAND_WIDTH - RIGHT_OFFSET),
      y: y + TOP_OFFSET
    }
  }
}
