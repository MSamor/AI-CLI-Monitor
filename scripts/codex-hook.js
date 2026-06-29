#!/usr/bin/env node

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

  await postJson(payload)
}

main()
  .catch(() => undefined)
  .finally(() => {
    process.exit(0)
  })
