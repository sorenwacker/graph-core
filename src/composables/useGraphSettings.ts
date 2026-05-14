import { ref, reactive, watch, isRef, type Ref, type UnwrapRef } from 'vue'
import { RADIAL_DEFAULTS, STORAGE_KEYS } from '../utils/uiConstants.js'
import type { NodeType } from '../types'

/**
 * All node types available in the graph
 */
export const ALL_NODE_TYPES: NodeType[] = [
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
 * Radial layout settings
 */
export interface RadialLayoutSettings {
  nodeRepulsion: number
  edgeLength: number
  elasticity: number
  gravity: number
  gravityRange: number
  nestingFactor: number
  iterations: number
}

/**
 * Options for useGraphSettings composable.
 */
export interface UseGraphSettingsOptions {
  /** Current workspace ID (ref or number) */
  workspace?: Ref<number> | number
}

/**
 * Return type for useGraphSettings composable.
 */
/**
 * Trackpad zoom mode - how two-finger gestures are interpreted
 * - 'scroll': Two-finger vertical scroll zooms (like Google Maps)
 * - 'pinch': Only pinch gesture zooms, scroll pans (scroll-friendly)
 */
export type TrackpadZoomMode = 'scroll' | 'pinch'

export interface UseGraphSettingsReturn {
  /** Layout mode (tree, radial, etc.) */
  layoutMode: Ref<string>
  /** Whether relax mode is locked */
  relaxLocked: Ref<boolean>
  /** Whether fit mode is locked */
  fitLocked: Ref<boolean>
  /** Whether to show external links */
  showExternalLinks: Ref<boolean>
  /** Whether to show root node */
  showRootNode: Ref<boolean>
  /** Visible node types */
  visibleTypes: Ref<NodeType[]>
  /** Radial layout settings */
  radialSettings: UnwrapRef<RadialLayoutSettings>
  /** Trackpad zoom mode */
  trackpadZoomMode: Ref<TrackpadZoomMode>
  /** Toggle visibility of a node type */
  toggleTypeVisibility: (type: NodeType) => void
  /** Reset radial settings to defaults */
  resetRadialSettings: () => void
  /** Check if a node type is visible */
  isTypeVisible: (type: NodeType) => boolean
  /** Reload all settings from localStorage */
  reload: () => void
}

/**
 * Composable for managing graph display settings with localStorage persistence.
 * Settings are stored per-workspace to ensure isolation between workspaces.
 */
export function useGraphSettings(options: UseGraphSettingsOptions = {}): UseGraphSettingsReturn {
  const { workspace } = options

  // Get workspace value (support both ref and plain number)
  const getWorkspace = (): number | string => (isRef(workspace) ? workspace.value : workspace || 'work')

  // Build workspace-specific storage key
  const wsKey = (baseKey: string): string => `${baseKey}-${getWorkspace()}`

  // Helper functions for localStorage
  function getString(key: string, defaultValue: string): string {
    if (typeof localStorage === 'undefined') return defaultValue
    return localStorage.getItem(wsKey(key)) || defaultValue
  }

  function getBoolean(key: string, defaultValue: boolean): boolean {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (stored === null) return defaultValue
    return stored === 'true'
  }

  function getNumber(key: string, defaultValue: number): number {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (stored === null) return defaultValue
    const parsed = Number(stored)
    return isNaN(parsed) ? defaultValue : parsed
  }

  function getArray<T>(key: string, defaultValue: T[]): T[] {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(wsKey(key))
    if (!stored) return defaultValue
    try {
      return JSON.parse(stored) as T[]
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
  const visibleTypes = ref<NodeType[]>(getArray(STORAGE_KEYS.GRAPH_TYPE_FILTER, [...ALL_NODE_TYPES]))

  // Trackpad zoom mode
  const trackpadZoomMode = ref<TrackpadZoomMode>(
    getString(STORAGE_KEYS.GRAPH_TRACKPAD_ZOOM_MODE, 'scroll') as TrackpadZoomMode
  )

  // Radial layout settings
  const radialSettings = reactive<RadialLayoutSettings>({
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
  function reload(): void {
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
    trackpadZoomMode.value = getString(STORAGE_KEYS.GRAPH_TRACKPAD_ZOOM_MODE, 'scroll') as TrackpadZoomMode
  }

  // Watch workspace changes and reload settings
  if (isRef(workspace)) {
    watch(workspace, () => reload())
  }

  // Persistence watchers
  watch(layoutMode, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_LAYOUT_MODE), val)
    }
  })

  watch(relaxLocked, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RELAX_LOCKED), String(val))
    }
  })

  watch(fitLocked, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_FIT_LOCKED), String(val))
    }
  })

  watch(showExternalLinks, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_SHOW_EXTERNAL_LINKS), String(val))
    }
  })

  watch(showRootNode, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_SHOW_ROOT_NODE), String(val))
    }
  })

  watch(
    visibleTypes,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_TYPE_FILTER), JSON.stringify(val))
      }
    },
    { deep: true }
  )

  watch(trackpadZoomMode, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_TRACKPAD_ZOOM_MODE), val)
    }
  })

  // Watch radial settings
  watch(
    () => radialSettings.nodeRepulsion,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_REPULSION), String(val))
      }
    }
  )
  watch(
    () => radialSettings.edgeLength,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_EDGE_LENGTH), String(val))
      }
    }
  )
  watch(
    () => radialSettings.elasticity,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_ELASTICITY), String(val))
      }
    }
  )
  watch(
    () => radialSettings.gravity,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY), String(val))
      }
    }
  )
  watch(
    () => radialSettings.gravityRange,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_GRAVITY_RANGE), String(val))
      }
    }
  )
  watch(
    () => radialSettings.nestingFactor,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_NESTING), String(val))
      }
    }
  )
  watch(
    () => radialSettings.iterations,
    val => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(wsKey(STORAGE_KEYS.GRAPH_RADIAL_ITERATIONS), String(val))
      }
    }
  )

  /**
   * Toggle visibility of a node type
   */
  function toggleTypeVisibility(type: NodeType): void {
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
  function resetRadialSettings(): void {
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
   */
  function isTypeVisible(type: NodeType): boolean {
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

    // Trackpad zoom
    trackpadZoomMode,

    // Methods
    toggleTypeVisibility,
    resetRadialSettings,
    isTypeVisible,
    reload,
  }
}
