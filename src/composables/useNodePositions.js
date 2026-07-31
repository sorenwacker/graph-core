/**
 * Composable for managing node positions in the graph.
 * Handles loading/saving positions to localStorage and smart positioning for new nodes.
 */

/**
 * Create a positions key for localStorage.
 * @param {string} workspace - Current workspace name
 * @param {number|null} parentId - Parent container ID
 * @returns {string} Storage key for positions
 */
export function getPositionsKey(workspace, parentId) {
  const pid = parentId || 'root'
  const ws = workspace || 'work'
  return `graph-positions-${ws}-${pid}`
}

/**
 * Load saved positions from localStorage with validation.
 * Filters out corrupted positions (must be finite and within reasonable bounds).
 * @param {string} key - Storage key
 * @returns {Object} Map of nodeId -> {x, y} positions
 */
export function loadNodePositions(key) {
  try {
    const saved = localStorage.getItem(key)
    if (!saved) return {}
    const positions = JSON.parse(saved)
    // Filter out corrupted positions
    const MAX_POS = 50000
    const validated = {}
    for (const [id, pos] of Object.entries(positions)) {
      if (
        pos &&
        typeof pos.x === 'number' &&
        typeof pos.y === 'number' &&
        isFinite(pos.x) &&
        isFinite(pos.y) &&
        Math.abs(pos.x) < MAX_POS &&
        Math.abs(pos.y) < MAX_POS
      ) {
        validated[id] = pos
      }
    }
    return validated
  } catch {
    return {}
  }
}

/**
 * Save node positions to localStorage with validation.
 * Merges with existing positions to preserve positions of filtered-out nodes.
 * @param {Object} cy - Cytoscape instance
 * @param {string} key - Storage key
 */
export function saveNodePositions(cy, key) {
  if (!cy) return
  const MAX_POS = 50000
  // Load existing positions first to preserve positions of hidden/filtered nodes
  const existingPositions = loadNodePositions(key)
  const positions = { ...existingPositions }
  cy.nodes().forEach(node => {
    const pos = node.position()
    // Only save valid positions
    if (isFinite(pos.x) && isFinite(pos.y) && Math.abs(pos.x) < MAX_POS && Math.abs(pos.y) < MAX_POS) {
      positions[node.id()] = { x: pos.x, y: pos.y }
    }
  })
  localStorage.setItem(key, JSON.stringify(positions))
}

/**
 * Find a smart position for a new node based on context.
 * Uses parent position, child positions, or graph center as fallbacks.
 * @param {number} nodeId - ID of the new node
 * @param {number|null} parentId - Parent node ID
 * @param {Object} savedPositions - Map of existing positions
 * @param {Array} childIds - IDs of children (for wrap-with-parent)
 * @param {Object|null} cy - Cytoscape instance for additional lookups
 * @returns {Object} Position {x, y}
 */
export function findSmartPosition(nodeId, parentId, savedPositions, childIds = [], cy = null) {
  // Convert parentId to string for lookup (localStorage keys are strings)
  const parentKey = String(parentId)

  // First priority: if this node has children with positions, position near them
  // This handles wrap-with-parent where the new parent should be near its child
  if (childIds.length > 0) {
    const childPositions = childIds.map(id => savedPositions[String(id)]).filter(pos => pos)
    if (childPositions.length > 0) {
      const avgX = childPositions.reduce((sum, p) => sum + p.x, 0) / childPositions.length
      const avgY = childPositions.reduce((sum, p) => sum + p.y, 0) / childPositions.length
      // Place slightly above/offset from children
      return {
        x: avgX + (Math.random() - 0.5) * 30,
        y: avgY - 40 - Math.random() * 20,
      }
    }
  }

  // If parent has a position, place close to parent
  if (parentId && savedPositions[parentKey]) {
    const parentPos = savedPositions[parentKey]
    const angle = Math.random() * Math.PI * 2
    const distance = 20 + Math.random() * 20
    return {
      x: parentPos.x + Math.cos(angle) * distance,
      y: parentPos.y + Math.sin(angle) * distance,
    }
  }

  // Try to get parent position from current cytoscape instance
  if (parentId && cy) {
    const parentNode = cy.$(`#${parentId}`)
    if (parentNode.length > 0) {
      const parentPos = parentNode.position()
      const angle = Math.random() * Math.PI * 2
      const distance = 20 + Math.random() * 20
      return {
        x: parentPos.x + Math.cos(angle) * distance,
        y: parentPos.y + Math.sin(angle) * distance,
      }
    }
  }

  // Otherwise, find center of existing nodes and place nearby
  const positions = Object.values(savedPositions)
  if (positions.length > 0) {
    const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
    const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 30
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    }
  }

  // Try to get center from current cytoscape nodes
  if (cy && cy.nodes().length > 0) {
    const bb = cy.nodes().boundingBox()
    const centerX = (bb.x1 + bb.x2) / 2
    const centerY = (bb.y1 + bb.y2) / 2
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 30
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance,
    }
  }

  // Default center position
  return { x: 400, y: 300 }
}
