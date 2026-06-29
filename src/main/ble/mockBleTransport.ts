import type { BleSnapshot, LedCommand } from '../../shared/types'
import { BleTransport } from './bleTransport'

export class MockBleTransport extends BleTransport {
  readonly mode = 'mock' as const

  private snapshot: BleSnapshot = {
    mode: 'mock',
    state: 'mock',
    deviceName: 'AI_LED_MOCK',
    diagnostic: 'Mock BLE transport is active.'
  }

  constructor(diagnostic?: string) {
    super()

    if (diagnostic) {
      this.snapshot = {
        ...this.snapshot,
        diagnostic
      }
    }
  }

  async start(): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      state: 'mock'
    }
    this.emitStatus()
  }

  async stop(): Promise<void> {
    this.emitStatus()
  }

  async send(command: LedCommand): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      lastCommand: command
    }
    this.emitStatus()
  }

  getSnapshot(): BleSnapshot {
    return { ...this.snapshot }
  }
}
