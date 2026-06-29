import { describe, expect, it } from 'vitest'
import { ledCommandForGlobalState } from './protocol'

describe('ledCommandForGlobalState', () => {
  it('maps global states to single byte commands', () => {
    expect(ledCommandForGlobalState('green')).toBe('G')
    expect(ledCommandForGlobalState('yellow')).toBe('Y')
    expect(ledCommandForGlobalState('red')).toBe('R')
  })
})
