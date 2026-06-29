import noble, { type Characteristic, type NobleState, type Peripheral } from '@abandonware/noble'
import {
  BLE_DEVICE_NAME,
  NUS_RX_CHARACTERISTIC_UUID,
  NUS_SERVICE_UUID
} from '../../shared/protocol'
import type { BleSnapshot, LedCommand } from '../../shared/types'
import { BleTransport, errorMessage } from './bleTransport'

export class NobleBleTransport extends BleTransport {
  readonly mode = 'noble' as const

  private snapshot: BleSnapshot = {
    mode: 'noble',
    state: 'idle',
    deviceName: BLE_DEVICE_NAME
  }

  private peripheral?: Peripheral
  private rxCharacteristic?: Characteristic
  private reconnectTimer?: NodeJS.Timeout
  private started = false

  async start(): Promise<void> {
    if (!this.started) {
      noble.on('stateChange', this.handleStateChange)
      noble.on('discover', this.handleDiscover)
      this.started = true
    }

    this.handleStateChange(noble.state)
  }

  async stop(): Promise<void> {
    this.clearReconnectTimer()
    noble.off('stateChange', this.handleStateChange)
    noble.off('discover', this.handleDiscover)
    this.started = false

    await this.stopScanning()

    if (this.peripheral?.state === 'connected') {
      await this.peripheral.disconnectAsync().catch(() => undefined)
    }

    this.peripheral = undefined
    this.rxCharacteristic = undefined
    this.updateSnapshot({ state: 'idle', diagnostic: undefined })
  }

  async send(command: LedCommand): Promise<void> {
    if (!this.rxCharacteristic) {
      throw new Error('BLE device is not connected.')
    }

    await this.rxCharacteristic.writeAsync(Buffer.from(command, 'utf8'), false)
    this.updateSnapshot({ lastCommand: command, diagnostic: undefined })
  }

  getSnapshot(): BleSnapshot {
    return { ...this.snapshot }
  }

  private handleStateChange = (state: NobleState): void => {
    if (state === 'poweredOn') {
      void this.scan()
      return
    }

    this.rxCharacteristic = undefined
    this.peripheral = undefined
    this.updateSnapshot({
      state: 'error',
      diagnostic: this.diagnosticForNobleState(state)
    })
  }

  private handleDiscover = (peripheral: Peripheral): void => {
    const localName = peripheral.advertisement.localName

    if (localName !== BLE_DEVICE_NAME) {
      return
    }

    void this.connect(peripheral)
  }

  private async scan(): Promise<void> {
    if (this.rxCharacteristic) {
      return
    }

    this.updateSnapshot({ state: 'scanning', diagnostic: undefined })

    try {
      await this.stopScanning()

      if (noble.startScanningAsync) {
        await noble.startScanningAsync([], false)
      } else {
        noble.startScanning([], false)
      }
    } catch (error) {
      this.updateSnapshot({
        state: 'error',
        diagnostic: `BLE scan failed: ${errorMessage(error)}`
      })
    }
  }

  private async connect(peripheral: Peripheral): Promise<void> {
    if (this.rxCharacteristic || this.snapshot.state === 'connecting') {
      return
    }

    this.updateSnapshot({ state: 'connecting', deviceName: BLE_DEVICE_NAME })

    try {
      await this.stopScanning()
      this.peripheral = peripheral
      await peripheral.connectAsync()

      // Pico exposes a Nordic UART compatible service. Electron only writes to
      // RX; TX exists for compatibility and future diagnostics.
      const { characteristics } =
        await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [NUS_SERVICE_UUID],
          [NUS_RX_CHARACTERISTIC_UUID]
        )

      const rxCharacteristic = characteristics.find(
        (characteristic) => characteristic.uuid === NUS_RX_CHARACTERISTIC_UUID
      )

      if (!rxCharacteristic) {
        throw new Error('Nordic UART RX characteristic was not found.')
      }

      this.rxCharacteristic = rxCharacteristic
      peripheral.once('disconnect', this.handleDisconnect)
      this.updateSnapshot({
        state: 'connected',
        deviceName: BLE_DEVICE_NAME,
        diagnostic: undefined
      })
    } catch (error) {
      this.rxCharacteristic = undefined
      this.updateSnapshot({
        state: 'error',
        diagnostic: `BLE connect failed: ${errorMessage(error)}`
      })
      this.scheduleReconnect()
    }
  }

  private handleDisconnect = (): void => {
    this.rxCharacteristic = undefined
    this.peripheral = undefined
    this.updateSnapshot({
      state: 'reconnecting',
      diagnostic: 'BLE device disconnected. Reconnecting...'
    })
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      if (noble.state === 'poweredOn') {
        void this.scan()
      }
    }, 2000)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private async stopScanning(): Promise<void> {
    if (noble.stopScanningAsync) {
      await noble.stopScanningAsync().catch(() => undefined)
      return
    }

    noble.stopScanning()
  }

  private updateSnapshot(next: Partial<BleSnapshot>): void {
    this.snapshot = {
      ...this.snapshot,
      ...next
    }
    this.emitStatus()
  }

  private diagnosticForNobleState(state: NobleState): string {
    switch (state) {
      case 'poweredOff':
        return 'Bluetooth is powered off.'
      case 'unauthorized':
        return 'Bluetooth permission is not granted to this app.'
      case 'unsupported':
        return 'Bluetooth LE is unsupported by this platform or adapter.'
      default:
        return `Bluetooth adapter is not ready: ${state}.`
    }
  }
}
