import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export type ProcessInfo = {
  pid: number
  ppid: number
  command: string
  args: string
}

export async function listProcesses(): Promise<ProcessInfo[]> {
  if (platform() === 'win32') {
    return listWindowsProcesses()
  }

  return listUnixProcesses()
}

async function listUnixProcesses(): Promise<ProcessInfo[]> {
  const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,comm=,args='], {
    maxBuffer: 8 * 1024 * 1024
  })

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)

      if (!match) {
        return undefined
      }

      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        command: match[3],
        args: match[4] ?? ''
      }
    })
    .filter((processInfo): processInfo is ProcessInfo => Boolean(processInfo))
}

async function listWindowsProcesses(): Promise<ProcessInfo[]> {
  const script = [
    'Get-CimInstance Win32_Process',
    'Select-Object ProcessId,ParentProcessId,Name,CommandLine',
    'ConvertTo-Json -Compress'
  ].join(' | ')

  const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], {
    maxBuffer: 8 * 1024 * 1024
  })

  if (!stdout.trim()) {
    return []
  }

  const parsed = JSON.parse(stdout) as unknown
  const rows = Array.isArray(parsed) ? parsed : [parsed]

  return rows
    .map((row) => {
      if (!isWindowsProcessRow(row)) {
        return undefined
      }

      return {
        pid: Number(row.ProcessId),
        ppid: Number(row.ParentProcessId),
        command: row.Name ?? '',
        args: row.CommandLine ?? ''
      }
    })
    .filter((processInfo): processInfo is ProcessInfo => Boolean(processInfo))
}

function isWindowsProcessRow(row: unknown): row is {
  ProcessId: number
  ParentProcessId: number
  Name?: string
  CommandLine?: string
} {
  return typeof row === 'object' && row !== null && 'ProcessId' in row && 'ParentProcessId' in row
}
