import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export type AppPreferences = {
  desktopIslandBounds?: Electron.Rectangle
}

export class PreferencesStore {
  private readonly preferencesFile = join(app.getPath('userData'), 'preferences.json')
  private preferences: AppPreferences = this.read()

  getDesktopIslandBounds(): Electron.Rectangle | undefined {
    return this.preferences.desktopIslandBounds
      ? { ...this.preferences.desktopIslandBounds }
      : undefined
  }

  setDesktopIslandBounds(bounds: Electron.Rectangle): void {
    this.preferences = {
      ...this.preferences,
      desktopIslandBounds: { ...bounds }
    }
    this.write()
  }

  private read(): AppPreferences {
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.preferencesFile, 'utf8'))

      if (!isPreferences(parsed)) {
        return {}
      }

      return parsed
    } catch {
      return {}
    }
  }

  private write(): void {
    try {
      mkdirSync(dirname(this.preferencesFile), { recursive: true })
      writeFileSync(this.preferencesFile, `${JSON.stringify(this.preferences, null, 2)}\n`, 'utf8')
    } catch {
      // Preferences are best-effort; window behavior should keep working if storage fails.
    }
  }
}

function isPreferences(value: unknown): value is AppPreferences {
  if (!value || typeof value !== 'object') {
    return false
  }

  const preferences = value as AppPreferences
  return preferences.desktopIslandBounds === undefined || isRectangle(preferences.desktopIslandBounds)
}

function isRectangle(value: unknown): value is Electron.Rectangle {
  if (!value || typeof value !== 'object') {
    return false
  }

  const rectangle = value as Electron.Rectangle
  return (
    Number.isFinite(rectangle.x) &&
    Number.isFinite(rectangle.y) &&
    Number.isFinite(rectangle.width) &&
    Number.isFinite(rectangle.height) &&
    rectangle.width > 0 &&
    rectangle.height > 0
  )
}
