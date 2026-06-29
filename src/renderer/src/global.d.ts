import type { AiMonitorApi } from '../../shared/api'

declare global {
  interface Window {
    aiMonitor: AiMonitorApi
  }
}

export {}
