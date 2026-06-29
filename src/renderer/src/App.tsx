import {
  Activity,
  Bluetooth,
  Circle,
  Minus,
  MonitorDot,
  Play,
  RefreshCw,
  Terminal,
  X,
  Zap
} from 'lucide-react'
import { useEffect } from 'react'
import type {
  BleConnectionState,
  BleSnapshot,
  ClaudeState,
  CodexState,
  GlobalState,
  LedCommand,
  MonitorEvent
} from '../../shared/types'
import { Island } from './Island'
import { useMonitorStore } from './store'

const commandButtons: Array<{ command: LedCommand; label: string; tone: GlobalState | 'blue' }> = [
  { command: 'G', label: '空闲绿', tone: 'green' },
  { command: 'Y', label: '等待黄', tone: 'yellow' },
  { command: 'R', label: '运行红', tone: 'red' },
  { command: 'B', label: '呼吸蓝', tone: 'blue' }
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
    return <Island agent={snapshot.agent} />
  }

  return (
    <main className="shell">
      <div className="windowChrome">
        <div className="windowTitle">AI 命令行监听器</div>
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
          <div className="eyebrow">AI 命令行状态中枢</div>
          <h1>{labelForGlobal(snapshot.agent.global)}</h1>
          <p className="heroSubline">{globalDescription(snapshot.agent.global)}</p>
        </div>
        <div className="ledPreview" aria-label={`当前灯光状态：${labelForGlobal(snapshot.agent.global)}`}>
          <span />
        </div>
      </section>

      <section className="grid">
        <StatePanel
          icon={<Activity size={22} />}
          label="Claude"
          value={labelForAgentState(snapshot.agent.claude)}
          valueClass={snapshot.agent.claude}
          detail="通过 Claude 钩子接收工具调用和等待状态"
        />
        <StatePanel
          icon={<Terminal size={22} />}
          label="Codex"
          value={labelForAgentState(snapshot.agent.codex)}
          valueClass={snapshot.agent.codex}
          detail="通过跨平台进程监听识别 Codex 是否运行"
        />
        <BlePanel ble={snapshot.ble} />
      </section>

      <section className="workspace">
        <div className="controlPanel">
          <div className="sectionHeader">
            <MonitorDot size={20} />
            <h2>手动灯控</h2>
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
                <Circle size={18} fill="currentColor" />
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
              <Activity size={17} />
              <span>开启灵动岛</span>
            </button>
            <button
              type="button"
              title="关闭桌面灵动岛"
              onClick={() => void window.aiMonitor.setDesktopIslandEnabled(false)}
            >
              <Circle size={17} />
              <span>关闭灵动岛</span>
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

function StatePanel({
  icon,
  label,
  value,
  valueClass,
  detail
}: {
  icon: JSX.Element
  label: string
  value: string
  valueClass: ClaudeState | CodexState
  detail: string
}): JSX.Element {
  return (
    <div className="panel">
      <div className="sectionHeader">
        {icon}
        <h2>{label}</h2>
      </div>
      <div className={`stateValue stateValue-${valueClass}`}>{value}</div>
      <p>{detail}</p>
    </div>
  )
}

function BlePanel({ ble }: { ble: BleSnapshot }): JSX.Element {
  return (
    <div className="panel">
      <div className="sectionHeader">
        <Bluetooth size={22} />
      <h2>蓝牙硬件</h2>
      </div>
      <div className={`stateValue stateValue-${ble.state}`}>{labelForBleState(ble.state)}</div>
      <p>{ble.mode === 'mock' ? '模拟蓝牙通道' : ble.deviceName ?? '正在扫描 AI_LED'}</p>
      <p className="bleHint">BLE GATT 自动连接，无需系统蓝牙手动配对。</p>
      {ble.lastCommand ? <p className="lastCommand">最近指令：{ble.lastCommand}</p> : null}
      {ble.diagnostic ? <p className="diagnostic">{ble.diagnostic}</p> : null}
      <div className="inlineActions">
        <button type="button" title="重新连接蓝牙" onClick={() => void window.aiMonitor.reconnectBle()}>
          <RefreshCw size={17} />
          <span>重连</span>
        </button>
        <button type="button" title="切换模拟蓝牙" onClick={() => void window.aiMonitor.useMockBle()}>
          <Zap size={17} />
          <span>模拟</span>
        </button>
      </div>
    </div>
  )
}

function EventLog({ events }: { events: MonitorEvent[] }): JSX.Element {
  return (
    <div className="logPanel">
      <div className="sectionHeader">
        <Play size={20} />
        <h2>事件流</h2>
      </div>
      <div className="eventList">
        {events.length === 0 ? <div className="empty">暂无事件</div> : null}
        {events.map((event) => (
          <div className={`event event-${event.level}`} key={event.id}>
            <time>{new Date(event.at).toLocaleTimeString()}</time>
            <span>{event.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function labelForGlobal(state: GlobalState): string {
  if (state === 'red') {
    return '运行中'
  }

  if (state === 'yellow') {
    return '等待确认'
  }

  return '空闲待命'
}

function globalDescription(state: GlobalState): string {
  if (state === 'red') {
    return '检测到至少一个 CLI 正在执行任务，硬件灯将保持运行态。'
  }

  if (state === 'yellow') {
    return 'Claude 正在等待用户输入或授权，桌面灵动岛会保留提醒。'
  }

  return 'Claude 与 Codex 当前都没有活跃任务。'
}

function labelForAgentState(state: ClaudeState | CodexState): string {
  if (state === 'running') {
    return '运行中'
  }

  if (state === 'waiting') {
    return '等待中'
  }

  return '空闲'
}

function labelForBleState(state: BleConnectionState): string {
  const labels: Record<BleConnectionState, string> = {
    idle: '未启动',
    scanning: '扫描中',
    connecting: '连接中',
    connected: '已连接',
    reconnecting: '重连中',
    mock: '模拟模式',
    error: '异常'
  }

  return labels[state]
}
