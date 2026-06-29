import { EventEmitter } from 'node:events'
import { ledCommandForGlobalState } from '../../shared/protocol'
import {
  computeGlobalState,
  createCodexActivitySnapshot,
  DEFAULT_AGENT_STATE,
  DEFAULT_CODEX_ACTIVITY
} from '../../shared/state'
import type {
  AgentState,
  ClaudeState,
  ClaudeHookPayload,
  CodexActivitySnapshot,
  CodexState,
  LedCommand,
  MonitorEvent,
  MonitorSnapshot
} from '../../shared/types'
import type { BleTransport } from '../ble/bleTransport'
import { errorMessage } from '../ble/bleTransport'

type StateManagerOptions = {
  debounceMs?: number
  resendMs?: number
  maxEvents?: number
  activityTimeoutMs?: number
  codexSettledTimeoutMs?: number
}

export class StateManager extends EventEmitter {
  private agent: AgentState = { ...DEFAULT_AGENT_STATE }
  private codexActivity: CodexActivitySnapshot = { ...DEFAULT_CODEX_ACTIVITY }
  private island = {
    enabled: false,
    visible: false
  }
  private events: MonitorEvent[] = []
  private debounceTimer?: NodeJS.Timeout
  private resendTimer?: NodeJS.Timeout
  private claudeActivityTimer?: NodeJS.Timeout
  private codexActivityTimer?: NodeJS.Timeout
  private lastSentCommand?: LedCommand
  private removeBleStatusListener?: () => void
  private bleReady = false
  private flushing = false

  private readonly debounceMs: number
  private readonly resendMs: number
  private readonly maxEvents: number
  private readonly activityTimeoutMs: number
  private readonly codexSettledTimeoutMs: number

  constructor(
    private ble: BleTransport,
    options: StateManagerOptions = {}
  ) {
    super()
    this.debounceMs = options.debounceMs ?? 500
    this.resendMs = options.resendMs ?? 30_000
    this.maxEvents = options.maxEvents ?? 80
    this.activityTimeoutMs = options.activityTimeoutMs ?? 5 * 60_000
    this.codexSettledTimeoutMs = options.codexSettledTimeoutMs ?? 5_000
    this.attachBle()
  }

  async start(): Promise<void> {
    await this.ble.start()
    await this.flushGlobalState(true)

    // 硬件在重连瞬间可能漏掉一次写入，所以定时重发当前全局状态。
    this.resendTimer = setInterval(() => {
      void this.flushGlobalState(true)
    }, this.resendMs)
  }

  async dispose(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    if (this.resendTimer) {
      clearInterval(this.resendTimer)
    }

    this.clearAgentActivityTimeout('claude')
    this.clearAgentActivityTimeout('codex')
    this.removeBleStatusListener?.()
    await this.ble.stop()
  }

  async replaceBleTransport(nextBle: BleTransport, reason: string): Promise<void> {
    this.removeBleStatusListener?.()
    await this.ble.stop().catch(() => undefined)
    this.ble = nextBle
    this.bleReady = false
    this.attachBle()
    this.addEvent('info', reason)
    await this.ble.start()
    await this.flushGlobalState(true)
    this.emitSnapshot()
  }

  async reconnectBle(): Promise<void> {
    this.addEvent('info', '正在重启蓝牙通道。')
    await this.ble.stop().catch(() => undefined)
    await this.ble.start()
    await this.flushGlobalState(true)
    this.emitSnapshot()
  }

  setClaudeState(next: ClaudeState, source: string): void {
    this.updateAgent({ claude: next }, `Claude 状态变更为「${labelForAgentState(next)}」（${source}）。`)
    this.refreshAgentActivityTimeout('claude', next)
  }

  setCodexState(next: CodexState, source: string): void {
    this.updateAgent({ codex: next }, `Codex 状态变更为「${labelForAgentState(next)}」（${source}）。`)
    this.refreshAgentActivityTimeout('codex', next)
  }

  setCodexHookActivity(payload: ClaudeHookPayload, nextState?: CodexState): void {
    this.codexActivity = createCodexActivitySnapshot(payload)

    if (nextState) {
      this.updateAgent(
        { codex: nextState },
        `Codex 官方 hook：${this.codexActivity.label}。${this.codexActivity.detail}`
      )
      this.refreshAgentActivityTimeout('codex', nextState, this.timeoutForCodexActivity())
      return
    }

    this.addEvent('info', `Codex 官方 hook：${this.codexActivity.label}。`)
    this.emitSnapshot()
  }

  recordProcessObservation(message: string): void {
    this.addEvent('info', message)
    this.emitSnapshot()
  }

  setDesktopIslandEnabled(enabled: boolean, visible = enabled): void {
    if (this.island.enabled === enabled && this.island.visible === visible) {
      return
    }

    this.island = { enabled, visible }
    this.addEvent('info', `桌面灵动岛已${enabled ? '开启' : '关闭'}。`)
    this.emitSnapshot()
  }

  setDesktopIslandVisible(visible: boolean): void {
    if (this.island.visible === visible) {
      return
    }

    this.island = {
      ...this.island,
      visible
    }
    this.emitSnapshot()
  }

  async setManualLed(command: LedCommand): Promise<void> {
    await this.ble.send(command)
    this.lastSentCommand = command
    this.addEvent('info', `已发送手动灯控指令：${command}。`)
    this.emitSnapshot()
  }

  getSnapshot(): MonitorSnapshot {
    return {
      agent: { ...this.agent },
      codexActivity: { ...this.codexActivity },
      ble: this.ble.getSnapshot(),
      island: { ...this.island },
      events: [...this.events]
    }
  }

  onSnapshot(listener: (snapshot: MonitorSnapshot) => void): () => void {
    this.on('snapshot', listener)
    return () => this.off('snapshot', listener)
  }

  private attachBle(): void {
    this.removeBleStatusListener = this.ble.onStatus((snapshot) => {
      const ready = snapshot.state === 'connected' || snapshot.state === 'mock'
      const becameReady = ready && !this.bleReady
      this.bleReady = ready

      // 只有蓝牙从不可用变为可写时才强制补发，避免“写入 -> 状态回调 -> 再写入”的循环。
      if (becameReady && !this.flushing) {
        void this.flushGlobalState(true)
      }

      this.emitSnapshot()
    })
  }

  private updateAgent(patch: Partial<Pick<AgentState, 'claude' | 'codex'>>, message: string): void {
    const nextClaude = patch.claude ?? this.agent.claude
    const nextCodex = patch.codex ?? this.agent.codex
    const nextGlobal = computeGlobalState({ claude: nextClaude, codex: nextCodex })
    const changed =
      nextClaude !== this.agent.claude ||
      nextCodex !== this.agent.codex ||
      nextGlobal !== this.agent.global

    if (!changed) {
      return
    }

    this.agent = {
      claude: nextClaude,
      codex: nextCodex,
      global: nextGlobal
    }

    // UI 需要立即看到每个 CLI 的状态；硬件灯写入会防抖，避免短暂状态抖动造成闪烁。
    this.addEvent('info', message)
    this.scheduleFlush()
    this.emitSnapshot()
  }

  private scheduleFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
    }

    this.debounceTimer = setTimeout(() => {
      void this.flushGlobalState()
    }, this.debounceMs)
  }

  private refreshAgentActivityTimeout(
    agent: 'claude' | 'codex',
    state: ClaudeState | CodexState,
    timeoutMs = this.activityTimeoutMs
  ): void {
    this.clearAgentActivityTimeout(agent)

    if (state === 'idle') {
      return
    }

    // 有些 CLI 手动中断生成时不会可靠触发 Stop hook。
    // 这里用 hook 活动超时兜底，避免 UI 和硬件灯长时间停在“生成中”。
    const timer = setTimeout(() => {
      this.expireAgentActivity(agent, timeoutMs)
    }, timeoutMs)

    if (agent === 'claude') {
      this.claudeActivityTimer = timer
      return
    }

    this.codexActivityTimer = timer
  }

  private clearAgentActivityTimeout(agent: 'claude' | 'codex'): void {
    const timer = agent === 'claude' ? this.claudeActivityTimer : this.codexActivityTimer

    if (!timer) {
      return
    }

    clearTimeout(timer)

    if (agent === 'claude') {
      this.claudeActivityTimer = undefined
      return
    }

    this.codexActivityTimer = undefined
  }

  private expireAgentActivity(agent: 'claude' | 'codex', timeoutMs = this.activityTimeoutMs): void {
    this.clearAgentActivityTimeout(agent)

    if (agent === 'claude') {
      if (this.agent.claude === 'idle') {
        return
      }

      this.updateAgent(
        { claude: 'idle' },
        `Claude 超过 ${this.timeoutSeconds(timeoutMs)} 秒没有新的 hook 活动，已恢复为空闲。`
      )
      return
    }

    if (this.agent.codex === 'idle') {
      return
    }

    this.codexActivity = {
      phase: 'idle',
      label: 'Codex 可能已停止',
      detail: `超过 ${this.timeoutSeconds(timeoutMs)} 秒没有收到新的 Codex hook，已自动恢复为空闲。`,
      updatedAt: new Date().toISOString()
    }
    this.updateAgent(
      { codex: 'idle' },
      `Codex 超过 ${this.timeoutSeconds(timeoutMs)} 秒没有新的 hook 活动，已恢复为空闲。`
    )
  }

  private timeoutSeconds(timeoutMs: number): number {
    return Math.round(timeoutMs / 1000)
  }

  private timeoutForCodexActivity(): number {
    if (
      this.codexActivity.phase === 'tool-done' ||
      this.codexActivity.phase === 'compact-done' ||
      this.codexActivity.phase === 'subagent'
    ) {
      return this.codexSettledTimeoutMs
    }

    return this.activityTimeoutMs
  }

  private async flushGlobalState(force = false): Promise<void> {
    if (this.flushing) {
      return
    }

    const command = ledCommandForGlobalState(this.agent.global)
    const bleSnapshot = this.ble.getSnapshot()
    const bleWritable = bleSnapshot.state === 'connected' || bleSnapshot.state === 'mock'

    // 硬件只需要全局颜色；桌面灵动岛通过快照展示每个 CLI 的独立状态。
    if (!force && command === this.lastSentCommand) {
      return
    }

    // 没有硬件连接时不尝试写入，避免重复产生“同步失败”事件。
    if (!bleWritable) {
      this.emitSnapshot()
      return
    }

    this.flushing = true

    try {
      await this.ble.send(command)
      this.lastSentCommand = command
      this.addEvent('info', `已同步硬件灯状态：${command}。`)
    } catch (error) {
      this.addEvent('warning', `硬件灯同步失败：${errorMessage(error)}`)
    } finally {
      this.flushing = false
    }

    this.emitSnapshot()
  }

  private addEvent(level: MonitorEvent['level'], message: string): void {
    const event: MonitorEvent = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      at: new Date().toISOString(),
      level,
      message
    }

    this.events = [event, ...this.events].slice(0, this.maxEvents)
  }

  private emitSnapshot(): void {
    this.emit('snapshot', this.getSnapshot())
  }
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return 'AI 生成中'
  }

  if (state === 'waiting') {
    return '等待确认'
  }

  return '空闲'
}
