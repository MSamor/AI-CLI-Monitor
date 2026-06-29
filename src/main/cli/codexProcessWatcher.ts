import path from 'node:path'
import { homedir } from 'node:os'
import { promises as fs } from 'node:fs'
import type { StateManager } from '../state/stateManager'
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
  private readonly startedAtMs = Date.now()
  private readonly pollMs: number
  private readonly currentPid: number
  private readonly currentPpid: number
  private readonly codexHome: string

  constructor(
    private stateManager: StateManager,
    options: CodexProcessWatcherOptions = {}
  ) {
    this.pollMs = options.pollMs ?? 1000
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
        this.stateManager.setCodexState('idle', '进程已退出')
      }
    } catch {
      if (this.running) {
        this.running = false
        this.stateManager.setCodexState('idle', '进程监听异常')
      }
    }
  }

  private async pollSessionEvents(): Promise<void> {
    const sessionFiles = await this.listRecentSessionFiles()

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

    return files
  }

  private async readNewSessionLines(file: string): Promise<void> {
    const stat = await fs.stat(file).catch(() => undefined)

    if (!stat) {
      this.sessionOffsets.delete(file)
      return
    }

    const previousOffset = this.sessionOffsets.get(file)
    const startOffset =
      previousOffset === undefined ? Math.max(0, stat.size - 16 * 1024) : previousOffset

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
      this.handleSessionChunk(buffer.toString('utf8'))
    } finally {
      await handle.close()
    }
  }

  private handleSessionChunk(chunk: string): void {
    for (const line of chunk.split('\n')) {
      if (!line.includes('turn_aborted')) {
        continue
      }

      const event = parseSessionLine(line)

      if (!event || !isFreshEvent(event.timestamp, this.startedAtMs)) {
        continue
      }

      if (event.type !== 'event_msg' || event.payload?.type !== 'turn_aborted') {
        continue
      }

      this.stateManager.setCodexHookActivity(
        {
          hook_event_name: 'TurnAborted',
          event: 'TurnAborted',
          turn_id: toOptionalString(event.payload.turn_id),
          last_assistant_message: '用户手动中断了 Codex 本轮输出。'
        },
        'idle'
      )
    }
  }
}

type CodexSessionLine = {
  timestamp?: string
  type?: string
  payload?: {
    type?: string
    turn_id?: unknown
  }
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

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}
