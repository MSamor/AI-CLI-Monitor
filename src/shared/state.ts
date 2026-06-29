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
  // Hardware LED is intentionally coarse-grained: any active CLI means busy.
  // Detailed per-CLI state is kept for the dashboard and desktop island.
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

  // Claude Code hooks provide lifecycle events, not a long-lived process state.
  // This mapping keeps the monitor conservative: tool activity is running,
  // notifications are waiting, and terminal stop/session events return idle.
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
