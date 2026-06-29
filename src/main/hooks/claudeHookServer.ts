import http from 'node:http'
import { HOOK_SERVER_HOST, HOOK_SERVER_PORT } from '../../shared/protocol'
import { mapClaudeHookToState, mapCodexActivityToState } from '../../shared/state'
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
    if (request.method !== 'POST' || !request.url) {
      this.writeJson(response, 404, { ok: false, error: '未找到接口' })
      return
    }

    try {
      const payload = await readJsonBody(request)
      const url = new URL(request.url, `http://${HOOK_SERVER_HOST}:${HOOK_SERVER_PORT}`)

      if (url.pathname === '/hooks/claude') {
        this.handleClaudePayload(payload, response)
        return
      }

      if (url.pathname === '/hooks/codex') {
        this.handleCodexPayload(payload, response)
        return
      }

      this.writeJson(response, 404, { ok: false, error: '未找到接口' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.writeJson(response, 400, { ok: false, error: message })
    }
  }

  private handleClaudePayload(
    payload: ClaudeHookPayload,
    response: http.ServerResponse
  ): void {
    const nextState = mapClaudeHookToState(payload)

    // 未识别的钩子事件也返回 200，避免监听器版本差异阻塞 Claude CLI。
    if (nextState) {
      const source = payload.hook_event_name ?? payload.event ?? '未知事件'
      this.stateManager.setClaudeState(nextState, String(source))
    }

    this.writeJson(response, 200, { ok: true, state: nextState ?? null })
  }

  private handleCodexPayload(payload: ClaudeHookPayload, response: http.ServerResponse): void {
    const nextState = mapCodexActivityToState(payload)

    if (nextState) {
      const source = payload.hook_event_name ?? payload.event ?? payload.state ?? 'Codex 活动'
      this.stateManager.setCodexState(nextState, String(source))
    }

    this.writeJson(response, 200, { ok: true, state: nextState ?? null })
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
        reject(new Error('请求体过大'))
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
        reject(new Error('请求体不是合法 JSON'))
      }
    })

    request.on('error', reject)
  })
}
