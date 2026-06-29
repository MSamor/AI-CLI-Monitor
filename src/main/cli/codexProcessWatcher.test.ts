import { describe, expect, it } from 'vitest'
import { isCodexProcess } from './codexProcessWatcher'

describe('isCodexProcess', () => {
  it('matches codex command names', () => {
    expect(isCodexProcess({ pid: 20, ppid: 1, command: 'codex', args: 'codex' }, 10, 9)).toBe(true)
    expect(
      isCodexProcess({ pid: 20, ppid: 1, command: 'codex.exe', args: 'codex.exe' }, 10, 9)
    ).toBe(true)
  })

  it('matches codex in command line args', () => {
    expect(
      isCodexProcess(
        { pid: 20, ppid: 1, command: 'node', args: '/usr/local/bin/node /usr/local/bin/codex' },
        10,
        9
      )
    ).toBe(true)
  })

  it('ignores the monitor process itself', () => {
    expect(isCodexProcess({ pid: 10, ppid: 1, command: 'codex', args: 'codex' }, 10, 9)).toBe(
      false
    )
    expect(isCodexProcess({ pid: 9, ppid: 1, command: 'codex', args: 'codex' }, 10, 9)).toBe(
      false
    )
  })
})
