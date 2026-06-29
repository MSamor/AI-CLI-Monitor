import { MockBleTransport } from './mockBleTransport'
import type { BleTransport } from './bleTransport'
import { errorMessage } from './bleTransport'

export async function createBleTransport(forceMock = false): Promise<BleTransport> {
  if (forceMock) {
    return new MockBleTransport('Mock BLE transport was requested.')
  }

  try {
    const { NobleBleTransport } = await import('./nobleBleTransport')
    return new NobleBleTransport()
  } catch (error) {
    return new MockBleTransport(`Noble BLE transport is unavailable: ${errorMessage(error)}`)
  }
}
