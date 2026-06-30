import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import type {
  MonitoredTool,
  ToolHookStatus,
  ToolIntegrationSnapshot,
  ToolIntegrationsSnapshot
} from '../../shared/types'

type JsonObject = Record<string, unknown>

type ToolSpec = {
  tool: MonitoredTool
  commandName: string
  configPath: string
  scriptPath: string
  scriptContent: string
  events: string[]
  matcher: string
  legacyScriptPaths: string[]
}

const execFileAsync = promisify(execFile)

const CLAUDE_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionEnd'
]

const CODEX_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'Notification',
  'PreCompact',
  'PostCompact',
  'SubagentStart',
  'SubagentStop',
  'Stop'
]

const CLAUDE_HOOK_SCRIPT = `#!/usr/bin/env node

const http = require('node:http')

const HOST = '127.0.0.1'
const PORT = 17361

function readStdin() {
  return new Promise((resolve) => {
    const chunks = []

    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))

    if (process.stdin.isTTY) {
      resolve('{}')
    }
  })
}

function postJson(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')

  return new Promise((resolve) => {
    const request = http.request(
      {
        host: HOST,
        port: PORT,
        path: '/hooks/claude',
        method: 'POST',
        timeout: 500,
        headers: {
          'content-type': 'application/json',
          'content-length': body.length
        }
      },
      (response) => {
        response.resume()
        response.on('end', resolve)
      }
    )

    request.on('error', resolve)
    request.on('timeout', () => {
      request.destroy()
      resolve()
    })
    request.end(body)
  })
}

async function main() {
  const raw = await readStdin()
  let payload = {}

  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = { raw }
  }

  if (process.env.CLAUDE_EVENT && !payload.hook_event_name) {
    payload.hook_event_name = process.env.CLAUDE_EVENT
  }

  await postJson(payload)
}

main()
  .catch(() => undefined)
  .finally(() => {
    process.exit(0)
  })
`

const CODEX_HOOK_SCRIPT = `#!/usr/bin/env node

const http = require('node:http')

const HOST = '127.0.0.1'
const PORT = 17361

function readStdin() {
  return new Promise((resolve) => {
    const chunks = []

    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))

    if (process.stdin.isTTY) {
      resolve('{}')
    }
  })
}

function postJson(payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')

  return new Promise((resolve) => {
    const request = http.request(
      {
        host: HOST,
        port: PORT,
        path: '/hooks/codex',
        method: 'POST',
        timeout: 500,
        headers: {
          'content-type': 'application/json',
          'content-length': body.length
        }
      },
      (response) => {
        response.resume()
        response.on('end', resolve)
      }
    )

    request.on('error', resolve)
    request.on('timeout', () => {
      request.destroy()
      resolve()
    })
    request.end(body)
  })
}

async function main() {
  const raw = await readStdin()
  let payload = {}

  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch {
    payload = { raw }
  }

  const hookEventName =
    process.env.CODEX_HOOK_EVENT_NAME ||
    process.env.CODEX_HOOK_EVENT ||
    process.env.CODEX_EVENT ||
    process.env.HOOK_EVENT_NAME

  if (hookEventName && !payload.hook_event_name) {
    payload.hook_event_name = hookEventName
  }

  await postJson(payload)
}

main()
  .catch(() => undefined)
  .finally(() => {
    process.exit(0)
  })
`

export class ToolIntegrationManager {
  private readonly specs: Record<MonitoredTool, ToolSpec>
  private lastActionErrors: Partial<Record<MonitoredTool, string>> = {}

  constructor() {
    const home = homedir()
    const codexHome = process.env.CODEX_HOME ?? join(home, '.codex')

    this.specs = {
      claude: {
        tool: 'claude',
        commandName: 'claude',
        configPath: join(home, '.claude', 'settings.json'),
        scriptPath: join(home, '.claude', 'ai-cli-monitor-claude-hook.js'),
        scriptContent: CLAUDE_HOOK_SCRIPT,
        events: CLAUDE_EVENTS,
        matcher: '',
        legacyScriptPaths: [join(home, '.claude', 'claude-hook.js')]
      },
      codex: {
        tool: 'codex',
        commandName: 'codex',
        configPath: join(codexHome, 'hooks.json'),
        scriptPath: join(codexHome, 'ai-cli-monitor-codex-hook.js'),
        scriptContent: CODEX_HOOK_SCRIPT,
        events: CODEX_EVENTS,
        matcher: '*',
        legacyScriptPaths: [join(codexHome, 'codex-hook.js')]
      }
    }
  }

  async refresh(clearActionErrors = true): Promise<ToolIntegrationsSnapshot> {
    if (clearActionErrors) {
      this.lastActionErrors = {}
    }

    const [claude, codex] = await Promise.all([
      this.inspectTool(this.specs.claude),
      this.inspectTool(this.specs.codex)
    ])

    return { claude, codex }
  }

  async setHookEnabled(
    tool: MonitoredTool,
    enabled: boolean
  ): Promise<ToolIntegrationsSnapshot> {
    const spec = this.specs[tool]

    try {
      if (enabled) {
        await this.enableHook(spec)
      } else {
        await this.disableHook(spec)
      }

      delete this.lastActionErrors[tool]
    } catch (error) {
      this.lastActionErrors[tool] = errorMessage(error)
    }

    return this.refresh(false)
  }

  private async inspectTool(spec: ToolSpec): Promise<ToolIntegrationSnapshot> {
    const [executablePath, hookInspection] = await Promise.all([
      this.findExecutable(spec.commandName),
      this.inspectHookConfig(spec)
    ])
    const actionError = this.lastActionErrors[spec.tool]
    const hookStatus: ToolHookStatus = actionError ? 'error' : hookInspection.status
    const diagnostic = actionError ?? hookInspection.diagnostic

    return {
      installed: Boolean(executablePath),
      executablePath,
      hookStatus,
      hookScriptPath: spec.scriptPath,
      configPath: spec.configPath,
      diagnostic,
      updatedAt: new Date().toISOString()
    }
  }

  private async inspectHookConfig(spec: ToolSpec): Promise<{
    status: ToolHookStatus
    diagnostic?: string
  }> {
    try {
      const config = await this.readConfig(spec.configPath)
      const hooks = isRecord(config.hooks) ? config.hooks : {}
      const configuredCount = spec.events.filter((eventName) =>
        eventHasManagedHook(hooks[eventName], spec)
      ).length

      if (configuredCount === spec.events.length) {
        return { status: 'enabled', diagnostic: 'Hook 已配置。' }
      }

      if (configuredCount > 0) {
        return {
          status: 'partial',
          diagnostic: `Hook 部分配置：${configuredCount}/${spec.events.length} 个事件。`
        }
      }

      return { status: 'disabled', diagnostic: 'Hook 未配置。' }
    } catch (error) {
      return {
        status: 'error',
        diagnostic: `Hook 配置读取失败：${errorMessage(error)}`
      }
    }
  }

  private async enableHook(spec: ToolSpec): Promise<void> {
    await this.writeHookScript(spec)

    const config = await this.readConfig(spec.configPath)
    const hooks = isRecord(config.hooks) ? { ...config.hooks } : {}

    for (const eventName of spec.events) {
      hooks[eventName] = [
        ...removeManagedHookEntries(hooks[eventName], spec),
        createHookEntry(spec)
      ]
    }

    await this.writeConfig(spec.configPath, {
      ...config,
      hooks
    })
  }

  private async disableHook(spec: ToolSpec): Promise<void> {
    const config = await this.readConfig(spec.configPath)
    const hooks = isRecord(config.hooks) ? { ...config.hooks } : {}

    for (const eventName of spec.events) {
      const nextEntries = removeManagedHookEntries(hooks[eventName], spec)

      if (nextEntries.length > 0) {
        hooks[eventName] = nextEntries
      } else {
        delete hooks[eventName]
      }
    }

    await this.writeConfig(spec.configPath, {
      ...config,
      hooks
    })
  }

  private async writeHookScript(spec: ToolSpec): Promise<void> {
    await mkdir(dirname(spec.scriptPath), { recursive: true })
    await writeFile(spec.scriptPath, spec.scriptContent, 'utf8')
    await chmod(spec.scriptPath, 0o755).catch(() => undefined)
  }

  private async readConfig(configPath: string): Promise<JsonObject> {
    try {
      const raw = await readFile(configPath, 'utf8')

      if (!raw.trim()) {
        return {}
      }

      const parsed: unknown = JSON.parse(raw)

      if (!isRecord(parsed)) {
        throw new Error('配置文件根节点不是 JSON 对象。')
      }

      return parsed
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return {}
      }

      throw error
    }
  }

  private async writeConfig(configPath: string, config: JsonObject): Promise<void> {
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  }

  private async findExecutable(commandName: string): Promise<string | undefined> {
    try {
      if (process.platform === 'win32') {
        const result = await execFileAsync('where.exe', [commandName], { timeout: 2000 })
        return firstOutputLine(result.stdout)
      }

      const shell = process.env.SHELL ?? '/bin/sh'
      const result = await execFileAsync(shell, ['-lc', `command -v ${commandName}`], {
        timeout: 2000
      })
      const executablePath = firstOutputLine(result.stdout)

      if (!executablePath) {
        return undefined
      }

      await access(executablePath, constants.X_OK)
      return executablePath
    } catch {
      return undefined
    }
  }
}

function createHookEntry(spec: ToolSpec): JsonObject {
  return {
    matcher: spec.matcher,
    hooks: [
      {
        type: 'command',
        command: `node ${quoteCommandPath(spec.scriptPath)}`
      }
    ]
  }
}

function removeManagedHookEntries(value: unknown, spec: ToolSpec): unknown[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!isRecord(entry)) {
        return entry
      }

      if (!Array.isArray(entry.hooks)) {
        return entry
      }

      return {
        ...entry,
        hooks: entry.hooks.filter((hook) => !isManagedHook(hook, spec))
      }
    })
    .filter((entry) => !isRecord(entry) || !Array.isArray(entry.hooks) || entry.hooks.length > 0)
}

function eventHasManagedHook(value: unknown, spec: ToolSpec): boolean {
  if (!Array.isArray(value)) {
    return false
  }

  return value.filter(isRecord).some((entry) => {
    if (!Array.isArray(entry.hooks)) {
      return false
    }

    return entry.hooks.some((hook) => isManagedHook(hook, spec))
  })
}

function isManagedHook(value: unknown, spec: ToolSpec): boolean {
  if (!isRecord(value) || typeof value.command !== 'string') {
    return false
  }

  return isManagedCommand(value.command, spec)
}

function isManagedCommand(command: string, spec: ToolSpec): boolean {
  const normalizedCommand = normalizePathText(command)
  const candidates = [
    spec.scriptPath,
    ...spec.legacyScriptPaths,
    `ai-cli-monitor-${spec.tool}-hook.js`,
    `ai-cli-monitor/scripts/${spec.tool}-hook.js`
  ].map(normalizePathText)

  return candidates.some((candidate) => normalizedCommand.includes(candidate))
}

function quoteCommandPath(value: string): string {
  if (process.platform === 'win32') {
    return `"${value.replace(/"/g, '\\"')}"`
  }

  return `"${value.replace(/(["\\$`])/g, '\\$1')}"`
}

function firstOutputLine(value: string | Buffer): string | undefined {
  const output = String(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  return output || undefined
}

function normalizePathText(value: string): string {
  return value.replace(/\\/g, '/')
}

function isRecord(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
