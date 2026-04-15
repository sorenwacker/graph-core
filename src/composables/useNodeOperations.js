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
   * Create a new node
   */
  async function createNode({ title, type, parentId, x, y }) {
    if (isProcessing.value) return null
    isProcessing.value = true

    try {
      const nodeType = type || 'task'
      const today = new Date().toISOString().split('T')[0]
      const trimmedTitle = typeof title === 'string' ? title.trim() : title
      const nodeData = {
        title: trimmedTitle,
        type: nodeType,
        parent_id: parentId,
        workspace_id: getWorkspaceIdForNode?.(nodeType),
        // Auto-set start_date for tasks and projects
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
    } catch (e) {
      if (onError) onError(e)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Update an existing node
   */
  async function updateNode(updatedNode, { trackUndo = true } = {}) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      const oldNode = trackUndo ? await api.getNode(updatedNode.id) : null

      // Auto-set end_date when marking complete (if no end_date)
      if (updatedNode.completed && !oldNode?.completed && !updatedNode.end_date) {
        updatedNode.end_date = new Date().toISOString().split('T')[0]
      }

      // Trim whitespace from title and notes
      if (typeof updatedNode.title === 'string') {
        updatedNode.title = updatedNode.title.trim()
      }
      if (typeof updatedNode.notes === 'string') {
        updatedNode.notes = updatedNode.notes.trim()
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
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Delete a node and its descendants
   */
  async function deleteNode(nodeId) {
    if (isProcessing.value) return { success: false }
    isProcessing.value = true

    try {
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
    } catch (e) {
      if (onError) onError(e)
      return { success: false }
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Delete multiple nodes (including all descendants)
   */
  async function deleteMultipleNodes(nodeIds) {
    if (isProcessing.value || !nodeIds?.length) return { success: false }
    isProcessing.value = true

    try {
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
    } catch (e) {
      if (onError) onError(e)
      return { success: false }
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Move a node to a new parent
   */
  async function moveNode({ nodeId, oldParentId, newParentId }) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      if (oldParentId !== undefined && pushCommand) {
        pushCommand(new MoveCommand({ nodeId, oldParentId, newParentId }))
      }
      await api.moveNode(nodeId, newParentId)

      if (onSuccess) await onSuccess({ type: 'move', nodeId, newParentId })
      return true
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Move multiple nodes to a new parent
   */
  async function moveMultipleNodes({ nodeIds, newParentId }) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      for (const nodeId of nodeIds) {
        await api.moveNode(nodeId, newParentId)
      }

      if (onSuccess) await onSuccess({ type: 'moveMultiple', nodeIds, newParentId })
      return true
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
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
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
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
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Toggle node favorite status
   */
  async function toggleFavorite(node) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      await api.updateNode(node.id, { favorite: !node.favorite })

      if (onSuccess) await onSuccess({ type: 'toggleFavorite', node })
      return true
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Link two nodes
   */
  async function linkNodes(sourceId, targetId) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      await api.linkNodes(sourceId, targetId)

      if (pushCommand) {
        pushCommand(new LinkCommand({ sourceId, targetId }))
      }

      if (onSuccess) await onSuccess({ type: 'link', sourceId, targetId })
      return true
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Unlink two nodes
   */
  async function unlinkNodes(sourceId, targetId) {
    if (isProcessing.value) return false
    isProcessing.value = true

    try {
      await api.unlinkNodes(sourceId, targetId)

      if (pushCommand) {
        pushCommand(new UnlinkCommand({ sourceId, targetId }))
      }

      if (onSuccess) await onSuccess({ type: 'unlink', sourceId, targetId })
      return true
    } catch (e) {
      if (onError) onError(e)
      return false
    } finally {
      isProcessing.value = false
    }
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
