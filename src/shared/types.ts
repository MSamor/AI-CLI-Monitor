export type ClaudeState = 'idle' | 'running' | 'waiting'
export type CodexState = 'idle' | 'running'
export type GlobalState = 'green' | 'red' | 'yellow'
export type LedCommand = 'R' | 'G' | 'Y' | 'B'
export type MonitoredTool = 'claude' | 'codex'
export type ToolHookStatus = 'enabled' | 'disabled' | 'partial' | 'error'

export type AgentState = {
  claude: ClaudeState
  codex: CodexState
  global: GlobalState
}

export type CodexActivityPhase =
  | 'idle'
  | 'session'
  | 'prompt'
  | 'tool-start'
  | 'permission'
  | 'tool-done'
  | 'compact'
  | 'compact-done'
  | 'subagent-start'
  | 'subagent'
  | 'interrupted'
  | 'stopped'

export type CodexActivitySnapshot = {
  phase: CodexActivityPhase
  label: string
  detail: string
  eventName?: string
  sessionId?: string
  turnId?: string
  toolName?: string
  toolUseId?: string
  command?: string
  permissionMode?: string
  model?: string
  cwd?: string
  lastAssistantMessage?: string
  updatedAt?: string
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

export type ToolIntegrationSnapshot = {
  installed: boolean
  executablePath?: string
  hookStatus: ToolHookStatus
  hookScriptPath: string
  configPath: string
  diagnostic?: string
  updatedAt: string
}

export type ToolIntegrationsSnapshot = Record<MonitoredTool, ToolIntegrationSnapshot>

export type MonitorSnapshot = {
  agent: AgentState
  codexActivity: CodexActivitySnapshot
  ble: BleSnapshot
  island: DesktopIslandSnapshot
  integrations: ToolIntegrationsSnapshot
  events: MonitorEvent[]
}

export type ClaudeHookPayload = {
  hook_event_name?: string
  event?: string
  tool_name?: string
  tool_use_id?: string
  tool_input?: unknown
  tool_response?: unknown
  turn_id?: string
  prompt?: string
  model?: string
  transcript_path?: string | null
  permission_mode?: string
  last_assistant_message?: string | null
  stop_hook_active?: boolean
  session_id?: string
  cwd?: string
  [key: string]: unknown
}
