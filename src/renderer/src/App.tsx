import {
  Activity,
  Bluetooth,
  Brain,
  Circle,
  Minus,
  MonitorDot,
  Play,
  RefreshCw,
  Sparkles,
  X,
  Zap
} from 'lucide-react'
import { useEffect } from 'react'
import type {
  BleConnectionState,
  BleSnapshot,
  ClaudeState,
  CodexActivitySnapshot,
  CodexState,
  GlobalState,
  LedCommand,
  MonitorEvent
} from '../../shared/types'
import { Island } from './Island'
import { useMonitorStore } from './store'

const commandButtons: Array<{ command: LedCommand; label: string; tone: GlobalState | 'blue' }> = [
  { command: 'G', label: '静默', tone: 'green' },
  { command: 'Y', label: '待确认', tone: 'yellow' },
  { command: 'R', label: '输出中', tone: 'red' },
  { command: 'B', label: '呼吸', tone: 'blue' }
]

export function App(): JSX.Element {
  const snapshot = useMonitorStore((store) => store.snapshot)
  const error = useMonitorStore((store) => store.error)
  const load = useMonitorStore((store) => store.load)
  const setSnapshot = useMonitorStore((store) => store.setSnapshot)
  const view = new URLSearchParams(window.location.search).get('view')

  useEffect(() => {
    void load()
    return window.aiMonitor?.onSnapshot(setSnapshot)
  }, [load, setSnapshot])

  useEffect(() => {
    document.documentElement.classList.toggle('islandRoot', view === 'island')
    document.body.classList.toggle('islandBody', view === 'island')

    return () => {
      document.documentElement.classList.remove('islandRoot')
      document.body.classList.remove('islandBody')
    }
  }, [view])

  if (error) {
    return (
      <main className="shell">
        <div className="errorPanel">{error}</div>
      </main>
    )
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <div className="loading">正在启动监听器...</div>
      </main>
    )
  }

  if (view === 'island') {
    return <Island snapshot={snapshot} />
  }

  return (
    <main className="shell">
      <div className="windowChrome">
        <div className="windowTitle">AI Stream Ops</div>
        <div className="windowActions">
          <button type="button" title="最小化" onClick={() => void window.aiMonitor.minimizeWindow()}>
            <Minus size={14} />
          </button>
          <button type="button" title="关闭" onClick={() => void window.aiMonitor.closeWindow()}>
            <X size={14} />
          </button>
        </div>
      </div>

      <section className={`statusBand statusBand-${snapshot.agent.global}`}>
        <div>
          <div className="eyebrow">REAL-TIME AI OUTPUT</div>
          <h1>{labelForGlobal(snapshot.agent.global)}</h1>
          <p className="heroSubline">{globalDescription(snapshot.agent.global)}</p>
        </div>
        <div className="statusCluster" aria-label={`当前 AI 输出状态：${labelForGlobal(snapshot.agent.global)}`}>
          <div className={`activeCliChip activeCliChip-${snapshot.agent.global}`}>
            <span className="activeCliDot" />
            <strong>{activeCliLabel(snapshot.agent.claude, snapshot.agent.codex)}</strong>
          </div>
          <div className="statusClusterItem">
            <strong>{activeCount(snapshot.agent.claude, snapshot.agent.codex)}</strong>
            <span>生成源</span>
          </div>
          <div className="ledPreview">
            <span />
          </div>
        </div>
      </section>

      <section className="agentGrid">
        <AgentTrack
          icon={<Brain size={20} />}
          label="Claude"
          state={snapshot.agent.claude}
          detail={agentDetail('Claude', snapshot.agent.claude)}
        />
        <AgentTrack
          icon={<Sparkles size={20} />}
          label="Codex"
          state={snapshot.agent.codex}
          detail={agentDetail('Codex', snapshot.agent.codex)}
          activity={snapshot.codexActivity}
        />
        <BlePanel ble={snapshot.ble} />
      </section>

      <section className="workspace">
        <div className="controlPanel">
          <div className="sectionHeader">
            <MonitorDot size={18} />
            <h2>控制</h2>
          </div>
          <div className="buttonGrid">
            {commandButtons.map((button) => (
              <button
                key={button.command}
                className={`commandButton commandButton-${button.tone}`}
                type="button"
                title={`发送 ${button.command} 指令`}
                onClick={() => void window.aiMonitor.setManualLed(button.command)}
              >
                <Circle size={14} fill="currentColor" />
                <span>{button.label}</span>
              </button>
            ))}
          </div>
          <div className="islandControls">
            <button
              type="button"
              title="开启桌面灵动岛"
              onClick={() => void window.aiMonitor.setDesktopIslandEnabled(true)}
            >
              <Activity size={15} />
              <span>开灵动岛</span>
            </button>
            <button
              type="button"
              title="关闭桌面灵动岛"
              onClick={() => void window.aiMonitor.setDesktopIslandEnabled(false)}
            >
              <Circle size={15} />
              <span>关灵动岛</span>
            </button>
          </div>
          <p className="islandStatus">
            桌面灵动岛：{snapshot.island.enabled ? '已开启' : '未开启'}
          </p>
        </div>

        <EventLog events={snapshot.events} />
      </section>
    </main>
  )
}

function AgentTrack({
  icon,
  label,
  state,
  detail,
  activity
}: {
  icon: JSX.Element
  label: string
  state: ClaudeState | CodexState
  detail: string
  activity?: CodexActivitySnapshot
}): JSX.Element {
  return (
    <div className={`panel agentPanel agentPanel-${state}`}>
      <div className="sectionHeader">
        <span className={`agentLogo agentLogo-${state}`} aria-hidden="true">
          {icon}
        </span>
        <h2>{label}</h2>
        <span className={`statusPill statusPill-${state}`}>{labelForAgentState(state)}</span>
      </div>
      <div className="signalRail" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{detail}</p>
      {activity ? (
        <p className="codexStep">
          {activity.label}
          {activity.toolName ? ` · ${activity.toolName}` : ''}
        </p>
      ) : null}
      {activity?.command ? <p className="codexCommand">{activity.command}</p> : null}
      {activity?.turnId || activity?.model ? (
        <p className="codexMeta">{[activity.turnId, activity.model].filter(Boolean).join(' · ')}</p>
      ) : null}
    </div>
  )
}

function BlePanel({ ble }: { ble: BleSnapshot }): JSX.Element {
  return (
    <div className={`panel blePanel blePanel-${ble.state}`}>
      <div className="sectionHeader">
        <Bluetooth size={20} />
        <h2>蓝牙灯控</h2>
        <span className={`statusPill statusPill-${toneForBleState(ble.state)}`}>
          {labelForBleState(ble.state)}
        </span>
      </div>
      <p>{ble.mode === 'mock' ? '模拟蓝牙通道' : ble.deviceName ?? '等待手动重试'}</p>
      <p className="bleHint">启动后只自动扫描一次；后续需要点击「重连」。</p>
      {ble.lastCommand ? <p className="lastCommand">最近指令：{ble.lastCommand}</p> : null}
      {ble.diagnostic ? <p className="diagnostic">{ble.diagnostic}</p> : null}
      <div className="inlineActions">
        <button type="button" title="重新连接蓝牙" onClick={() => void window.aiMonitor.reconnectBle()}>
          <RefreshCw size={16} />
          <span>重连</span>
        </button>
        <button type="button" title="切换模拟蓝牙" onClick={() => void window.aiMonitor.useMockBle()}>
          <Zap size={16} />
          <span>模拟</span>
        </button>
      </div>
    </div>
  )
}

function EventLog({ events }: { events: MonitorEvent[] }): JSX.Element {
  const visibleEvents = events.slice(0, 3)

  return (
    <div className="logPanel">
      <div className="sectionHeader">
        <Play size={18} />
        <h2>事件流</h2>
        <span className="eventCount">{visibleEvents.length}</span>
      </div>
      <div className="eventList">
        {visibleEvents.length === 0 ? <div className="empty">暂无事件</div> : null}
        {visibleEvents.map((event) => (
          <div className={`event event-${event.level}`} key={event.id}>
            <time>{new Date(event.at).toLocaleTimeString()}</time>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function activeCount(claude: ClaudeState, codex: CodexState): number {
  return [claude, codex].filter((state) => state === 'running').length
}

function activeCliLabel(claude: ClaudeState, codex: CodexState): string {
  const names = [
    claude === 'running' ? 'Claude' : undefined,
    codex === 'running' ? 'Codex' : undefined
  ].filter(Boolean)

  if (names.length > 0) {
    return `${names.join(' / ')} 正在生成`
  }

  if (claude === 'waiting') {
    return 'Claude 等待确认'
  }

  return '暂无 AI 生成'
}

function labelForGlobal(state: GlobalState): string {
  if (state === 'red') {
    return 'AI 正在输出'
  }

  if (state === 'yellow') {
    return '等待你的确认'
  }

  return '没有生成任务'
}

function globalDescription(state: GlobalState): string {
  if (state === 'red') {
    return '检测到 Claude 或 Codex 正在思考、生成或输出内容，硬件灯保持红色。'
  }

  if (state === 'yellow') {
    return 'AI 已暂停在确认点，可能需要授权、输入或继续指令。'
  }

  return 'Claude 与 Codex 当前没有生成输出，桌面灵动岛保持低干扰。'
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return '生成输出中'
  }

  if (state === 'waiting') {
    return '等待确认'
  }

  return '未生成'
}

function agentDetail(agentName: 'Claude' | 'Codex', state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return `${agentName} 正在思考、调用工具或流式输出回复。`
  }

  if (state === 'waiting') {
    return `${agentName} 正在等待你的确认或输入。`
  }

  if (agentName === 'Codex') {
    return '进程在线不代表生成中；wrapper/hook 上报后才点亮。'
  }

  return '未检测到新的 AI 生成或输出事件。'
}

function labelForBleState(state: BleConnectionState): string {
  const labels: Record<BleConnectionState, string> = {
    idle: '待重试',
    scanning: '扫描中',
    connecting: '连接中',
    connected: '已连接',
    reconnecting: '待重连',
    mock: '模拟模式',
    error: '异常'
  }

  return labels[state]
}

function toneForBleState(state: BleConnectionState): 'idle' | 'running' | 'waiting' | 'error' {
  if (state === 'connected' || state === 'mock') {
    return 'running'
  }

  if (state === 'error') {
    return 'error'
  }

  if (state === 'idle') {
    return 'idle'
  }

  return 'waiting'
}
