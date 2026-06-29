import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { PreferencesStore } from '../preferences'
import type { StateManager } from '../state/stateManager'

const COMPACT_WIDTH = 352
const COMPACT_HEIGHT = 38
const EXPANDED_WIDTH = 500
const EXPANDED_HEIGHT = 252
const TOP_OFFSET = 2
const EDGE_PADDING = 8
const SNAP_TO_TOP_DELAY_MS = 420
const SNAP_LOCK_MS = 220

export class DesktopIslandController {
  private window?: BrowserWindow
  private expanded = false
  private snapTimer?: NodeJS.Timeout
  private snapping = false

  constructor(
    private stateManager: StateManager,
    private preferences: PreferencesStore
  ) {}

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
    this.window.on('blur', () => {
      this.window?.webContents.send(IPC_CHANNELS.desktopIslandBlurred)
    })
    this.window.on('move', () => {
      this.scheduleSnapToTop()
    })
    this.window.on('closed', () => {
      this.clearSnapTimer()
      this.window = undefined
      this.expanded = false
      this.stateManager.setDesktopIslandEnabled(false, false)
    })

    void this.loadIslandRoute(this.window)
  }

  hide(): void {
    this.expanded = false

    if (this.window && !this.window.isDestroyed()) {
      this.clearSnapTimer()
      this.applyBounds()
      this.window.close()
      return
    }

    this.stateManager.setDesktopIslandEnabled(false, false)
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.clearSnapTimer()
      this.applyBounds()
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

    const nextBounds = this.bounds()
    this.window.setBounds(nextBounds, true)
    this.saveBounds(nextBounds)
  }

  private scheduleSnapToTop(): void {
    if (!this.window || this.window.isDestroyed() || this.snapping) {
      return
    }

    this.clearSnapTimer()
    this.snapTimer = setTimeout(() => {
      this.snapToTop()
    }, SNAP_TO_TOP_DELAY_MS)
  }

  private snapToTop(): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    this.snapping = true
    this.applyBounds()

    setTimeout(() => {
      this.snapping = false
    }, SNAP_LOCK_MS)
  }

  private clearSnapTimer(): void {
    if (!this.snapTimer) {
      return
    }

    clearTimeout(this.snapTimer)
    this.snapTimer = undefined
  }

  private bounds(): Electron.Rectangle {
    const islandWidth = this.expanded ? EXPANDED_WIDTH : COMPACT_WIDTH
    const islandHeight = this.expanded ? EXPANDED_HEIGHT : COMPACT_HEIGHT
    const currentBounds = this.window && !this.window.isDestroyed() ? this.window.getBounds() : undefined
    const storedBounds = this.validStoredBounds()
    const baseBounds = currentBounds ?? storedBounds
    const display = currentBounds
      ? screen.getDisplayMatching(currentBounds)
      : storedBounds
        ? screen.getDisplayMatching(storedBounds)
      : screen.getPrimaryDisplay()
    const displayBounds = display.bounds
    const centerX = baseBounds
      ? baseBounds.x + baseBounds.width / 2
      : displayBounds.x + displayBounds.width / 2
    const preferredX = Math.round(centerX - islandWidth / 2)
    // 灵动岛只允许改变横向位置；纵向始终吸附到当前屏幕顶部，避免拖进其他应用内容区。
    const preferredY = displayBounds.y + TOP_OFFSET
    const maxX = displayBounds.x + displayBounds.width - islandWidth - EDGE_PADDING
    const maxY = displayBounds.y + displayBounds.height - islandHeight - EDGE_PADDING

    return {
      width: islandWidth,
      height: islandHeight,
      x: clamp(preferredX, displayBounds.x + EDGE_PADDING, maxX),
      y: clamp(preferredY, displayBounds.y + TOP_OFFSET, maxY)
    }
  }

  private validStoredBounds(): Electron.Rectangle | undefined {
    const storedBounds = this.preferences.getDesktopIslandBounds()

    if (!storedBounds || !intersectsAnyDisplay(storedBounds)) {
      return undefined
    }

    return storedBounds
  }

  private saveBounds(bounds = this.window?.getBounds()): void {
    if (!bounds) {
      return
    }

    this.preferences.setDesktopIslandBounds(bounds)
  }
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) {
    return min
  }

  return Math.min(Math.max(value, min), max)
}

function intersectsAnyDisplay(bounds: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => intersects(bounds, display.bounds))
}

function intersects(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
