import { ref, watch } from 'vue'

/**
 * Create a ref that automatically persists to localStorage
 * @param {string} key - localStorage key
 * @param {*} defaultValue - Default value if not in storage
 * @param {Object} options - Options for parsing and serialization
 * @param {string} options.type - 'string' | 'boolean' | 'number' | 'nullable'
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
    } else {
      localStorage.setItem(key, String(val))
    }
  })

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
    workspace: persistedRef('graphcore-workspace', 'work')
  }
}
