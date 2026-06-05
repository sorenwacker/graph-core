// Constants for edge length calculation based on graph density
const EDGE_LENGTH = {
  BASE_LARGE: 60, // >100 nodes
  BASE_MEDIUM: 80, // >50 nodes
  BASE_SMALL: 100, // >30 nodes
  BASE_DEFAULT: 120, // <=30 nodes
  PER_DEGREE_DENSE: 10, // >50 nodes
  PER_DEGREE_SPARSE: 15, // <=50 nodes
}

const NODE_COUNT_THRESHOLDS = {
  LARGE: 100,
  MEDIUM: 50,
  SMALL: 30,
}

const NODE_SPACING = {
  LARGE: 30, // >100 nodes
  MEDIUM: 40, // >50 nodes
  DEFAULT: 50,
}

const GRAVITY_SCALE_DIVISOR = 10000

const GRID_GAP = 15 // Gap between nodes in grid
const MIN_NODE_WIDTH = 100
const MIN_NODE_HEIGHT = 40

/**
 * Sync cytoscape node dimensions with actual HTML label sizes.
 * This ensures layouts respect the real visual size of nodes.
 * @param {Object} cy - Cytoscape instance
 */
function syncNodeDimensions(cy) {
  if (!cy) return

  // Get current zoom level to adjust for scaled dimensions
  const zoom = cy.zoom()

  cy.batch(() => {
    cy.nodes().forEach(node => {
      const nodeId = node.id()
      const htmlLabel = document.querySelector(`[data-node-id="${nodeId}"]`)

      if (htmlLabel) {
        const rect = htmlLabel.getBoundingClientRect()
        if (rect.width > 0 && rect.height > 0) {
          // Divide by zoom to get unscaled dimensions, add padding
          const width = Math.max(rect.width / zoom + 20, MIN_NODE_WIDTH)
          const height = Math.max(rect.height / zoom + 20, MIN_NODE_HEIGHT)
          node.style({ width, height })
        }
      }
    })
  })
}

/**
 * Get actual node dimensions from cytoscape or DOM.
 * @param {Object} node - Cytoscape node
 * @returns {Object} { width, height }
 */
function getNodeDimensions(node) {
  // Try to get dimensions from the rendered HTML label
  const nodeId = node.id()
  const htmlLabel = document.querySelector(`[data-node-id="${nodeId}"]`)

  if (htmlLabel) {
    const rect = htmlLabel.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      return { width: rect.width, height: rect.height }
    }
  }

  // Fall back to cytoscape node dimensions
  const bb = node.boundingBox()
  if (bb.w > 0 && bb.h > 0) {
    return { width: bb.w, height: bb.h }
  }

  // Final fallback to style-defined dimensions
  const style = node.style()
  return {
    width: parseFloat(style.width) || 180,
    height: parseFloat(style.height) || 80,
  }
}

/**
 * Tetris-style bin-packing layout.
 * Places nodes in rows, filling gaps where smaller nodes fit.
 * @param {Object} cy - Cytoscape instance
 * @param {Object} options - Layout options
 */
function runTetrisGridLayout(cy, options = {}) {
  const {
    padding = 50,
    animate = true,
    animationDuration = 250,
    sortAlphabetically = false,
    containerWidth: providedWidth,
  } = options

  const nodes = cy.nodes().toArray()
  if (nodes.length === 0) return

  // Sort nodes - either alphabetically first or by size first
  const alphaCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  nodes.sort((a, b) => {
    const titleA = a.data('nodeData')?.title || ''
    const titleB = b.data('nodeData')?.title || ''

    if (sortAlphabetically) {
      // Primary: alphabetical, Secondary: by size
      const titleCompare = alphaCompare(titleA, titleB)
      if (titleCompare !== 0) return titleCompare
      const dimA = getNodeDimensions(a)
      const dimB = getNodeDimensions(b)
      return dimB.width * dimB.height - dimA.width * dimA.height
    } else {
      // Primary: by area (largest first), Secondary: alphabetical
      const dimA = getNodeDimensions(a)
      const dimB = getNodeDimensions(b)
      const areaA = dimA.width * dimA.height
      const areaB = dimB.width * dimB.height
      if (areaB !== areaA) return areaB - areaA
      return alphaCompare(titleA, titleB)
    }
  })

  // Use provided width or measure from container
  const container = cy.container()
  const containerWidth = providedWidth || (container ? container.clientWidth - padding * 2 : 1200)

  // Simple row-based layout (no shelf reuse to avoid overlap issues)
  const rows = [] // Each row: { items: [{ x, width, height, node }] }
  let currentRow = { items: [] }
  let currentRowX = 0
  let currentRowMaxHeight = 0

  for (const node of nodes) {
    const dim = getNodeDimensions(node)
    const nodeWidth = dim.width + GRID_GAP
    const nodeHeight = dim.height + GRID_GAP

    // Check if node fits on current row
    if (currentRowX + nodeWidth <= containerWidth || currentRow.items.length === 0) {
      currentRow.items.push({
        x: currentRowX,
        width: nodeWidth,
        height: nodeHeight,
        node,
      })
      currentRowX += nodeWidth
      if (nodeHeight > currentRowMaxHeight) {
        currentRowMaxHeight = nodeHeight
      }
    } else {
      // Finalize current row and start new one
      currentRow.height = currentRowMaxHeight
      rows.push(currentRow)

      currentRow = {
        items: [{ x: 0, width: nodeWidth, height: nodeHeight, node }],
      }
      currentRowX = nodeWidth
      currentRowMaxHeight = nodeHeight
    }
  }

  // Don't forget the last row
  if (currentRow.items.length > 0) {
    currentRow.height = currentRowMaxHeight
    rows.push(currentRow)
  }

  // Calculate Y positions for each row
  let currentY = 0
  for (const row of rows) {
    row.y = currentY
    currentY += row.height
  }

  // Calculate positions and apply
  const positions = []
  for (const row of rows) {
    for (const item of row.items) {
      const dim = getNodeDimensions(item.node)
      positions.push({
        node: item.node,
        x: padding + item.x + dim.width / 2,
        y: padding + row.y + dim.height / 2,
      })
    }
  }

  // Apply positions
  if (animate) {
    cy.batch(() => {
      for (const pos of positions) {
        pos.node.animate({ position: { x: pos.x, y: pos.y } }, { duration: animationDuration, easing: 'ease-out' })
      }
    })
    // Fit after animation
    setTimeout(() => {
      cy.fit(padding)
    }, animationDuration + 50)
  } else {
    cy.batch(() => {
      for (const pos of positions) {
        pos.node.position({ x: pos.x, y: pos.y })
      }
    })
    cy.fit(padding)
  }
}

/**
 * Layout configurations for different graph modes.
 */
export const LAYOUTS = {
  // Tree mode: Dagre - hierarchical with minimal edge crossings
  tree: {
    name: 'dagre',
    animate: true,
    animationDuration: 300,
    rankDir: 'TB',
    nodeSep: 30, // Spacing between nodes (added to actual node size)
    rankSep: 60, // Spacing between ranks
    edgeSep: 20,
    ranker: 'network-simplex',
    fit: true,
    padding: 50,
    // Use actual node dimensions from cytoscape
    nodeDimensionsIncludeLabels: true,
  },

  // Horizontal: dagre left-to-right
  horizontal: {
    name: 'dagre',
    animate: true,
    animationDuration: 300,
    fit: true,
    padding: 50,
    rankDir: 'LR',
    nodeSep: 30,
    rankSep: 60,
    edgeSep: 20,
    ranker: 'network-simplex',
    nodeDimensionsIncludeLabels: true,
  },

  // Radial: cose-bilkent force-directed
  radial: {
    name: 'cose-bilkent',
    animate: 'end',
    animationDuration: 300,
    fit: true,
    padding: 50,
    randomize: true,
    nodeRepulsion: 8000, // Increased to prevent overlap
    idealEdgeLength: 150, // Increased for better spacing
    edgeElasticity: 0.45,
    gravity: 0.8,
    gravityRange: 10,
    numIter: 2500,
    tile: false,
    nodeDimensionsIncludeLabels: true,
  },

  // Grid: Tetris-style bin-packing layout (handled via custom function)
  grid: {
    name: 'preset',
    animate: true,
    animationDuration: 250,
    fit: true,
    padding: 20,
  },

  // Circle: simple circle layout
  circle: {
    name: 'circle',
    animate: true,
    animationDuration: 250,
    fit: true,
    padding: 50,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    spacingFactor: 1.2,
  },

  // Relax (single click): Dagre - clean up edge crossings
  relax: {
    name: 'dagre',
    animate: true,
    animationDuration: 300,
    rankDir: 'TB',
    nodeSep: 30,
    rankSep: 60,
    edgeSep: 20,
    ranker: 'network-simplex',
    fit: true,
    padding: 50,
    nodeDimensionsIncludeLabels: true,
  },

  // Continuous relax (double click): cola infinite
  continuous: {
    name: 'cola',
    animate: true,
    infinite: true,
    fit: false,
    nodeSpacing: node => {
      // Use actual node dimensions - cola will use these for overlap avoidance
      const width = node.width() || MIN_NODE_WIDTH
      const height = node.height() || MIN_NODE_HEIGHT
      // Return spacing that accounts for node size
      return Math.max(width, height) / 2 + 15
    },
    edgeLength: edge => {
      const source = edge.source()
      const target = edge.target()
      // Base edge length on actual node dimensions
      const sourceWidth = source.width() || MIN_NODE_WIDTH
      const targetWidth = target.width() || MIN_NODE_WIDTH
      const sourceHeight = source.height() || MIN_NODE_HEIGHT
      const targetHeight = target.height() || MIN_NODE_HEIGHT
      // Edge length should be at least half the sum of node sizes plus some spacing
      const minLength = (Math.max(sourceWidth, sourceHeight) + Math.max(targetWidth, targetHeight)) / 2 + 50
      return Math.max(minLength, 100)
    },
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    handleDisconnected: true,
    convergenceThreshold: 0.001,
    maxSimulationTime: 0,
    ungrabifyWhileSimulating: false,
    centerGraph: false,
  },
}

/**
 * Composable for managing graph layouts.
 * @param {Object} options - Configuration options
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @param {Function} options.getLayoutMode - Function returning current layout mode
 * @param {Function} options.setLayoutMode - Function to set layout mode
 * @param {Function} options.getRadialSettings - Function returning radial settings
 * @param {Function} options.savePositions - Function to save positions
 * @param {Function} options.clearPositions - Function to clear saved positions
 * @param {Ref} options.relaxLocked - Ref for relax lock state (from useGraphSettings)
 * @param {Ref} options.fitLocked - Ref for fit lock state (from useGraphSettings)
 * @returns {Object} Layout management functions
 */
export function useGraphLayout(options = {}) {
  const {
    getCy,
    getLayoutMode,
    setLayoutMode,
    getRadialSettings,
    getSortAlphabetically,
    savePositions,
    clearPositions,
    relaxLocked,
    fitLocked,
  } = options

  // Continuous layout state
  let continuousLayout = null
  let continuousFitInterval = null
  let autoRelaxTimer = null

  /**
   * Get layout options for the current mode.
   * @param {string} mode - Layout mode (optional, uses current if not provided)
   * @returns {Object} Layout options
   */
  function getLayoutOptions(mode) {
    const layoutMode = mode || (getLayoutMode ? getLayoutMode() : 'tree')
    if (layoutMode === 'radial' && getRadialSettings) {
      const radialSettings = getRadialSettings()
      const scaledGravity = radialSettings.gravity / GRAVITY_SCALE_DIVISOR
      return {
        ...LAYOUTS.radial,
        nodeRepulsion: radialSettings.nodeRepulsion,
        idealEdgeLength: radialSettings.edgeLength,
        edgeElasticity: radialSettings.elasticity,
        gravity: scaledGravity,
        gravityRange: 10,
        numIter: radialSettings.iterations,
      }
    }
    // Circle layout: arrange nodes in concentric rings by depth
    if (layoutMode === 'circle') {
      const cy = getCy ? getCy() : null
      let maxDepth = 1
      if (cy) {
        cy.nodes().forEach(n => {
          const depth = n.data('nodeData')?.depth || 0
          if (depth > maxDepth) maxDepth = depth
        })
      }
      return {
        ...LAYOUTS.circle,
        concentric: node => {
          const depth = node.data('nodeData')?.depth || 0
          // Higher value = closer to center
          // Depth 0 (root/container) at center, children in outer rings
          return maxDepth + 1 - depth
        },
      }
    }
    return LAYOUTS[layoutMode] || LAYOUTS.tree
  }

  /**
   * Apply a new layout mode.
   * @param {string} mode - Layout mode to apply
   */
  function setLayout(mode) {
    // Stop relax and fit when switching layouts
    if (relaxLocked.value) {
      relaxLocked.value = false
      stopContinuousRelax()
    }
    if (fitLocked.value) {
      fitLocked.value = false
      stopContinuousFit()
    }

    if (setLayoutMode) setLayoutMode(mode)
    reLayout()
  }

  /**
   * Re-run the current layout.
   */
  function reLayout() {
    const cy = getCy ? getCy() : null
    if (!cy) return

    // Clear saved positions
    if (clearPositions) clearPositions()

    // Sync node dimensions with actual HTML label sizes before layout
    syncNodeDimensions(cy)

    const mode = getLayoutMode ? getLayoutMode() : 'tree'

    // Use custom Tetris grid layout for grid mode
    if (mode === 'grid') {
      // Use window width as basis for landscape layout
      // The container might not reflect the actual available space
      const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
      // Estimate sidebar width (typically 250-280px when pinned) and some margin
      const estimatedSidebarWidth = 300
      const measuredWidth = Math.max(windowWidth - estimatedSidebarWidth, 600)

      // Reset zoom and spread nodes apart to ensure accurate DOM measurements
      cy.zoom(1)
      cy.pan({ x: 0, y: 0 })

      // Spread nodes apart temporarily to avoid overlap affecting dimensions
      cy.batch(() => {
        const nodes = cy.nodes().toArray()
        nodes.forEach((node, i) => {
          node.position({ x: i * 300, y: 0 })
        })
      })

      // Wait for DOM to update with spread positions, then measure and layout
      requestAnimationFrame(() => {
        syncNodeDimensions(cy)
        const sortAlpha = getSortAlphabetically ? getSortAlphabetically() : false
        runTetrisGridLayout(cy, {
          padding: 20,
          animate: false,
          animationDuration: 0,
          sortAlphabetically: sortAlpha,
          containerWidth: measuredWidth,
        })

        // Fit to view after layout
        cy.fit(undefined, 50)

        setTimeout(() => {
          if (savePositions) savePositions()
        }, 100)
      })
      return
    }

    const layoutOptions = getLayoutOptions()
    cy.layout(layoutOptions).run()
    setTimeout(() => {
      if (savePositions) savePositions()
    }, 800)
  }

  /**
   * Apply radial settings to the current layout.
   */
  function applyRadialSettings() {
    const cy = getCy ? getCy() : null
    if (!cy) return

    const radialSettings = getRadialSettings ? getRadialSettings() : {}

    // Calculate center of current graph to use as gravity center
    const bb = cy.nodes().boundingBox()
    const centerX = (bb.x1 + bb.x2) / 2
    const centerY = (bb.y1 + bb.y2) / 2

    const layoutOptions = {
      name: 'cose-bilkent',
      animate: 'end',
      animationDuration: 300,
      fit: true,
      randomize: false,
      nodeRepulsion: radialSettings.nodeRepulsion || 4500,
      idealEdgeLength: radialSettings.edgeLength || 100,
      edgeElasticity: radialSettings.elasticity || 0.45,
      gravity: (radialSettings.gravity || 10000) / 10000,
      gravityRangeCompound: 1.5,
      gravityRange: 3.8,
      numIter: 2500,
      tile: false,
      gravityCenter: { x: centerX, y: centerY },
    }

    const layout = cy.layout(layoutOptions)
    layout.on('layoutstop', () => {
      if (savePositions) savePositions()
    })
    layout.run()
  }

  /**
   * Reset layout with randomization.
   */
  function resetLayout() {
    const cy = getCy ? getCy() : null
    if (!cy) return

    if (clearPositions) clearPositions()

    const baseOpts = getLayoutOptions()
    const opts = {
      ...baseOpts,
      animate: 'end',
      animationDuration: 500,
      fit: true,
      randomize: true,
    }

    cy.layout(opts).run()
    setTimeout(() => {
      if (savePositions) savePositions()
    }, 1000)
  }

  /**
   * Run single relaxation pass with cose-bilkent.
   */
  function relaxLayout() {
    const cy = getCy ? getCy() : null
    if (!cy) return

    // Sync node dimensions before relaxing
    syncNodeDimensions(cy)

    const radialSettings = getRadialSettings ? getRadialSettings() : {}
    const spacing = Math.max(5, Math.round((radialSettings.nodeRepulsion || 4500) / 50))
    const edgeLen = Math.max(20, Math.round(radialSettings.edgeLength || 100))
    const gravityEffect = Math.max(0.1, 1 - (radialSettings.gravity || 10000) / 50000)

    const layoutOptions = {
      name: 'cola',
      animate: true,
      fit: false,
      randomize: false,
      nodeSpacing: Math.round(spacing * gravityEffect),
      edgeLength: Math.round(edgeLen * gravityEffect),
      avoidOverlap: true,
      handleDisconnected: true,
      centerGraph: radialSettings.gravity > 20000,
      convergenceThreshold: 0.01,
      maxSimulationTime: 2000,
      ungrabifyWhileSimulating: false,
    }

    const layout = cy.layout(layoutOptions)
    layout.on('layoutstop', () => {
      cy.animate({ fit: { padding: 50 } }, { duration: 300 })
      if (savePositions) savePositions()
    })
    layout.run()
  }

  /**
   * Run local relaxation on a node and its neighbors.
   * @param {number} nodeId - Node ID to relax around
   */
  function localRelax(nodeId) {
    const cy = getCy ? getCy() : null
    if (!cy) return

    const node = cy.getElementById(String(nodeId))
    if (!node || node.length === 0) return

    const neighborhood = node.neighborhood().add(node)
    cy.nodes().not(neighborhood).lock()

    const zoom = cy.zoom()
    const pan = cy.pan()

    neighborhood
      .layout({
        name: 'cola',
        animate: true,
        animationDuration: 200,
        fit: false,
        randomize: false,
        nodeSpacing: 30,
        edgeLength: 80,
        maxSimulationTime: 500,
      })
      .run()

    setTimeout(() => {
      cy.nodes().unlock()
      cy.zoom(zoom)
      cy.pan(pan)
      if (savePositions) savePositions()
    }, 300)
  }

  /**
   * Auto-relax newly added nodes.
   * @param {Array} newNodeIds - IDs of new nodes
   */
  function autoRelaxNewNodes(newNodeIds) {
    const cy = getCy ? getCy() : null
    if (!cy || newNodeIds.length === 0) return

    if (autoRelaxTimer) {
      clearTimeout(autoRelaxTimer)
      autoRelaxTimer = null
    }

    // Skip if continuous relax is already running
    if (relaxLocked.value) return

    const radialSettings = getRadialSettings ? getRadialSettings() : {}
    const newNodes = newNodeIds.map(id => cy.getElementById(String(id))).filter(n => n.length > 0)
    if (newNodes.length === 0) return

    let newNodesCollection = cy.collection()
    newNodes.forEach(node => {
      newNodesCollection = newNodesCollection.add(node)
    })

    let neighborhood = cy.collection()
    newNodes.forEach(node => {
      neighborhood = neighborhood.union(node.neighborhood().add(node))
    })

    cy.nodes().not(newNodesCollection).lock()

    const savedZoom = cy.zoom()
    const savedPan = { ...cy.pan() }

    const layout = neighborhood.layout({
      name: 'cola',
      animate: true,
      fit: false,
      randomize: false,
      nodeSpacing: 40,
      edgeLength: radialSettings.edgeLength || 80,
      maxSimulationTime: 500,
      ungrabifyWhileSimulating: false,
    })

    layout.on('layoutstop', () => {
      cy.nodes().unlock()
      cy.zoom(savedZoom)
      cy.pan(savedPan)
      if (savePositions) savePositions()
    })

    layout.run()
  }

  /**
   * Start continuous relaxation.
   */
  function startContinuousRelax() {
    const cy = getCy ? getCy() : null
    if (!cy) return

    stopContinuousRelax()

    const radialSettings = getRadialSettings ? getRadialSettings() : {}
    const spacing = Math.max(5, Math.round((radialSettings.nodeRepulsion || 4500) / 50))
    const edgeLen = Math.max(20, Math.round(radialSettings.edgeLength || 100))
    const gravityEffect = Math.max(0.1, 1 - (radialSettings.gravity || 10000) / 50000)

    const layoutOptions = {
      name: 'cola',
      animate: true,
      infinite: true,
      fit: false,
      nodeSpacing: Math.round(spacing * gravityEffect),
      edgeLength: edgeLen,
      avoidOverlap: true,
      handleDisconnected: true,
      centerGraph: false,
      convergenceThreshold: 0.001,
      ungrabifyWhileSimulating: false,
    }

    continuousLayout = cy.layout(layoutOptions)
    continuousLayout.run()
  }

  /**
   * Restart continuous relaxation with current settings.
   */
  function restartContinuousRelax() {
    const cy = getCy ? getCy() : null
    if (!cy || !relaxLocked.value) return
    stopContinuousRelax()
    startContinuousRelax()
  }

  /**
   * Stop continuous relaxation.
   */
  function stopContinuousRelax() {
    if (continuousLayout) {
      continuousLayout.stop()
      continuousLayout = null
    }
    if (savePositions) savePositions()
  }

  /**
   * Handle relax button click (single/double click detection).
   */
  let lastRelaxClickTime = 0
  function handleRelaxClick() {
    const now = Date.now()
    const timeSinceLastClick = now - lastRelaxClickTime
    lastRelaxClickTime = now

    if (timeSinceLastClick < 350) {
      // Double click - toggle lock
      relaxLocked.value = !relaxLocked.value
      if (relaxLocked.value) {
        startContinuousRelax()
      } else {
        stopContinuousRelax()
      }
    } else {
      // Single click - run relax once (unless locked)
      if (!relaxLocked.value) {
        relaxLayout()
      }
    }
  }

  /**
   * Fit view to all nodes.
   */
  function fitView() {
    const cy = getCy ? getCy() : null
    if (cy) {
      cy.fit(50)
    }
  }

  /**
   * Start continuous fit.
   */
  function startContinuousFit() {
    const cy = getCy ? getCy() : null
    if (!cy) return
    stopContinuousFit()
    cy.animate({ fit: { padding: 50 } }, { duration: 200 })
    continuousFitInterval = setInterval(() => {
      const cy = getCy ? getCy() : null
      if (cy) cy.animate({ fit: { padding: 50 } }, { duration: 250 })
    }, 300)
  }

  /**
   * Stop continuous fit.
   */
  function stopContinuousFit() {
    if (continuousFitInterval) {
      clearInterval(continuousFitInterval)
      continuousFitInterval = null
    }
  }

  /**
   * Handle fit button click (single/double click detection).
   */
  let lastFitClickTime = 0
  function handleFitClick() {
    const now = Date.now()
    const timeSinceLastClick = now - lastFitClickTime
    lastFitClickTime = now

    if (timeSinceLastClick < 350) {
      // Double click - toggle lock
      fitLocked.value = !fitLocked.value
      if (fitLocked.value) {
        startContinuousFit()
      } else {
        stopContinuousFit()
      }
    } else {
      // Single click - fit once (unless locked)
      if (!fitLocked.value) {
        fitView()
      }
    }
  }

  /**
   * Cleanup function - call on unmount.
   */
  function cleanup() {
    stopContinuousRelax()
    stopContinuousFit()
    if (autoRelaxTimer) {
      clearTimeout(autoRelaxTimer)
      autoRelaxTimer = null
    }
  }

  /**
   * Run Tetris grid layout (for external use).
   */
  function runGridLayout() {
    const cy = getCy ? getCy() : null
    if (!cy) return
    // Use window width for landscape layout
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200
    const estimatedSidebarWidth = 300
    const measuredWidth = Math.max(windowWidth - estimatedSidebarWidth, 600)
    const sortAlpha = getSortAlphabetically ? getSortAlphabetically() : false
    runTetrisGridLayout(cy, {
      padding: 20,
      animate: true,
      animationDuration: 250,
      sortAlphabetically: sortAlpha,
      containerWidth: measuredWidth,
    })
    setTimeout(() => {
      if (savePositions) savePositions()
    }, 300)
  }

  /**
   * Check if current mode is grid.
   */
  function isGridMode() {
    const mode = getLayoutMode ? getLayoutMode() : 'tree'
    return mode === 'grid'
  }

  return {
    // Layout config
    LAYOUTS,
    getLayoutOptions,

    // Layout operations
    setLayout,
    reLayout,
    resetLayout,
    applyRadialSettings,
    relaxLayout,
    localRelax,
    autoRelaxNewNodes,

    // Grid layout
    runGridLayout,
    isGridMode,

    // Node dimension sync
    syncNodeDimensions: () => syncNodeDimensions(getCy ? getCy() : null),

    // Continuous relax
    startContinuousRelax,
    stopContinuousRelax,
    restartContinuousRelax,
    handleRelaxClick,

    // Fit operations
    fitView,
    startContinuousFit,
    stopContinuousFit,
    handleFitClick,

    // Cleanup
    cleanup,
  }
}
