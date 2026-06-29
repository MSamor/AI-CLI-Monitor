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
import type { MouseEvent as ReactMouseEvent } from 'react'
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
  | 'error'
  | 'mock'

const islandSpring = {
  type: 'spring',
  stiffness: 460,
  damping: 36,
  mass: 0.8
} as const
const EXPAND_LEAVE_GUARD_MS = 750
const COLLAPSE_DELAY_MS = 120

export function Island({ snapshot }: { snapshot: MonitorSnapshot }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const expandedAtRef = useRef(0)
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const activeItems = activeAgentItems(snapshot.agent)
  const visibleItems = activeItems.length > 0 ? activeItems : idleAgentItems()
  const recentEvents = snapshot.events.slice(0, 2)

  useEffect(() => clearCollapseTimer, [])

  const expand = (): void => {
    clearCollapseTimer()

    if (expanded) {
      return
    }

    expandedAtRef.current = Date.now()
    setExpanded(true)
    void window.aiMonitor.setDesktopIslandExpanded(true)
  }

  const collapse = (): void => {
    clearCollapseTimer()

    if (!expanded) {
      return
    }

    setExpanded(false)
    void window.aiMonitor.setDesktopIslandExpanded(false)
  }

  const requestCollapse = (event: ReactMouseEvent<HTMLElement>): void => {
    if (!expanded) {
      return
    }

    // Electron 调整透明窗口尺寸时可能发出一次假的 mouseleave。
    const elapsed = Date.now() - expandedAtRef.current
    const pointerStillInside =
      event.clientX >= 0 &&
      event.clientX <= window.innerWidth &&
      event.clientY >= 0 &&
      event.clientY <= window.innerHeight

    if (elapsed < EXPAND_LEAVE_GUARD_MS || pointerStillInside) {
      return
    }

    clearCollapseTimer()
    collapseTimerRef.current = setTimeout(collapse, COLLAPSE_DELAY_MS)
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
      onMouseEnter={clearCollapseTimer}
      onMouseLeave={requestCollapse}
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
        <span className="islandMeta">生成 {activeItems.length}</span>
        <span className={`islandBle islandBle-${toneForBleState(snapshot.ble.state)}`}>
          <Bluetooth size={11} />
          {labelForBleState(snapshot.ble.state)}
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
                  {item.name === 'Claude' ? <Brain size={13} /> : <Sparkles size={13} />}
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

function islandTitle(agent: AgentState): string {
  if (agent.global === 'red') {
    return 'AI 输出中'
  }

  if (agent.global === 'yellow') {
    return '等待确认'
  }

  return 'AI 静默'
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return '输出'
  }

  if (state === 'waiting') {
    return '确认'
  }

  return '静默'
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
    green: '没有生成',
    red: '正在输出',
    yellow: '等待确认'
  }

  return labels[state]
}

function toneForBleState(
  state: BleConnectionState
): 'connected' | 'scanning' | 'error' | 'mock' {
  if (state === 'connected') {
    return 'connected'
  }

  if (state === 'mock') {
    return 'mock'
  }

  if (state === 'error') {
    return 'error'
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
