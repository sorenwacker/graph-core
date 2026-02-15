/**
 * UI Constants - Centralized magic numbers for the application.
 * Helps maintain consistency and makes changes easier.
 */

// Layout dimensions
export const SIDEBAR_WIDTH = 280
export const DETAIL_PANEL_WIDTH = 400
export const DETAIL_PANEL_MIN_WIDTH = 300
export const DETAIL_PANEL_MAX_WIDTH = 800

// Timing (milliseconds)
export const HOVER_DELAY_MS = 150
export const DEBOUNCE_DELAY_MS = 50
export const DETAIL_OPEN_DELAY_MS = 300
export const TRANSITION_DURATION_MS = 200
export const SIDEBAR_HIDE_DELAY_MS = 150

// Limits
export const MAX_HISTORY_SIZE = 50
export const MAX_UNDO_STACK_SIZE = 50
export const MAX_RECENT_ITEMS = 10
export const MAX_SEARCH_RESULTS = 100

// Graph settings
export const DEFAULT_GRAPH_DETAIL_THRESHOLD = 30
export const DEFAULT_GRAPH_MAX_DEPTH = 0  // 0 = unlimited
export const DEFAULT_GRAPH_ROOT_MAX_DEPTH = 1

// Card grid
export const CARD_MIN_WIDTH = 200
export const CARD_MAX_WIDTH = 400
export const CARD_GAP = 16

// Radial layout defaults
export const RADIAL_DEFAULTS = {
  repulsion: 5000,
  edgeLength: 100,
  elasticity: 0.5,
  gravity: 10000,
  gravityRange: 3.8,
  nestingFactor: 0.1,
  iterations: 2500
}

// localStorage keys (centralized to prevent typos)
export const STORAGE_KEYS = {
  VIEW_MODE: 'graphcore-viewMode',
  CONTAINER_ID: 'graphcore-containerId',
  WORKSPACE: 'graphcore-workspace',
  HIDE_SENSITIVE: 'graphcore-hideSensitive',
  HIDE_COMPLETED: 'graphcore-hideCompleted',
  GRAPH_DETAIL_THRESHOLD: 'graphcore-graphDetailThreshold',
  GRAPH_MAX_DEPTH: 'graphcore-graphMaxDepth',
  GRAPH_ROOT_MAX_DEPTH: 'graphcore-graphRootMaxDepth',
  OPEN_DETAIL_FULLSCREEN: 'graphcore-openDetailFullscreen',
  HOVER_PREVIEW: 'graphcore-hoverPreview',
  SIDEBAR_PINNED: 'graphcore-sidebarPinned',
  // Graph-specific
  GRAPH_LAYOUT_MODE: 'graph-layout-mode',
  GRAPH_RELAX_LOCKED: 'graph-relax-locked',
  GRAPH_FIT_LOCKED: 'graph-fit-locked',
  GRAPH_SHOW_EXTERNAL_LINKS: 'graph-show-external-links',
  GRAPH_SHOW_ROOT_NODE: 'graph-show-root-node',
  GRAPH_TYPE_FILTER: 'graph-type-filter',
  GRAPH_RADIAL_REPULSION: 'graph-radial-repulsion',
  GRAPH_RADIAL_EDGE_LENGTH: 'graph-radial-edge-length',
  GRAPH_RADIAL_ELASTICITY: 'graph-radial-elasticity',
  GRAPH_RADIAL_GRAVITY: 'graph-radial-gravity',
  GRAPH_RADIAL_GRAVITY_RANGE: 'graph-radial-gravity-range',
  GRAPH_RADIAL_NESTING: 'graph-radial-nesting',
  GRAPH_RADIAL_ITERATIONS: 'graph-radial-iterations'
}
