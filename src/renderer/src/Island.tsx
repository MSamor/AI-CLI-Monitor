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
              <Activity size={16} />
              <span>All idle</span>
            </div>
          ) : (
            activeItems.map((item) => (
              <div className={`islandAgent islandAgent-${item.state}`} key={item.name}>
                {item.name === 'Claude' ? <Activity size={16} /> : <Terminal size={16} />}
                <span>{item.name}</span>
                <strong>{item.state}</strong>
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
    return 'AI agents running'
  }

  if (agent.global === 'yellow') {
    return 'Claude needs attention'
  }

  return 'AI agents ready'
}
