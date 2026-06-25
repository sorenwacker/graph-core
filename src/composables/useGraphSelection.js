/**
 * Composable for managing graph selection state synchronization.
 * Handles syncing selection between Vue state, Cytoscape, and HTML labels.
 */

/**
 * Update HTML label selection based on a set of selected IDs.
 * @param {Set} selectedIdSet - Set of selected node IDs
 */
export function updateHtmlLabelSelectionFromIds(selectedIdSet) {
  document.querySelectorAll('.node-html, .node-person').forEach(el => {
    const nodeId = el.dataset.nodeId
    const isSelected = selectedIdSet && selectedIdSet.has(parseInt(nodeId))
    el.dataset.selected = isSelected ? 'true' : 'false'
    if (isSelected) {
      el.classList.add('selected')
    } else {
      el.classList.remove('selected')
    }
  })
}

/**
 * Update HTML labels based on cytoscape selection state.
 * @param {Object} cy - Cytoscape instance
 */
export function updateHtmlLabelsFromCySelection(cy) {
  if (!cy) return
  const selectedIds = new Set()
  cy.$(':selected').forEach(node => {
    selectedIds.add(node.id())
  })
  document.querySelectorAll('.node-html, .node-person').forEach(el => {
    const nodeId = el.dataset.nodeId
    const isSelected = selectedIds.has(nodeId)
    el.dataset.selected = isSelected ? 'true' : 'false'
    if (isSelected) {
      el.classList.add('selected')
    } else {
      el.classList.remove('selected')
    }
  })
}

/**
 * Center the graph on a specific node.
 * @param {Object} cy - Cytoscape instance
 * @param {number} nodeId - Node ID to center on
 */
export function centerOnNode(cy, nodeId) {
  if (!cy) return
  const node = cy.$(`#${nodeId}`)
  if (node.length > 0) {
    cy.animate({
      center: { eles: node },
      zoom: 1.5,
      duration: 400,
      easing: 'ease-out',
    })
    // Flash highlight effect
    node.addClass('search-highlight')
    setTimeout(() => {
      node.removeClass('search-highlight')
    }, 2000)
  }
}

/**
 * Check if a node is currently visible in the graph.
 * @param {Object} cy - Cytoscape instance
 * @param {number} nodeId - Node ID to check
 * @returns {boolean}
 */
export function isNodeVisible(cy, nodeId) {
  if (!cy) return false
  return cy.getElementById(String(nodeId)).length > 0
}
