import type {
  AgentState,
  AgentStateCode,
  BlePayload,
  ClaudeState,
  CodexActivityPhase,
  CodexPhaseCode,
  CodexState,
  GlobalState,
  LedCommand,
  MonitorStatusPayload
} from './types'

export type MonitorStatusMetadata = {
  activeTool?: string
  project?: string
  elapsedSec?: number
  summary?: string
}

export const BLE_DEVICE_NAME = 'AI_LED'

export const NUS_SERVICE_UUID = '6e400001b5a3f393e0a9e50e24dcca9e'
export const NUS_RX_CHARACTERISTIC_UUID = '6e400002b5a3f393e0a9e50e24dcca9e'
export const NUS_TX_CHARACTERISTIC_UUID = '6e400003b5a3f393e0a9e50e24dcca9e'

export const HOOK_SERVER_HOST = '127.0.0.1'
export const HOOK_SERVER_PORT = 17361

export function ledCommandForGlobalState(state: GlobalState): LedCommand {
  if (state === 'red') {
    return 'R'
  }

  if (state === 'yellow') {
    return 'Y'
  }

  return 'G'
}

export function agentStateCode(state: ClaudeState | CodexState): AgentStateCode {
  if (state === 'running') {
    return 'R'
  }

  if (state === 'waiting') {
    return 'W'
  }

  return 'I'
}

export function codexPhaseCode(phase: CodexActivityPhase): CodexPhaseCode {
  switch (phase) {
    case 'prompt':
      return 'P'
    case 'tool-start':
      return 'T'
    case 'permission':
      return 'W'
    case 'tool-done':
      return 'D'
    case 'compact':
    case 'compact-done':
      return 'C'
    case 'subagent-start':
    case 'subagent':
      return 'S'
    case 'interrupted':
    case 'stopped':
      return 'X'
    case 'idle':
    case 'session':
    default:
      return 'I'
  }
}

export function buildMonitorStatusPayload(
  agent: Pick<AgentState, 'global' | 'claude' | 'codex'>,
  codexPhase: CodexActivityPhase,
  metadata: MonitorStatusMetadata = {}
): MonitorStatusPayload {
  const head =
    `M,${ledCommandForGlobalState(agent.global)},${agentStateCode(agent.claude)},${agentStateCode(agent.codex)},${codexPhaseCode(codexPhase)}` as const
  const activeTool = sanitizePacketField(metadata.activeTool, 15)
  const project = sanitizePacketField(metadata.project, 23)
  const elapsed = String(Math.max(0, Math.floor(metadata.elapsedSec ?? 0)))
  const summary = sanitizePacketField(metadata.summary, 39)

  if (!activeTool && !project && elapsed === '0' && !summary) {
    return head
  }

  return `${head},${activeTool},${project},${elapsed},${summary}` as MonitorStatusPayload
}

export function ledCommandFromPayload(payload: BlePayload): LedCommand | undefined {
  if (isLedCommand(payload)) {
    return payload
  }

  const [, globalCommand] = payload.split(',')
  return isLedCommand(globalCommand) ? globalCommand : undefined
}

function isLedCommand(value: string): value is LedCommand {
  return value === 'R' || value === 'G' || value === 'Y' || value === 'B'
}

function sanitizePacketField(value: string | undefined, maxLength: number): string {
  return String(value ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/[,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
