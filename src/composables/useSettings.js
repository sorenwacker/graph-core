import { ref, watch } from 'vue'

/**
 * Composable for managing application settings with localStorage persistence.
 * Centralizes all settings to prevent scattered localStorage access throughout the app.
 *
 * @returns {Object} Settings refs with auto-persistence
 */
export function useSettings() {
  // Helper to get value from localStorage
  function getString(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    return localStorage.getItem(key) || defaultValue
  }

  function getBoolean(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    return stored === 'true'
  }

  function getNumber(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    const parsed = parseInt(stored, 10)
    return isNaN(parsed) ? defaultValue : parsed
  }

  // View mode: tree, graph, timeline, table, persons, tasks, trash
  const viewMode = ref(getString('graphcore-viewMode', 'tree'))

  // Current container ID (null for root level)
  const containerId = ref(getString('graphcore-containerId', null))

  // Visibility settings
  const hideCompleted = ref(getBoolean('graphcore-hideCompleted', true))
  const hideSensitive = ref(getBoolean('graphcore-hideSensitive', false))

  // Graph settings
  const graphDetailThreshold = ref(getNumber('graphcore-graphDetailThreshold', 30))
  const graphMaxDepth = ref(getNumber('graphcore-graphMaxDepth', 0))
  const graphRootMaxDepth = ref(getNumber('graphcore-graphRootMaxDepth', 1))

  // Detail panel settings
  const openDetailFullscreen = ref(getBoolean('graphcore-openDetailFullscreen', false))
  const hoverPreviewEnabled = ref(getBoolean('graphcore-hoverPreview', true))

  // Sidebar settings
  const sidebarPinned = ref(getBoolean('graphcore-sidebarPinned', false))

  // Workspace
  const workspace = ref(getString('graphcore-workspace', 'work'))

  // Persist changes to localStorage
  watch(viewMode, (val) => {
    localStorage.setItem('graphcore-viewMode', val)
  })

  watch(containerId, (val) => {
    if (val === null) {
      localStorage.removeItem('graphcore-containerId')
    } else {
      localStorage.setItem('graphcore-containerId', val)
    }
  })

  watch(hideCompleted, (val) => {
    localStorage.setItem('graphcore-hideCompleted', String(val))
  })

  watch(hideSensitive, (val) => {
    localStorage.setItem('graphcore-hideSensitive', String(val))
  })

  watch(graphDetailThreshold, (val) => {
    if (typeof val === 'number' && !isNaN(val)) {
      localStorage.setItem('graphcore-graphDetailThreshold', String(val))
    }
  })

  watch(graphMaxDepth, (val) => {
    localStorage.setItem('graphcore-graphMaxDepth', String(val))
  })

  watch(graphRootMaxDepth, (val) => {
    localStorage.setItem('graphcore-graphRootMaxDepth', String(val))
  })

  watch(openDetailFullscreen, (val) => {
    localStorage.setItem('graphcore-openDetailFullscreen', String(val))
  })

  watch(hoverPreviewEnabled, (val) => {
    localStorage.setItem('graphcore-hoverPreview', String(val))
  })

  watch(sidebarPinned, (val) => {
    localStorage.setItem('graphcore-sidebarPinned', String(val))
  })

  watch(workspace, (val) => {
    localStorage.setItem('graphcore-workspace', val)
  })

  return {
    viewMode,
    containerId,
    hideCompleted,
    hideSensitive,
    graphDetailThreshold,
    graphMaxDepth,
    graphRootMaxDepth,
    openDetailFullscreen,
    hoverPreviewEnabled,
    sidebarPinned,
    workspace
  }
}
