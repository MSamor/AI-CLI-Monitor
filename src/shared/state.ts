import type {
  AgentState,
  ClaudeHookPayload,
  ClaudeState,
  CodexState,
  GlobalState
} from './types'

export const DEFAULT_AGENT_STATE: AgentState = {
  claude: 'idle',
  codex: 'idle',
  global: 'green'
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
    case 'thinking':
    case 'generating':
    case 'streaming':
    case 'running':
    case 'start':
      return 'running'
    case 'idle':
    case 'stop':
    case 'done':
    case 'exit':
      return 'idle'
    default:
      return undefined
  }
}
