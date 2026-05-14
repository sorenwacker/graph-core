import { nextTick } from 'vue'
import { updateHtmlLabelsFromCySelection } from './useGraphSelection.js'

/**
 * Check if a cytoscape event originated from an HTML label overlay.
 * @param {Object} e - Cytoscape event object
 * @returns {boolean} True if click was on an HTML label
 */
function isClickOnHtmlLabel(e) {
  const clientX = e.originalEvent?.clientX
  const clientY = e.originalEvent?.clientY
  if (clientX === undefined || clientY === undefined) return false
  const element = document.elementFromPoint(clientX, clientY)
  return !!element?.closest?.('.node-html')
}

/**
 * Find the closest cytoscape node to a position within a threshold.
 * @param {Object} cy - Cytoscape instance
 * @param {Object} pos - Position {x, y}
 * @param {string} excludeId - Node ID to exclude from search
 * @param {number} threshold - Maximum distance to consider
 * @returns {Object|null} Closest cytoscape node or null
 */
function findClosestNode(cy, pos, excludeId, threshold = 50) {
  let closestNode = null
  let closestDist = Infinity

  cy.nodes().forEach(n => {
    if (n.id() === excludeId) return
    const nPos = n.position()
    const distance = Math.sqrt(Math.pow(pos.x - nPos.x, 2) + Math.pow(pos.y - nPos.y, 2))
    if (distance < threshold && distance < closestDist) {
      closestDist = distance
      closestNode = n
    }
  })

  return closestNode
}

/**
 * Check if a node is a descendant of another node.
 * @param {Object} parent - Parent node with children array
 * @param {number} childId - ID to search for
 * @returns {boolean} True if childId is a descendant of parent
 */
function isDescendant(parent, childId) {
  if (!parent.children) return false
  for (const child of parent.children) {
    if (child.id === childId) return true
    if (isDescendant(child, childId)) return true
  }
  return false
}

/**
 * Composable for handling cytoscape graph events.
 * @param {Object} options - Configuration options
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @param {Function} options.getContainer - Function returning container element
 * @param {Function} options.getDropHighlight - Function returning drop highlight element
 * @param {Function} options.getLinkModeActive - Function returning link mode state
 * @param {Function} options.getParent - Function returning parent node
 * @param {Function} options.getSelectedIds - Function returning set of selected node IDs
 * @param {Function} options.emit - Event emitter function
 * @param {Function} options.showAddNodeModal - Show add node modal
 * @param {Function} options.hideEditModal - Hide edit modal
 * @param {Function} options.showTooltip - Show tooltip
 * @param {Function} options.hideTooltip - Hide tooltip
 * @param {Function} options.forceHideTooltip - Force hide tooltip
 * @param {Function} options.savePositions - Save positions function
 * @param {Function} options.onToggleCollapse - Callback for toggling node collapse state
 * @returns {Object} Event setup function
 */
export function useGraphEvents(options = {}) {
  const {
    getCy,
    getContainer,
    getDropHighlight,
    getLinkModeActive,
    getSelectedIds,
    emit,
    showAddNodeModal,
    hideEditModal,
    showTooltip,
    hideTooltip,
    forceHideTooltip,
    savePositions,
    onToggleCollapse,
  } = options

  let backgroundClickPending = false
  let dragStartPos = null
  let highlightedNode = null
  let selectionUpdateTimer = null

  /**
   * Set up node tap and double-tap handlers.
   */
  function setupNodeTapHandlers(cy) {
    cy.on('tap', 'node', e => {
      if (isClickOnHtmlLabel(e)) return

      const node = e.target.data('nodeData')
      if (!node) return

      const hasCmd = e.originalEvent.metaKey || e.originalEvent.ctrlKey
      const hasAlt = e.originalEvent.altKey

      if (hasCmd && hasAlt) {
        emit('delete', node.id)
      } else if (hasCmd) {
        const pos = e.target.position()
        showAddNodeModal(node.id, { x: pos.x + 50, y: pos.y + 80 })
      } else if (e.originalEvent.shiftKey) {
        emit('select-multiple', { node, add: true })
      } else {
        emit('select', node)
      }
    })

    cy.on('dbltap', 'node', e => {
      if (isClickOnHtmlLabel(e)) return

      const node = e.target.data('nodeData')
      if (node) {
        hideEditModal()
        emit('enter', node)
      }
    })
  }

  /**
   * Set up background tap handler for deselection and node creation.
   */
  function setupBackgroundTapHandler(cy) {
    cy.on('tap', e => {
      if (e.target !== cy) return
      if (isClickOnHtmlLabel(e)) return

      if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
        const pos = e.position
        showAddNodeModal(null, { x: pos.x, y: pos.y })
        return
      }

      backgroundClickPending = true
      setTimeout(() => {
        if (backgroundClickPending) {
          backgroundClickPending = false
          hideEditModal()
          emit('select', null)
        }
      }, 200)
    })
  }

  /**
   * Set up box selection handler.
   */
  function setupBoxSelectionHandler(cy) {
    cy.on('boxend', () => {
      const selectedNodes = cy.$(':selected')
      if (selectedNodes.length === 0) return

      const nodeIds = []
      const nodes = []
      selectedNodes.forEach(node => {
        const nodeData = node.data('nodeData')
        if (nodeData) {
          nodeIds.push(nodeData.id)
          nodes.push(nodeData)
        }
      })

      if (nodeIds.length > 0) {
        emit('select-multiple', { nodes, nodeIds })
      }
      nextTick(() => updateHtmlLabelsFromCySelection(cy))
    })

    cy.on('select unselect', 'node', () => {
      if (selectionUpdateTimer) clearTimeout(selectionUpdateTimer)
      selectionUpdateTimer = setTimeout(() => {
        updateHtmlLabelsFromCySelection(cy)
      }, 10)
    })
  }

  /**
   * Set up edge tap handler for unlinking and inserting nodes.
   */
  function setupEdgeTapHandler(cy) {
    cy.on('tap', 'edge', e => {
      const edge = e.target
      const sourceId = parseInt(edge.source().id())
      const targetId = parseInt(edge.target().id())
      const sourceNode = edge.source().data('nodeData')
      const targetNode = edge.target().data('nodeData')
      const isLinkEdge = edge.data('isLink')
      const hasCmd = e.originalEvent?.metaKey || e.originalEvent?.ctrlKey
      const hasAlt = e.originalEvent?.altKey

      if (!sourceNode || !targetNode) return

      if (hasCmd && hasAlt) {
        if (isLinkEdge) {
          emit('unlink', { sourceId, targetId })
        } else {
          emit('move', { nodeId: targetId, oldParentId: sourceId, newParentId: null })
        }
      } else if (hasCmd) {
        const midPos = {
          x: (edge.source().position().x + edge.target().position().x) / 2,
          y: (edge.source().position().y + edge.target().position().y) / 2,
        }
        showAddNodeModal(null, midPos, { parentId: sourceId, childId: targetId, isLink: isLinkEdge })
      }
    })
  }

  /**
   * Set up tooltip show/hide handlers.
   */
  function setupTooltipHandlers(cy) {
    cy.on('mouseover', 'node', e => {
      const nodeData = e.target.data('nodeData')
      if (!nodeData || nodeData.notes_sensitive) return
      showTooltip(null, nodeData)
    })

    cy.on('mouseout', 'node', () => {
      hideTooltip()
    })

    cy.on('drag', 'node', () => {
      forceHideTooltip()
    })
  }

  /**
   * Set up HTML label click handlers for the container element.
   */
  function setupHtmlLabelHandlers(cy, container) {
    let htmlClickPending = null
    let htmlClickTimer = null

    container.addEventListener('click', e => {
      // Handle collapse button click
      const collapseBtn = e.target.closest('.collapse-btn')
      if (collapseBtn) {
        e.preventDefault()
        e.stopPropagation()
        backgroundClickPending = false
        const nodeId = parseInt(collapseBtn.dataset.collapseNode)
        console.log('Collapse button clicked, nodeId:', nodeId, 'onToggleCollapse:', !!onToggleCollapse)
        if (nodeId && onToggleCollapse) {
          onToggleCollapse(nodeId)
        }
        return
      }

      const htmlLabel = e.target.closest('.node-html')
      if (!htmlLabel) return

      backgroundClickPending = false
      const nodeId = htmlLabel.dataset.nodeId
      if (!nodeId) return

      const cyNode = cy.$(`#${nodeId}`)
      if (!cyNode || cyNode.length === 0) return

      const nodeData = cyNode.data('nodeData')
      if (!nodeData) return

      const hasCmd = e.metaKey || e.ctrlKey
      const hasAlt = e.altKey
      e.preventDefault()
      e.stopPropagation()

      if (hasCmd && hasAlt) {
        emit('delete', nodeData.id)
      } else if (hasCmd) {
        const pos = cyNode.position()
        showAddNodeModal(nodeData.id, { x: pos.x + 50, y: pos.y + 80 })
      } else if (e.shiftKey) {
        emit('select-multiple', { node: nodeData, add: true })
      } else {
        // Delay regular select to check for double-click
        if (htmlClickTimer) clearTimeout(htmlClickTimer)
        htmlClickPending = nodeData
        htmlClickTimer = setTimeout(() => {
          if (htmlClickPending) {
            emit('select', htmlClickPending)
            htmlClickPending = null
          }
        }, 200)
      }
    })

    container.addEventListener('dblclick', e => {
      if (htmlClickTimer) clearTimeout(htmlClickTimer)
      htmlClickPending = null

      const htmlLabel = e.target.closest('.node-html')
      if (!htmlLabel) return

      const nodeId = htmlLabel.dataset.nodeId
      if (!nodeId) return

      const cyNode = cy.$(`#${nodeId}`)
      if (!cyNode || cyNode.length === 0) return

      const nodeData = cyNode.data('nodeData')
      if (nodeData) {
        e.preventDefault()
        e.stopPropagation()
        hideEditModal()
        emit('enter', nodeData)
      }
    })
  }

  /**
   * Set up context menu handler.
   */
  function setupContextMenuHandler(cy, container) {
    cy.on('cxttap', 'node', e => {
      e.preventDefault()
      const node = e.target.data('nodeData')
      if (!node) return

      const renderedPos = e.target.renderedPosition()
      const containerRect = container.getBoundingClientRect()
      const syntheticEvent = {
        clientX: containerRect.left + renderedPos.x,
        clientY: containerRect.top + renderedPos.y,
        preventDefault: () => {},
        stopPropagation: () => {},
      }
      emit('context-menu', { event: syntheticEvent, node })
    })
  }

  /**
   * Update drop highlight position to match closest node.
   */
  function updateDropHighlight(closestNode, container, dropHighlight) {
    const renderedPos = closestNode.renderedPosition()
    const containerRect = container.getBoundingClientRect()
    const htmlLabels = container.querySelectorAll('.node-html, .node-person')

    // Find closest HTML label to the node
    let highlightRect = null
    let closestLabelDist = Infinity
    htmlLabels.forEach(label => {
      const rect = label.getBoundingClientRect()
      const labelCenterX = rect.left + rect.width / 2 - containerRect.left
      const labelCenterY = rect.top + rect.height / 2 - containerRect.top
      const dist = Math.sqrt(Math.pow(labelCenterX - renderedPos.x, 2) + Math.pow(labelCenterY - renderedPos.y, 2))
      if (dist < closestLabelDist) {
        closestLabelDist = dist
        highlightRect = rect
      }
    })

    const padding = 4
    if (highlightRect && closestLabelDist < 50) {
      dropHighlight.style.left = highlightRect.left - containerRect.left - padding + 'px'
      dropHighlight.style.top = highlightRect.top - containerRect.top - padding + 'px'
      dropHighlight.style.width = highlightRect.width + padding * 2 + 'px'
      dropHighlight.style.height = highlightRect.height + padding * 2 + 'px'
    } else {
      const bb = closestNode.renderedBoundingBox()
      dropHighlight.style.left = bb.x1 - padding + 'px'
      dropHighlight.style.top = bb.y1 - padding + 'px'
      dropHighlight.style.width = bb.w + padding * 2 + 'px'
      dropHighlight.style.height = bb.h + padding * 2 + 'px'
    }

    dropHighlight.style.display = 'block'
    const linkMode = getLinkModeActive()
    dropHighlight.classList.toggle('link-mode', linkMode)
  }

  /**
   * Set up drag and drop handlers for reparenting and linking.
   */
  function setupDragDropHandlers(cy, container) {
    cy.on('grab', 'node', e => {
      dragStartPos = { ...e.target.position() }
    })

    cy.on('dragfree', 'node', () => {
      if (savePositions) savePositions()
    })

    cy.on('drag', 'node', e => {
      const draggedNode = e.target
      const pos = draggedNode.position()
      const dropHighlight = getDropHighlight()

      if (highlightedNode) {
        highlightedNode.removeClass('drop-target')
        highlightedNode = null
      }

      const closestNode = findClosestNode(cy, pos, draggedNode.id())

      if (closestNode && dropHighlight) {
        closestNode.addClass('drop-target')
        highlightedNode = closestNode
        updateDropHighlight(closestNode, container, dropHighlight)
      } else if (dropHighlight) {
        dropHighlight.style.display = 'none'
        dropHighlight.classList.remove('link-mode')
      }
    })

    cy.on('free', 'node', e => {
      const dropHighlight = getDropHighlight()
      if (highlightedNode) {
        highlightedNode.removeClass('drop-target')
        highlightedNode = null
      }
      if (dropHighlight) {
        dropHighlight.style.display = 'none'
      }

      const draggedNode = e.target
      const pos = draggedNode.position()

      // Ignore small drags (clicks)
      if (dragStartPos) {
        const dist = Math.sqrt(Math.pow(pos.x - dragStartPos.x, 2) + Math.pow(pos.y - dragStartPos.y, 2))
        if (dist < 20) {
          dragStartPos = null
          return
        }
      }

      const closestNode = findClosestNode(cy, pos, draggedNode.id())
      if (!closestNode) {
        dragStartPos = null
        return
      }

      const targetNode = closestNode.data('nodeData')
      const sourceNode = draggedNode.data('nodeData')
      if (!targetNode || !sourceNode) {
        dragStartPos = null
        return
      }

      // Can't drop on self
      if (sourceNode.id === targetNode.id) {
        if (dragStartPos) draggedNode.position(dragStartPos)
        dragStartPos = null
        return
      }

      // Handle link mode
      if (getLinkModeActive()) {
        emit('link', { sourceId: sourceNode.id, targetId: targetNode.id })
        if (dragStartPos) draggedNode.position(dragStartPos)
        dragStartPos = null
        return
      }

      // Prevent moving node under its own descendant
      if (isDescendant(sourceNode, targetNode.id)) {
        alert('Cannot move a node under its own descendant')
        if (dragStartPos) draggedNode.position(dragStartPos)
        dragStartPos = null
        return
      }

      // Handle multi-select move
      const selectedIds = getSelectedIds?.()
      const selectedIdsSet = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
      const isMultiSelect = selectedIdsSet.size > 1 && selectedIdsSet.has(sourceNode.id)

      if (isMultiSelect) {
        const nodeIds = [...selectedIdsSet].filter(id => {
          if (id === targetNode.id) return false
          const cyNode = cy.$(`#${id}`)
          if (cyNode.length === 0) return false
          const nodeData = cyNode.data('nodeData')
          if (!nodeData) return false
          return !isDescendant(nodeData, targetNode.id)
        })

        if (nodeIds.length > 0) {
          emit('move-multiple', { nodeIds, newParentId: targetNode.id })
        }
      } else {
        emit('move', { nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: targetNode.id })
      }

      dragStartPos = null
    })
  }

  /**
   * Set up all event handlers for the graph.
   */
  function setupEvents() {
    const cy = getCy()
    const container = getContainer()
    if (!cy || !container) return

    setupNodeTapHandlers(cy)
    setupBackgroundTapHandler(cy)
    setupBoxSelectionHandler(cy)
    setupEdgeTapHandler(cy)
    setupTooltipHandlers(cy)
    setupHtmlLabelHandlers(cy, container)
    setupContextMenuHandler(cy, container)
    setupDragDropHandlers(cy, container)
  }

  return {
    setupEvents,
  }
}
