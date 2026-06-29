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
      // Codex does not expose hooks, so v1 treats a matching process as the
      // source of truth and requires two clean polls before returning idle.
      const hasCodex = processes.some((processInfo) =>
        isCodexProcess(processInfo, this.currentPid, this.currentPpid)
      )

      if (hasCodex) {
        this.cleanPolls = 0

        if (!this.running) {
          this.running = true
          this.stateManager.setCodexState('running', 'process watcher')
        }

        return
      }

      this.cleanPolls += 1

      if (this.running && this.cleanPolls >= 2) {
        this.running = false
        this.stateManager.setCodexState('idle', 'process watcher')
      }
    } catch {
      if (this.running) {
        this.running = false
        this.stateManager.setCodexState('idle', 'process watcher error')
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

  // Match both a direct binary invocation and common node/shim wrappers whose
  // command line contains a codex executable path.
  if (commandBase === 'codex' || commandBase === 'codex.exe') {
    return true
  }

  if (/\bcodex(\.exe)?\b/.test(commandBase)) {
    return true
  }

  return /(^|\s|["'])((?:[a-z]:)?[^"'\s]*[\\/])?codex(\.exe)?(\s|$|["'])/.test(args)
}
