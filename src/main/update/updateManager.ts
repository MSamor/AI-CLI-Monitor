import { app, BrowserWindow, dialog, shell } from 'electron'
import type { MessageBoxOptions, MessageBoxReturnValue } from 'electron'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import https from 'node:https'
import { dirname, join } from 'node:path'
import { Transform } from 'node:stream'
import type { TransformCallback } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { MonitorEvent, UpdateSnapshot } from '../../shared/types'

const RELEASE_API_URL = 'https://api.github.com/repos/MSamor/AI-CLI-Monitor/releases/latest'
const RELEASE_PAGE_URL = 'https://github.com/MSamor/AI-CLI-Monitor/releases/latest'
const REQUEST_TIMEOUT_MS = 15_000
const DOWNLOAD_IDLE_TIMEOUT_MS = 120_000
const MAX_REDIRECTS = 5

type GithubRelease = {
  tag_name?: string
  name?: string
  html_url?: string
  draft?: boolean
  prerelease?: boolean
  assets?: GithubReleaseAsset[]
}

type GithubReleaseAsset = {
  name?: string
  browser_download_url?: string
  size?: number
}

type UpdateCandidate = {
  version: string
  displayName: string
  releasePageUrl: string
  asset?: Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & {
    size?: number
  }
}

type UpdateStatusEvent = {
  level: MonitorEvent['level']
  message: string
}

type DownloadProgress = {
  receivedBytes: number
  totalBytes?: number
  progress?: number
}

export class UpdateManager {
  private checking = false
  private downloading = false

  constructor(
    private readonly getMainWindow: () => BrowserWindow | undefined,
    private readonly showMainWindow: () => BrowserWindow | undefined,
    private readonly quitApp: () => void,
    private readonly setUpdateStatus: (next: Partial<UpdateSnapshot>, event?: UpdateStatusEvent) => void
  ) {}

  async checkOnStartup(): Promise<void> {
    if (!app.isPackaged || this.checking || this.downloading) {
      return
    }

    this.checking = true
    this.setUpdateStatus({
      phase: 'checking',
      message: '正在检查更新。'
    })

    try {
      const candidate = await this.getUpdateCandidate()

      if (!candidate) {
        this.setUpdateStatus({ phase: 'idle' })
        return
      }

      await this.promptForUpdate(candidate)
    } catch (error) {
      const message = `检查更新失败：${errorMessage(error)}`
      this.setUpdateStatus(
        {
          phase: 'error',
          message
        },
        {
          level: 'warning',
          message
        }
      )
      // Startup update checks are best-effort and must not affect monitoring.
    } finally {
      this.checking = false
    }
  }

  private async getUpdateCandidate(): Promise<UpdateCandidate | undefined> {
    const release = await requestJson<GithubRelease>(RELEASE_API_URL)

    if (release.draft || release.prerelease || !release.tag_name) {
      return undefined
    }

    const latestVersion = normalizeVersion(release.tag_name)

    if (!latestVersion || compareVersions(latestVersion, app.getVersion()) <= 0) {
      return undefined
    }

    return {
      version: latestVersion,
      displayName: release.name || release.tag_name,
      releasePageUrl: release.html_url || RELEASE_PAGE_URL,
      asset: selectAsset(release.assets ?? [])
    }
  }

  private async promptForUpdate(candidate: UpdateCandidate): Promise<void> {
    this.setUpdateStatus(
      {
        phase: 'available',
        version: candidate.version,
        assetName: candidate.asset?.name,
        totalBytes: candidate.asset?.size,
        receivedBytes: 0,
        progress: 0,
        message: candidate.asset
          ? `发现 AI CLI Monitor ${candidate.version}，可下载 ${candidate.asset.name}。`
          : `发现 AI CLI Monitor ${candidate.version}，但当前系统没有匹配的安装包。`
      },
      {
        level: 'info',
        message: `发现新版本：AI CLI Monitor ${candidate.version}。`
      }
    )

    const window = this.showMainWindow()

    if (!candidate.asset) {
      const result = await showMessageBox(window, {
        type: 'info',
        title: '发现新版本',
        message: `发现 AI CLI Monitor ${candidate.version}`,
        detail: '当前系统没有匹配的安装包，请打开 GitHub Release 页面手动下载。',
        buttons: ['打开发布页', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })

      if (result.response === 0) {
        await shell.openExternal(candidate.releasePageUrl)
      }

      return
    }

    const confirm = await showMessageBox(window, {
      type: 'info',
      title: '发现新版本',
      message: `发现 AI CLI Monitor ${candidate.version}`,
      detail: `当前版本为 ${app.getVersion()}。\n是否下载新版安装包？`,
      buttons: ['下载新版', '稍后'],
      defaultId: 0,
      cancelId: 1,
      noLink: true
    })

    if (confirm.response !== 0) {
      this.setUpdateStatus({
        phase: 'available',
        message: '已暂缓下载新版安装包。'
      })
      return
    }

    if (this.downloading) {
      return
    }

    await this.downloadAndPromptInstall(candidate)
  }

  private async downloadAndPromptInstall(candidate: UpdateCandidate): Promise<void> {
    if (!candidate.asset) {
      return
    }

    const asset = candidate.asset
    this.downloading = true
    const window = this.showMainWindow() ?? this.getMainWindow()
    const targetPath = join(app.getPath('downloads'), asset.name)
    const tempPath = `${targetPath}.download`
    const totalBytes = asset.size

    try {
      this.setUpdateStatus(
        {
          phase: 'downloading',
          version: candidate.version,
          assetName: asset.name,
          receivedBytes: 0,
          totalBytes,
          progress: 0,
          filePath: targetPath,
          message: '正在下载新版安装包。'
        },
        {
          level: 'info',
          message: `开始下载新版安装包：${asset.name}。`
        }
      )
      window?.setProgressBar(2)
      await mkdir(dirname(targetPath), { recursive: true })
      await rm(tempPath, { force: true })

      let lastProgressUpdateAt = 0
      const downloaded = await downloadFile(
        asset.browser_download_url,
        tempPath,
        (downloadProgress) => {
          window?.setProgressBar(downloadProgress.progress ?? 2)

          const now = Date.now()
          const isComplete =
            Boolean(downloadProgress.totalBytes) &&
            downloadProgress.receivedBytes >= downloadProgress.totalBytes!

          if (!isComplete && now - lastProgressUpdateAt < 150) {
            return
          }

          lastProgressUpdateAt = now
          this.setUpdateStatus({
            phase: 'downloading',
            version: candidate.version,
            assetName: asset.name,
            receivedBytes: downloadProgress.receivedBytes,
            totalBytes: downloadProgress.totalBytes ?? totalBytes,
            progress: downloadProgress.progress,
            filePath: targetPath,
            message: '正在下载新版安装包。'
          })
        },
        totalBytes
      )

      await rm(targetPath, { force: true })
      await rename(tempPath, targetPath)
      window?.setProgressBar(-1)

      const dialogWindow = this.showMainWindow() ?? window
      this.setUpdateStatus(
        {
          phase: 'downloaded',
          version: candidate.version,
          assetName: asset.name,
          receivedBytes: downloaded.receivedBytes,
          totalBytes: downloaded.totalBytes ?? totalBytes,
          progress: 1,
          filePath: targetPath,
          message: '新版安装包已下载完成，等待安装确认。'
        },
        {
          level: 'info',
          message: `新版安装包已下载：${targetPath}。`
        }
      )

      const result = await showMessageBox(dialogWindow, {
        type: 'info',
        title: '新版已下载',
        message: `AI CLI Monitor ${candidate.version} 已下载完成`,
        detail: '现在打开安装包并退出当前应用吗？',
        buttons: ['打开安装包并退出', '稍后'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })

      if (result.response !== 0) {
        shell.showItemInFolder(targetPath)
        return
      }

      const openError = await shell.openPath(targetPath)

      if (openError) {
        const openResult = await showMessageBox(this.showMainWindow() ?? dialogWindow, {
          type: 'error',
          title: '无法打开安装包',
          message: '新版安装包已下载，但系统无法打开它。',
          detail: `${openError}\n\n文件位置：${targetPath}`,
          buttons: ['打开所在文件夹', '关闭'],
          defaultId: 0,
          cancelId: 1,
          noLink: true
        })

        if (openResult.response === 0) {
          shell.showItemInFolder(targetPath)
        }

        return
      }

      this.quitApp()
    } catch (error) {
      const message = `新版安装包下载失败：${errorMessage(error)}`
      window?.setProgressBar(-1)
      await rm(tempPath, { force: true }).catch(() => undefined)
      this.setUpdateStatus(
        {
          phase: 'error',
          version: candidate.version,
          assetName: asset.name,
          filePath: targetPath,
          message
        },
        {
          level: 'error',
          message
        }
      )

      const result = await showMessageBox(this.showMainWindow() ?? window, {
        type: 'error',
        title: '下载失败',
        message: '新版安装包下载失败',
        detail: `${errorMessage(error)}\n\n请检查网络连接，或打开 GitHub Release 页面手动下载。`,
        buttons: ['打开发布页', '关闭'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })

      if (result.response === 0) {
        await shell.openExternal(candidate.releasePageUrl)
      }
    } finally {
      this.downloading = false
      window?.setProgressBar(-1)
    }
  }
}

function normalizeVersion(value: string): string | undefined {
  const match = value.trim().match(/^v?(\d+(?:\.\d+){0,2})/)

  if (!match) {
    return undefined
  }

  return match[1]
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a)?.split('.').map(Number) ?? []
  const right = normalizeVersion(b)?.split('.').map(Number) ?? []
  const length = Math.max(left.length, right.length, 3)

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)

    if (diff !== 0) {
      return diff
    }
  }

  return 0
}

function selectAsset(assets: GithubReleaseAsset[]): UpdateCandidate['asset'] {
  const candidates = assets
    .filter(
      (asset): asset is Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & {
        size?: number
      } => Boolean(asset.name && asset.browser_download_url)
    )
    .filter((asset) => !asset.name.endsWith('.blockmap'))

  const selected = selectAssetForPlatform(candidates)

  return selected
    ? {
        name: selected.name,
        browser_download_url: selected.browser_download_url,
        size: selected.size
      }
    : undefined
}

function selectAssetForPlatform(
  assets: Array<Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & { size?: number }>
): (Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & { size?: number }) | undefined {
  const normalizedArch = process.arch === 'x64' ? 'x64' : process.arch === 'arm64' ? 'arm64' : ''

  if (process.platform === 'darwin') {
    return (
      findAsset(assets, ['darwin', normalizedArch, '.dmg']) ??
      findAsset(assets, ['mac', normalizedArch, '.dmg']) ??
      findAsset(assets, [normalizedArch, '.dmg']) ??
      findAsset(assets, ['.dmg']) ??
      findAsset(assets, ['darwin', normalizedArch, '.zip']) ??
      findAsset(assets, ['mac', normalizedArch, '.zip']) ??
      findAsset(assets, [normalizedArch, '.zip']) ??
      findAsset(assets, ['.zip'], ['win', 'windows', 'linux'])
    )
  }

  if (process.platform === 'win32') {
    return (
      findAsset(assets, ['win', '.exe']) ??
      findAsset(assets, ['windows', '.exe']) ??
      findAsset(assets, ['.exe']) ??
      findAsset(assets, ['win', '.zip']) ??
      findAsset(assets, ['windows', '.zip'])
    )
  }

  if (process.platform === 'linux') {
    return (
      findAsset(assets, ['linux', normalizedArch, '.appimage']) ??
      findAsset(assets, [normalizedArch, '.appimage']) ??
      findAsset(assets, ['.appimage']) ??
      findAsset(assets, ['linux', normalizedArch, '.deb']) ??
      findAsset(assets, [normalizedArch, '.deb']) ??
      findAsset(assets, ['.deb'])
    )
  }

  return undefined
}

function findAsset(
  assets: Array<Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & { size?: number }>,
  requiredParts: string[],
  forbiddenParts: string[] = []
): (Required<Pick<GithubReleaseAsset, 'name' | 'browser_download_url'>> & { size?: number }) | undefined {
  return assets.find((asset) => {
    const name = asset.name.toLowerCase()
    return (
      requiredParts.every((part) => name.includes(part.toLowerCase())) &&
      forbiddenParts.every((part) => !name.includes(part.toLowerCase()))
    )
  })
}

async function requestJson<T>(url: string): Promise<T> {
  const body = await requestText(url)
  return JSON.parse(body) as T
}

function requestText(url: string, redirects = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': `AI-CLI-Monitor/${app.getVersion()}`
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location

        if (isRedirect(statusCode) && location) {
          response.resume()

          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects'))
            return
          }

          requestText(new URL(location, url).toString(), redirects + 1).then(resolve, reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Request failed: ${statusCode}`))
          return
        }

        response.setEncoding('utf8')
        let data = ''
        response.on('data', (chunk: string) => {
          data += chunk
        })
        response.on('end', () => resolve(data))
      }
    )

    request.on('timeout', () => request.destroy(new Error('Request timed out')))
    request.on('error', reject)
  })
}

function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (progress: DownloadProgress) => void,
  expectedBytes?: number,
  redirects = 0
): Promise<DownloadProgress> {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        timeout: DOWNLOAD_IDLE_TIMEOUT_MS,
        headers: {
          'User-Agent': `AI-CLI-Monitor/${app.getVersion()}`
        }
      },
      (response) => {
        const statusCode = response.statusCode ?? 0
        const location = response.headers.location

        if (isRedirect(statusCode) && location) {
          response.resume()

          if (redirects >= MAX_REDIRECTS) {
            reject(new Error('Too many redirects'))
            return
          }

          downloadFile(
            new URL(location, url).toString(),
            targetPath,
            onProgress,
            expectedBytes,
            redirects + 1
          ).then(resolve, reject)
          return
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume()
          reject(new Error(`Download failed: ${statusCode}`))
          return
        }

        const totalBytes = parseContentLength(response.headers['content-length']) ?? expectedBytes
        let received = 0
        const stream = createWriteStream(targetPath)
        const counter = new Transform({
          transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
            received += chunk.length
            onProgress({
              receivedBytes: received,
              totalBytes,
              progress: totalBytes ? Math.min(received / totalBytes, 1) : undefined
            })
            callback(null, chunk)
          }
        })

        pipeline(response, counter, stream)
          .then(() => {
            if (received <= 0) {
              throw new Error('下载结果为空。')
            }

            if (totalBytes && received < totalBytes) {
              throw new Error(`下载不完整：已下载 ${received} 字节，应为 ${totalBytes} 字节。`)
            }

            resolve({
              receivedBytes: received,
              totalBytes,
              progress: totalBytes ? Math.min(received / totalBytes, 1) : undefined
            })
          })
          .catch(reject)
      }
    )

    request.on('timeout', () =>
      request.destroy(
        new Error(`下载超时：超过 ${Math.round(DOWNLOAD_IDLE_TIMEOUT_MS / 1000)} 秒没有收到数据。`)
      )
    )
    request.on('error', reject)
  })
}

function parseContentLength(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  const parsed = raw ? Number(raw) : 0

  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return String(error)
}

function isRedirect(statusCode: number): boolean {
  return statusCode >= 300 && statusCode < 400
}

function showMessageBox(
  window: BrowserWindow | undefined,
  options: MessageBoxOptions
): Promise<MessageBoxReturnValue> {
  if (window && !window.isDestroyed()) {
    return dialog.showMessageBox(window, options)
  }

  return dialog.showMessageBox(options)
}
