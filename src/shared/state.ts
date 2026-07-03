import type {
  AgentState,
  ClaudeHookPayload,
  ClaudeState,
  CodexActivityPhase,
  CodexActivitySnapshot,
  CodexState,
  GlobalState,
  UpdateSnapshot
} from './types'

export const DEFAULT_AGENT_STATE: AgentState = {
  claude: 'idle',
  codex: 'idle',
  global: 'green'
}

export const DEFAULT_CODEX_ACTIVITY: CodexActivitySnapshot = {
  phase: 'idle',
  label: 'Codex 空闲',
  detail: '尚未收到 Codex 事件。'
}

export const DEFAULT_UPDATE_SNAPSHOT: UpdateSnapshot = {
  phase: 'idle'
}

export function computeGlobalState(state: Pick<AgentState, 'claude' | 'codex'>): GlobalState {
  // 硬件灯只关心全局忙闲；桌面端保留每个 CLI 的细分状态。
  if (state.claude === 'waiting' || state.codex === 'waiting') {
    return 'yellow'
  }

  if (state.claude === 'running' || state.codex === 'running') {
    return 'red'
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
  const normalizedEventName = eventName.toLowerCase()

  // Claude 钩子提供的是事件，不是持续状态；这里做保守映射。
  // 用户提交、工具调用代表 AI 正在思考或输出；通知代表等待确认；结束/中断类事件回到空闲。
  switch (normalizedEventName) {
    case 'generating':
    case 'running':
    case 'busy':
    case 'userpromptsubmit':
    case 'pretooluse':
    case 'posttooluse':
      return 'running'
    case 'notification':
      return 'waiting'
    case 'idle':
    case 'stop':
    case 'turnaborted':
    case 'interrupted':
    case 'cancelled':
    case 'canceled':
    case 'abort':
    case 'aborted':
    case 'subagentstop':
    case 'sessionend':
    case 'stopfailure':
      return 'idle'
    default:
      return undefined
  }
}

export function mapCodexActivityToState(payload: ClaudeHookPayload): CodexState | undefined {
  const eventName = String(payload.hook_event_name ?? payload.event ?? payload.state ?? '')
  const normalizedEventName = eventName.toLowerCase()
  const needsUserAction = codexPayloadNeedsUserAction(payload)

  switch (normalizedEventName) {
    case 'generating':
    case 'running':
    case 'busy':
    case 'userpromptsubmit':
    case 'subagentstart':
    case 'posttooluse':
    case 'precompact':
    case 'postcompact':
    case 'subagentstop':
      return 'running'
    case 'pretooluse':
      return needsUserAction ? 'waiting' : 'running'
    case 'waiting':
    case 'permissionrequest':
    case 'notification':
      return 'waiting'
    case 'idle':
    case 'stop':
    case 'done':
    case 'exit':
    case 'turnaborted':
    case 'interrupted':
    case 'cancelled':
    case 'canceled':
    case 'abort':
    case 'aborted':
    case 'sessionend':
      return 'idle'
    default:
      if (needsUserAction) {
        return 'waiting'
      }

      return undefined
  }
}

export function createCodexActivitySnapshot(payload: ClaudeHookPayload): CodexActivitySnapshot {
  const eventName = String(payload.hook_event_name ?? payload.event ?? payload.state ?? 'Unknown')
  const toolName = toOptionalString(payload.tool_name)
  const command = extractCommand(payload.tool_input)
  const phase = codexPayloadShouldShowPermission(eventName, payload)
    ? 'permission'
    : phaseForCodexEvent(eventName)
  const label = labelForCodexPhase(phase, toolName)
  const detail = detailForCodexPayload(phase, payload, command, toolName)

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

export function codexPayloadNeedsUserAction(payload: ClaudeHookPayload): boolean {
  const toolName =
    toOptionalString(payload.tool_name) ??
    toOptionalString(payload.name) ??
    toOptionalString(payload.tool)

  if (toolName === 'request_user_input') {
    return true
  }

  const toolInput = toolInputRecord(payload.tool_input ?? payload.input ?? payload.arguments)

  return Boolean(
    toolInput &&
      (toolInput.sandbox_permissions === 'require_escalated' ||
        typeof toolInput.justification === 'string')
  )
}

function codexPayloadShouldShowPermission(eventName: string, payload: ClaudeHookPayload): boolean {
  if (!codexPayloadNeedsUserAction(payload)) {
    return false
  }

  switch (eventName.toLowerCase()) {
    case 'posttooluse':
    case 'stop':
    case 'done':
    case 'exit':
    case 'sessionend':
    case 'turnaborted':
    case 'interrupted':
    case 'cancelled':
    case 'canceled':
    case 'abort':
    case 'aborted':
      return false
    default:
      return true
  }
}

function phaseForCodexEvent(eventName: string): CodexActivityPhase {
  switch (eventName.toLowerCase()) {
    case 'sessionstart':
      return 'session'
    case 'userpromptsubmit':
    case 'generating':
    case 'running':
    case 'busy':
      return 'prompt'
    case 'pretooluse':
      return 'tool-start'
    case 'permissionrequest':
    case 'waiting':
      return 'permission'
    case 'posttooluse':
      return 'tool-done'
    case 'notification':
      return 'permission'
    case 'precompact':
      return 'compact'
    case 'postcompact':
      return 'compact-done'
    case 'subagentstart':
      return 'subagent-start'
    case 'subagentstop':
      return 'subagent'
    case 'stop':
    case 'sessionend':
      return 'stopped'
    case 'turnaborted':
    case 'interrupted':
    case 'cancelled':
    case 'canceled':
    case 'abort':
    case 'aborted':
      return 'interrupted'
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
    case 'compact-done':
      return 'Codex 上下文压缩完成'
    case 'subagent-start':
      return 'Codex 子任务启动'
    case 'subagent':
      return 'Codex 子任务完成'
    case 'interrupted':
      return 'Codex 已中断'
    case 'stopped':
      return 'Codex 本轮结束'
    case 'idle':
      return 'Codex 空闲'
    default:
      return 'Codex 活动'
  }
}

function detailForCodexPayload(
  phase: CodexActivityPhase,
  payload: ClaudeHookPayload,
  command?: string,
  toolName?: string
): string {
  if (phase === 'permission') {
    const message = toOptionalString(payload.last_assistant_message)

    if (message) {
      return message
    }

    if (toolName === 'request_user_input') {
      return '正在等待用户选择或输入。'
    }

    return `正在等待授权，模式：${toOptionalString(payload.permission_mode) ?? '未知'}。`
  }

  if (command) {
    return prefixToolOutput(phase, command, toolName)
  }

  const assistantMessage = toOptionalString(payload.last_assistant_message)

  if (assistantMessage) {
    return prefixToolOutput(phase, assistantMessage, toolName)
  }

  const prompt = toOptionalString(payload.prompt)

  if (prompt) {
    return prompt
  }

  const cwd = toOptionalString(payload.cwd)

  if (cwd) {
    return cwd
  }

  return '已收到官方 Codex 事件。'
}

function prefixToolOutput(phase: CodexActivityPhase, detail: string, toolName?: string): string {
  if (phase !== 'tool-done' || !toolName) {
    return detail
  }

  if (detail.startsWith(`${toolName} 输出：`)) {
    return detail
  }

  return `${toolName} 输出：${detail}`
}

function extractCommand(value: unknown): string | undefined {
  const record = toolInputRecord(value)

  if (!record) {
    return undefined
  }

  if ('command' in record && typeof record.command === 'string') {
    return record.command
  }

  if ('cmd' in record && typeof record.cmd === 'string') {
    return record.cmd
  }

  return undefined
}

function toolInputRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value) {
    return undefined
  }

  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return toolInputRecord(parsed)
    } catch {
      return undefined
    }
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}
