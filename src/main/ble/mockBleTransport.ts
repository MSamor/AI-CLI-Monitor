import { ledCommandFromPayload } from '../../shared/protocol'
import type { BlePayload, BleSnapshot } from '../../shared/types'
import { BleTransport } from './bleTransport'

export class MockBleTransport extends BleTransport {
  readonly mode = 'mock' as const

  private snapshot: BleSnapshot = {
    mode: 'mock',
    state: 'mock',
    deviceName: 'AI_LED_MOCK',
    diagnostic: '当前使用模拟蓝牙通道，不会连接真实硬件。'
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

  async sendPayload(payload: BlePayload): Promise<void> {
    this.snapshot = {
      ...this.snapshot,
      lastCommand: ledCommandFromPayload(payload),
      lastPayload: payload
    }
    this.emitStatus()
  }

  getSnapshot(): BleSnapshot {
    return { ...this.snapshot }
  }
}
