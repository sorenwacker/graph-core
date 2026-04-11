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

/**
 * Composable for graph selection management.
 * @param {Object} options - Configuration options
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @returns {Object} Selection management functions
 */
export function useGraphSelection(options = {}) {
  const { getCy } = options

  /**
   * Sync Vue selection state to cytoscape.
   * @param {Array} selectedIds - Array of selected node IDs
   */
  function syncSelectionToCy(selectedIds) {
    const cy = getCy ? getCy() : null
    if (!cy) return

    const newIdSet = new Set(selectedIds || [])

    // Update isSelected in node data
    cy.nodes().forEach(node => {
      const nodeId = parseInt(node.id())
      const isSelected = newIdSet.has(nodeId)
      if (node.data('isSelected') !== isSelected) {
        node.data('isSelected', isSelected)
      }
    })

    // Check if cytoscape selection already matches
    const currentSelected = new Set()
    cy.$(':selected').forEach(n => currentSelected.add(parseInt(n.id())))

    const sameSelection = currentSelected.size === newIdSet.size && [...currentSelected].every(id => newIdSet.has(id))

    if (!sameSelection) {
      cy.nodes().unselect()
      if (newIdSet.size > 0) {
        newIdSet.forEach(id => {
          cy.$(`#${id}`).select()
        })
      }
    }

    updateHtmlLabelSelectionFromIds(newIdSet)
  }

  /**
   * Sync single selection to cytoscape.
   * @param {number|null} selectedId - Single selected node ID
   * @param {Array} selectedIds - Array of selected IDs (for checking if empty)
   */
  function syncSingleSelectionToCy(selectedId, selectedIds) {
    const cy = getCy ? getCy() : null
    // Only act if selectedIds is empty (single selection case)
    if (selectedIds && selectedIds.length > 0) return
    if (!cy) return

    cy.nodes().forEach(node => {
      const nodeId = parseInt(node.id())
      const isSelected = nodeId === selectedId
      if (node.data('isSelected') !== isSelected) {
        node.data('isSelected', isSelected)
      }
    })

    if (selectedId) {
      cy.nodes().unselect()
      cy.$(`#${selectedId}`).select()
    }

    updateHtmlLabelSelectionFromIds(selectedId ? new Set([selectedId]) : new Set())
  }

  /**
   * Update HTML labels from cytoscape selection.
   */
  function updateFromCySelection() {
    const cy = getCy ? getCy() : null
    updateHtmlLabelsFromCySelection(cy)
  }

  /**
   * Center view on a node.
   * @param {number} nodeId - Node ID
   */
  function center(nodeId) {
    const cy = getCy ? getCy() : null
    centerOnNode(cy, nodeId)
  }

  /**
   * Check if node is visible.
   * @param {number} nodeId - Node ID
   * @returns {boolean}
   */
  function checkVisible(nodeId) {
    const cy = getCy ? getCy() : null
    return isNodeVisible(cy, nodeId)
  }

  return {
    syncSelectionToCy,
    syncSingleSelectionToCy,
    updateFromCySelection,
    updateHtmlLabelSelectionFromIds,
    updateHtmlLabelsFromCySelection: updateFromCySelection,
    centerOnNode: center,
    isNodeVisible: checkVisible,
  }
}
