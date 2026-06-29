import { MockBleTransport } from './mockBleTransport'
import type { BleTransport } from './bleTransport'
import { errorMessage } from './bleTransport'

export async function createBleTransport(forceMock = false): Promise<BleTransport> {
  if (forceMock) {
    return new MockBleTransport('已按配置启用模拟蓝牙通道。')
  }

  try {
    const { NobleBleTransport } = await import('./nobleBleTransport')
    return new NobleBleTransport()
  } catch (error) {
    return new MockBleTransport(`真实蓝牙通道不可用，已切换为模拟模式：${errorMessage(error)}`)
  }
}
