import http from 'node:http'
import { HOOK_SERVER_HOST, HOOK_SERVER_PORT } from '../../shared/protocol'
import { mapClaudeHookToState } from '../../shared/state'
import type { ClaudeHookPayload } from '../../shared/types'
import type { StateManager } from '../state/stateManager'

export class ClaudeHookServer {
  private server?: http.Server

  constructor(private stateManager: StateManager) {}

  start(): Promise<void> {
    if (this.server) {
      return Promise.resolve()
    }

    this.server = http.createServer((request, response) => {
      void this.handleRequest(request, response)
    })

    return new Promise((resolve, reject) => {
      this.server?.once('error', reject)
      this.server?.listen(HOOK_SERVER_PORT, HOOK_SERVER_HOST, () => {
        this.server?.off('error', reject)
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    if (!this.server) {
      return Promise.resolve()
    }

    const server = this.server
    this.server = undefined

    return new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse
  ): Promise<void> {
    if (request.method !== 'POST' || request.url !== '/hooks/claude') {
      this.writeJson(response, 404, { ok: false, error: 'not_found' })
      return
    }

    try {
      const payload = await readJsonBody(request)
      const nextState = mapClaudeHookToState(payload)

      // Unknown hook events still return 200 so Claude CLI is never blocked by
      // monitor-side version skew.
      if (nextState) {
        const source = payload.hook_event_name ?? payload.event ?? 'unknown'
        this.stateManager.setClaudeState(nextState, String(source))
      }

      this.writeJson(response, 200, { ok: true, state: nextState ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.writeJson(response, 400, { ok: false, error: message })
    }
  }

  private writeJson(response: http.ServerResponse, statusCode: number, body: unknown): void {
    response.writeHead(statusCode, {
      'content-type': 'application/json'
    })
    response.end(JSON.stringify(body))
  }
}

function readJsonBody(request: http.IncomingMessage): Promise<ClaudeHookPayload> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > 1024 * 1024) {
        reject(new Error('request body is too large'))
        request.destroy()
        return
      }

      chunks.push(chunk)
    })

    request.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw) as ClaudeHookPayload)
      } catch {
        reject(new Error('invalid json body'))
      }
    })

    request.on('error', reject)
  })
}
