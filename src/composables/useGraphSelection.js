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
