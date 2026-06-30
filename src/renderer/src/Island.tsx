import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity,
  Bluetooth,
  Brain,
  Circle,
  Grip,
  Radio,
  Sparkles,
  Timer,
  Zap
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  AgentState,
  BleConnectionState,
  ClaudeState,
  CodexActivitySnapshot,
  CodexState,
  GlobalState,
  MonitorSnapshot
} from '../../shared/types'

type IslandMetricTone =
  | ClaudeState
  | CodexState
  | GlobalState
  | 'connected'
  | 'scanning'

const contentTransition = {
  duration: 0.34,
  ease: 'easeOut'
} as const
const COLLAPSE_DELAY_MS = 1000
const RESIZE_ANIMATION_MS = 460
const EXPAND_CONTENT_DELAY_MS = 120
const EXPANDED_VIEWPORT_WIDTH = 430
const EXPANDED_VIEWPORT_HEIGHT = 252
const VIEWPORT_WAIT_TIMEOUT_MS = 220

export function Island({ snapshot }: { snapshot: MonitorSnapshot }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const [renderExpandedBounds, setRenderExpandedBounds] = useState(false)
  const expandedRef = useRef(false)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const animationFrameRef = useRef<number | undefined>(undefined)
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const expandContentTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeItems = activeAgentItems(snapshot.agent)
  const visibleItems = activeItems.length > 0 ? activeItems : idleAgentItems()
  const recentEvents = snapshot.events.slice(0, 2)
  const compactTitle = islandTitle(snapshot.agent, snapshot.codexActivity)
  const compactSubtitle = islandSubtitle(snapshot.agent, snapshot.codexActivity)
  const codexDetail = codexPrimaryDetail(snapshot.codexActivity)
  const codexDetailWithSource = codexDetail
    ? withSourcePrefix('Codex', codexDetail)
    : undefined

  useEffect(() => {
    return () => {
      clearCollapseTimer()
      clearAnimationFrame()
      clearResizeTimer()
      clearExpandContentTimer()
    }
  }, [])
  useEffect(() => {
    expandedRef.current = expanded
  }, [expanded])
  useEffect(() => {
    return window.aiMonitor.onDesktopIslandBlurred(() => {
      if (!expandedRef.current) {
        return
      }

      clearCollapseTimer()
      collapseTimerRef.current = setTimeout(collapse, COLLAPSE_DELAY_MS)
    })
  }, [])

  const expand = (): void => {
    clearCollapseTimer()
    clearResizeTimer()
    clearExpandContentTimer()

    if (expandedRef.current) {
      return
    }

    expandedRef.current = true
    void (async () => {
      await window.aiMonitor.setDesktopIslandExpanded(true)

      if (!expandedRef.current) {
        return
      }

      waitForViewportSize(EXPANDED_VIEWPORT_WIDTH, EXPANDED_VIEWPORT_HEIGHT, () => {
        setRenderExpandedBounds(true)
        clearExpandContentTimer()
        expandContentTimerRef.current = setTimeout(() => {
          if (expandedRef.current) {
            setExpanded(true)
          }

          expandContentTimerRef.current = undefined
        }, EXPAND_CONTENT_DELAY_MS)
      })
    })()
  }

  const collapse = (): void => {
    clearCollapseTimer()
    clearAnimationFrame()
    clearExpandContentTimer()

    if (!expandedRef.current) {
      return
    }

    expandedRef.current = false
    setExpanded(false)
    setRenderExpandedBounds(false)
    void window.aiMonitor.setDesktopIslandExpanded(false)
    clearResizeTimer()
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = undefined
    }, RESIZE_ANIMATION_MS)
  }

  const clearCollapseTimer = (): void => {
    if (!collapseTimerRef.current) {
      return
    }

    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = undefined
  }

  const clearResizeTimer = (): void => {
    if (!resizeTimerRef.current) {
      return
    }

    clearTimeout(resizeTimerRef.current)
    resizeTimerRef.current = undefined
  }

  const clearExpandContentTimer = (): void => {
    if (!expandContentTimerRef.current) {
      return
    }

    clearTimeout(expandContentTimerRef.current)
    expandContentTimerRef.current = undefined
  }

  const waitForViewportSize = (
    minWidth: number,
    minHeight: number,
    callback: () => void
  ): void => {
    clearAnimationFrame()

    const startedAt = performance.now()
    let readyFrames = 0

    const tick = (): void => {
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = undefined
        const viewportReady = window.innerWidth >= minWidth && window.innerHeight >= minHeight
        const timedOut = performance.now() - startedAt >= VIEWPORT_WAIT_TIMEOUT_MS

        if (viewportReady) {
          readyFrames += 1
        } else {
          readyFrames = 0
        }

        if (readyFrames >= 2 || timedOut) {
          callback()
          return
        }

        tick()
      })
    }

    tick()
  }

  const clearAnimationFrame = (): void => {
    if (animationFrameRef.current === undefined) {
      return
    }

    cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = undefined
  }

  return (
    <main
      className={`island island-${snapshot.agent.global} ${
        renderExpandedBounds ? 'island-expanded' : 'island-compact'
      } ${expanded ? 'island-open' : 'island-closed'}`}
      onPointerDown={clearCollapseTimer}
    >
      <div className="islandShell">
        <div className="islandDragHandle" title="拖拽移动灵动岛">
          <Grip size={12} />
        </div>

        <button
          className="islandTapSurface"
          type="button"
          title={`${compactTitle}：${compactSubtitle}`}
          onClick={expand}
        >
          <span className="islandPulse" />
          <span className="islandTextStack">
            <span className="islandTitle">{compactTitle}</span>
            <span className="islandSubline">{compactSubtitle}</span>
          </span>
          <span className="islandCliStack" aria-label={`当前活跃 CLI：${activeCliLabel(snapshot.agent)}`}>
            {compactAgentItems(snapshot.agent).map((item) => (
              <span
                className={`islandCompactCli islandCompactCli-${item.state}`}
                key={item.name}
                title={`${item.name}：${labelForAgentState(item.state)}`}
              >
                {item.name === 'Claude' ? <Brain size={11} /> : <Sparkles size={11} />}
              </span>
            ))}
          </span>
          <span
            className={`islandBle islandBle-${toneForBleState(snapshot.ble.state)}`}
            title={`蓝牙：${labelForBleState(snapshot.ble.state)}`}
            aria-label={`蓝牙：${labelForBleState(snapshot.ble.state)}`}
          >
            <Bluetooth size={12} />
          </span>
        </button>

        <AnimatePresence>
          {expanded ? (
            <motion.section
              className="islandDetails"
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={contentTransition}
            >
              <div className="islandAgentRow">
                {visibleItems.map((item) => (
                  <div className={`islandAgent islandAgent-${item.state}`} key={item.name}>
                    <span className={`islandAgentLogo islandAgentLogo-${item.state}`} aria-hidden="true">
                      {item.name === 'Claude' ? <Brain size={13} /> : <Sparkles size={13} />}
                    </span>
                    <span>{item.name}</span>
                    <strong>{labelForAgentState(item.state)}</strong>
                  </div>
                ))}
              </div>
              <IslandMetric
                icon={<Circle size={13} />}
                label="全局"
                value={labelForGlobalState(snapshot.agent.global)}
                tone={snapshot.agent.global}
              />
              <IslandMetric
                icon={<Radio size={13} />}
                label="设备"
                value={snapshot.ble.deviceName ?? '未发现设备'}
                tone={toneForBleState(snapshot.ble.state)}
              />
              <IslandMetric
                icon={<Zap size={13} />}
                label="灯控"
                value={snapshot.ble.lastCommand ?? commandForGlobal(snapshot.agent.global)}
                tone={snapshot.agent.global}
              />
              <div className={`islandCodexStep islandCodexStep-${snapshot.agent.codex}`}>
                <Activity size={12} />
                <span>{withSourcePrefix('Codex', snapshot.codexActivity.label)}</span>
                <strong>{snapshot.codexActivity.toolName ?? snapshot.codexActivity.eventName ?? 'hook'}</strong>
              </div>
              {codexDetailWithSource ? (
                <div className="islandDiagnostic">{codexDetailWithSource}</div>
              ) : null}
              {snapshot.codexActivity.turnId || snapshot.codexActivity.model ? (
                <div className="islandDiagnostic">
                  {compactCodexMeta(snapshot.codexActivity.turnId, snapshot.codexActivity.model)}
                </div>
              ) : null}
              <div className="islandEventStack">
                {recentEvents.length === 0 ? (
                  <div className="islandEvent">
                    <Timer size={12} />
                    <span>暂无事件</span>
                  </div>
                ) : (
                  recentEvents.map((event) => (
                    <div className={`islandEvent islandEvent-${event.level}`} key={event.id}>
                      <Timer size={12} />
                      <time>{formatEventTime(event.at)}</time>
                      <span>{event.message}</span>
                    </div>
                  ))
                )}
              </div>
              {snapshot.ble.diagnostic ? (
                <div className="islandDiagnostic">{snapshot.ble.diagnostic}</div>
              ) : null}
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  )
}

function IslandMetric({
  icon,
  label,
  value,
  tone
}: {
  icon: JSX.Element
  label: string
  value: string
  tone: IslandMetricTone
}): JSX.Element {
  return (
    <motion.div
      className={`islandMetric islandMetric-${tone}`}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={contentTransition}
    >
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  )
}

function activeAgentItems(agent: AgentState): Array<{
  name: 'Claude' | 'Codex'
  state: ClaudeState | CodexState
}> {
  const items: Array<{ name: 'Claude' | 'Codex'; state: ClaudeState | CodexState }> = []

  if (agent.claude !== 'idle') {
    items.push({ name: 'Claude', state: agent.claude })
  }

  if (agent.codex !== 'idle') {
    items.push({ name: 'Codex', state: agent.codex })
  }

  return items
}

function idleAgentItems(): Array<{
  name: 'Claude' | 'Codex'
  state: ClaudeState | CodexState
}> {
  return [
    { name: 'Claude', state: 'idle' },
    { name: 'Codex', state: 'idle' }
  ]
}

function compactAgentItems(agent: AgentState): Array<{
  name: 'Claude' | 'Codex'
  state: ClaudeState | CodexState
}> {
  const activeItems = activeAgentItems(agent)

  if (activeItems.length > 0) {
    return activeItems
  }

  return [{ name: 'Codex', state: 'idle' }]
}

function islandTitle(agent: AgentState, activity: CodexActivitySnapshot): string {
  if (shouldUseCodexActivity(agent, activity)) {
    return withSourcePrefix('Codex', activity.label)
  }

  if (agent.global === 'red') {
    return withSourcePrefix(primaryAgentSource(agent), 'AI 生成中')
  }

  if (agent.global === 'yellow') {
    return withSourcePrefix(primaryAgentSource(agent), '等待确认')
  }

  return withSourcePrefix('Codex', activity.label || '空闲')
}

function islandSubtitle(agent: AgentState, activity: CodexActivitySnapshot): string {
  const detail = codexPrimaryDetail(activity)

  if (shouldUseCodexActivity(agent, activity)) {
    return withSourcePrefix('Codex', detail ?? activeCliLabel(agent))
  }

  if (agent.claude !== 'idle') {
    return withSourcePrefix('Claude', claudeActivityDetail(agent.claude))
  }

  return withSourcePrefix('Codex', detail ?? '等待活动')
}

function shouldUseCodexActivity(agent: AgentState, activity: CodexActivitySnapshot): boolean {
  if (agent.codex !== 'idle') {
    return true
  }

  if (agent.claude !== 'idle') {
    return false
  }

  return activity.phase !== 'idle' || Boolean(activity.updatedAt)
}

function primaryAgentSource(agent: AgentState): 'Claude' | 'Codex' {
  if (agent.claude !== 'idle' && agent.codex === 'idle') {
    return 'Claude'
  }

  return 'Codex'
}

function claudeActivityDetail(state: ClaudeState): string {
  if (state === 'waiting') {
    return '等待确认'
  }

  if (state === 'running') {
    return '正在生成'
  }

  return '空闲'
}

function withSourcePrefix(source: 'Claude' | 'Codex', value: string): string {
  const text = normalizeSingleLine(value) ?? '活动'
  const prefix = `${source} · `

  if (text.startsWith(prefix)) {
    return text
  }

  return `${prefix}${stripSourcePrefix(source, text)}`
}

function stripSourcePrefix(source: 'Claude' | 'Codex', value: string): string {
  if (value === source) {
    return '活动'
  }

  const separators = [' · ', '：', ': ', ' ']

  for (const separator of separators) {
    const prefix = `${source}${separator}`

    if (value.startsWith(prefix)) {
      return value.slice(prefix.length).trim() || '活动'
    }
  }

  return value
}

function codexPrimaryDetail(activity: CodexActivitySnapshot): string | undefined {
  return (
    normalizeSingleLine(activity.detail) ??
    normalizeSingleLine(activity.command) ??
    normalizeSingleLine(activity.lastAssistantMessage) ??
    normalizeSingleLine(activity.cwd)
  )
}

function normalizeSingleLine(value?: string): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim()

  return normalized || undefined
}

function activeCliLabel(agent: AgentState): string {
  const waitingNames = [
    agent.claude === 'waiting' ? 'Claude 确认' : undefined,
    agent.codex === 'waiting' ? 'Codex 授权' : undefined
  ].filter(Boolean)

  if (waitingNames.length > 0) {
    return waitingNames.join(' / ')
  }

  const runningNames = [
    agent.claude === 'running' ? 'Claude' : undefined,
    agent.codex === 'running' ? 'Codex' : undefined
  ].filter(Boolean)

  if (runningNames.length > 0) {
    return runningNames.join(' / ')
  }

  return '空闲'
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return '生成'
  }

  if (state === 'waiting') {
    return '确认'
  }

  return '空闲'
}

function labelForBleState(state: BleConnectionState): string {
  const labels: Record<BleConnectionState, string> = {
    idle: '待重试',
    scanning: '扫描',
    connecting: '连接',
    connected: '已连',
    reconnecting: '重连',
    mock: '模拟',
    error: '异常'
  }

  return labels[state]
}

function labelForGlobalState(state: GlobalState): string {
  const labels: Record<GlobalState, string> = {
    green: '空闲',
    red: '生成中',
    yellow: '等待确认'
  }

  return labels[state]
}

function toneForBleState(
  state: BleConnectionState
): 'connected' | 'scanning' {
  if (state === 'connected' || state === 'mock') {
    return 'connected'
  }

  return 'scanning'
}

function commandForGlobal(state: GlobalState): string {
  if (state === 'red') {
    return 'R'
  }

  if (state === 'yellow') {
    return 'Y'
  }

  return 'G'
}

function formatEventTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(value))
}

function compactCodexMeta(turnId?: string, model?: string): string {
  return [turnId ? `turn ${turnId}` : undefined, model].filter(Boolean).join(' · ')
}
