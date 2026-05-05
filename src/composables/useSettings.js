import { ref, watch, shallowRef } from 'vue'

// Cache for loaded settings from database
let settingsCache = null
let settingsLoaded = false

/**
 * Check if running in Electron environment with database access.
 * @returns {boolean}
 */
function hasElectronAPI() {
  return typeof window !== 'undefined' && window.electronAPI?.getAllSettings
}

/**
 * Load all settings from database (called once on first use).
 * @returns {Promise<Object>} Settings object
 */
async function loadSettingsFromDatabase() {
  if (settingsLoaded && settingsCache) {
    return settingsCache
  }
  try {
    settingsCache = await window.electronAPI.getAllSettings()
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
 * @param {string} key - Setting key
 * @param {*} defaultValue - Default value if not in storage
 * @param {Object} options - Options for parsing and serialization
 * @param {string} options.type - 'string' | 'boolean' | 'number' | 'nullable' | 'json'
 * @returns {Ref} Vue ref with auto-persistence
 */
function persistedRef(key, defaultValue, { type = 'string' } = {}) {
  // Parse stored value based on type
  function parse(stored) {
    if (stored === null || stored === undefined) return defaultValue
    const str = String(stored)
    switch (type) {
      case 'boolean':
        return str === 'true'
      case 'number': {
        const parsed = parseInt(str, 10)
        return isNaN(parsed) ? defaultValue : parsed
      }
      case 'nullable':
        return str || null
      case 'json':
        try {
          return JSON.parse(str)
        } catch {
          return defaultValue
        }
      default:
        return str
    }
  }

  // Serialize value for storage
  function serialize(val) {
    if (val === null && type === 'nullable') {
      return null
    }
    if (type === 'json') {
      return JSON.stringify(val)
    }
    return String(val)
  }

  // Get initial value from cache or localStorage
  let initialValue = defaultValue
  if (hasElectronAPI() && settingsCache) {
    initialValue = parse(settingsCache[key])
  } else if (typeof localStorage !== 'undefined') {
    initialValue = parse(localStorage.getItem(key))
  }

  const value = ref(initialValue)

  // Watch for changes and persist
  watch(
    value,
    async val => {
      const serialized = serialize(val)

      // Save to database if available
      if (hasElectronAPI()) {
        try {
          if (serialized === null) {
            await window.electronAPI.deleteSetting(key)
            if (settingsCache) delete settingsCache[key]
          } else {
            await window.electronAPI.setSetting(key, serialized)
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
const settingsReady = shallowRef(false)
let initPromise = null

/**
 * Initialize settings from database (call once at app startup).
 * @returns {Promise<void>}
 */
export async function initSettings() {
  if (settingsReady.value) return
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (hasElectronAPI()) {
      await loadSettingsFromDatabase()
    }
    settingsReady.value = true
  })()

  return initPromise
}

/**
 * Migrate settings from localStorage to database.
 * Call this once during app initialization to move existing localStorage settings to the database.
 * @returns {Promise<Object>} Migration result
 */
export async function migrateSettingsToDatabase() {
  if (!hasElectronAPI() || typeof localStorage === 'undefined') {
    return { migrated: 0, skipped: 'No electronAPI or localStorage' }
  }

  const prefix = 'graphcore-'
  const settingsToMigrate = {}
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
  const existingSettings = await window.electronAPI.getAllSettings()
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
  await window.electronAPI.setSettings(settingsToMigrate)

  // Update cache
  settingsCache = { ...settingsCache, ...settingsToMigrate }

  return { migrated: count, settings: Object.keys(settingsToMigrate) }
}

/**
 * Composable for managing application settings with database persistence.
 * Centralizes all settings to prevent scattered storage access throughout the app.
 *
 * @returns {Object} Settings refs with auto-persistence
 */
export function useSettings() {
  return {
    // Ready state
    settingsReady,

    // View mode: tree, graph, timeline, table, persons, tasks, trash
    viewMode: persistedRef('graphcore-viewMode', 'graph'),

    // Current container ID (null for root level)
    containerId: persistedRef('graphcore-containerId', null, { type: 'nullable' }),

    // Visibility settings
    hideCompleted: persistedRef('graphcore-hideCompleted', true, { type: 'boolean' }),
    hideSensitive: persistedRef('graphcore-hideSensitive', false, { type: 'boolean' }),

    // Graph settings
    graphDetailThreshold: persistedRef('graphcore-graphDetailThreshold', 50, { type: 'number' }),
    graphMaxDepth: persistedRef('graphcore-graphMaxDepth', 0, { type: 'number' }),
    graphRootMaxDepth: persistedRef('graphcore-graphRootMaxDepth', 5, { type: 'number' }),
    graphNotesPreviewLength: persistedRef('graphcore-graphNotesPreviewLength', 200, { type: 'number' }),

    // Detail panel settings
    openDetailFullscreen: persistedRef('graphcore-openDetailFullscreen', false, { type: 'boolean' }),
    hoverPreviewEnabled: persistedRef('graphcore-hoverPreview', true, { type: 'boolean' }),
    inheritColors: persistedRef('graphcore-inheritColors', true, { type: 'boolean' }),

    // Sidebar settings
    sidebarPinned: persistedRef('graphcore-sidebarPinned', true, { type: 'boolean' }),

    // Workspace
    workspace: persistedRef('graphcore-workspace', 'work'),

    // AI provider settings
    aiProvider: persistedRef('graphcore-aiProvider', 'ollama'), // 'ollama' or 'openai'
    aiEnabled: persistedRef('graphcore-aiEnabled', false, { type: 'boolean' }),
    aiCustomPrompts: persistedRef('graphcore-aiCustomPrompts', [], { type: 'json' }),

    // Ollama LLM settings
    ollamaEndpoint: persistedRef('graphcore-ollamaEndpoint', 'http://localhost:11434'),
    ollamaModel: persistedRef('graphcore-ollamaModel', 'llama3.2'),
    ollamaContextSize: persistedRef('graphcore-ollamaContextSize', 32768, { type: 'number' }),

    // OpenAI-compatible settings
    openaiEndpoint: persistedRef('graphcore-openaiEndpoint', 'https://api.openai.com/v1'),
    openaiApiKey: persistedRef('graphcore-openaiApiKey', ''),
    openaiModel: persistedRef('graphcore-openaiModel', 'gpt-4o-mini'),
    openaiSkipSslVerification: persistedRef('graphcore-openaiSkipSslVerification', false, { type: 'boolean' }),

    // Legacy (for backwards compatibility)
    ollamaEnabled: persistedRef('graphcore-ollamaEnabled', false, { type: 'boolean' }),
    ollamaCustomPrompts: persistedRef('graphcore-ollamaCustomPrompts', [], { type: 'json' }),

    // Onboarding
    hasSeenOnboarding: persistedRef('graphcore-hasSeenOnboarding', false, { type: 'boolean' }),

    // Hint bar
    showHintBar: persistedRef('graphcore-showHintBar', true, { type: 'boolean' }),
  }
}
