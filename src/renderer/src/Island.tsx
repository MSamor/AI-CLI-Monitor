import { Activity, Terminal } from 'lucide-react'
import type { AgentState, ClaudeState, CodexState } from '../../shared/types'

export function Island({ agent }: { agent: AgentState }): JSX.Element {
  const activeItems = activeAgentItems(agent)

  return (
    <main className={`island island-${agent.global}`}>
      <div className="islandPulse" />
      <div className="islandContent">
        <div className="islandTitle">{islandTitle(agent)}</div>
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
    </main>
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
