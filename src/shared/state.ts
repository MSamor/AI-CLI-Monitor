import type {
  AgentState,
  ClaudeHookPayload,
  ClaudeState,
  CodexActivityPhase,
  CodexActivitySnapshot,
  CodexState,
  GlobalState
} from './types'

export const DEFAULT_AGENT_STATE: AgentState = {
  claude: 'idle',
  codex: 'idle',
  global: 'green'
}

export const DEFAULT_CODEX_ACTIVITY: CodexActivitySnapshot = {
  phase: 'idle',
  label: 'Codex 静默',
  detail: '尚未收到 Codex 官方 hook 事件。'
}

export function computeGlobalState(state: Pick<AgentState, 'claude' | 'codex'>): GlobalState {
  // 硬件灯只关心全局忙闲；桌面端保留每个 CLI 的细分状态。
  if (state.claude === 'running' || state.codex === 'running') {
    return 'red'
  }

  if (state.claude === 'waiting') {
    return 'yellow'
  }

  return 'green'
}

export function createAgentState(
  claude: ClaudeState = DEFAULT_AGENT_STATE.claude,
  codex: CodexState = DEFAULT_AGENT_STATE.codex
): AgentState {
  return {
    claude,
    codex,
    global: computeGlobalState({ claude, codex })
  }
}

export function mapClaudeHookToState(payload: ClaudeHookPayload): ClaudeState | undefined {
  const eventName = String(payload.hook_event_name ?? payload.event ?? '')

  // Claude 钩子提供的是事件，不是持续状态；这里做保守映射。
  // 用户提交、工具调用代表 AI 正在思考或输出；通知代表等待确认；Stop/SessionEnd 回到空闲。
  switch (eventName) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
      return 'running'
    case 'Notification':
      return 'waiting'
    case 'Stop':
    case 'SubagentStop':
    case 'SessionEnd':
    case 'StopFailure':
      return 'idle'
    default:
      return undefined
  }
}

export function mapCodexActivityToState(payload: ClaudeHookPayload): CodexState | undefined {
  const eventName = String(payload.hook_event_name ?? payload.event ?? payload.state ?? '')

  switch (eventName) {
    case 'UserPromptSubmit':
    case 'PreToolUse':
    case 'PostToolUse':
    case 'SubagentStop':
      return 'running'
    case 'PermissionRequest':
    case 'Notification':
      return 'running'
    case 'idle':
    case 'stop':
    case 'done':
    case 'exit':
    case 'Stop':
    case 'SessionEnd':
      return 'idle'
    default:
      return undefined
  }
}

export function createCodexActivitySnapshot(payload: ClaudeHookPayload): CodexActivitySnapshot {
  const eventName = String(payload.hook_event_name ?? payload.event ?? payload.state ?? 'Unknown')
  const toolName = toOptionalString(payload.tool_name)
  const command = extractCommand(payload.tool_input)
  const phase = phaseForCodexEvent(eventName)
  const label = labelForCodexPhase(phase, toolName)
  const detail = detailForCodexPayload(phase, payload, command)

  return {
    phase,
    label,
    detail,
    eventName,
    sessionId: toOptionalString(payload.session_id),
    turnId: toOptionalString(payload.turn_id),
    toolName,
    toolUseId: toOptionalString(payload.tool_use_id),
    command,
    permissionMode: toOptionalString(payload.permission_mode),
    model: toOptionalString(payload.model),
    cwd: toOptionalString(payload.cwd),
    lastAssistantMessage: toOptionalString(payload.last_assistant_message),
    updatedAt: new Date().toISOString()
  }
}

function phaseForCodexEvent(eventName: string): CodexActivityPhase {
  switch (eventName) {
    case 'SessionStart':
      return 'session'
    case 'UserPromptSubmit':
      return 'prompt'
    case 'PreToolUse':
      return 'tool-start'
    case 'PermissionRequest':
      return 'permission'
    case 'PostToolUse':
      return 'tool-done'
    case 'Notification':
      return 'permission'
    case 'PreCompact':
      return 'compact'
    case 'SubagentStop':
      return 'subagent'
    case 'Stop':
    case 'SessionEnd':
      return 'stopped'
    default:
      return 'session'
  }
}

function labelForCodexPhase(phase: CodexActivityPhase, toolName?: string): string {
  switch (phase) {
    case 'session':
      return 'Codex 会话已连接'
    case 'prompt':
      return 'Codex 正在处理输入'
    case 'tool-start':
      return toolName ? `准备执行 ${toolName}` : '准备执行工具'
    case 'permission':
      return '等待 Codex 授权'
    case 'tool-done':
      return toolName ? `${toolName} 执行完成` : '工具执行完成'
    case 'compact':
      return 'Codex 正在压缩上下文'
    case 'subagent':
      return 'Codex 子任务完成'
    case 'stopped':
      return 'Codex 本轮结束'
    case 'idle':
      return 'Codex 静默'
    default:
      return 'Codex 活动'
  }
}

function detailForCodexPayload(
  phase: CodexActivityPhase,
  payload: ClaudeHookPayload,
  command?: string
): string {
  if (phase === 'permission') {
    return `正在等待授权，模式：${toOptionalString(payload.permission_mode) ?? '未知'}。`
  }

  if (command) {
    return command
  }

  const assistantMessage = toOptionalString(payload.last_assistant_message)

  if (assistantMessage) {
    return assistantMessage
  }

  const prompt = toOptionalString(payload.prompt)

  if (prompt) {
    return prompt
  }

  const cwd = toOptionalString(payload.cwd)

  if (cwd) {
    return cwd
  }

  return '已收到官方 Codex hook 事件。'
}

function extractCommand(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  if ('command' in value && typeof value.command === 'string') {
    return value.command
  }

  if ('cmd' in value && typeof value.cmd === 'string') {
    return value.cmd
  }

  return undefined
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}
