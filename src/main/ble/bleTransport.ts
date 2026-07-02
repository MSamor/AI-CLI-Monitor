import { EventEmitter } from 'node:events'
import type { BlePayload, BleSnapshot, LedCommand } from '../../shared/types'

export abstract class BleTransport extends EventEmitter {
  abstract readonly mode: BleSnapshot['mode']

  abstract start(): Promise<void>
  abstract stop(): Promise<void>
  abstract sendPayload(payload: BlePayload): Promise<void>
  abstract getSnapshot(): BleSnapshot

  send(command: LedCommand): Promise<void> {
    return this.sendPayload(command)
  }

  onStatus(listener: (snapshot: BleSnapshot) => void): () => void {
    this.on('status', listener)
    return () => this.off('status', listener)
  }

  protected emitStatus(): void {
    this.emit('status', this.getSnapshot())
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}
