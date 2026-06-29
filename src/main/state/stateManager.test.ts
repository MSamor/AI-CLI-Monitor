import { describe, expect, it, vi } from 'vitest'
import type { BleSnapshot, LedCommand } from '../../shared/types'
import { BleTransport } from '../ble/bleTransport'
import { StateManager } from './stateManager'

class TestBleTransport extends BleTransport {
  readonly mode = 'mock' as const
  readonly commands: LedCommand[] = []
  private snapshot: BleSnapshot = { mode: 'mock', state: 'mock' }

  async start(): Promise<void> {
    this.emitStatus()
  }

  async stop(): Promise<void> {
    this.emitStatus()
  }

  async send(command: LedCommand): Promise<void> {
    this.commands.push(command)
    this.snapshot = { ...this.snapshot, lastCommand: command }
    this.emitStatus()
  }

  getSnapshot(): BleSnapshot {
    return { ...this.snapshot }
  }
}

describe('StateManager', () => {
  it('debounces global state changes before sending LED command', async () => {
    vi.useFakeTimers()
    const ble = new TestBleTransport()
    const manager = new StateManager(ble, { debounceMs: 500, resendMs: 60_000 })

    await manager.start()
    ble.commands.length = 0

    manager.setClaudeState('running', 'test')
    manager.setClaudeState('idle', 'test')
    manager.setClaudeState('waiting', 'test')

    await vi.advanceTimersByTimeAsync(499)
    expect(ble.commands).toEqual([])

    await vi.advanceTimersByTimeAsync(1)
    expect(ble.commands).toEqual(['Y'])

    await manager.dispose()
    vi.useRealTimers()
  })

  it('does not resend an unchanged state outside forced flushes', async () => {
    vi.useFakeTimers()
    const ble = new TestBleTransport()
    const manager = new StateManager(ble, { debounceMs: 100, resendMs: 60_000 })

    await manager.start()
    ble.commands.length = 0

    manager.setClaudeState('running', 'test')
    await vi.advanceTimersByTimeAsync(100)
    manager.setClaudeState('running', 'test')
    await vi.advanceTimersByTimeAsync(100)

    expect(ble.commands).toEqual(['R'])

    await manager.dispose()
    vi.useRealTimers()
  })

  it('tracks desktop island state in snapshots', async () => {
    const ble = new TestBleTransport()
    const manager = new StateManager(ble)

    await manager.start()
    expect(manager.getSnapshot().island).toEqual({ enabled: false, visible: false })

    manager.setDesktopIslandEnabled(true)
    expect(manager.getSnapshot().island).toEqual({ enabled: true, visible: true })

    manager.setDesktopIslandVisible(false)
    expect(manager.getSnapshot().island).toEqual({ enabled: true, visible: false })

    await manager.dispose()
  })
})
