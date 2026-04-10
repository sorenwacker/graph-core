import { api } from '../services/api'
import { buildTooltipHTML } from '../utils/tooltip.js'
import { getGraphColors } from '../utils/constants.js'
import { decodeHtmlEntities } from '../utils/html.js'
import {
  flattenNodes,
  filterByDepth,
  filterCompletedNodes,
  sortNodesRecursively,
  filterByType,
  buildInheritedColorMap
} from './useNodeFiltering.js'

/**
 * Darken a hex color by reducing RGB values.
 * @param {string} hex - Hex color string
 * @returns {string} Darkened hex color
 */
export function darkenColor(hex) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 30)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 30)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 30)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

/**
 * Build cytoscape elements from a node list.
 * @param {Object} options - Build options
 * @param {Array} options.nodeList - Array of nodes
 * @param {Object|null} options.parentNode - Parent container node
 * @param {Object} options.savedPositions - Saved node positions
 * @param {number} options.detailThreshold - Threshold for showing details
 * @param {number} options.maxDepth - Maximum depth to display
 * @param {boolean} options.hideCompleted - Whether to hide completed nodes
 * @param {boolean} options.hideSensitive - Whether to hide sensitive content
 * @param {boolean} options.sortAlphabetically - Whether to sort nodes
 * @param {Array} options.visibleTypes - Types to show
 * @param {boolean} options.showRootNode - Whether to show root node
 * @param {Array} options.selectedIds - Currently selected node IDs
 * @param {number|null} options.selectedId - Single selected node ID
 * @returns {Array} Cytoscape elements array
 */
export function buildElements(options) {
  const {
    nodeList,
    parentNode,
    savedPositions = {},
    detailThreshold = 30,
    maxDepth = 0,
    hideCompleted = false,
    hideSensitive = false,
    sortAlphabetically = false,
    visibleTypes = [],
    showRootNode = true,
    selectedIds = [],
    selectedId = null,
    ancestorColor = null,
    inheritColors = true
  } = options

  // Filter out null entries from the start
  const cleanNodeList = (nodeList || []).filter(n => n && n.id)
  // Apply depth filter first
  const depthFiltered = filterByDepth(cleanNodeList, maxDepth)
  // Filter completed nodes and their children if hideCompleted is enabled
  const completedFiltered = hideCompleted
    ? filterCompletedNodes(depthFiltered)
    : depthFiltered
  // Filter by visible node types
  const typeFiltered = filterByType(completedFiltered, visibleTypes)
  // Sort alphabetically if enabled
  const filteredList = sortAlphabetically
    ? sortNodesRecursively(typeFiltered)
    : typeFiltered
  const flat = flattenNodes(filteredList, [], false, maxDepth)

  // Include parent unless hidden by settings, completed when hiding completed, or type is filtered out
  // Always include parent when there are no children (otherwise graph would be empty)
  const parentTypeVisible = !parentNode || visibleTypes.includes(parentNode.type)
  const hasNoChildren = flat.length === 0
  const includeParent = parentNode && parentNode.id && (hasNoChildren || showRootNode) && parentTypeVisible && !(hideCompleted && parentNode.completed)
  const allNodes = (includeParent ? [{ ...parentNode, children: filteredList }, ...flat] : flat).filter(n => n && n.id)
  const totalNodes = allNodes.length
  const showDetails = totalNodes <= detailThreshold
  // Top-level node IDs in current view (for glow effect)
  const topLevelIds = new Set(cleanNodeList.map(n => n.id))

  // Build inherited color map - parent colors flow to children
  // Use parent's own color if set, otherwise use ancestor color from the app-level color map
  const parentColor = inheritColors
    ? (parentNode?.color && parentNode.color !== '#0f4c75' ? parentNode.color : ancestorColor)
    : (parentNode?.color && parentNode.color !== '#0f4c75' ? parentNode.color : null)
  const inheritedColorMap = buildInheritedColorMap(filteredList, parentColor, {}, inheritColors)
  // Also add parent to the map if included
  if (includeParent && parentNode) {
    const parentOwnColor = parentNode.color && parentNode.color !== '#0f4c75' ? parentNode.color : null
    inheritedColorMap[parentNode.id] = inheritColors ? parentColor : parentOwnColor
  }

  const elements = []
  // Track positions of elements we've built (for sibling positioning)
  const builtPositions = {}

  // Add nodes
  allNodes.forEach((node) => {
    const savedPos = savedPositions[String(node.id)]
    // Get colors from centralized config (handles person unique colors automatically)
    const colors = getGraphColors(node.type, node.id)
    // Custom color as background tint - uses inherited color from parent if no own color
    const customBgTint = inheritedColorMap[node.id] || null
    // Root node glow: current container when drilling in, or top-level nodes in current view
    const isCurrentContainer = parentNode && node.id === parentNode.id
    const isTopLevelNode = !parentNode && topLevelIds.has(node.id)
    const shouldGlow = isCurrentContainer || isTopLevelNode
    const hasChildren = node.children?.length > 0
    const isCompleted = node.completed

    // Label is just the title - HTML rendering handles the rest
    const label = decodeHtmlEntities(node.title)

    // Build tooltip HTML using shared utility
    const tooltip = buildTooltipHTML(node, {
      showCheckbox: node.type !== 'person',
      hideSensitive: hideSensitive || node.notes_sensitive
    })

    // Adjust colors for completed nodes and parent nodes
    const bgColor = isCompleted ? darkenColor(colors.bg) : colors.bg
    const textColor = isCompleted ? '#888888' : colors.text

    const element = {
      data: {
        id: String(node.id),
        label,
        tooltip,
        type: node.type,
        isPerson: node.type === 'person',
        bgColor,
        borderColor: colors.border,
        textColor,
        customBgTint,
        hasChildren,
        isCurrentContainer,
        shouldGlow,
        isCompleted,
        showDetails,
        totalNodes,
        isSelected: selectedIds?.includes(node.id) || selectedId === node.id,
        nodeData: node
      }
    }
    // Apply saved position if available, otherwise compute position near parent/siblings
    if (savedPos) {
      element.position = { x: savedPos.x, y: savedPos.y }
    } else {
      // Strategy 1: Try parent's saved position
      const nodeParentId = node.parent_id
      let referencePos = nodeParentId ? savedPositions[String(nodeParentId)] : null

      // Strategy 2: Try parent's built position (if parent was just added)
      if (!referencePos && nodeParentId) {
        referencePos = builtPositions[String(nodeParentId)]
      }

      // Strategy 3: Try the container node's position (parentNode param)
      if (!referencePos && parentNode) {
        referencePos = savedPositions[String(parentNode.id)] || builtPositions[String(parentNode.id)]
      }

      // Strategy 4: Try any sibling's position (same parent)
      if (!referencePos && nodeParentId) {
        for (const [id, pos] of Object.entries(builtPositions)) {
          const siblingNode = allNodes.find(n => String(n.id) === id)
          if (siblingNode && siblingNode.parent_id === nodeParentId) {
            referencePos = pos
            break
          }
        }
      }

      // Strategy 5: Use center of all existing positions
      if (!referencePos) {
        const allPos = [...Object.values(savedPositions), ...Object.values(builtPositions)]
        if (allPos.length > 0) {
          const centerX = allPos.reduce((sum, p) => sum + p.x, 0) / allPos.length
          const centerY = allPos.reduce((sum, p) => sum + p.y, 0) / allPos.length
          referencePos = { x: centerX, y: centerY }
        }
      }

      if (referencePos) {
        const angle = Math.random() * Math.PI * 2
        const distance = 80 + Math.random() * 40
        element.position = {
          x: referencePos.x + Math.cos(angle) * distance,
          y: referencePos.y + Math.sin(angle) * distance
        }
      }
    }

    // Track this element's position for siblings
    if (element.position) {
      builtPositions[String(node.id)] = element.position
    }
    elements.push(element)
  })

  // Add edges - use filteredList to avoid edges to non-existent nodes
  if (parentNode && includeParent) {
    filteredList.forEach(child => {
      elements.push({
        data: {
          id: `e-${parentNode.id}-${child.id}`,
          source: String(parentNode.id),
          target: String(child.id)
        }
      })
    })
  }

  flat.forEach(node => {
    if (node.children) {
      node.children.forEach(child => {
        elements.push({
          data: {
            id: `e-${node.id}-${child.id}`,
            source: String(node.id),
            target: String(child.id)
          }
        })
      })
    }
  })

  return elements
}

/**
 * Add link edges (many-to-many relationships) to elements.
 * @param {Array} elements - Elements array to modify
 * @param {Array} links - Links from API
 */
export function addLinkEdges(elements, links) {
  const nodeIds = new Set(elements.filter(el => !el.data.source).map(el => el.data.id))

  links.forEach(link => {
    const sourceId = String(link.source_id)
    const targetId = String(link.target_id)
    // Only add if both nodes are in the graph
    if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
      elements.push({
        data: {
          id: `link-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          isLink: true
        }
      })
    }
  })
}

/**
 * Fetch and add linked nodes that are outside the current hierarchy.
 * @param {Object} options - Options object
 * @param {Array} options.elements - Elements array to modify
 * @param {Array} options.links - Links from API
 * @param {Object} options.savedPositions - Saved positions
 * @param {boolean} options.hideCompleted - Whether to hide completed
 * @param {Array} options.selectedIds - Selected node IDs
 * @param {number|null} options.selectedId - Single selected ID
 * @param {Function} options.handleError - Error handler function
 */
export async function fetchLinkedNodes(options) {
  const {
    elements,
    links,
    savedPositions,
    hideCompleted = false,
    selectedIds = [],
    selectedId = null,
    handleError
  } = options

  const existingNodeIds = new Set(elements.filter(el => !el.data.source).map(el => el.data.id))

  // Build a map of external node ID -> linked internal node IDs
  const externalToInternal = new Map()
  links.forEach(link => {
    const sourceId = String(link.source_id)
    const targetId = String(link.target_id)
    if (!existingNodeIds.has(sourceId)) {
      if (!externalToInternal.has(link.source_id)) externalToInternal.set(link.source_id, [])
      externalToInternal.get(link.source_id).push(link.target_id)
    }
    if (!existingNodeIds.has(targetId)) {
      if (!externalToInternal.has(link.target_id)) externalToInternal.set(link.target_id, [])
      externalToInternal.get(link.target_id).push(link.source_id)
    }
  })

  // Build a map of element positions for nodes already in the graph
  const elementPositions = {}
  elements.forEach(el => {
    if (!el.data.source && el.position) {
      elementPositions[el.data.id] = el.position
    }
  })

  // Fetch each linked node and add it to the graph (without parents)
  for (const [nodeId, linkedInternalIds] of externalToInternal) {
    try {
      const node = await api.getNode(nodeId)
      if (node && !node.deleted_at) {
        // Skip completed nodes if hideCompleted is enabled
        if (hideCompleted && node.completed) continue

        let position = savedPositions[String(node.id)]

        // If no saved position, place near the nodes it's linked to
        if (!position) {
          const linkedPositions = linkedInternalIds
            .map(id => savedPositions[String(id)] || elementPositions[String(id)])
            .filter(pos => pos)

          if (linkedPositions.length > 0) {
            // Position near the average of linked nodes
            const avgX = linkedPositions.reduce((sum, p) => sum + p.x, 0) / linkedPositions.length
            const avgY = linkedPositions.reduce((sum, p) => sum + p.y, 0) / linkedPositions.length
            const angle = Math.random() * Math.PI * 2
            const distance = 80 + Math.random() * 40
            position = {
              x: avgX + Math.cos(angle) * distance,
              y: avgY + Math.sin(angle) * distance
            }
          }
        }

        // Get proper colors for this node type
        const colors = getGraphColors(node.type, node.id)
        const isCompleted = node.completed
        const bgColor = isCompleted ? darkenColor(colors.bg) : colors.bg
        const textColor = isCompleted ? '#888888' : colors.text

        elements.push({
          data: {
            id: String(node.id),
            nodeData: node,
            type: node.type,
            isPerson: node.type === 'person',
            isLinkedExternal: true,
            bgColor,
            borderColor: colors.border,
            textColor,
            isCompleted,
            isSelected: selectedIds?.includes(node.id) || selectedId === node.id
          },
          position: position ? { x: position.x, y: position.y } : undefined
        })
      }
    } catch (err) {
      if (handleError) {
        handleError(err, { context: `Fetching linked node ${nodeId}`, silent: true })
      }
    }
  }
}

/**
 * Composable for graph element building.
 * @param {Object} options - Configuration options
 * @returns {Object} Element building functions
 */
export function useGraphElements(options = {}) {
  return {
    buildElements: (buildOptions) => buildElements({ ...options, ...buildOptions }),
    addLinkEdges,
    fetchLinkedNodes: (fetchOptions) => fetchLinkedNodes({ ...options, ...fetchOptions }),
    darkenColor
  }
}
