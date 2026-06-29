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

const islandSpring = {
  type: 'spring',
  stiffness: 460,
  damping: 36,
  mass: 0.8
} as const
const COLLAPSE_DELAY_MS = 3000

export function Island({ snapshot }: { snapshot: MonitorSnapshot }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(false)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeItems = activeAgentItems(snapshot.agent)
  const visibleItems = activeItems.length > 0 ? activeItems : idleAgentItems()
  const recentEvents = snapshot.events.slice(0, 2)

  useEffect(() => clearCollapseTimer, [])
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

    if (expanded) {
      return
    }

    expandedRef.current = true
    setExpanded(true)
    void window.aiMonitor.setDesktopIslandExpanded(true)
  }

  const collapse = (): void => {
    clearCollapseTimer()

    if (!expandedRef.current) {
      return
    }

    expandedRef.current = false
    setExpanded(false)
    void window.aiMonitor.setDesktopIslandExpanded(false)
  }

  const clearCollapseTimer = (): void => {
    if (!collapseTimerRef.current) {
      return
    }

    clearTimeout(collapseTimerRef.current)
    collapseTimerRef.current = undefined
  }

  return (
    <motion.main
      layout
      className={`island island-${snapshot.agent.global} ${expanded ? 'island-expanded' : 'island-compact'}`}
      onPointerDown={clearCollapseTimer}
      initial={{ opacity: 0, scale: 0.88, y: -8 }}
      animate={{
        opacity: 1,
        scale: 1,
        y: 0
      }}
      transition={islandSpring}
    >
      <div className="islandDragHandle" title="拖拽移动灵动岛">
        <Grip size={12} />
      </div>

      <button className="islandTapSurface" type="button" onClick={expand}>
        <motion.span
          className="islandPulse"
          animate={{
            scale: snapshot.agent.global === 'red' ? [0.9, 1.22, 0.9] : [0.94, 1.08, 0.94]
          }}
          transition={{
            duration: snapshot.agent.global === 'red' ? 1.1 : 1.9,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
        />
        <span className="islandTitle">{islandTitle(snapshot.agent)}</span>
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
        <span className="islandMeta">{activeCliLabel(snapshot.agent)}</span>
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
            transition={{ duration: 0.2, ease: 'easeOut' }}
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
            <div className="islandCodexStep">
              <Activity size={12} />
              <span>{snapshot.codexActivity.label}</span>
              <strong>{snapshot.codexActivity.toolName ?? snapshot.codexActivity.eventName ?? 'hook'}</strong>
            </div>
            {snapshot.codexActivity.command ? (
              <div className="islandDiagnostic">{snapshot.codexActivity.command}</div>
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
    </motion.main>
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
      transition={{ duration: 0.18, ease: 'easeOut' }}
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

function islandTitle(agent: AgentState): string {
  if (agent.global === 'red') {
    return 'AI 生成中'
  }

  if (agent.global === 'yellow') {
    return '等待确认'
  }

  return '空闲'
}

function activeCliLabel(agent: AgentState): string {
  const names = [
    agent.claude === 'running' ? 'Claude' : undefined,
    agent.codex === 'running' ? 'Codex' : undefined
  ].filter(Boolean)

  if (names.length > 0) {
    return names.join(' / ')
  }

  if (agent.claude === 'waiting') {
    return 'Claude 确认'
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
