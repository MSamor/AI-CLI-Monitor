import { EventEmitter } from 'node:events'
import { ledCommandForGlobalState } from '../../shared/protocol'
import { computeGlobalState, DEFAULT_AGENT_STATE } from '../../shared/state'
import type {
  AgentState,
  ClaudeState,
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
}

export class StateManager extends EventEmitter {
  private agent: AgentState = { ...DEFAULT_AGENT_STATE }
  private island = {
    enabled: false,
    visible: false
  }
  private events: MonitorEvent[] = []
  private debounceTimer?: NodeJS.Timeout
  private resendTimer?: NodeJS.Timeout
  private lastSentCommand?: LedCommand
  private removeBleStatusListener?: () => void
  private bleReady = false
  private flushing = false

  private readonly debounceMs: number
  private readonly resendMs: number
  private readonly maxEvents: number

  constructor(
    private ble: BleTransport,
    options: StateManagerOptions = {}
  ) {
    super()
    this.debounceMs = options.debounceMs ?? 500
    this.resendMs = options.resendMs ?? 30_000
    this.maxEvents = options.maxEvents ?? 80
    this.attachBle()
  }

  async start(): Promise<void> {
    await this.ble.start()
    await this.flushGlobalState(true)

    // Hardware LEDs can miss a write during reconnects, so the current state is
    // periodically resent even when no agent state changed.
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
    this.addEvent('info', 'Restarting BLE transport.')
    await this.ble.stop().catch(() => undefined)
    await this.ble.start()
    await this.flushGlobalState(true)
    this.emitSnapshot()
  }

  setClaudeState(next: ClaudeState, source: string): void {
    this.updateAgent({ claude: next }, `Claude is ${next} (${source}).`)
  }

  setCodexState(next: CodexState, source: string): void {
    this.updateAgent({ codex: next }, `Codex is ${next} (${source}).`)
  }

  setDesktopIslandEnabled(enabled: boolean, visible = enabled): void {
    if (this.island.enabled === enabled && this.island.visible === visible) {
      return
    }

    this.island = { enabled, visible }
    this.addEvent('info', `Desktop island ${enabled ? 'enabled' : 'disabled'}.`)
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
    this.addEvent('info', `Manual LED command sent: ${command}.`)
    this.emitSnapshot()
  }

  getSnapshot(): MonitorSnapshot {
    return {
      agent: { ...this.agent },
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

      // Only force a send on the transition into a ready BLE state. A write
      // also updates BLE status, so this guard prevents a send/status loop.
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

    // Agent state changes are pushed to the UI immediately, while BLE writes
    // are debounced so brief process/hook transitions do not flicker the LED.
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

  private async flushGlobalState(force = false): Promise<void> {
    if (this.flushing) {
      return
    }

    const command = ledCommandForGlobalState(this.agent.global)

    // Hardware only needs the global color. The desktop island still receives
    // the full per-CLI state through snapshots for multi-agent display.
    if (!force && command === this.lastSentCommand) {
      return
    }

    this.flushing = true

    try {
      await this.ble.send(command)
      this.lastSentCommand = command
      this.addEvent('info', `LED command sent: ${command}.`)
    } catch (error) {
      this.addEvent('warning', `LED command failed: ${errorMessage(error)}`)
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
