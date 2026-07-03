#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const root = process.cwd()
const tempDir = await mkdtemp(path.join(tmpdir(), 'ai-cli-monitor-test-'))

try {
  const watcherOutfile = path.join(tempDir, 'codexProcessWatcher.mjs')
  const stateOutfile = path.join(tempDir, 'state.mjs')

  await Promise.all([
    build({
      entryPoints: [path.join(root, 'src/main/cli/codexProcessWatcher.ts')],
      outfile: watcherOutfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'silent'
    }),
    build({
      entryPoints: [path.join(root, 'src/shared/state.ts')],
      outfile: stateOutfile,
      bundle: true,
      platform: 'node',
      format: 'esm',
      target: 'node20',
      logLevel: 'silent'
    })
  ])

  const { sessionActivityForEvent } = await import(pathToFileURL(watcherOutfile).href)
  const { createCodexActivitySnapshot, mapCodexActivityToState } = await import(
    pathToFileURL(stateOutfile).href
  )

  assertActivity(
    sessionActivityForEvent(event({ type: 'function_call', name: 'request_user_input' })),
    'waiting',
    'PermissionRequest',
    'request_user_input'
  )

  assertActivity(
    sessionActivityForEvent(
      event({
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({
          cmd: 'npm run dev',
          sandbox_permissions: 'require_escalated',
          justification: 'Allow dev server?'
        })
      })
    ),
    'waiting',
    'PermissionRequest',
    'exec_command'
  )

  assertActivity(
    sessionActivityForEvent(
      event({
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'npm run typecheck' })
      })
    ),
    'running',
    'PreToolUse',
    'exec_command'
  )

  assertActivity(
    sessionActivityForEvent(event({ type: 'function_call_output' }), 'exec_command'),
    'running',
    'PostToolUse',
    'exec_command'
  )

  assertActivity(
    sessionActivityForEvent(event({ type: 'task_complete', last_agent_message: 'done' })),
    'idle',
    'Stop',
    undefined
  )

  assert.equal(
    mapCodexActivityToState({
      tool_name: 'request_user_input',
      tool_input: { questions: [] }
    }),
    'waiting'
  )

  assert.equal(
    mapCodexActivityToState({
      hook_event_name: 'PreToolUse',
      tool_name: 'exec_command',
      tool_input: { cmd: 'npm run dev', sandbox_permissions: 'require_escalated' }
    }),
    'waiting'
  )

  const approvalSnapshot = createCodexActivitySnapshot({
    hook_event_name: 'PreToolUse',
    tool_name: 'exec_command',
    tool_input: { cmd: 'npm run dev', sandbox_permissions: 'require_escalated' }
  })
  assert.equal(approvalSnapshot.phase, 'permission')
  assert.equal(approvalSnapshot.command, 'npm run dev')

  console.log('codex session activity tests passed')
} finally {
  await rm(tempDir, { recursive: true, force: true })
}

function event(payload) {
  return {
    timestamp: new Date().toISOString(),
    type: 'response_item',
    payload: {
      call_id: 'call_test',
      ...payload
    }
  }
}

function assertActivity(activity, state, eventName, toolName) {
  assert.ok(activity)
  assert.equal(activity.state, state)
  assert.equal(activity.payload.hook_event_name, eventName)
  assert.equal(activity.payload.tool_name, toolName)
}
