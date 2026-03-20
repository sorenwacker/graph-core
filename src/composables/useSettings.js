import { ref, watch } from 'vue'

/**
 * Create a ref that automatically persists to localStorage
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if not in storage
 * @param {Object} options - Options for parsing and serialization
 * @param {string} options.type - 'string' | 'boolean' | 'number' | 'nullable' | 'json'
 * @returns {Ref} Vue ref with auto-persistence
 */
function persistedRef(key, defaultValue, { type = 'string' } = {}) {
  // Parse stored value based on type
  function parse(stored) {
    if (stored === null) return defaultValue
    switch (type) {
      case 'boolean':
        return stored === 'true'
      case 'number': {
        const parsed = parseInt(stored, 10)
        return isNaN(parsed) ? defaultValue : parsed
      }
      case 'nullable':
        return stored || null
      case 'json':
        try {
          return JSON.parse(stored)
        } catch {
          return defaultValue
        }
      default:
        return stored
    }
  }

  // Get initial value from localStorage
  const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  const value = ref(parse(stored))

  // Watch for changes and persist
  watch(value, (val) => {
    if (typeof localStorage === 'undefined') return
    if (val === null && type === 'nullable') {
      localStorage.removeItem(key)
    } else if (type === 'json') {
      localStorage.setItem(key, JSON.stringify(val))
    } else {
      localStorage.setItem(key, String(val))
    }
  }, { deep: true })

  return value
}

/**
 * Composable for managing application settings with localStorage persistence.
 * Centralizes all settings to prevent scattered localStorage access throughout the app.
 *
 * @returns {Object} Settings refs with auto-persistence
 */
export function useSettings() {
  return {
    // View mode: tree, graph, timeline, table, persons, tasks, trash
    viewMode: persistedRef('graphcore-viewMode', 'tree'),

    // Current container ID (null for root level)
    containerId: persistedRef('graphcore-containerId', null, { type: 'nullable' }),

    // Visibility settings
    hideCompleted: persistedRef('graphcore-hideCompleted', true, { type: 'boolean' }),
    hideSensitive: persistedRef('graphcore-hideSensitive', false, { type: 'boolean' }),

    // Graph settings
    graphDetailThreshold: persistedRef('graphcore-graphDetailThreshold', 0, { type: 'number' }),
    graphMaxDepth: persistedRef('graphcore-graphMaxDepth', 0, { type: 'number' }),
    graphRootMaxDepth: persistedRef('graphcore-graphRootMaxDepth', 1, { type: 'number' }),

    // Detail panel settings
    openDetailFullscreen: persistedRef('graphcore-openDetailFullscreen', false, { type: 'boolean' }),
    hoverPreviewEnabled: persistedRef('graphcore-hoverPreview', true, { type: 'boolean' }),

    // Sidebar settings
    sidebarPinned: persistedRef('graphcore-sidebarPinned', false, { type: 'boolean' }),

    // Workspace
    workspace: persistedRef('graphcore-workspace', 'work'),

    // AI provider settings
    aiProvider: persistedRef('graphcore-aiProvider', 'ollama'), // 'ollama' or 'openai'
    aiEnabled: persistedRef('graphcore-aiEnabled', true, { type: 'boolean' }),
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
    ollamaEnabled: persistedRef('graphcore-ollamaEnabled', true, { type: 'boolean' }),
    ollamaCustomPrompts: persistedRef('graphcore-ollamaCustomPrompts', [], { type: 'json' })
  }
}
