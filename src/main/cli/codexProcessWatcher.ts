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
      // Codex 当前没有官方 Hook，v1 使用进程列表作为状态来源。
      // 连续两次轮询都没有命中时才回到空闲，避免进程瞬时抖动。
      const hasCodex = processes.some((processInfo) =>
        isCodexProcess(processInfo, this.currentPid, this.currentPpid)
      )

      if (hasCodex) {
        this.cleanPolls = 0

        if (!this.running) {
          this.running = true
          this.stateManager.setCodexState('running', '进程监听')
        }

        return
      }

      this.cleanPolls += 1

      if (this.running && this.cleanPolls >= 2) {
        this.running = false
        this.stateManager.setCodexState('idle', '进程监听')
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
