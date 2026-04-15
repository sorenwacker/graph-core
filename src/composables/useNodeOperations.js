import { ref } from 'vue'
import {
  MoveCommand,
  CreateCommand,
  DeleteCommand,
  DeleteMultipleCommand,
  EditCommand,
  CompleteCommand,
  LinkCommand,
  UnlinkCommand,
} from '../commands/index.js'
import { pickNodeFields, NODE_UPDATE_FIELDS } from '../utils/nodeFields.js'

/**
 * Composable for node CRUD operations.
 * Provides functions for creating, updating, deleting, and moving nodes.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for backend calls
 * @param {Function} options.pushCommand - Function to push undo commands
 * @param {Function} options.getWorkspaceIdForNode - Get workspace ID for node type
 * @param {Function} options.onSuccess - Callback after successful operation
 * @param {Function} options.onError - Callback on error
 * @param {Function} options.broadcastUpdate - Broadcast node update to detached windows
 * @param {Function} options.broadcastDelete - Broadcast node delete to detached windows
 * @returns {Object} Node operation functions
 */
export function useNodeOperations({
  api,
  pushCommand,
  getWorkspaceIdForNode,
  onSuccess,
  onError,
  broadcastUpdate,
  broadcastDelete,
} = {}) {
  const isProcessing = ref(false)

  /**
   * Wrapper for async operations with processing guard and error handling.
   * Prevents concurrent operations and provides consistent error handling.
   */
  async function withProcessing(operation, { failValue = null, precondition = null } = {}) {
    if (isProcessing.value) return failValue
    if (precondition && !precondition()) return failValue
    isProcessing.value = true
    try {
      return await operation()
    } catch (e) {
      if (onError) onError(e)
      return failValue
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Create a new node
   */
  async function createNode({ title, type, parentId, x, y }) {
    return withProcessing(async () => {
      const nodeType = type || 'task'
      const today = new Date().toISOString().split('T')[0]
      const trimmedTitle = typeof title === 'string' ? title.trim() : title
      const nodeData = {
        title: trimmedTitle,
        type: nodeType,
        parent_id: parentId,
        workspace_id: getWorkspaceIdForNode?.(nodeType),
        ...(nodeType === 'task' || nodeType === 'project' ? { start_date: today } : {}),
      }

      const newNode = await api.createNode(nodeData)
      if (!newNode || !newNode.id) {
        throw new Error('Failed to create node')
      }

      if (pushCommand) {
        pushCommand(new CreateCommand({ nodeId: newNode.id, nodeData, parentId }))
      }

      if (onSuccess) await onSuccess({ type: 'create', node: newNode, x, y })
      return newNode
    })
  }

  /**
   * Update an existing node
   */
  async function updateNode(updatedNode, { trackUndo = true } = {}) {
    return withProcessing(
      async () => {
        const oldNode = trackUndo ? await api.getNode(updatedNode.id) : null

        // Auto-set end_date when marking complete (if no end_date)
        if (updatedNode.completed && !oldNode?.completed && !updatedNode.end_date) {
          updatedNode.end_date = new Date().toISOString().split('T')[0]
        }

        // Trim whitespace from title only (not notes - would disrupt editing)
        if (typeof updatedNode.title === 'string') {
          updatedNode.title = updatedNode.title.trim()
        }

        const newValues = pickNodeFields(updatedNode)
        await api.updateNode(updatedNode.id, newValues)

        if (broadcastUpdate) broadcastUpdate(updatedNode)

        if (trackUndo && oldNode && pushCommand) {
          const oldValues = pickNodeFields(oldNode)
          pushCommand(new EditCommand({ nodeId: updatedNode.id, oldValues, newValues }))
        }

        if (onSuccess) await onSuccess({ type: 'update', node: updatedNode })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Delete a node and its descendants
   */
  async function deleteNode(nodeId) {
    return withProcessing(
      async () => {
        const node = await api.getNode(nodeId)
        if (!node) return { success: false }

        const descendants = (await api.getDescendants(nodeId)) || []
        const allNodesToDelete = [node, ...descendants]

        // Delete all nodes (descendants first, then the root)
        for (const n of [...descendants].reverse()) {
          await api.deleteNode(n.id, false)
          if (broadcastDelete) broadcastDelete(n.id)
        }
        await api.deleteNode(nodeId, false)
        if (broadcastDelete) broadcastDelete(nodeId)

        // Push undo with all deleted nodes
        if (pushCommand) {
          if (allNodesToDelete.length > 1) {
            pushCommand(new DeleteMultipleCommand({ nodes: allNodesToDelete }))
          } else {
            pushCommand(new DeleteCommand({ nodeData: node }))
          }
        }

        if (onSuccess) await onSuccess({ type: 'delete', node, descendants })
        return { success: true, node, descendants }
      },
      { failValue: { success: false } }
    )
  }

  /**
   * Delete multiple nodes (including all descendants)
   */
  async function deleteMultipleNodes(nodeIds) {
    return withProcessing(
      async () => {
        const allNodesToDelete = []
        const processedIds = new Set()

        // Collect all nodes and their descendants
        for (const id of nodeIds) {
          if (processedIds.has(id)) continue
          const node = await api.getNode(id)
          if (!node) continue

          const descendants = (await api.getDescendants(id)) || []
          allNodesToDelete.push(node)
          processedIds.add(id)

          for (const desc of descendants) {
            if (!processedIds.has(desc.id)) {
              allNodesToDelete.push(desc)
              processedIds.add(desc.id)
            }
          }
        }

        // Delete all nodes (children first to maintain integrity)
        const sortedForDelete = [...allNodesToDelete].sort((a, b) => (b.depth || 0) - (a.depth || 0))
        for (const node of sortedForDelete) {
          await api.deleteNode(node.id, false)
          if (broadcastDelete) broadcastDelete(node.id)
        }

        if (allNodesToDelete.length > 0 && pushCommand) {
          pushCommand(new DeleteMultipleCommand({ nodes: allNodesToDelete }))
        }

        if (onSuccess) await onSuccess({ type: 'deleteMultiple', nodes: allNodesToDelete })
        return { success: true, nodes: allNodesToDelete }
      },
      { failValue: { success: false }, precondition: () => nodeIds?.length > 0 }
    )
  }

  /**
   * Move a node to a new parent
   */
  async function moveNode({ nodeId, oldParentId, newParentId }) {
    return withProcessing(
      async () => {
        if (oldParentId !== undefined && pushCommand) {
          pushCommand(new MoveCommand({ nodeId, oldParentId, newParentId }))
        }
        await api.moveNode(nodeId, newParentId)

        if (onSuccess) await onSuccess({ type: 'move', nodeId, newParentId })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Move multiple nodes to a new parent
   */
  async function moveMultipleNodes({ nodeIds, newParentId }) {
    return withProcessing(
      async () => {
        for (const nodeId of nodeIds) {
          await api.moveNode(nodeId, newParentId)
        }

        if (onSuccess) await onSuccess({ type: 'moveMultiple', nodeIds, newParentId })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Move a node to root level
   */
  async function moveNodeToRoot(nodeId) {
    return moveNode({ nodeId, newParentId: null })
  }

  /**
   * Toggle node completion status
   */
  async function toggleComplete(node) {
    return withProcessing(
      async () => {
        const oldCompleted = node.completed
        const newCompleted = !oldCompleted

        const updates = { completed: newCompleted }
        if (newCompleted && !node.end_date) {
          updates.end_date = new Date().toISOString().split('T')[0]
        }

        await api.updateNode(node.id, updates)
        if (pushCommand) {
          pushCommand(new CompleteCommand({ nodeId: node.id, oldCompleted, newCompleted }))
        }

        if (onSuccess) await onSuccess({ type: 'toggleComplete', node, newCompleted })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Toggle node favorite status
   */
  async function toggleFavorite(node) {
    return withProcessing(
      async () => {
        await api.updateNode(node.id, { favorite: !node.favorite })

        if (onSuccess) await onSuccess({ type: 'toggleFavorite', node })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Link two nodes
   */
  async function linkNodes(sourceId, targetId) {
    return withProcessing(
      async () => {
        await api.linkNodes(sourceId, targetId)

        if (pushCommand) {
          pushCommand(new LinkCommand({ sourceId, targetId }))
        }

        if (onSuccess) await onSuccess({ type: 'link', sourceId, targetId })
        return true
      },
      { failValue: false }
    )
  }

  /**
   * Unlink two nodes
   */
  async function unlinkNodes(sourceId, targetId) {
    return withProcessing(
      async () => {
        await api.unlinkNodes(sourceId, targetId)

        if (pushCommand) {
          pushCommand(new UnlinkCommand({ sourceId, targetId }))
        }

        if (onSuccess) await onSuccess({ type: 'unlink', sourceId, targetId })
        return true
      },
      { failValue: false }
    )
  }

  return {
    // State
    isProcessing,

    // Operations
    createNode,
    updateNode,
    deleteNode,
    deleteMultipleNodes,
    moveNode,
    moveMultipleNodes,
    moveNodeToRoot,
    toggleComplete,
    toggleFavorite,
    linkNodes,
    unlinkNodes,

    // Utilities
    pickNodeFields,
    NODE_UPDATE_FIELDS,
  }
}
