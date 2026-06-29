import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// BLE 依赖包含原生模块，必须保持运行时动态加载，缺失时才能回退到模拟蓝牙。
const nativeBleExternals = [
  '@abandonware/noble',
  '@abandonware/bluetooth-hci-socket',
  'node-gyp-build',
  'usb',
  'ws'
]

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: nativeBleExternals })]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react()],
    server: {
      host: '127.0.0.1'
    }
  }
})
