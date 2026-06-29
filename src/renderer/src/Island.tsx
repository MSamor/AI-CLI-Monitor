import { Activity, Bluetooth, Circle, Terminal, Zap } from 'lucide-react'
import { useState } from 'react'
import type {
  AgentState,
  BleConnectionState,
  ClaudeState,
  CodexState,
  GlobalState,
  MonitorSnapshot
} from '../../shared/types'

export function Island({ snapshot }: { snapshot: MonitorSnapshot }): JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const activeItems = activeAgentItems(snapshot.agent)
  const latestEvent = snapshot.events[0]

  const expand = (): void => {
    if (expanded) {
      return
    }

    setExpanded(true)
    void window.aiMonitor.setDesktopIslandExpanded(true)
  }

  const collapse = (): void => {
    if (!expanded) {
      return
    }

    setExpanded(false)
    void window.aiMonitor.setDesktopIslandExpanded(false)
  }

  return (
    <main
      className={`island island-${snapshot.agent.global} ${expanded ? 'island-expanded' : 'island-compact'}`}
      onClick={expand}
      onMouseLeave={collapse}
    >
      <div className="islandPulse" />
      <div className="islandContent">
        <div className="islandTitle">{islandTitle(snapshot.agent)}</div>
        <div className="islandAgents">
          {activeItems.length === 0 ? (
            <div className="islandAgent islandAgent-idle">
              <Activity size={11} />
              <span>全部空闲</span>
            </div>
          ) : (
            activeItems.map((item) => (
              <div className={`islandAgent islandAgent-${item.state}`} key={item.name}>
                {item.name === 'Claude' ? <Activity size={11} /> : <Terminal size={11} />}
                <span>{item.name}</span>
                <strong>{labelForAgentState(item.state)}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      {expanded ? (
        <section className="islandDetails">
          <IslandMetric
            icon={<Activity size={13} />}
            label="Claude"
            value={labelForAgentState(snapshot.agent.claude)}
            tone={snapshot.agent.claude}
          />
          <IslandMetric
            icon={<Terminal size={13} />}
            label="Codex"
            value={labelForAgentState(snapshot.agent.codex)}
            tone={snapshot.agent.codex}
          />
          <IslandMetric
            icon={<Bluetooth size={13} />}
            label="蓝牙"
            value={labelForBleState(snapshot.ble.state)}
            tone={toneForBleState(snapshot.ble.state)}
          />
          <IslandMetric
            icon={<Circle size={13} />}
            label="灯控"
            value={snapshot.ble.lastCommand ?? commandForGlobal(snapshot.agent.global)}
            tone={snapshot.agent.global}
          />
          <div className="islandEvent">
            <Zap size={12} />
            <span>{latestEvent?.message ?? '暂无事件'}</span>
          </div>
        </section>
      ) : null}
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
  tone: ClaudeState | CodexState | GlobalState | 'connected' | 'scanning' | 'error' | 'mock'
}): JSX.Element {
  return (
    <div className={`islandMetric islandMetric-${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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

function islandTitle(agent: AgentState): string {
  if (agent.global === 'red') {
    return '运行中'
  }

  if (agent.global === 'yellow') {
    return '等待'
  }

  return '空闲'
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return '运行'
  }

  if (state === 'waiting') {
    return '等待'
  }

  return '空闲'
}

function labelForBleState(state: BleConnectionState): string {
  const labels: Record<BleConnectionState, string> = {
    idle: '未启',
    scanning: '扫描',
    connecting: '连接',
    connected: '已连',
    reconnecting: '重连',
    mock: '模拟',
    error: '异常'
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
