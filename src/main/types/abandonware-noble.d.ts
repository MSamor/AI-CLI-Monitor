declare module '@abandonware/noble' {
  import { EventEmitter } from 'node:events'

  export type NobleState =
    | 'unknown'
    | 'resetting'
    | 'unsupported'
    | 'unauthorized'
    | 'poweredOff'
    | 'poweredOn'

  export type Characteristic = {
    uuid: string
    writeAsync(data: Buffer, withoutResponse?: boolean): Promise<void>
  }

  export type Peripheral = EventEmitter & {
    id: string
    uuid: string
    state?: string
    advertisement: {
      localName?: string
      serviceUuids?: string[]
    }
    connectAsync(): Promise<void>
    disconnectAsync(): Promise<void>
    discoverSomeServicesAndCharacteristicsAsync(
      serviceUuids: string[],
      characteristicUuids: string[]
    ): Promise<{ characteristics: Characteristic[] }>
  }

  type Noble = EventEmitter & {
    state: NobleState
    startScanning(serviceUuids?: string[], allowDuplicates?: boolean): void
    startScanningAsync?(serviceUuids?: string[], allowDuplicates?: boolean): Promise<void>
    stopScanning(): void
    stopScanningAsync?(): Promise<void>
    on(event: 'stateChange', listener: (state: NobleState) => void): Noble
    on(event: 'discover', listener: (peripheral: Peripheral) => void): Noble
    off(event: 'stateChange', listener: (state: NobleState) => void): Noble
    off(event: 'discover', listener: (peripheral: Peripheral) => void): Noble
  }

  const noble: Noble
  export default noble
}
