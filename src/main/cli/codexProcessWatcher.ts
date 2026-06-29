import path from 'node:path'
import type { StateManager } from '../state/stateManager'
import { listProcesses, type ProcessInfo } from './processList'

type CodexProcessWatcherOptions = {
  pollMs?: number
  currentPid?: number
  currentPpid?: number
}

export class CodexProcessWatcher {
  private timer?: NodeJS.Timeout
  private cleanPolls = 0
  private running = false
  private readonly pollMs: number
  private readonly currentPid: number
  private readonly currentPpid: number

  constructor(
    private stateManager: StateManager,
    options: CodexProcessWatcherOptions = {}
  ) {
    this.pollMs = options.pollMs ?? 1000
    this.currentPid = options.currentPid ?? process.pid
    this.currentPpid = options.currentPpid ?? process.ppid
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
