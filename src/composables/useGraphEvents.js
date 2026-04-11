import { nextTick } from 'vue'
import { updateHtmlLabelsFromCySelection } from './useGraphSelection.js'

/**
 * Composable for handling cytoscape graph events.
 * @param {Object} options - Configuration options
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @param {Function} options.getContainer - Function returning container element
 * @param {Function} options.getDropHighlight - Function returning drop highlight element
 * @param {Function} options.getLinkModeActive - Function returning link mode state
 * @param {Function} options.getParent - Function returning parent node
 * @param {Function} options.emit - Event emitter function
 * @param {Function} options.showAddNodeModal - Show add node modal
 * @param {Function} options.hideEditModal - Hide edit modal
 * @param {Function} options.showTooltip - Show tooltip
 * @param {Function} options.hideTooltip - Hide tooltip
 * @param {Function} options.forceHideTooltip - Force hide tooltip
 * @param {Function} options.savePositions - Save positions function
 * @returns {Object} Event setup function
 */
export function useGraphEvents(options = {}) {
  const {
    getCy,
    getContainer,
    getDropHighlight,
    getLinkModeActive,
    getParent,
    emit,
    showAddNodeModal,
    hideEditModal,
    showTooltip,
    hideTooltip,
    forceHideTooltip,
    savePositions,
  } = options

  let backgroundClickPending = false
  let dragStartPos = null
  let highlightedNode = null
  let selectionUpdateTimer = null

  function setupEvents() {
    const cy = getCy()
    const container = getContainer()
    if (!cy || !container) return

    // Node tap handlers - skip if click was on HTML label (DOM handlers will handle it)
    cy.on('tap', 'node', e => {
      // Check if click was on an HTML label using screen coordinates
      const clientX = e.originalEvent?.clientX
      const clientY = e.originalEvent?.clientY
      if (clientX !== undefined && clientY !== undefined) {
        const elementAtPoint = document.elementFromPoint(clientX, clientY)
        if (elementAtPoint?.closest?.('.node-html')) {
          return // Let DOM events handle it
        }
      }

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
      // Check if click was on an HTML label using screen coordinates
      const clientX = e.originalEvent?.clientX
      const clientY = e.originalEvent?.clientY
      if (clientX !== undefined && clientY !== undefined) {
        const elementAtPoint = document.elementFromPoint(clientX, clientY)
        if (elementAtPoint?.closest?.('.node-html')) {
          return // Let DOM events handle it
        }
      }

      const node = e.target.data('nodeData')
      if (node) {
        hideEditModal()
        emit('enter', node)
      }
    })

    // Background tap - ignore if click was on HTML label (handled by DOM events)
    cy.on('tap', e => {
      if (e.target === cy) {
        // Check if click was on an HTML label using screen coordinates
        const clientX = e.originalEvent?.clientX
        const clientY = e.originalEvent?.clientY
        if (clientX !== undefined && clientY !== undefined) {
          const elementAtPoint = document.elementFromPoint(clientX, clientY)
          if (elementAtPoint?.closest?.('.node-html')) {
            return // Let DOM event handlers deal with this
          }
        }

        // Cmd/Ctrl+click on background: add new node
        if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
          const pos = e.position
          showAddNodeModal(null, { x: pos.x, y: pos.y })
          return
        }

        // Regular click on background: deselect after delay (to ignore if part of drag)
        backgroundClickPending = true
        setTimeout(() => {
          if (backgroundClickPending) {
            backgroundClickPending = false
            hideEditModal()
            emit('select', null)
          }
        }, 200)
      }
    })

    cy.on('dragfree', 'node', () => {
      if (savePositions) savePositions()
    })

    cy.on('boxend', () => {
      const selectedNodes = cy.$(':selected')
      if (selectedNodes.length > 0) {
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
        nextTick(() => {
          updateHtmlLabelsFromCySelection(cy)
        })
      }
    })

    cy.on('select unselect', 'node', () => {
      if (selectionUpdateTimer) clearTimeout(selectionUpdateTimer)
      selectionUpdateTimer = setTimeout(() => {
        updateHtmlLabelsFromCySelection(cy)
      }, 10)
    })

    // Edge tap
    cy.on('tap', 'edge', async e => {
      const edge = e.target
      const sourceId = parseInt(edge.source().id())
      const targetId = parseInt(edge.target().id())
      const sourceNode = edge.source().data('nodeData')
      const targetNode = edge.target().data('nodeData')
      const isLinkEdge = edge.data('isLink')
      const hasCmd = e.originalEvent?.metaKey || e.originalEvent?.ctrlKey
      const hasAlt = e.originalEvent?.altKey

      if (sourceNode && targetNode) {
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
      }
    })

    // Tooltip events
    cy.on('mouseover', 'node', e => {
      const nodeData = e.target.data('nodeData')
      if (!nodeData || nodeData.notes_sensitive) return
      showTooltip(null, nodeData)
    })

    cy.on('mouseout', 'node', () => {
      hideTooltip()
    })

    // HTML label click handling - delay to detect double-click
    let htmlClickPending = null
    let htmlClickTimer = null

    container.addEventListener('click', e => {
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

      // Immediate actions for modifier keys
      if (hasCmd && hasAlt) {
        emit('delete', nodeData.id)
        return
      } else if (hasCmd) {
        const pos = cyNode.position()
        showAddNodeModal(nodeData.id, { x: pos.x + 50, y: pos.y + 80 })
        return
      } else if (e.shiftKey) {
        emit('select-multiple', { node: nodeData, add: true })
        return
      }

      // Delay regular select to check for double-click
      if (htmlClickTimer) clearTimeout(htmlClickTimer)
      htmlClickPending = nodeData
      htmlClickTimer = setTimeout(() => {
        if (htmlClickPending) {
          emit('select', htmlClickPending)
          htmlClickPending = null
        }
      }, 200)
    })

    container.addEventListener('dblclick', e => {
      // Cancel pending click
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

    cy.on('drag', 'node', () => {
      forceHideTooltip()
    })

    // Context menu
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

    // Drag and drop for reparenting/linking
    cy.on('grab', 'node', e => {
      dragStartPos = { ...e.target.position() }
    })

    cy.on('drag', 'node', e => {
      const draggedNode = e.target
      const pos = draggedNode.position()
      const dropThreshold = 50
      const dropHighlight = getDropHighlight()

      if (highlightedNode) {
        highlightedNode.removeClass('drop-target')
        highlightedNode = null
      }

      let closestNode = null
      let closestDist = Infinity
      cy.nodes().forEach(n => {
        if (n.id() === draggedNode.id()) return
        const nPos = n.position()
        const distance = Math.sqrt(Math.pow(pos.x - nPos.x, 2) + Math.pow(pos.y - nPos.y, 2))
        if (distance < dropThreshold && distance < closestDist) {
          closestDist = distance
          closestNode = n
        }
      })

      if (closestNode && dropHighlight) {
        closestNode.addClass('drop-target')
        highlightedNode = closestNode
        const renderedPos = closestNode.renderedPosition()
        const containerRect = container.getBoundingClientRect()
        let highlightRect = null
        const htmlLabels = container.querySelectorAll('.node-html, .node-person')
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
        if (linkMode) {
          dropHighlight.classList.add('link-mode')
        } else {
          dropHighlight.classList.remove('link-mode')
        }
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

      if (dragStartPos) {
        const dist = Math.sqrt(Math.pow(pos.x - dragStartPos.x, 2) + Math.pow(pos.y - dragStartPos.y, 2))
        if (dist < 20) {
          dragStartPos = null
          return
        }
      }

      const dropThreshold = 50
      let closestNode = null
      let closestDist = Infinity

      cy.nodes().forEach(n => {
        if (n.id() === draggedNode.id()) return
        const nPos = n.position()
        const distance = Math.sqrt(Math.pow(pos.x - nPos.x, 2) + Math.pow(pos.y - nPos.y, 2))
        if (distance < dropThreshold && distance < closestDist) {
          closestDist = distance
          closestNode = n
        }
      })

      if (closestNode) {
        const targetNode = closestNode.data('nodeData')
        const sourceNode = draggedNode.data('nodeData')
        if (targetNode && sourceNode) {
          if (sourceNode.id === targetNode.id) {
            if (dragStartPos) draggedNode.position(dragStartPos)
            dragStartPos = null
            return
          }

          const linkMode = getLinkModeActive()
          if (linkMode) {
            emit('link', { sourceId: sourceNode.id, targetId: targetNode.id })
            if (dragStartPos) draggedNode.position(dragStartPos)
            dragStartPos = null
            return
          }

          const isDescendant = (parent, childId) => {
            if (!parent.children) return false
            for (const child of parent.children) {
              if (child.id === childId) return true
              if (isDescendant(child, childId)) return true
            }
            return false
          }
          if (isDescendant(sourceNode, targetNode.id)) {
            alert('Cannot move a node under its own descendant')
            if (dragStartPos) draggedNode.position(dragStartPos)
            dragStartPos = null
            return
          }

          emit('move', { nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: targetNode.id })
        }
      }

      dragStartPos = null
    })
  }

  return {
    setupEvents,
  }
}
