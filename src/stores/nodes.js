import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../services/api.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'

/**
 * Nodes store - manages node data, tree structure, and CRUD operations.
 * This centralizes node state that was previously scattered across App.vue.
 */
export const useNodesStore = defineStore('nodes', () => {
  const { handleError } = useErrorHandler()

  // ===========================================
  // STATE
  // ===========================================

  // Current view state
  const currentContainerId = ref(null) // null = root level
  const currentContainer = ref(null)
  const children = ref([])
  const breadcrumbs = ref([])

  // Loading state
  const loading = ref(false)
  const error = ref(null)

  // Undo/Redo
  const undoStack = ref([])
  const redoStack = ref([])

  // ===========================================
  // GETTERS (COMPUTED)
  // ===========================================

  const isAtRoot = computed(() => currentContainerId.value === null)

  const hasUndo = computed(() => undoStack.value.length > 0)
  const hasRedo = computed(() => redoStack.value.length > 0)

  const flatChildren = computed(() => {
    const result = []
    function flatten(nodeList) {
      if (!nodeList) return
      for (const node of nodeList) {
        if (!node) continue
        result.push(node)
        if (node.children?.length) {
          flatten(node.children)
        }
      }
    }
    flatten(children.value)
    return result
  })

  // ===========================================
  // ACTIONS
  // ===========================================

  /**
   * Load children for a container (or root if containerId is null)
   */
  async function loadChildren(containerId = null, workspaceId = 'work') {
    loading.value = true
    error.value = null

    try {
      if (containerId === null) {
        // Root level
        currentContainer.value = null
        breadcrumbs.value = []
        const roots = await api.getRoots(workspaceId)
        children.value = (roots || []).filter(Boolean)
      } else {
        // Inside a container
        const container = await api.getNode(containerId)
        currentContainer.value = container

        // Load descendants
        const descendants = await api.getDescendants(containerId)
        children.value = (descendants || []).filter(Boolean)

        // Build breadcrumbs from ancestors
        const ancestors = await api.getAncestors(containerId)
        breadcrumbs.value = (ancestors || []).filter(a => a && a.id !== container.id)
        if (container) breadcrumbs.value.push(container)
      }

      currentContainerId.value = containerId
    } catch (e) {
      error.value = e.message
      handleError(e, { context: 'Loading children', silent: true })
    } finally {
      loading.value = false
    }
  }

  /**
   * Create a new node
   */
  async function createNode(nodeData) {
    try {
      const created = await api.createNode(nodeData)
      pushUndo({ type: 'create', nodeId: created.id, nodeData, parentId: nodeData.parent_id })
      return created
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  /**
   * Update an existing node
   */
  async function updateNode(nodeId, updates, trackUndo = true) {
    try {
      const oldNode = trackUndo ? await api.getNode(nodeId) : null
      await api.updateNode(nodeId, updates)

      if (trackUndo && oldNode) {
        pushUndo({ type: 'edit', nodeId, oldValues: oldNode, newValues: updates })
      }

      return await api.getNode(nodeId)
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  /**
   * Delete a node (soft delete)
   */
  async function deleteNode(nodeId) {
    try {
      const node = await api.getNode(nodeId)
      await api.deleteNode(nodeId, false)

      if (node) {
        pushUndo({ type: 'delete', nodeData: node, parentId: node.parent_id })
      }

      return node
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  /**
   * Move a node to a new parent
   */
  async function moveNode(nodeId, newParentId) {
    try {
      const node = await api.getNode(nodeId)
      const oldParentId = node.parent_id

      await api.moveNode(nodeId, newParentId)

      pushUndo({ type: 'move', nodeId, oldParentId, newParentId })

      return await api.getNode(nodeId)
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  /**
   * Toggle completed status
   */
  async function toggleComplete(node) {
    const newCompleted = !node.completed
    await updateNode(node.id, { completed: newCompleted }, false)
    return newCompleted
  }

  /**
   * Toggle favorite status
   */
  async function toggleFavorite(node) {
    const newFavorite = !node.favorite
    await updateNode(node.id, { favorite: newFavorite }, false)
    return newFavorite
  }

  // ===========================================
  // UNDO/REDO
  // ===========================================

  function pushUndo(action) {
    undoStack.value.push(action)
    redoStack.value = []
    if (undoStack.value.length > 50) {
      undoStack.value.shift()
    }
  }

  async function undo() {
    if (undoStack.value.length === 0) return

    const action = undoStack.value.pop()

    try {
      switch (action.type) {
        case 'create':
          await api.deleteNode(action.nodeId, true)
          break
        case 'delete':
          await api.createNode(action.nodeData)
          break
        case 'edit':
          await api.updateNode(action.nodeId, action.oldValues)
          break
        case 'move':
          await api.moveNode(action.nodeId, action.oldParentId)
          break
      }

      redoStack.value.push(action)
      await loadChildren(currentContainerId.value)
    } catch (e) {
      // Restore action to stack on failure
      undoStack.value.push(action)
      error.value = e.message
    }
  }

  async function redo() {
    if (redoStack.value.length === 0) return

    const action = redoStack.value.pop()

    try {
      switch (action.type) {
        case 'create':
          await api.createNode(action.nodeData)
          break
        case 'delete':
          await api.deleteNode(action.nodeId, true)
          break
        case 'edit':
          await api.updateNode(action.nodeId, action.newValues)
          break
        case 'move':
          await api.moveNode(action.nodeId, action.newParentId)
          break
      }

      undoStack.value.push(action)
      await loadChildren(currentContainerId.value)
    } catch (e) {
      // Restore action to stack on failure
      redoStack.value.push(action)
      error.value = e.message
    }
  }

  function clearUndoHistory() {
    undoStack.value = []
    redoStack.value = []
  }

  // ===========================================
  // NAVIGATION
  // ===========================================

  async function navigateToContainer(containerId, workspaceId = 'work') {
    await loadChildren(containerId, workspaceId)
  }

  async function navigateToRoot(workspaceId = 'work') {
    await loadChildren(null, workspaceId)
  }

  async function navigateToParent(workspaceId = 'work') {
    if (breadcrumbs.value.length > 1) {
      const parentId = breadcrumbs.value[breadcrumbs.value.length - 2].id
      await loadChildren(parentId, workspaceId)
    } else {
      await loadChildren(null, workspaceId)
    }
  }

  // ===========================================
  // RETURN PUBLIC API
  // ===========================================

  return {
    // State
    currentContainerId,
    currentContainer,
    children,
    breadcrumbs,
    loading,
    error,
    undoStack,
    redoStack,

    // Getters
    isAtRoot,
    hasUndo,
    hasRedo,
    flatChildren,

    // Actions
    loadChildren,
    createNode,
    updateNode,
    deleteNode,
    moveNode,
    toggleComplete,
    toggleFavorite,

    // Undo/Redo
    pushUndo,
    undo,
    redo,
    clearUndoHistory,

    // Navigation
    navigateToContainer,
    navigateToRoot,
    navigateToParent,
  }
})
