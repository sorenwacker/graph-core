import { ref } from 'vue'

/**
 * Composable for graph-specific operations like inserting nodes between edges
 * and managing node positions in the graph view.
 */
export function useGraphOperations({
  api,
  currentContainerId,
  currentWorkspace,
  expandedIds,
  getWorkspaceIdForNode,
  refreshAfterChange
}) {
  const error = ref(null)

  /**
   * Save node position for graph view
   * @param {string|number} nodeId - The node ID
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string|number|null} viewId - View ID to save to (defaults to currentContainerId)
   */
  function saveNodePosition(nodeId, x, y, viewId = null) {
    const targetViewId = viewId ?? currentContainerId.value ?? 'root'
    const ws = currentWorkspace.value || 'work'
    const posKey = `graph-positions-${ws}-${targetViewId}`
    const positions = JSON.parse(localStorage.getItem(posKey) || '{}')

    if (x !== undefined && y !== undefined) {
      positions[nodeId] = { x, y }
    } else {
      // Auto-generate position near existing nodes
      const existingPositions = Object.values(positions)
      if (existingPositions.length > 0) {
        const centerX = existingPositions.reduce((sum, p) => sum + p.x, 0) / existingPositions.length
        const centerY = existingPositions.reduce((sum, p) => sum + p.y, 0) / existingPositions.length
        const angle = Math.random() * Math.PI * 2
        const distance = 50 + Math.random() * 50
        positions[nodeId] = {
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance
        }
      } else {
        positions[nodeId] = { x: 400 + Math.random() * 50, y: 300 + Math.random() * 50 }
      }
    }

    localStorage.setItem(posKey, JSON.stringify(positions))
  }

  /**
   * Insert a new node between two existing nodes (parent-child or link edge)
   * @param {Object} params - Insert parameters
   * @param {string|number} params.parentId - Parent node ID
   * @param {string|number} params.childId - Child node ID
   * @param {string} params.title - Title for new node
   * @param {string} params.type - Type of new node
   * @param {boolean} params.isLink - Whether this is a link edge (vs parent-child)
   */
  async function insertBetween({ parentId, childId, title, type, isLink }) {
    try {
      const nodeType = type || 'task'
      if (isLink) {
        // For link edges: remove the link, create new node, link both to new node
        await api.unlinkNodes(parentId, childId)
        const newNode = await api.createNode({
          title,
          type: nodeType,
          parent_id: currentContainerId.value,
          workspace_id: getWorkspaceIdForNode(nodeType)
        })
        await api.linkNodes(parentId, newNode.id)
        await api.linkNodes(newNode.id, childId)
      } else {
        // For parent-child edges: create new node as child of parent
        const newNode = await api.createNode({
          title,
          type: nodeType,
          parent_id: parentId,
          workspace_id: getWorkspaceIdForNode(nodeType)
        })
        // Move the original child to be under the new node
        await api.moveNode(childId, newNode.id)
        expandedIds.value.add(parentId)
        expandedIds.value.add(newNode.id)
      }
      await refreshAfterChange()
    } catch (e) {
      error.value = e.message
    }
  }

  return {
    error,
    saveNodePosition,
    insertBetween
  }
}
