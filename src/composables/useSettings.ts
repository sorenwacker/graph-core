import { ref, watch, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { ViewMode, AIProvider, AICustomPrompt, UseSettingsReturn } from '../types/settings'

/** Type options for parsing persisted values */
type PersistedType = 'string' | 'boolean' | 'number' | 'nullable' | 'json'

/** Options for persistedRef function */
interface PersistedRefOptions {
  type?: PersistedType
}

/** Settings stored in database cache */
type SettingsCache = Record<string, string> | null

/** Electron API interface for settings */
interface ElectronSettingsAPI {
  getAllSettings: () => Promise<Record<string, string>>
  getSetting: (key: string) => Promise<string | null>
  setSetting: (key: string, value: string) => Promise<void>
  setSettings: (settings: Record<string, string>) => Promise<void>
  deleteSetting: (key: string) => Promise<void>
}

/** Get the electron API from window if available */
function getElectronAPI(): ElectronSettingsAPI | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== 'undefined' ? (window as any).electronAPI : undefined
}

/** Migration result from localStorage to database */
export interface MigrationResult {
  migrated: number
  skipped?: string
  message?: string
  settings?: string[]
}

// Cache for loaded settings from database
let settingsCache: SettingsCache = null
let settingsLoaded = false

/**
 * Check if running in Electron environment with database access.
 */
function hasElectronAPI(): boolean {
  return !!getElectronAPI()?.getAllSettings
}

/**
 * Load all settings from database (called once on first use).
 */
async function loadSettingsFromDatabase(): Promise<Record<string, string>> {
  if (settingsLoaded && settingsCache) {
    return settingsCache
  }
  try {
    settingsCache = await getElectronAPI()!.getAllSettings()
    settingsLoaded = true
    return settingsCache
  } catch (e) {
    console.error('Failed to load settings from database:', e)
    settingsCache = {}
    settingsLoaded = true
    return settingsCache
  }
}

/**
 * Create a ref that automatically persists to database (or localStorage fallback).
 */
function persistedRef<T>(key: string, defaultValue: T, { type = 'string' }: PersistedRefOptions = {}): Ref<T> {
  // Parse stored value based on type
  function parse(stored: string | null | undefined): T {
    if (stored === null || stored === undefined) return defaultValue
    const str = String(stored)
    switch (type) {
      case 'boolean':
        return (str === 'true') as T
      case 'number': {
        const parsed = parseInt(str, 10)
        return (isNaN(parsed) ? defaultValue : parsed) as T
      }
      case 'nullable':
        return (str || null) as T
      case 'json':
        try {
          return JSON.parse(str) as T
        } catch {
          return defaultValue
        }
      default:
        return str as T
    }
  }

  // Serialize value for storage
  function serialize(val: T): string | null {
    if (val === null && type === 'nullable') {
      return null
    }
    if (type === 'json') {
      return JSON.stringify(val)
    }
    return String(val)
  }

  // Get initial value from cache or localStorage
  let initialValue: T = defaultValue
  if (hasElectronAPI() && settingsCache) {
    initialValue = parse(settingsCache[key])
  } else if (typeof localStorage !== 'undefined') {
    initialValue = parse(localStorage.getItem(key))
  }

  const value = ref<T>(initialValue) as Ref<T>

  // Watch for changes and persist
  watch(
    value,
    async (val: T) => {
      const serialized = serialize(val)

      // Save to database if available
      if (hasElectronAPI()) {
        try {
          if (serialized === null) {
            await getElectronAPI()!.deleteSetting(key)
            if (settingsCache) delete settingsCache[key]
          } else {
            await getElectronAPI()!.setSetting(key, serialized)
            if (settingsCache) settingsCache[key] = serialized
          }
        } catch (e) {
          console.error('Failed to save setting to database:', key, e)
        }
      }

      // Also save to localStorage as fallback/backup
      if (typeof localStorage !== 'undefined') {
        if (serialized === null) {
          localStorage.removeItem(key)
        } else {
          localStorage.setItem(key, serialized)
        }
      }
    },
    { deep: true }
  )

  return value
}

// Singleton state for settings initialization
const settingsReady: ShallowRef<boolean> = shallowRef(false)
let initPromise: Promise<void> | null = null

// Singleton refs for all settings (created once, reused across calls)
let settingsInstance: (UseSettingsReturn & { settingsReady: ShallowRef<boolean> }) | null = null

/**
 * Reset settings state (for testing only).
 * @internal
 */
export function _resetSettingsForTesting(): void {
  settingsCache = null
  settingsLoaded = false
  settingsInstance = null
  settingsReady.value = false
  initPromise = null
}

/**
 * Initialize settings from database (call once at app startup).
 */
export async function initSettings(): Promise<void> {
  if (settingsReady.value) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (hasElectronAPI()) {
      await loadSettingsFromDatabase()
    }
    // Create singleton settings instance after cache is loaded
    settingsInstance = createSettingsRefs()
    settingsReady.value = true
  })()

  return initPromise
}

/**
 * Internal function to create settings refs (called once after cache loads).
 */
function createSettingsRefs(): UseSettingsReturn & { settingsReady: ShallowRef<boolean> } {
  return {
    // Ready state
    settingsReady,

    // View mode: tree, graph, timeline, table, persons, tasks, trash
    viewMode: persistedRef<ViewMode>('graphcore-viewMode', 'graph'),

    // Current container ID (null for root level)
    containerId: persistedRef<number | null>('graphcore-containerId', null, { type: 'nullable' }),

    // Visibility settings
    hideCompleted: persistedRef<boolean>('graphcore-hideCompleted', true, { type: 'boolean' }),
    hideSensitive: persistedRef<boolean>('graphcore-hideSensitive', false, { type: 'boolean' }),

    // Graph settings
    graphDetailThreshold: persistedRef<number>('graphcore-graphDetailThreshold', 50, { type: 'number' }),
    graphMaxDepth: persistedRef<number>('graphcore-graphMaxDepth', 0, { type: 'number' }),
    graphRootMaxDepth: persistedRef<number>('graphcore-graphRootMaxDepth', 5, { type: 'number' }),
    graphNotesPreviewLength: persistedRef<number>('graphcore-graphNotesPreviewLength', 200, { type: 'number' }),

    // Detail panel settings
    openDetailFullscreen: persistedRef<boolean>('graphcore-openDetailFullscreen', false, { type: 'boolean' }),
    hoverPreviewEnabled: persistedRef<boolean>('graphcore-hoverPreview', true, { type: 'boolean' }),
    inheritColors: persistedRef<boolean>('graphcore-inheritColors', true, { type: 'boolean' }),

    // Sidebar settings
    sidebarPinned: persistedRef<boolean>('graphcore-sidebarPinned', true, { type: 'boolean' }),

    // Workspace
    workspace: persistedRef<string>('graphcore-workspace', 'work'),

    // AI provider settings
    aiProvider: persistedRef<AIProvider>('graphcore-aiProvider', 'ollama'),
    aiEnabled: persistedRef<boolean>('graphcore-aiEnabled', false, { type: 'boolean' }),
    aiCustomPrompts: persistedRef<AICustomPrompt[]>('graphcore-aiCustomPrompts', [], { type: 'json' }),

    // Ollama LLM settings
    ollamaEndpoint: persistedRef<string>('graphcore-ollamaEndpoint', 'http://localhost:11434'),
    ollamaModel: persistedRef<string>('graphcore-ollamaModel', 'llama3.2'),
    ollamaContextSize: persistedRef<number>('graphcore-ollamaContextSize', 32768, { type: 'number' }),

    // OpenAI-compatible settings
    openaiEndpoint: persistedRef<string>('graphcore-openaiEndpoint', 'https://api.openai.com/v1'),
    openaiApiKey: persistedRef<string>('graphcore-openaiApiKey', ''),
    openaiModel: persistedRef<string>('graphcore-openaiModel', 'gpt-4o-mini'),
    openaiSkipSslVerification: persistedRef<boolean>('graphcore-openaiSkipSslVerification', false, { type: 'boolean' }),

    // Legacy (for backwards compatibility)
    ollamaEnabled: persistedRef<boolean>('graphcore-ollamaEnabled', false, { type: 'boolean' }),
    ollamaCustomPrompts: persistedRef<AICustomPrompt[]>('graphcore-ollamaCustomPrompts', [], { type: 'json' }),

    // Onboarding
    hasSeenOnboarding: persistedRef<boolean>('graphcore-hasSeenOnboarding', false, { type: 'boolean' }),

    // Hint bar
    showHintBar: persistedRef<boolean>('graphcore-showHintBar', true, { type: 'boolean' }),
  }
}

/**
 * Migrate settings from localStorage to database.
 * Call this once during app initialization to move existing localStorage settings to the database.
 */
export async function migrateSettingsToDatabase(): Promise<MigrationResult> {
  if (!hasElectronAPI() || typeof localStorage === 'undefined') {
    return { migrated: 0, skipped: 'No electronAPI or localStorage' }
  }

  const prefix = 'graphcore-'
  const settingsToMigrate: Record<string, string> = {}
  let count = 0

  // Find all graphcore- prefixed localStorage keys
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) {
      const value = localStorage.getItem(key)
      if (value !== null) {
        settingsToMigrate[key] = value
        count++
      }
    }
  }

  if (count === 0) {
    return { migrated: 0, message: 'No localStorage settings to migrate' }
  }

  // Check if database already has settings
  const existingSettings = await getElectronAPI()!.getAllSettings()
  const existingCount = Object.keys(existingSettings).length

  if (existingCount > 0) {
    // Database already has settings, only migrate missing ones
    for (const key of Object.keys(settingsToMigrate)) {
      if (key in existingSettings) {
        delete settingsToMigrate[key]
        count--
      }
    }
  }

  if (count === 0) {
    return { migrated: 0, message: 'All settings already in database' }
  }

  // Migrate to database
  await getElectronAPI()!.setSettings(settingsToMigrate)

  // Update cache
  settingsCache = { ...settingsCache, ...settingsToMigrate }

  return { migrated: count, settings: Object.keys(settingsToMigrate) }
}

/**
 * Composable for managing application settings with database persistence.
 * Centralizes all settings to prevent scattered storage access throughout the app.
 * Returns singleton refs that are shared across all components.
 */
export function useSettings(): UseSettingsReturn & { settingsReady: ShallowRef<boolean> } {
  // Return existing singleton if available (created after initSettings)
  if (settingsInstance) {
    return settingsInstance
  }

  // Fallback: create settings refs if called before initSettings completes
  // This can happen in tests or edge cases
  if (!settingsInstance) {
    settingsInstance = createSettingsRefs()
  }

  return settingsInstance
}
