/**
 * UI Constants - Centralized magic numbers for the application.
 */

// Layout dimensions
export const SIDEBAR_WIDTH = 280

// Timing (milliseconds)
export const SIDEBAR_HIDE_DELAY_MS = 150

// Limits
export const MAX_HISTORY_SIZE = 50

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
