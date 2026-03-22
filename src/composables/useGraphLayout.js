import { ref } from 'vue'

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
    padding: 50
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
    ranker: 'network-simplex'
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
    tile: false
  },

  // Grid: simple grid layout
  grid: {
    name: 'grid',
    animate: true,
    animationDuration: 250,
    fit: true,
    padding: 50,
    avoidOverlap: true,
    avoidOverlapPadding: 20,
    nodeDimensionsIncludeLabels: true,
    condense: false,
    rows: undefined,
    cols: undefined,
    sort: (a, b) => (a.data('label') || '').localeCompare(b.data('label') || '')
  },

  // Circle: nodes arranged in a circle
  circle: {
    name: 'concentric',
    animate: true,
    animationDuration: 250,
    fit: true,
    padding: 50,
    minNodeSpacing: 100,
    avoidOverlap: true,
    nodeDimensionsIncludeLabels: true,
    concentric: () => 1,
    levelWidth: () => 1
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
    padding: 50
  },

  // Continuous relax (double click): cola infinite
  continuous: {
    name: 'cola',
    animate: true,
    infinite: true,
    fit: false,
    nodeSpacing: (node) => {
      const nodeCount = node.cy().nodes().length
      if (nodeCount > 100) return 30
      if (nodeCount > 50) return 40
      return 50
    },
    edgeLength: (edge) => {
      const nodeCount = edge.cy().nodes().length
      const source = edge.source()
      const target = edge.target()
      const sourceDegree = source.degree()
      const targetDegree = target.degree()
      const avgDegree = (sourceDegree + targetDegree) / 2

      let baseLength = 120
      if (nodeCount > 100) baseLength = 60
      else if (nodeCount > 50) baseLength = 80
      else if (nodeCount > 30) baseLength = 100

      const perDegree = nodeCount > 50 ? 10 : 15
      return baseLength + Math.min(avgDegree * perDegree, baseLength)
    },
    avoidOverlap: true,
    handleDisconnected: true,
    convergenceThreshold: 0.001,
    maxSimulationTime: 0,
    ungrabifyWhileSimulating: false,
    centerGraph: false
  }
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
    fitLocked
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
      const scaledGravity = radialSettings.gravity / 10000
      return {
        ...LAYOUTS.radial,
        nodeRepulsion: radialSettings.nodeRepulsion,
        idealEdgeLength: radialSettings.edgeLength,
        edgeElasticity: radialSettings.elasticity,
        gravity: scaledGravity,
        gravityRange: 10,
        numIter: radialSettings.iterations
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
      gravityRange: 3.8,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: Math.max(5, 50 - (radialSettings.gravity || 10000) / 1000),
      tilingPaddingHorizontal: Math.max(5, 50 - (radialSettings.gravity || 10000) / 1000)
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
      randomize: true
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

    const layoutOptions = {
      name: 'cose-bilkent',
      animate: 'end',
      animationDuration: 300,
      fit: false,
      randomize: false,
      nodeRepulsion: radialSettings.nodeRepulsion || 4500,
      idealEdgeLength: radialSettings.edgeLength || 100,
      edgeElasticity: radialSettings.elasticity || 0.45,
      gravity: (radialSettings.gravity || 10000) / 10000,
      gravityRange: 3.8,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: Math.max(5, 50 - (radialSettings.gravity || 10000) / 1000),
      tilingPaddingHorizontal: Math.max(5, 50 - (radialSettings.gravity || 10000) / 1000)
    }

    const layout = cy.layout(layoutOptions)
    layout.on('layoutstop', () => {
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

    neighborhood.layout({
      name: 'cola',
      animate: true,
      animationDuration: 200,
      fit: false,
      randomize: false,
      nodeSpacing: 30,
      edgeLength: 80,
      maxSimulationTime: 500
    }).run()

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
      ungrabifyWhileSimulating: false
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
    const gravityEffect = Math.max(0.1, 1 - ((radialSettings.gravity || 10000) / 50000))

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
      ungrabifyWhileSimulating: false
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
    cleanup
  }
}
