import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { StateManager } from '../state/stateManager'

const COMPACT_WIDTH = 292
const COMPACT_HEIGHT = 32
const EXPANDED_WIDTH = 420
const EXPANDED_HEIGHT = 156
const RIGHT_OFFSET = 10
const TOP_OFFSET = 1

export class DesktopIslandController {
  private window?: BrowserWindow
  private expanded = false

  constructor(private stateManager: StateManager) {}

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
      this.window.focus()
      this.applyBounds()
      this.stateManager.setDesktopIslandEnabled(true, true)
      return
    }

    this.expanded = false
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
      this.expanded = false
      this.stateManager.setDesktopIslandEnabled(false, false)
    })

    void this.loadIslandRoute(this.window)
  }

  hide(): void {
    this.expanded = false

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

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) {
      return
    }

    this.expanded = expanded
    this.applyBounds()
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

  private applyBounds(): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.window.setBounds(this.bounds(), true)
  }

  private bounds(): Electron.Rectangle {
    const display = screen.getPrimaryDisplay()
    const { x, y, width } = display.bounds
    const islandWidth = this.expanded ? EXPANDED_WIDTH : COMPACT_WIDTH
    const islandHeight = this.expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT

    return {
      width: islandWidth,
      height: islandHeight,
      x: Math.round(x + width - islandWidth - RIGHT_OFFSET),
      y: y + TOP_OFFSET
    }
  }
}
