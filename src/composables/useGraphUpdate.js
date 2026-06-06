import { api } from '../services/api'
import { buildElements, addLinkEdges, fetchLinkedNodes } from './useGraphElements.js'
import { findSmartPosition } from './useNodePositions.js'
import { LAYOUT_SAVE_DELAY_MS, NODE_POSITION_SETTLE_DELAY_MS } from '../utils/settingsConstants'

/**
 * Composable for graph update logic.
 * Handles building elements, diffing changes, and updating the graph efficiently.
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getCy - Function returning cytoscape instance
 * @param {Function} options.getProps - Function returning component props
 * @param {Function} options.getSettings - Function returning current graph settings (visibleTypes, showExternalLinks, etc.)
 * @param {Function} options.loadPositions - Function to load saved positions
 * @param {Function} options.savePositions - Function to save node positions
 * @param {Function} options.getLayoutOptions - Function returning layout options
 * @param {Function} options.handleError - Error handler function
 * @param {Object} options.layout - Layout composable instance
 * @returns {Object} Graph update functions
 */
export function useGraphUpdate(options = {}) {
  const { getCy, getProps, getSettings, loadPositions, savePositions, getLayoutOptions, handleError, layout } = options

  /**
   * Build graph elements and optionally fetch external links.
   * @param {Object} savedPos - Saved node positions
   * @returns {Promise<Array>} Array of cytoscape elements
   */
  async function buildElementsWithLinks(savedPos) {
    const props = getProps()
    const settings = getSettings()

    const elements = buildElements({
      nodeList: props.nodes,
      parentNode: props.parent,
      savedPositions: savedPos,
      detailThreshold: props.detailThreshold,
      maxDepth: settings.maxDepth,
      hideCompleted: props.hideCompleted,
      hideSensitive: props.hideSensitive,
      sortAlphabetically: props.sortAlphabetically,
      visibleTypes: settings.visibleTypes,
      showRootNode: settings.showRootNode,
      selectedIds: props.selectedIds,
      selectedId: props.selectedId,
      ancestorColor: props.ancestorColor,
      inheritColors: props.inheritColors,
    })

    if (settings.showExternalLinks) {
      try {
        // Capture hierarchy node IDs before fetching external nodes
        const hierarchyNodeIds = new Set(
          elements.filter(e => !e.data.source && !e.data.isLinkedExternal).map(e => e.data.id)
        )
        const ids = elements.filter(e => !e.data.source).map(e => parseInt(e.data.id))
        if (ids.length > 0) {
          const links = await api.getAllLinks(ids)
          await fetchLinkedNodes({
            elements,
            links,
            savedPositions: savedPos,
            hideCompleted: props.hideCompleted,
            selectedIds: props.selectedIds,
            selectedId: props.selectedId,
            handleError,
          })
          // Pass hierarchyNodeIds to filter out links between external nodes
          addLinkEdges(elements, links, hierarchyNodeIds)
        }
      } catch (e) {
        if (handleError) handleError(e, { context: 'Loading links', silent: true })
      }
    }

    return elements
  }

  /**
   * Save current zoom, pan, and node positions from the graph.
   * @returns {Object} Current state including savedZoom, savedPan, savedPos, existingIds
   */
  function collectCurrentState() {
    const cy = getCy()
    const savedZoom = cy.zoom()
    const savedPan = { ...cy.pan() }
    const savedPos = loadPositions()
    const existingIds = new Set()
    cy.nodes().forEach(n => {
      existingIds.add(n.id())
      const p = n.position()
      if (p.x !== 0 || p.y !== 0) savedPos[n.id()] = { x: p.x, y: p.y }
    })
    return { savedZoom, savedPan, savedPos, existingIds }
  }

  /**
   * Determine what changed and apply updates.
   * Returns diff info or null if only data updates needed.
   * @param {Array} elements - New elements array
   * @param {Set} existingIds - Set of existing node IDs
   * @param {Object} savedPos - Saved positions map
   * @returns {Object|null} Diff result or null if only data updates needed
   */
  function diffAndApply(elements, existingIds, savedPos) {
    const cy = getCy()
    const hasPos = Object.keys(savedPos).length > 0
    const elemPos = {}
    elements.forEach(e => {
      if (!e.data.source && e.position) elemPos[e.data.id] = e.position
    })

    let hasNew = false
    let hasEdge = false
    const newIds = new Set()
    const newEdges = new Set()
    const newNodeIds = []
    const extNeedRelax = []
    const existEdges = new Set()
    cy.edges().forEach(e => existEdges.add(`${e.source().id()}-${e.target().id()}`))

    elements.forEach(e => {
      if (e.data.source) {
        const k = `${e.data.source}-${e.data.target}`
        newEdges.add(k)
        if (!existEdges.has(k)) hasEdge = true
      } else {
        newIds.add(e.data.id)
        const isNew = !existingIds.has(e.data.id)
        const isExt = e.data.isLinkedExternal
        if (isNew && !isExt) {
          hasNew = true
          if (!e.position) newNodeIds.push(e.data.id)
        }
        if (isExt && !e.position) extNeedRelax.push(e.data.id)
        if (!e.position) {
          const nd = e.data.nodeData
          e.position = findSmartPosition(
            e.data.id,
            nd?.parent_id,
            { ...savedPos, ...elemPos },
            nd?.children?.map(c => c.id) || [],
            cy
          )
        }
      }
    })

    if (!hasEdge)
      for (const x of existEdges)
        if (!newEdges.has(x)) {
          hasEdge = true
          break
        }
    let hasRemoved = false
    for (const x of existingIds)
      if (!newIds.has(x)) {
        hasRemoved = true
        break
      }

    // If only data changed (no structural changes), update in place
    if (!hasNew && !hasRemoved && !hasEdge && hasPos) {
      const map = new Map()
      elements.forEach(e => {
        if (!e.data.source) map.set(e.data.id, e)
      })
      cy.batch(() => {
        cy.nodes().forEach(n => {
          const el = map.get(n.id())
          if (el) n.data(el.data)
        })
      })
      if (savePositions) savePositions()
      return null // Signal that we're done
    }

    return { hasPos, newNodeIds, extNeedRelax }
  }

  /**
   * Position and relax new nodes after graph update.
   * @param {Object} diffResult - Result from diffAndApply
   * @param {number} savedZoom - Previous zoom level
   * @param {Object} savedPan - Previous pan position
   */
  function handleNewNodes(diffResult, savedZoom, savedPan) {
    const cy = getCy()
    const { hasPos, newNodeIds, extNeedRelax } = diffResult
    const allNeed = [...newNodeIds, ...extNeedRelax]

    if (!hasPos) {
      const layoutOptions = getLayoutOptions()
      cy.layout(layoutOptions).run()
      setTimeout(() => {
        if (savePositions) savePositions()
      }, LAYOUT_SAVE_DELAY_MS)
    } else if (allNeed.length > 0) {
      setTimeout(() => {
        if (layout) layout.autoRelaxNewNodes(allNeed)
      }, NODE_POSITION_SETTLE_DELAY_MS)
    } else {
      requestAnimationFrame(() => {
        cy.viewport({ zoom: savedZoom, pan: savedPan })
        if (savePositions) savePositions()
      })
    }
  }

  /**
   * Full graph update - collects state, builds elements, applies diff.
   * @param {Object} cy - Cytoscape instance (will be used if provided, otherwise getCy())
   * @param {boolean} isInitializing - Whether graph is currently initializing
   * @param {Function} initGraph - Function to initialize graph if cy is null
   * @param {Function} attachCollapseHandlers - Function to attach collapse handlers after update
   * @returns {Promise<void>}
   */
  async function updateGraph(cy, isInitializing, initGraph, attachCollapseHandlers) {
    if (isInitializing) return
    if (!cy) {
      await initGraph()
      return
    }

    const { savedZoom, savedPan, savedPos, existingIds } = collectCurrentState()
    const elements = await buildElementsWithLinks(savedPos)
    const diffResult = diffAndApply(elements, existingIds, savedPos)

    // If diffAndApply returned null, only data updates were needed
    if (diffResult === null) return

    // Apply structural changes
    cy.batch(() => {
      cy.elements().remove()
      cy.add(elements)
      // Don't grabify - drag is handled via HTML label mousedown handlers
      cy.nodes().ungrabify()
    })
    cy.viewport({ zoom: savedZoom, pan: savedPan })

    handleNewNodes(diffResult, savedZoom, savedPan)
    if (attachCollapseHandlers) setTimeout(attachCollapseHandlers, 100)
  }

  return {
    buildElementsWithLinks,
    collectCurrentState,
    diffAndApply,
    handleNewNodes,
    updateGraph,
  }
}
