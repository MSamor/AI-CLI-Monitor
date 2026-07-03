import path from 'node:path'
import { homedir } from 'node:os'
import { promises as fs } from 'node:fs'
import type { StateManager } from '../state/stateManager'
import type { ClaudeHookPayload, CodexState } from '../../shared/types'
import { codexPayloadNeedsUserAction } from '../../shared/state'
import { listProcesses, type ProcessInfo } from './processList'

type CodexProcessWatcherOptions = {
  pollMs?: number
  currentPid?: number
  currentPpid?: number
  codexHome?: string
}

export class CodexProcessWatcher {
  private timer?: NodeJS.Timeout
  private cleanPolls = 0
  private running = false
  private readonly sessionOffsets = new Map<string, number>()
  private readonly pendingSessionLines = new Map<string, string>()
  private readonly runningSessionFiles = new Set<string>()
  private readonly sessionToolNames = new Map<string, Map<string, string>>()
  private readonly startedAtMs = Date.now()
  private readonly pollMs: number
  private readonly currentPid: number
  private readonly currentPpid: number
  private readonly codexHome: string

  constructor(
    private stateManager: StateManager,
    options: CodexProcessWatcherOptions = {}
  ) {
    this.pollMs = options.pollMs ?? 250
    this.currentPid = options.currentPid ?? process.pid
    this.currentPpid = options.currentPpid ?? process.ppid
    this.codexHome = options.codexHome ?? process.env.CODEX_HOME ?? path.join(homedir(), '.codex')
  }

  start(): void {
    void this.poll()
    this.timer = setInterval(() => {
      void this.poll()
    }, this.pollMs)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }

    this.sessionToolNames.clear()
  }

  private async poll(): Promise<void> {
    try {
      await this.pollSessionEvents()

      const processes = await listProcesses()
      // 进程存在只说明 Codex CLI 已打开，不代表 AI 正在生成或输出。
      // 真正的忙闲状态由 /hooks/codex 或 wrapper 上报，避免终端空开时误亮红灯。
      const hasCodex = processes.some((processInfo) =>
        isCodexProcess(processInfo, this.currentPid, this.currentPpid)
      )

      if (hasCodex) {
        this.cleanPolls = 0

        if (!this.running) {
          this.running = true
          this.stateManager.recordProcessObservation('Codex CLI 已打开，等待 AI 活动上报。')
        }

        return
      }

      this.cleanPolls += 1

      if (this.running && this.cleanPolls >= 2) {
        this.running = false
        this.runningSessionFiles.clear()
        this.sessionToolNames.clear()
        this.stateManager.setCodexState('idle', '进程已退出')
      }
    } catch {
      if (this.running) {
        this.running = false
        this.runningSessionFiles.clear()
        this.sessionToolNames.clear()
        this.stateManager.setCodexState('idle', '进程监听异常')
      }
    }
  }

  private async pollSessionEvents(): Promise<void> {
    const sessionFiles = await this.listRecentSessionFiles()
    const recentFiles = new Set(sessionFiles)

    for (const file of this.sessionOffsets.keys()) {
      if (!recentFiles.has(file)) {
        this.sessionOffsets.delete(file)
        this.pendingSessionLines.delete(file)
        this.runningSessionFiles.delete(file)
        this.sessionToolNames.delete(file)
      }
    }

    for (const file of sessionFiles) {
      await this.readNewSessionLines(file)
    }
  }

  private async listRecentSessionFiles(): Promise<string[]> {
    const files: string[] = []

    for (const directory of recentSessionDirectories(this.codexHome)) {
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) {
          continue
        }

        files.push(path.join(directory, entry.name))
      }
    }

    return files.sort()
  }

  private async readNewSessionLines(file: string): Promise<void> {
    const stat = await fs.stat(file).catch(() => undefined)

    if (!stat) {
      this.sessionOffsets.delete(file)
      this.pendingSessionLines.delete(file)
      this.runningSessionFiles.delete(file)
      this.sessionToolNames.delete(file)
      return
    }

    const previousOffset = this.sessionOffsets.get(file)
    const wasTruncated = previousOffset !== undefined && previousOffset > stat.size
    const startOffset =
      previousOffset === undefined || wasTruncated
        ? Math.max(0, stat.size - 16 * 1024)
        : previousOffset

    if (wasTruncated) {
      this.pendingSessionLines.delete(file)
    }

    if (stat.size <= startOffset) {
      this.sessionOffsets.set(file, stat.size)
      return
    }

    const handle = await fs.open(file, 'r').catch(() => undefined)

    if (!handle) {
      return
    }

    try {
      const length = stat.size - startOffset
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, startOffset)
      this.sessionOffsets.set(file, stat.size)
      this.handleSessionChunk(file, buffer.toString('utf8'))
    } finally {
      await handle.close()
    }
  }

  private handleSessionChunk(file: string, chunk: string): void {
    const text = `${this.pendingSessionLines.get(file) ?? ''}${chunk}`
    const lines = text.split(/\r?\n/)
    const hasTrailingNewline = text.endsWith('\n')
    let completeLines = hasTrailingNewline ? lines : lines.slice(0, -1)
    const trailingLine = hasTrailingNewline ? undefined : lines.at(-1)

    if (hasTrailingNewline) {
      this.pendingSessionLines.delete(file)
    } else if (trailingLine?.trim() && parseSessionLine(trailingLine)) {
      // Some JSONL writers expose a complete final object before the trailing newline arrives.
      completeLines = lines
      this.pendingSessionLines.delete(file)
    } else {
      this.pendingSessionLines.set(file, trailingLine ?? '')
    }

    for (const line of completeLines) {
      if (!line.trim()) {
        continue
      }

      const event = parseSessionLine(line)

      if (!event || !isFreshEvent(event.timestamp, this.startedAtMs)) {
        continue
      }

      this.rememberSessionToolName(file, event)
      const activity = sessionActivityForEvent(event, this.sessionToolName(file, event))

      if (!activity) {
        continue
      }

      if (activity.state === 'running') {
        this.runningSessionFiles.add(file)
        this.stateManager.setCodexHookActivity(activity.payload, activity.state, 'Codex 会话记录')
        continue
      }

      if (activity.state === 'waiting') {
        this.runningSessionFiles.delete(file)
        this.stateManager.setCodexHookActivity(activity.payload, activity.state, 'Codex 会话记录')
        continue
      }

      this.runningSessionFiles.delete(file)

      if (this.runningSessionFiles.size === 0) {
        this.stateManager.setCodexHookActivity(activity.payload, activity.state, 'Codex 会话记录')
      }
    }
  }

  private rememberSessionToolName(file: string, event: CodexSessionLine): void {
    const payload = isRecord(event.payload) ? event.payload : {}
    const callId = sessionCallId(payload)
    const toolName = sessionToolName(payload)

    if (!callId || !toolName) {
      return
    }

    const toolNames = this.sessionToolNames.get(file) ?? new Map<string, string>()
    toolNames.set(callId, toolName)
    this.sessionToolNames.set(file, toolNames)
  }

  private sessionToolName(file: string, event: CodexSessionLine): string | undefined {
    const payload = isRecord(event.payload) ? event.payload : {}
    const toolName = sessionToolName(payload)

    if (toolName) {
      return toolName
    }

    const callId = sessionCallId(payload)

    if (!callId) {
      return undefined
    }

    return this.sessionToolNames.get(file)?.get(callId)
  }
}

export type CodexSessionLine = {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

export type CodexSessionActivity = {
  state: CodexState
  payload: ClaudeHookPayload
}

export function isCodexProcess(
  processInfo: ProcessInfo,
  currentPid = process.pid,
  currentPpid = process.ppid
): boolean {
  if (processInfo.pid === currentPid || processInfo.pid === currentPpid) {
    return false
  }

  const commandBase = path.basename(processInfo.command).toLowerCase()
  const args = processInfo.args.toLowerCase()

  // 同时兼容直接运行 codex 二进制和通过 node/shim 包装启动的命令行。
  if (commandBase === 'codex' || commandBase === 'codex.exe') {
    return true
  }

  if (/\bcodex(\.exe)?\b/.test(commandBase)) {
    return true
  }

  return /(^|\s|["'])((?:[a-z]:)?[^"'\s]*[\\/])?codex(\.exe)?(\s|$|["'])/.test(args)
}

function recentSessionDirectories(codexHome: string): string[] {
  const now = new Date()

  return [0, 1].map((daysAgo) => {
    const date = new Date(now)
    date.setDate(now.getDate() - daysAgo)

    const year = String(date.getFullYear())
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    return path.join(codexHome, 'sessions', year, month, day)
  })
}

function parseSessionLine(line: string): CodexSessionLine | undefined {
  try {
    return JSON.parse(line) as CodexSessionLine
  } catch {
    return undefined
  }
}

function isFreshEvent(timestamp: string | undefined, startedAtMs: number): boolean {
  if (!timestamp) {
    return false
  }

  const eventAt = Date.parse(timestamp)

  return Number.isFinite(eventAt) && eventAt >= startedAtMs - 5_000
}

export function sessionActivityForEvent(
  event: CodexSessionLine,
  rememberedToolName?: string
): CodexSessionActivity | undefined {
  const payload = isRecord(event.payload) ? event.payload : {}
  const payloadType = toOptionalString(payload.type)?.toLowerCase()

  switch (payloadType) {
    case 'task_started':
      return createSessionActivity(event, 'UserPromptSubmit', 'running', 'Codex 已开始处理本轮任务。')
    case 'agent_message':
      return createSessionActivity(
        event,
        'Running',
        'running',
        toOptionalString(payload.message) ?? 'Codex 正在输出。'
      )
    case 'agent_reasoning':
    case 'reasoning':
      return createSessionActivity(event, 'Running', 'running', 'Codex 正在推理。')
    case 'message': {
      const role = toOptionalString(payload.role)?.toLowerCase()

      if (role !== 'assistant') {
        return undefined
      }

      return createSessionActivity(
        event,
        'Running',
        'running',
        extractMessageText(payload.content) ?? 'Codex 正在输出。'
      )
    }
    case 'function_call':
    case 'custom_tool_call': {
      const toolName = sessionToolName(payload) ?? rememberedToolName

      if (codexPayloadNeedsUserAction(payload)) {
        return createSessionActivity(
          event,
          'PermissionRequest',
          'waiting',
          detailForWaitingSessionTool(toolName),
          toolName
        )
      }

      return createSessionActivity(event, 'PreToolUse', 'running', undefined, toolName)
    }
    case 'tool_search_call':
      return createSessionActivity(event, 'PreToolUse', 'running', undefined, 'tool_search')
    case 'web_search_call':
      return createSessionActivity(event, 'PreToolUse', 'running', undefined, 'web_search')
    case 'patch_apply_begin':
      return createSessionActivity(event, 'PreToolUse', 'running', undefined, 'apply_patch')
    case 'permission_request':
    case 'approval_request':
    case 'approval_requested':
    case 'confirmation_request':
    case 'user_approval_request':
      return createSessionActivity(event, 'PermissionRequest', 'waiting', 'Codex 正在等待授权或确认。')
    case 'function_call_output':
    case 'custom_tool_call_output':
      return createSessionActivity(
        event,
        'PostToolUse',
        'running',
        '工具返回结果已写入 Codex 会话。',
        rememberedToolName
      )
    case 'tool_search_output':
      return createSessionActivity(
        event,
        'PostToolUse',
        'running',
        '工具返回结果已写入 Codex 会话。',
        'tool_search'
      )
    case 'web_search_end':
      return createSessionActivity(
        event,
        'PostToolUse',
        'running',
        '工具返回结果已写入 Codex 会话。',
        'web_search'
      )
    case 'mcp_tool_call_end':
      return createSessionActivity(
        event,
        'PostToolUse',
        'running',
        '工具返回结果已写入 Codex 会话。',
        'MCP tool'
      )
    case 'patch_apply_end':
      return createSessionActivity(
        event,
        'PostToolUse',
        'running',
        '补丁应用结果已写入 Codex 会话。',
        'apply_patch'
      )
    case 'task_complete':
      return createSessionActivity(
        event,
        'Stop',
        'idle',
        toOptionalString(payload.last_agent_message) ?? 'Codex 本轮输出完成。'
      )
    case 'turn_aborted':
      return createSessionActivity(event, 'TurnAborted', 'idle', '用户手动中断了 Codex 本轮输出。')
    case 'thread_rolled_back':
      return createSessionActivity(event, 'TurnAborted', 'idle', 'Codex 对话已回滚。')
    default:
      return undefined
  }
}

function createSessionActivity(
  event: CodexSessionLine,
  eventName: string,
  state: CodexState,
  detail?: string,
  fallbackToolName?: string
): CodexSessionActivity {
  const payload = isRecord(event.payload) ? event.payload : {}
  const toolName = sessionToolName(payload) ?? fallbackToolName
  const toolInput = toolInputForSessionPayload(payload)

  return {
    state,
    payload: {
      hook_event_name: eventName,
      event: eventName,
      source: 'codex-session',
      session_id: toOptionalString(payload.session_id),
      turn_id: toOptionalString(payload.turn_id),
      tool_name: toolName,
      tool_use_id: sessionCallId(payload),
      tool_input: toolInput,
      permission_mode: permissionModeForSessionPayload(payload, toolInput),
      model: toOptionalString(payload.model),
      cwd: toOptionalString(payload.cwd),
      last_assistant_message: detail
    }
  }
}

function detailForWaitingSessionTool(toolName?: string): string {
  if (toolName === 'request_user_input') {
    return 'Codex 正在等待用户选择或输入。'
  }

  return 'Codex 正在等待授权或确认。'
}

function sessionCallId(payload: Record<string, unknown>): string | undefined {
  return (
    toOptionalString(payload.call_id) ??
    toOptionalString(payload.tool_call_id) ??
    toOptionalString(payload.tool_use_id) ??
    toOptionalString(payload.id)
  )
}

function sessionToolName(payload: Record<string, unknown>): string | undefined {
  return (
    toOptionalString(payload.name) ??
    toOptionalString(payload.tool_name) ??
    toOptionalString(payload.tool)
  )
}

function toolInputForSessionPayload(payload: Record<string, unknown>): unknown {
  if ('tool_input' in payload) {
    return payload.tool_input
  }

  if ('input' in payload) {
    return payload.input
  }

  const args = payload.arguments

  if (typeof args !== 'string') {
    return args
  }

  try {
    const parsed: unknown = JSON.parse(args)
    return parsed
  } catch {
    return { command: args }
  }
}

function permissionModeForSessionPayload(
  payload: Record<string, unknown>,
  toolInput: unknown
): string | undefined {
  const direct = toOptionalString(payload.permission_mode)

  if (direct) {
    return direct
  }

  if (!isRecord(toolInput)) {
    return undefined
  }

  return toOptionalString(toolInput.sandbox_permissions)
}

function extractMessageText(value: unknown): string | undefined {
  const direct = toOptionalString(value)

  if (direct) {
    return direct
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const text = extractMessageText(item)

      if (text) {
        return text
      }
    }

    return undefined
  }

  if (!isRecord(value)) {
    return undefined
  }

  return (
    toOptionalString(value.text) ??
    toOptionalString(value.content) ??
    toOptionalString(value.message)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
