import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import type { StateManager } from '../state/stateManager'

const COMPACT_WIDTH = 352
const COMPACT_HEIGHT = 38
const EXPANDED_WIDTH = 500
const EXPANDED_HEIGHT = 220
const TOP_OFFSET = 2
const EDGE_PADDING = 8

export class DesktopIslandController {
  private window?: BrowserWindow
  private expanded = false

  constructor(private stateManager: StateManager) {}

  show(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show()
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
    const islandWidth = this.expanded ? EXPANDED_WIDTH : COMPACT_WIDTH
    const islandHeight = this.expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT
    const currentBounds = this.window && !this.window.isDestroyed() ? this.window.getBounds() : undefined
    const display = currentBounds
      ? screen.getDisplayMatching(currentBounds)
      : screen.getPrimaryDisplay()
    const displayBounds = display.bounds
    const centerX = currentBounds
      ? currentBounds.x + currentBounds.width / 2
      : displayBounds.x + displayBounds.width / 2
    const preferredX = Math.round(centerX - islandWidth / 2)
    const preferredY = currentBounds?.y ?? displayBounds.y + TOP_OFFSET
    const maxX = displayBounds.x + displayBounds.width - islandWidth - EDGE_PADDING
    const maxY = displayBounds.y + displayBounds.height - islandHeight - EDGE_PADDING

    return {
      width: islandWidth,
      height: islandHeight,
      x: clamp(preferredX, displayBounds.x + EDGE_PADDING, maxX),
      y: clamp(preferredY, displayBounds.y + TOP_OFFSET, maxY)
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}
