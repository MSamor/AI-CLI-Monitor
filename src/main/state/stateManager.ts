import { EventEmitter } from 'node:events'
import { basename } from 'node:path'
import {
  buildMonitorStatusPayload,
  ledCommandForGlobalState,
  type MonitorStatusMetadata
} from '../../shared/protocol'
import {
  computeGlobalState,
  createCodexActivitySnapshot,
  DEFAULT_AGENT_STATE,
  DEFAULT_CODEX_ACTIVITY,
  DEFAULT_UPDATE_SNAPSHOT
} from '../../shared/state'
import type {
  AgentState,
  BlePayload,
  ClaudeState,
  ClaudeHookPayload,
  CodexActivitySnapshot,
  CodexState,
  GlobalState,
  LedCommand,
  MonitorEvent,
  MonitorSnapshot,
  ToolIntegrationsSnapshot,
  UpdateSnapshot
} from '../../shared/types'
import type { BleTransport } from '../ble/bleTransport'
import { errorMessage } from '../ble/bleTransport'

type StateManagerOptions = {
  debounceMs?: number
  resendMs?: number
  maxEvents?: number
  activityTimeoutMs?: number
}

export class StateManager extends EventEmitter {
  private agent: AgentState = { ...DEFAULT_AGENT_STATE }
  private codexActivity: CodexActivitySnapshot = { ...DEFAULT_CODEX_ACTIVITY }
  private island = {
    enabled: false,
    visible: false
  }
  private integrations: ToolIntegrationsSnapshot = createInitialToolIntegrations()
  private update: UpdateSnapshot = { ...DEFAULT_UPDATE_SNAPSHOT }
  private events: MonitorEvent[] = []
  private debounceTimer?: NodeJS.Timeout
  private resendTimer?: NodeJS.Timeout
  private claudeActivityTimer?: NodeJS.Timeout
  private codexActivityTimer?: NodeJS.Timeout
  private lastSentPayload?: BlePayload
  private lastActiveAgent?: 'claude' | 'codex'
  private lastCodexActivityEventKey?: string
  private activityStartedAtMs?: number
  private removeBleStatusListener?: () => void
  private bleReady = false
  private flushing = false

  private readonly debounceMs: number
  private readonly resendMs: number
  private readonly maxEvents: number
  private readonly activityTimeoutMs: number

  constructor(
    private ble: BleTransport,
    options: StateManagerOptions = {}
  ) {
    super()
    this.debounceMs = options.debounceMs ?? 500
    this.resendMs = options.resendMs ?? 30_000
    this.maxEvents = options.maxEvents ?? 80
    this.activityTimeoutMs = options.activityTimeoutMs ?? 5 * 60_000
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
    if (next !== 'idle') {
      this.lastActiveAgent = 'claude'
      void this.flushGlobalState(true)
    }
    this.refreshAgentActivityTimeout('claude', next)
  }

  setCodexState(next: CodexState, source: string): void {
    this.updateAgent({ codex: next }, `Codex 状态变更为「${labelForAgentState(next)}」（${source}）。`)
    if (next !== 'idle') {
      this.lastActiveAgent = 'codex'
      void this.flushGlobalState(true)
    }
    this.refreshAgentActivityTimeout('codex', next)
  }

  setCodexHookActivity(
    payload: ClaudeHookPayload,
    nextState?: CodexState,
    source = 'Codex 官方 hook'
  ): void {
    this.codexActivity = createCodexActivitySnapshot(payload)
    const activityEventKey = this.codexActivityEventKey(nextState)

    if (nextState) {
      const agentChanged = this.updateAgent(
        { codex: nextState },
        `${source}：${this.codexActivity.label}。${this.codexActivity.detail}`
      )
      if (nextState !== 'idle') {
        this.lastActiveAgent = 'codex'
        void this.flushGlobalState(true)
      }
      this.refreshAgentActivityTimeout('codex', nextState)
      // Codex 阶段可能变化但 running/waiting/idle 不变，ESP32 屏幕也需要刷新。
      this.scheduleFlush()

      if (!agentChanged && activityEventKey !== this.lastCodexActivityEventKey) {
        this.addEvent('info', `${source}：${this.codexActivity.label}。`)
      }

      this.lastCodexActivityEventKey = activityEventKey
      this.emitSnapshot()
      return
    }

    if (activityEventKey !== this.lastCodexActivityEventKey) {
      this.addEvent('info', `${source}：${this.codexActivity.label}。`)
    }

    this.lastCodexActivityEventKey = activityEventKey
    this.scheduleFlush()
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

  setToolIntegrations(next: ToolIntegrationsSnapshot, message?: string): void {
    this.integrations = cloneToolIntegrations(next)

    if (message) {
      this.addEvent('info', message)
    }

    this.emitSnapshot()
  }

  setUpdateStatus(
    next: Partial<UpdateSnapshot>,
    event?: { level: MonitorEvent['level']; message: string }
  ): void {
    const updatedAt = new Date().toISOString()

    this.update =
      next.phase === 'idle'
        ? { ...DEFAULT_UPDATE_SNAPSHOT, ...next, updatedAt }
        : {
            ...this.update,
            ...next,
            updatedAt
          }

    if (event) {
      this.addEvent(event.level, event.message)
    }

    this.emitSnapshot()
  }

  async setManualLed(command: LedCommand): Promise<void> {
    const payload = this.buildManualPayload(command)

    await this.ble.sendPayload(payload)
    this.lastSentPayload = payload
    this.addEvent('info', `已发送手动灯控指令：${command} / ${payload}。`)
    this.emitSnapshot()
  }

  getSnapshot(): MonitorSnapshot {
    return {
      agent: { ...this.agent },
      codexActivity: { ...this.codexActivity },
      ble: this.ble.getSnapshot(),
      island: { ...this.island },
      integrations: cloneToolIntegrations(this.integrations),
      update: { ...this.update },
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

  private updateAgent(patch: Partial<Pick<AgentState, 'claude' | 'codex'>>, message: string): boolean {
    const previousGlobal = this.agent.global
    const nextClaude = patch.claude ?? this.agent.claude
    const nextCodex = patch.codex ?? this.agent.codex
    const nextGlobal = computeGlobalState({ claude: nextClaude, codex: nextCodex })
    const changed =
      nextClaude !== this.agent.claude ||
      nextCodex !== this.agent.codex ||
      nextGlobal !== this.agent.global

    if (!changed) {
      return false
    }

    this.agent = {
      claude: nextClaude,
      codex: nextCodex,
      global: nextGlobal
    }
    this.updateActivityTimer(previousGlobal, nextGlobal)

    // UI 需要立即看到每个 CLI 的状态；硬件灯写入会防抖，避免短暂状态抖动造成闪烁。
    this.addEvent('info', message)
    this.scheduleFlush()
    this.emitSnapshot()
    return true
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
        `Claude 超过 ${this.timeoutSeconds(timeoutMs)} 秒没有新的活动，已恢复为空闲。`
      )
      return
    }

    if (this.agent.codex === 'idle') {
      return
    }

    this.codexActivity = {
      phase: 'idle',
      label: 'Codex 可能已停止',
      detail: `超过 ${this.timeoutSeconds(timeoutMs)} 秒没有收到新的 Codex 活动，已自动恢复为空闲。`,
      updatedAt: new Date().toISOString()
    }
    this.updateAgent(
      { codex: 'idle' },
      `Codex 超过 ${this.timeoutSeconds(timeoutMs)} 秒没有新的活动，已恢复为空闲。`
    )
  }

  private timeoutSeconds(timeoutMs: number): number {
    return Math.round(timeoutMs / 1000)
  }

  private codexActivityEventKey(state?: CodexState): string {
    return [
      state ?? this.agent.codex,
      this.codexActivity.phase,
      this.codexActivity.eventName,
      this.codexActivity.toolName,
      this.codexActivity.toolUseId,
      this.codexActivity.command,
      this.codexActivity.detail
    ]
      .filter(Boolean)
      .join('\u001f')
  }

  private async flushGlobalState(force = false): Promise<void> {
    if (this.flushing) {
      return
    }

    const command = ledCommandForGlobalState(this.agent.global)
    const payload = buildMonitorStatusPayload(this.agent, this.codexActivity.phase, this.buildHardwareMetadata())
    const bleSnapshot = this.ble.getSnapshot()
    const bleWritable = bleSnapshot.state === 'connected' || bleSnapshot.state === 'mock'

    // ESP32 屏幕需要全局颜色、Claude/Codex 状态和 Codex 阶段，不能只比较灯色。
    if (!force && payload === this.lastSentPayload) {
      return
    }

    // 没有硬件连接时不尝试写入，避免重复产生“同步失败”事件。
    if (!bleWritable) {
      this.emitSnapshot()
      return
    }

    this.flushing = true

    try {
      await this.ble.sendPayload(payload)
      this.lastSentPayload = payload
      this.addEvent('info', `已同步硬件状态：${command} / ${payload}。`)
    } catch (error) {
      this.addEvent('warning', `硬件灯同步失败：${errorMessage(error)}`)
    } finally {
      this.flushing = false
    }

    this.emitSnapshot()
  }

  private buildManualPayload(command: LedCommand): BlePayload {
    if (command === 'B') {
      return command
    }

    const agent = this.agentForManualCommand(command)
    return buildMonitorStatusPayload(
      {
        ...agent,
        global: computeGlobalState(agent)
      },
      this.codexActivity.phase === 'idle' ? 'idle' : 'tool-start',
      this.buildHardwareMetadata(agent)
    )
  }

  private updateActivityTimer(previousGlobal: GlobalState, nextGlobal: GlobalState): void {
    if (nextGlobal === 'green') {
      this.activityStartedAtMs = undefined
      return
    }

    if (previousGlobal !== nextGlobal || !this.activityStartedAtMs) {
      this.activityStartedAtMs = Date.now()
    }
  }

  private buildHardwareMetadata(
    agent: Pick<AgentState, 'claude' | 'codex'> = this.agent
  ): MonitorStatusMetadata {
    return {
      activeTool: this.hardwareActiveTool(agent),
      project: this.hardwareProject(),
      elapsedSec: this.hardwareElapsedSeconds(agent),
      summary: this.hardwareSummary(agent)
    }
  }

  private hardwareActiveTool(agent: Pick<AgentState, 'claude' | 'codex'>): string | undefined {
    if (agent.codex !== 'idle') {
      return this.codexActivity.toolName ?? 'Codex'
    }

    if (agent.claude !== 'idle') {
      return 'Claude'
    }

    return undefined
  }

  private hardwareProject(): string | undefined {
    if (!this.codexActivity.cwd) {
      return undefined
    }

    return basename(this.codexActivity.cwd)
  }

  private hardwareElapsedSeconds(agent: Pick<AgentState, 'claude' | 'codex'>): number {
    if (computeGlobalState(agent) === 'green' || !this.activityStartedAtMs) {
      return 0
    }

    return Math.max(0, Math.floor((Date.now() - this.activityStartedAtMs) / 1000))
  }

  private hardwareSummary(agent: Pick<AgentState, 'claude' | 'codex'>): string | undefined {
    if (agent.codex !== 'idle') {
      return (
        this.codexActivity.command ??
        this.codexActivity.toolName ??
        this.codexActivity.eventName ??
        this.codexActivity.phase
      )
    }

    if (agent.claude !== 'idle') {
      return 'Claude activity'
    }

    return undefined
  }

  private agentForManualCommand(command: LedCommand): Pick<AgentState, 'claude' | 'codex'> {
    const manualState = command === 'Y' ? 'waiting' : command === 'R' ? 'running' : 'idle'

    if (manualState === 'idle') {
      return { claude: 'idle', codex: 'idle' }
    }

    if (this.agent.claude !== 'idle' || this.agent.codex !== 'idle') {
      return {
        claude: this.agent.claude,
        codex: this.agent.codex
      }
    }

    if (this.lastActiveAgent === 'claude') {
      return { claude: manualState, codex: 'idle' }
    }

    return { claude: 'idle', codex: manualState }
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

function createInitialToolIntegrations(): ToolIntegrationsSnapshot {
  const updatedAt = new Date().toISOString()

  return {
    claude: {
      installed: false,
      hookStatus: 'disabled',
      hookScriptPath: '',
      configPath: '',
      diagnostic: '尚未检测 Claude 集成状态。',
      updatedAt
    },
    codex: {
      installed: false,
      hookStatus: 'disabled',
      hookScriptPath: '',
      configPath: '',
      diagnostic: '尚未检测 Codex 集成状态。',
      updatedAt
    }
  }
}

function cloneToolIntegrations(value: ToolIntegrationsSnapshot): ToolIntegrationsSnapshot {
  return {
    claude: { ...value.claude },
    codex: { ...value.codex }
  }
}
