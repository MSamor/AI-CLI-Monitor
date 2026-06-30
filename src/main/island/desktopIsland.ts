import { BrowserWindow, screen } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../../shared/ipc'
import type { PreferencesStore } from '../preferences'
import type { StateManager } from '../state/stateManager'

const COMPACT_WIDTH = 286
const COMPACT_HEIGHT = 38
const EXPANDED_WIDTH = 430
const EXPANDED_HEIGHT = 252
const TOP_OFFSET = 2
const EDGE_PADDING = 8
const SNAP_TO_TOP_DELAY_MS = 420
const SNAP_LOCK_MS = 220
const RESIZE_ANIMATION_MS = 460
const PROGRAMMATIC_MOVE_LOCK_MS = 90

export class DesktopIslandController {
  private window?: BrowserWindow
  private expanded = false
  private snapTimer?: NodeJS.Timeout
  private snapping = false
  private resizeTimer?: NodeJS.Timeout
  private programmaticMoveTimer?: NodeJS.Timeout
  private applyingBounds = false

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
      this.clearProgrammaticMoveTimer()
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
      this.clearResizeTimer()
      this.clearProgrammaticMoveTimer()
      this.applyBounds()
      this.window.close()
      return
    }

    this.stateManager.setDesktopIslandEnabled(false, false)
  }

  dispose(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.clearSnapTimer()
      this.clearResizeTimer()
      this.clearProgrammaticMoveTimer()
      this.applyBounds()
      this.window.close()
    }
  }

  setExpanded(expanded: boolean): void {
    if (this.expanded === expanded) {
      return
    }

    this.expanded = expanded
    this.clearResizeTimer()

    if (expanded) {
      // 展开时：立即改变窗口大小，让前端动画在正确的空间内进行
      this.applyBounds()
    } else {
      // 收起时：延迟改变窗口大小，等待前端动画完成。
      this.resizeTimer = setTimeout(() => {
        this.applyBounds()
        this.resizeTimer = undefined
      }, RESIZE_ANIMATION_MS)
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

  private applyBounds(): void {
    if (!this.window || this.window.isDestroyed()) {
      return
    }

    const nextBounds = this.bounds()
    const currentBounds = this.window.getBounds()

    if (sameBounds(currentBounds, nextBounds)) {
      this.saveBounds(nextBounds)
      return
    }

    this.clearProgrammaticMoveTimer()
    this.applyingBounds = true
    this.window.setBounds(nextBounds, false)
    this.saveBounds(nextBounds)
    this.programmaticMoveTimer = setTimeout(() => {
      this.applyingBounds = false
      this.programmaticMoveTimer = undefined
    }, PROGRAMMATIC_MOVE_LOCK_MS)
  }

  private scheduleSnapToTop(): void {
    if (!this.window || this.window.isDestroyed() || this.snapping || this.applyingBounds) {
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

  private clearResizeTimer(): void {
    if (!this.resizeTimer) {
      return
    }

    clearTimeout(this.resizeTimer)
    this.resizeTimer = undefined
  }

  private clearProgrammaticMoveTimer(): void {
    if (this.programmaticMoveTimer) {
      clearTimeout(this.programmaticMoveTimer)
      this.programmaticMoveTimer = undefined
    }

    this.applyingBounds = false
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

function sameBounds(left: Electron.Rectangle, right: Electron.Rectangle): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  )
}

function intersectsAnyDisplay(bounds: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((display) => intersects(bounds, display.bounds))
}

function intersects(a: Electron.Rectangle, b: Electron.Rectangle): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
