import type { GlobalState, LedCommand } from './types'

export const BLE_DEVICE_NAME = 'AI_LED'

export const NUS_SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e'
export const NUS_RX_CHARACTERISTIC_UUID = '6e400002b5a3f393e0a9e50e24dcca9e'
export const NUS_TX_CHARACTERISTIC_UUID = '6e400003b5a3f393e0a9e50e24dcca9e'

export const HOOK_SERVER_HOST = '127.0.0.1'
export const HOOK_SERVER_PORT = 17361

export function ledCommandForGlobalState(state: GlobalState): LedCommand {
  if (state === 'red') {
    return 'R'
  }

  if (state === 'yellow') {
    return 'Y'
  }

  return 'G'
}
