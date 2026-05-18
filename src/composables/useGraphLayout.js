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
  const { padding = 50, animate = true, animationDuration = 250 } = options

  const nodes = cy.nodes().toArray()
  if (nodes.length === 0) return

  // Sort nodes by height (tallest first) then by width (widest first)
  // This helps pack efficiently
  nodes.sort((a, b) => {
    const dimA = getNodeDimensions(a)
    const dimB = getNodeDimensions(b)
    // Sort by area (largest first)
    const areaA = dimA.width * dimA.height
    const areaB = dimB.width * dimB.height
    if (areaB !== areaA) return areaB - areaA
    // Then alphabetically by title for stability
    const titleA = a.data('nodeData')?.title || ''
    const titleB = b.data('nodeData')?.title || ''
    return titleA.localeCompare(titleB)
  })

  // Get container dimensions for calculating grid width
  // Limit max width to prevent overly spread out layouts
  const container = cy.container()
  const rawWidth = container ? container.clientWidth - padding * 2 : 1200
  const containerWidth = Math.min(rawWidth, 1400) // Cap at reasonable width

  // Shelf-based bin packing algorithm
  const shelves = [] // Each shelf: { y, height, items: [{ x, width, node }] }

  for (const node of nodes) {
    const dim = getNodeDimensions(node)
    const nodeWidth = dim.width + GRID_GAP
    const nodeHeight = dim.height + GRID_GAP

    let placed = false

    // Try to fit on an existing shelf
    for (const shelf of shelves) {
      // Check if node height fits on this shelf (allow some tolerance)
      if (nodeHeight <= shelf.height + 20) {
        // Find the rightmost x position on this shelf
        let shelfEndX = 0
        for (const item of shelf.items) {
          const itemEnd = item.x + item.width
          if (itemEnd > shelfEndX) shelfEndX = itemEnd
        }

        // Check if there's room on this shelf
        if (shelfEndX + nodeWidth <= containerWidth) {
          shelf.items.push({
            x: shelfEndX,
            width: nodeWidth,
            node,
            height: nodeHeight,
          })
          placed = true
          break
        }
      }
    }

    // If not placed, create a new shelf
    if (!placed) {
      let newShelfY = 0
      if (shelves.length > 0) {
        const lastShelf = shelves[shelves.length - 1]
        newShelfY = lastShelf.y + lastShelf.height
      }

      shelves.push({
        y: newShelfY,
        height: nodeHeight,
        items: [{ x: 0, width: nodeWidth, node, height: nodeHeight }],
      })
    }
  }

  // Calculate positions and apply
  const positions = []
  for (const shelf of shelves) {
    for (const item of shelf.items) {
      const dim = getNodeDimensions(item.node)
      positions.push({
        node: item.node,
        x: padding + item.x + dim.width / 2,
        y: padding + shelf.y + dim.height / 2,
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
    nodeSep: 80,
    rankSep: 120,
    edgeSep: 30,
    ranker: 'network-simplex',
    fit: true,
    padding: 50,
  },

  // Horizontal: dagre left-to-right
  horizontal: {
    name: 'dagre',
    animate: true,
    animationDuration: 300,
    fit: true,
    padding: 50,
    rankDir: 'LR',
    nodeSep: 60,
    rankSep: 100,
    edgeSep: 20,
    ranker: 'network-simplex',
  },

  // Radial: cose-bilkent force-directed
  radial: {
    name: 'cose-bilkent',
    animate: 'end',
    animationDuration: 300,
    fit: true,
    padding: 50,
    randomize: true,
    nodeRepulsion: 4500,
    idealEdgeLength: 100,
    edgeElasticity: 0.45,
    gravity: 1.0,
    gravityRange: 10,
    numIter: 2500,
    tile: false,
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
    nodeSep: 80,
    rankSep: 120,
    edgeSep: 30,
    ranker: 'network-simplex',
    fit: true,
    padding: 50,
  },

  // Continuous relax (double click): cola infinite
  continuous: {
    name: 'cola',
    animate: true,
    infinite: true,
    fit: false,
    nodeSpacing: node => {
      const nodeCount = node.cy().nodes().length
      if (nodeCount > NODE_COUNT_THRESHOLDS.LARGE) return NODE_SPACING.LARGE
      if (nodeCount > NODE_COUNT_THRESHOLDS.MEDIUM) return NODE_SPACING.MEDIUM
      return NODE_SPACING.DEFAULT
    },
    edgeLength: edge => {
      const nodeCount = edge.cy().nodes().length
      const source = edge.source()
      const target = edge.target()
      const sourceDegree = source.degree()
      const targetDegree = target.degree()
      const avgDegree = (sourceDegree + targetDegree) / 2

      let baseLength = EDGE_LENGTH.BASE_DEFAULT
      if (nodeCount > NODE_COUNT_THRESHOLDS.LARGE) baseLength = EDGE_LENGTH.BASE_LARGE
      else if (nodeCount > NODE_COUNT_THRESHOLDS.MEDIUM) baseLength = EDGE_LENGTH.BASE_MEDIUM
      else if (nodeCount > NODE_COUNT_THRESHOLDS.SMALL) baseLength = EDGE_LENGTH.BASE_SMALL

      const perDegree =
        nodeCount > NODE_COUNT_THRESHOLDS.MEDIUM ? EDGE_LENGTH.PER_DEGREE_DENSE : EDGE_LENGTH.PER_DEGREE_SPARSE
      return baseLength + Math.min(avgDegree * perDegree, baseLength)
    },
    avoidOverlap: true,
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

    const mode = getLayoutMode ? getLayoutMode() : 'tree'

    // Use custom Tetris grid layout for grid mode
    if (mode === 'grid') {
      runTetrisGridLayout(cy, { padding: 20, animate: true, animationDuration: 250 })
      setTimeout(() => {
        if (savePositions) savePositions()
      }, 300)
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
    runTetrisGridLayout(cy, { padding: 20, animate: true, animationDuration: 250 })
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
