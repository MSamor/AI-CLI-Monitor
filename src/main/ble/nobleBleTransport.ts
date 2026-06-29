import noble, { type Characteristic, type NobleState, type Peripheral } from '@abandonware/noble'
import {
  BLE_DEVICE_NAME,
  NUS_RX_CHARACTERISTIC_UUID,
  NUS_SERVICE_UUID
} from '../../shared/protocol'
import type { BleSnapshot, LedCommand } from '../../shared/types'
import { BleTransport, errorMessage } from './bleTransport'

const SCAN_TIMEOUT_MS = 8000
const BASE_RECONNECT_MS = 2500
const MAX_RECONNECT_MS = 9000

export class NobleBleTransport extends BleTransport {
  readonly mode = 'noble' as const

  private snapshot: BleSnapshot = {
    mode: 'noble',
    state: 'idle',
    deviceName: BLE_DEVICE_NAME
  }

  private peripheral?: Peripheral
  private rxCharacteristic?: Characteristic
  private connectingPeripheralId?: string
  private scanTimer?: NodeJS.Timeout
  private reconnectTimer?: NodeJS.Timeout
  private reconnectAttempts = 0
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
    this.clearScanTimer()
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
    this.connectingPeripheralId = undefined
    this.updateSnapshot({ state: 'idle', diagnostic: undefined })
  }

  async send(command: LedCommand): Promise<void> {
    if (!this.rxCharacteristic) {
      throw new Error('蓝牙设备尚未连接。')
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

    this.clearScanTimer()
    this.clearReconnectTimer()
    this.rxCharacteristic = undefined
    this.peripheral = undefined
    this.connectingPeripheralId = undefined
    this.updateSnapshot({
      state: 'error',
      diagnostic: this.diagnosticForNobleState(state)
    })
  }

  private handleDiscover = (peripheral: Peripheral): void => {
    if (!this.matchesTargetPeripheral(peripheral)) {
      return
    }

    void this.connect(peripheral)
  }

  private async scan(): Promise<void> {
    if (!this.started || this.rxCharacteristic || this.connectingPeripheralId) {
      return
    }

    this.clearScanTimer()
    this.updateSnapshot({
      state: 'scanning',
      diagnostic: `正在扫描 ${BLE_DEVICE_NAME}。BLE GATT 不需要在系统蓝牙里手动配对。`
    })

    try {
      await this.stopScanning()

      if (noble.startScanningAsync) {
        await noble.startScanningAsync([NUS_SERVICE_UUID], false)
      } else {
        noble.startScanning([NUS_SERVICE_UUID], false)
      }

      this.scanTimer = setTimeout(() => {
        void this.handleScanTimeout()
      }, SCAN_TIMEOUT_MS)
    } catch (error) {
      this.updateSnapshot({
        state: 'error',
        diagnostic: `蓝牙扫描失败：${errorMessage(error)}`
      })
      this.scheduleReconnect()
    }
  }

  private async connect(peripheral: Peripheral): Promise<void> {
    if (this.rxCharacteristic || this.connectingPeripheralId) {
      return
    }

    this.clearScanTimer()
    this.connectingPeripheralId = peripheral.id
    this.updateSnapshot({
      state: 'connecting',
      deviceName: peripheral.advertisement.localName ?? BLE_DEVICE_NAME,
      diagnostic: '已发现目标设备，正在建立 GATT 连接。'
    })

    try {
      await this.stopScanning()
      this.peripheral = peripheral

      if (peripheral.state !== 'connected') {
        await peripheral.connectAsync()
      }

      // Pico 暴露 Nordic UART 兼容服务。桌面端只写 RX，TX 保留给后续诊断。
      const { characteristics } =
        await peripheral.discoverSomeServicesAndCharacteristicsAsync(
          [NUS_SERVICE_UUID],
          [NUS_RX_CHARACTERISTIC_UUID]
        )

      const rxCharacteristic = characteristics.find(
        (characteristic) => characteristic.uuid === NUS_RX_CHARACTERISTIC_UUID
      )

      if (!rxCharacteristic) {
        throw new Error('未找到 Nordic UART RX 写入特征。')
      }

      this.rxCharacteristic = rxCharacteristic
      this.connectingPeripheralId = undefined
      this.reconnectAttempts = 0
      peripheral.once('disconnect', this.handleDisconnect)
      this.updateSnapshot({
        state: 'connected',
        deviceName: peripheral.advertisement.localName ?? BLE_DEVICE_NAME,
        diagnostic: '已连接硬件，状态会自动同步到 Pico。'
      })
    } catch (error) {
      this.rxCharacteristic = undefined
      this.connectingPeripheralId = undefined
      await peripheral.disconnectAsync().catch(() => undefined)
      this.updateSnapshot({
        state: 'error',
        diagnostic: `蓝牙连接失败：${errorMessage(error)}`
      })
      this.scheduleReconnect()
    }
  }

  private handleDisconnect = (): void => {
    this.rxCharacteristic = undefined
    this.peripheral = undefined
    this.connectingPeripheralId = undefined
    this.updateSnapshot({
      state: 'reconnecting',
      diagnostic: '蓝牙设备已断开，正在自动重连...'
    })
    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (!this.started) {
      return
    }

    this.clearReconnectTimer()
    const delayMs = Math.min(BASE_RECONNECT_MS + this.reconnectAttempts * 750, MAX_RECONNECT_MS)
    this.reconnectAttempts += 1
    this.updateSnapshot({
      state: 'reconnecting',
      diagnostic: `${Math.round(delayMs / 1000)} 秒后重新扫描 ${BLE_DEVICE_NAME}。`
    })

    this.reconnectTimer = setTimeout(() => {
      if (noble.state === 'poweredOn') {
        void this.scan()
      }
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = undefined
    }
  }

  private clearScanTimer(): void {
    if (this.scanTimer) {
      clearTimeout(this.scanTimer)
      this.scanTimer = undefined
    }
  }

  private async handleScanTimeout(): Promise<void> {
    this.scanTimer = undefined

    if (!this.started || this.rxCharacteristic || this.connectingPeripheralId) {
      return
    }

    await this.stopScanning()
    this.scheduleReconnect()
  }

  private async stopScanning(): Promise<void> {
    if (noble.stopScanningAsync) {
      await noble.stopScanningAsync().catch(() => undefined)
      return
    }

    noble.stopScanning()
  }

  private matchesTargetPeripheral(peripheral: Peripheral): boolean {
    const localName = peripheral.advertisement.localName
    const serviceUuids = peripheral.advertisement.serviceUuids ?? []

    const hasTargetService = serviceUuids.some(
      (serviceUuid) => normalizeUuid(serviceUuid) === NUS_SERVICE_UUID
    )

    return localName === BLE_DEVICE_NAME || (!localName && hasTargetService)
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
        return '系统蓝牙未开启。'
      case 'unauthorized':
        return '当前应用没有蓝牙权限。'
      case 'unsupported':
        return '当前系统或蓝牙适配器不支持 BLE。'
      default:
        return `蓝牙适配器未就绪：${state}。`
    }
  }
}

function normalizeUuid(uuid: string): string {
  return uuid.replaceAll('-', '').toLowerCase()
}
