export type ClaudeState = 'idle' | 'running' | 'waiting'
export type CodexState = 'idle' | 'running'
export type GlobalState = 'green' | 'red' | 'yellow'
export type LedCommand = 'R' | 'G' | 'Y' | 'B'

export type AgentState = {
  claude: ClaudeState
  codex: CodexState
  global: GlobalState
}

export type BleConnectionState =
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'mock'
  | 'error'

export type BleSnapshot = {
  mode: 'noble' | 'mock'
  state: BleConnectionState
  deviceName?: string
  lastCommand?: LedCommand
  diagnostic?: string
}

export type MonitorEvent = {
  id: string
  at: string
  level: 'info' | 'warning' | 'error'
  message: string
}

export type DesktopIslandSnapshot = {
  enabled: boolean
  visible: boolean
}

export type MonitorSnapshot = {
  agent: AgentState
  ble: BleSnapshot
  island: DesktopIslandSnapshot
  events: MonitorEvent[]
}

export type ClaudeHookPayload = {
  hook_event_name?: string
  event?: string
  tool_name?: string
  session_id?: string
  cwd?: string
  [key: string]: unknown
}
