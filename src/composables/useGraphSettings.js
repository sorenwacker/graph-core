import { ref, reactive, watch, isRef } from 'vue'
import { RADIAL_DEFAULTS, STORAGE_KEYS } from '../utils/uiConstants.js'

/**
 * All node types available in the graph
 */
export const ALL_NODE_TYPES = [
  'task',
  'note',
  'project',
  'milestone',
  'topic',
  'component',
  'group',
  'event',
  'person',
  'organization',
]

/**
 * Composable for managing graph display settings with localStorage persistence.
 * Settings are stored per-workspace to ensure isolation between workspaces.
 *
 * @param {Object} options
 * @param {Ref<string>|string} options.workspace - Current workspace ID (ref or string)
 * @returns {Object} Graph settings state and functions
 */
export function useGraphSettings({ workspace } = {}) {
  // Get workspace value (support both ref and plain string)
  const getWorkspace = () => (isRef(workspace) ? workspace.value : workspace || 'work')

  // Build workspace-specific storage key
  const wsKey = baseKey => `${baseKey}-${getWorkspace()}`

  // Helper functions for localStorage
  function getString(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    return localStorage.getItem(wsKey(key)) || defaultValue
  }

  function getBoolean(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (stored === null) return defaultValue
    return stored === 'true'
  }

  function getNumber(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (stored === null) return defaultValue
    const parsed = Number(stored)
    return isNaN(parsed) ? defaultValue : parsed
  }

  function getArray(key, defaultValue) {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (!stored) return defaultValue
    try {
      return JSON.parse(stored)
    } catch {
      return defaultValue
    }
  }

  // Layout mode
  const layoutMode = ref(getString(STORAGE_KEYS.GRAPH_LAYOUT_MODE, 'tree'))

  // Display toggles
  const relaxLocked = ref(getBoolean(STORAGE_KEYS.GRAPH_RELAX_LOCKED, false))
  const fitLocked = ref(getBoolean(STORAGE_KEYS.GRAPH_FIT_LOCKED, false))
  const showExternalLinks = ref(getBoolean(STORAGE_KEYS.GRAPH_SHOW_EXTERNAL_LINKS, true))
  const showRootNode = ref(getBoolean(STORAGE_KEYS.GRAPH_SHOW_ROOT_NODE, true))

  // Node type filter
  const visibleTypes = ref(getArray(STORAGE_KEYS.GRAPH_TYPE_FILTER, [...ALL_NODE_TYPES]))

  // Radial layout settings
  const radialSettings = reactive({
    nodeRepulsion: getNumber(STORAGE_KEYS.GRAPH_RADIAL_REPULSION, RADIAL_DEFAULTS.repulsion),
    edgeLength: getNumber(STORAGE_KEYS.GRAPH_RADIAL_EDGE_LENGTH, RADIAL_DEFAULTS.edgeLength),
    elasticity: getNumber(STORAGE_KEYS.GRAPH_RADIAL_ELASTICITY, RADIAL_DEFAULTS.elasticity),
    gravity: getNumber(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY, RADIAL_DEFAULTS.gravity),
    gravityRange: getNumber(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY_RANGE, RADIAL_DEFAULTS.gravityRange),
    nestingFactor: getNumber(STORAGE_KEYS.GRAPH_RADIAL_NESTING, RADIAL_DEFAULTS.nestingFactor),
    iterations: getNumber(STORAGE_KEYS.GRAPH_RADIAL_ITERATIONS, RADIAL_DEFAULTS.iterations),
  })

  /**
   * Reload all settings from localStorage for current workspace
   */
  function reload() {
    layoutMode.value = getString(STORAGE_KEYS.GRAPH_LAYOUT_MODE, 'tree')
    relaxLocked.value = getBoolean(STORAGE_KEYS.GRAPH_RELAX_LOCKED, false)
    fitLocked.value = getBoolean(STORAGE_KEYS.GRAPH_FIT_LOCKED, false)
    showExternalLinks.value = getBoolean(STORAGE_KEYS.GRAPH_SHOW_EXTERNAL_LINKS, true)
    showRootNode.value = getBoolean(STORAGE_KEYS.GRAPH_SHOW_ROOT_NODE, true)
    visibleTypes.value = getArray(STORAGE_KEYS.GRAPH_TYPE_FILTER, [...ALL_NODE_TYPES])
    radialSettings.nodeRepulsion = getNumber(STORAGE_KEYS.GRAPH_RADIAL_REPULSION, RADIAL_DEFAULTS.repulsion)
    radialSettings.edgeLength = getNumber(STORAGE_KEYS.GRAPH_RADIAL_EDGE_LENGTH, RADIAL_DEFAULTS.edgeLength)
    radialSettings.elasticity = getNumber(STORAGE_KEYS.GRAPH_RADIAL_ELASTICITY, RADIAL_DEFAULTS.elasticity)
    radialSettings.gravity = getNumber(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY, RADIAL_DEFAULTS.gravity)
    radialSettings.gravityRange = getNumber(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY_RANGE, RADIAL_DEFAULTS.gravityRange)
    radialSettings.nestingFactor = getNumber(STORAGE_KEYS.GRAPH_RADIAL_NESTING, RADIAL_DEFAULTS.nestingFactor)
    radialSettings.iterations = getNumber(STORAGE_KEYS.GRAPH_RADIAL_ITERATIONS, RADIAL_DEFAULTS.iterations)
  }

  // Watch workspace changes and reload settings
  if (isRef(workspace)) {
    watch(workspace, () => reload())
  }

  // Persistence watchers
  watch(layoutMode, val => {
    localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_LAYOUT_MODE), val)
  })

  watch(relaxLocked, val => {
    localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RELAX_LOCKED), String(val))
  })

  watch(fitLocked, val => {
    localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_FIT_LOCKED), String(val))
  })

  watch(showExternalLinks, val => {
    localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_SHOW_EXTERNAL_LINKS), String(val))
  })

  watch(showRootNode, val => {
    localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_SHOW_ROOT_NODE), String(val))
  })

  watch(
    visibleTypes,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_TYPE_FILTER), JSON.stringify(val))
    },
    { deep: true }
  )

  // Watch radial settings
  watch(
    () => radialSettings.nodeRepulsion,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_REPULSION), String(val))
    }
  )
  watch(
    () => radialSettings.edgeLength,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_EDGE_LENGTH), String(val))
    }
  )
  watch(
    () => radialSettings.elasticity,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_ELASTICITY), String(val))
    }
  )
  watch(
    () => radialSettings.gravity,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY), String(val))
    }
  )
  watch(
    () => radialSettings.gravityRange,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY_RANGE), String(val))
    }
  )
  watch(
    () => radialSettings.nestingFactor,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_NESTING), String(val))
    }
  )
  watch(
    () => radialSettings.iterations,
    val => {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_ITERATIONS), String(val))
    }
  )

  /**
   * Toggle visibility of a node type
   * @param {string} type - Node type to toggle
   */
  function toggleTypeVisibility(type) {
    const index = visibleTypes.value.indexOf(type)
    if (index >= 0) {
      visibleTypes.value.splice(index, 1)
    } else {
      visibleTypes.value.push(type)
    }
  }

  /**
   * Reset radial settings to defaults
   */
  function resetRadialSettings() {
    radialSettings.nodeRepulsion = RADIAL_DEFAULTS.repulsion
    radialSettings.edgeLength = RADIAL_DEFAULTS.edgeLength
    radialSettings.elasticity = RADIAL_DEFAULTS.elasticity
    radialSettings.gravity = RADIAL_DEFAULTS.gravity
    radialSettings.gravityRange = RADIAL_DEFAULTS.gravityRange
    radialSettings.nestingFactor = RADIAL_DEFAULTS.nestingFactor
    radialSettings.iterations = RADIAL_DEFAULTS.iterations
  }

  /**
   * Check if a node type is visible
   * @param {string} type - Node type to check
   * @returns {boolean}
   */
  function isTypeVisible(type) {
    return visibleTypes.value.includes(type)
  }

  return {
    // Layout
    layoutMode,

    // Display toggles
    relaxLocked,
    fitLocked,
    showExternalLinks,
    showRootNode,

    // Type filter
    visibleTypes,

    // Radial settings
    radialSettings,

    // Methods
    toggleTypeVisibility,
    resetRadialSettings,
    isTypeVisible,
    reload,
  }
}
