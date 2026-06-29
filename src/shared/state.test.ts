import { describe, expect, it } from 'vitest'
import { computeGlobalState, mapClaudeHookToState } from './state'

describe('computeGlobalState', () => {
  it('returns red when claude is running', () => {
    expect(computeGlobalState({ claude: 'running', codex: 'idle' })).toBe('red')
  })

  it('returns red when codex is running', () => {
    expect(computeGlobalState({ claude: 'waiting', codex: 'running' })).toBe('red')
  })

  it('returns yellow when claude is waiting and codex is idle', () => {
    expect(computeGlobalState({ claude: 'waiting', codex: 'idle' })).toBe('yellow')
  })

  it('returns green when all agents are idle', () => {
    expect(computeGlobalState({ claude: 'idle', codex: 'idle' })).toBe('green')
  })
})

describe('mapClaudeHookToState', () => {
  it('maps tool events to running', () => {
    expect(mapClaudeHookToState({ hook_event_name: 'PreToolUse' })).toBe('running')
    expect(mapClaudeHookToState({ hook_event_name: 'PostToolUse' })).toBe('running')
  })

  it('maps notification to waiting', () => {
    expect(mapClaudeHookToState({ hook_event_name: 'Notification' })).toBe('waiting')
  })

  it('maps stop events to idle', () => {
    expect(mapClaudeHookToState({ hook_event_name: 'Stop' })).toBe('idle')
    expect(mapClaudeHookToState({ hook_event_name: 'SessionEnd' })).toBe('idle')
  })

  it('ignores unknown events', () => {
    expect(mapClaudeHookToState({ hook_event_name: 'SomethingElse' })).toBeUndefined()
  })
})
