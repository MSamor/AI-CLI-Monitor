import {
  Activity,
  Bluetooth,
  Circle,
  MonitorDot,
  Play,
  RefreshCw,
  Terminal,
  Zap
} from 'lucide-react'
import { useEffect } from 'react'
import type { BleSnapshot, GlobalState, LedCommand, MonitorEvent } from '../../shared/types'
import { Island } from './Island'
import { useMonitorStore } from './store'

const commandButtons: Array<{ command: LedCommand; label: string; tone: GlobalState | 'blue' }> = [
  { command: 'G', label: 'Green', tone: 'green' },
  { command: 'Y', label: 'Yellow', tone: 'yellow' },
  { command: 'R', label: 'Red', tone: 'red' },
  { command: 'B', label: 'Breathe', tone: 'blue' }
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
    document.body.classList.toggle('islandBody', view === 'island')

    return () => {
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
        <div className="loading">Loading monitor...</div>
      </main>
    )
  }

  if (view === 'island') {
    return <Island agent={snapshot.agent} />
  }

  return (
    <main className="shell">
      <section className={`statusBand statusBand-${snapshot.agent.global}`}>
        <div>
          <div className="eyebrow">AI CLI Monitor</div>
          <h1>{labelForGlobal(snapshot.agent.global)}</h1>
        </div>
        <div className="ledPreview" aria-label={`Current LED state: ${snapshot.agent.global}`}>
          <span />
        </div>
      </section>

      <section className="grid">
        <StatePanel
          icon={<Activity size={22} />}
          label="Claude"
          value={snapshot.agent.claude}
          detail="Hook events"
        />
        <StatePanel
          icon={<Terminal size={22} />}
          label="Codex"
          value={snapshot.agent.codex}
          detail="Process watcher"
        />
        <BlePanel ble={snapshot.ble} />
      </section>

      <section className="workspace">
        <div className="controlPanel">
          <div className="sectionHeader">
            <MonitorDot size={20} />
            <h2>Manual LED</h2>
          </div>
          <div className="buttonGrid">
            {commandButtons.map((button) => (
              <button
                key={button.command}
                className={`commandButton commandButton-${button.tone}`}
                type="button"
                title={`Send ${button.command}`}
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
              title="Enable desktop island"
              onClick={() => void window.aiMonitor.setDesktopIslandEnabled(true)}
            >
              <Activity size={17} />
              <span>Open Island</span>
            </button>
            <button
              type="button"
              title="Disable desktop island"
              onClick={() => void window.aiMonitor.setDesktopIslandEnabled(false)}
            >
              <Circle size={17} />
              <span>Close Island</span>
            </button>
          </div>
          <p className="islandStatus">
            Desktop island: {snapshot.island.enabled ? 'enabled' : 'disabled'}
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
  detail
}: {
  icon: JSX.Element
  label: string
  value: string
  detail: string
}): JSX.Element {
  return (
    <div className="panel">
      <div className="sectionHeader">
        {icon}
        <h2>{label}</h2>
      </div>
      <div className={`stateValue stateValue-${value}`}>{value}</div>
      <p>{detail}</p>
    </div>
  )
}

function BlePanel({ ble }: { ble: BleSnapshot }): JSX.Element {
  return (
    <div className="panel">
      <div className="sectionHeader">
        <Bluetooth size={22} />
        <h2>BLE</h2>
      </div>
      <div className={`stateValue stateValue-${ble.state}`}>{ble.state}</div>
      <p>{ble.mode === 'mock' ? 'Mock transport' : ble.deviceName ?? 'Scanning for AI_LED'}</p>
      {ble.lastCommand ? <p className="lastCommand">Last command: {ble.lastCommand}</p> : null}
      {ble.diagnostic ? <p className="diagnostic">{ble.diagnostic}</p> : null}
      <div className="inlineActions">
        <button type="button" title="Reconnect BLE" onClick={() => void window.aiMonitor.reconnectBle()}>
          <RefreshCw size={17} />
          <span>Reconnect</span>
        </button>
        <button type="button" title="Use mock BLE" onClick={() => void window.aiMonitor.useMockBle()}>
          <Zap size={17} />
          <span>Mock</span>
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
        <h2>Events</h2>
      </div>
      <div className="eventList">
        {events.length === 0 ? <div className="empty">No events yet.</div> : null}
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
    return 'Busy'
  }

  if (state === 'yellow') {
    return 'Waiting'
  }

  return 'Ready'
}
