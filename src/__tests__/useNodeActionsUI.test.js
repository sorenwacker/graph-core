import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, provide, inject } from 'vue'
import { useNodeActionsUI } from '../composables/useNodeActionsUI'
import { APP_CONTEXT_KEY } from '../composables/useAppContext'

// Mock the commands module
vi.mock('../commands/index.js', () => ({
  ApplyNotesEditCommand: class MockApplyNotesEditCommand {
    constructor(opts) {
      Object.assign(this, opts)
    }
    async execute() {
      return undefined
    }
  },
  ReorderCommand: class MockReorderCommand {
    constructor(opts) {
      Object.assign(this, opts)
    }
  },
}))

// Mock Vue's inject to return our test context
let mockAppContext = null
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    inject: key => {
      if (key === APP_CONTEXT_KEY) {
        return mockAppContext
      }
      return actual.inject(key)
    },
  }
})

describe('useNodeActionsUI', () => {
  let mockApi
  let mockNodeOps
  let mockPushCommand
  let mockGetWorkspaceIdForNode
  let selectedNode
  let selectedIds
  let showDetail
  let currentContainerId
  let breadcrumbs
  let children
  let expandedIds
  let flatChildren
  let viewRendererRef
  let detailPanelRef
  let error
  let mockEnterContainer
  let mockNavigateBack
  let mockRefreshAfterChange
  let mockRefreshAfterDelete
  let mockRefreshGraphAfterStructureChange
  let mockRefreshDetailPanelLinks
  let mockLoadSidebarTree
  let mockLoadFavorites
  let mockLoadChildren
  let mockInvalidateSidebarCache
  let mockLoadRecentItems
  let mockLoadTags

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock API
    mockApi = {
      getNode: vi.fn().mockResolvedValue({ id: 1, title: 'Test Node', parent_id: null }),
      getDescendants: vi.fn().mockResolvedValue([]),
      createNode: vi.fn().mockResolvedValue({ id: 2, title: 'New Node' }),
      moveNode: vi.fn().mockResolvedValue(true),
      getChildren: vi.fn().mockResolvedValue([]),
      reorderNode: vi.fn().mockResolvedValue(true),
    }

    // Mock node operations
    mockNodeOps = {
      deleteNode: vi.fn().mockResolvedValue({ success: true }),
      deleteMultipleNodes: vi.fn().mockResolvedValue({ success: true }),
      moveNode: vi.fn().mockResolvedValue(true),
      moveMultipleNodes: vi.fn().mockResolvedValue(true),
      moveNodeToRoot: vi.fn().mockResolvedValue(true),
      toggleComplete: vi.fn().mockResolvedValue(true),
      toggleFavorite: vi.fn().mockResolvedValue(true),
      linkNodes: vi.fn().mockResolvedValue(true),
      unlinkNodes: vi.fn().mockResolvedValue(true),
      createNode: vi.fn().mockResolvedValue({ id: 3, title: 'Child Node' }),
      updateNode: vi.fn().mockResolvedValue(true),
    }

    mockPushCommand = vi.fn()
    mockGetWorkspaceIdForNode = vi.fn().mockReturnValue(1)

    // State refs
    selectedNode = ref(null)
    selectedIds = ref(new Set())
    showDetail = ref(false)
    currentContainerId = ref(null)
    breadcrumbs = ref([])
    children = ref([])
    expandedIds = ref(new Set())
    flatChildren = ref([])
    viewRendererRef = ref({ loadTasks: vi.fn() })
    detailPanelRef = ref(null)
    error = ref(null)

    // Navigation mocks
    mockEnterContainer = vi.fn().mockResolvedValue(undefined)
    mockNavigateBack = vi.fn()

    // Refresh mocks
    mockRefreshAfterChange = vi.fn().mockResolvedValue(undefined)
    mockRefreshAfterDelete = vi.fn().mockResolvedValue(undefined)
    mockRefreshGraphAfterStructureChange = vi.fn().mockResolvedValue(undefined)
    mockRefreshDetailPanelLinks = vi.fn().mockResolvedValue(undefined)
    mockLoadSidebarTree = vi.fn().mockResolvedValue(undefined)
    mockLoadFavorites = vi.fn().mockResolvedValue(undefined)
    mockLoadChildren = vi.fn().mockResolvedValue(undefined)
    mockInvalidateSidebarCache = vi.fn()
    mockLoadRecentItems = vi.fn().mockResolvedValue(undefined)
    mockLoadTags = vi.fn().mockResolvedValue(undefined)

    // Set up mock app context
    mockAppContext = {
      api: mockApi,
      currentWorkspace: ref(1),
      currentContainerId,
      selectedNode,
      selectedIds,
      showDetail,
      expandedIds,
      breadcrumbs,
      children,
      flatChildren,
      viewRendererRef,
      detailPanelRef,
      error,
      enterContainer: mockEnterContainer,
      navigateBack: mockNavigateBack,
      loadChildren: mockLoadChildren,
      loadSidebarTree: mockLoadSidebarTree,
      loadFavorites: mockLoadFavorites,
      loadRecentItems: mockLoadRecentItems,
      loadTags: mockLoadTags,
      invalidateSidebarCache: mockInvalidateSidebarCache,
      refreshAfterChange: mockRefreshAfterChange,
      refreshAfterDelete: mockRefreshAfterDelete,
      refreshGraphAfterStructureChange: mockRefreshGraphAfterStructureChange,
      refreshDetailPanelLinks: mockRefreshDetailPanelLinks,
    }
  })

  function createNodeActionsUI() {
    return useNodeActionsUI({
      nodeOps: mockNodeOps,
      pushCommand: mockPushCommand,
      getWorkspaceIdForNode: mockGetWorkspaceIdForNode,
    })
  }

  describe('initialization', () => {
    it('should return all expected functions', () => {
      const result = createNodeActionsUI()

      expect(result).toHaveProperty('addChildNode')
      expect(result).toHaveProperty('clearSelectionAfterDelete')
      expect(result).toHaveProperty('deleteNode')
      expect(result).toHaveProperty('deleteMultipleNodes')
      expect(result).toHaveProperty('deleteSelectedNodes')
      expect(result).toHaveProperty('wrapWithParent')
      expect(result).toHaveProperty('moveNode')
      expect(result).toHaveProperty('moveMultipleNodes')
      expect(result).toHaveProperty('moveNodeToRoot')
      expect(result).toHaveProperty('toggleComplete')
      expect(result).toHaveProperty('toggleFavorite')
      expect(result).toHaveProperty('linkNodesFromGraph')
      expect(result).toHaveProperty('unlinkNodesFromGraph')
      expect(result).toHaveProperty('handleAIImproveNotes')
      expect(result).toHaveProperty('handleReorder')
      expect(result).toHaveProperty('updateNode')
      expect(result).toHaveProperty('clearSelection')
    })
  })

  describe('clearSelectionAfterDelete', () => {
    it('should clear selection state', () => {
      selectedNode.value = { id: 1 }
      showDetail.value = true

      const { clearSelectionAfterDelete } = createNodeActionsUI()
      clearSelectionAfterDelete()

      expect(showDetail.value).toBe(false)
      expect(selectedNode.value).toBeNull()
    })
  })

  describe('clearSelection', () => {
    it('should clear all selection state', () => {
      selectedNode.value = { id: 1 }
      selectedIds.value = new Set([1, 2, 3])
      showDetail.value = true

      const { clearSelection } = createNodeActionsUI()
      clearSelection()

      expect(selectedNode.value).toBeNull()
      expect(selectedIds.value.size).toBe(0)
      expect(showDetail.value).toBe(false)
    })
  })

  describe('deleteNode', () => {
    it('should delete node and clear selection', async () => {
      const { deleteNode } = createNodeActionsUI()

      await deleteNode(1)

      expect(mockApi.getNode).toHaveBeenCalledWith(1)
      expect(mockNodeOps.deleteNode).toHaveBeenCalledWith(1)
      expect(mockRefreshAfterDelete).toHaveBeenCalled()
    })

    it('should reload the tasks view after deleting', async () => {
      const { deleteNode } = createNodeActionsUI()

      await deleteNode(1)

      expect(viewRendererRef.value.loadTasks).toHaveBeenCalled()
    })

    it('should do nothing if node not found', async () => {
      mockApi.getNode.mockResolvedValue(null)
      const { deleteNode } = createNodeActionsUI()

      await deleteNode(999)

      expect(mockNodeOps.deleteNode).not.toHaveBeenCalled()
    })

    it('should redirect to parent if deleting current container', async () => {
      currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 5 })

      const { deleteNode } = createNodeActionsUI()
      await deleteNode(1)

      expect(mockLoadChildren).toHaveBeenCalledWith(5)
    })

    it('should redirect to root if deleting container with no parent', async () => {
      currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: null })

      const { deleteNode } = createNodeActionsUI()
      await deleteNode(1)

      expect(mockLoadChildren).toHaveBeenCalledWith(null)
    })

    it('should redirect if deleting a node in the breadcrumbs', async () => {
      breadcrumbs.value = [{ id: 1 }, { id: 2 }]
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 5 })

      const { deleteNode } = createNodeActionsUI()
      await deleteNode(1)

      expect(mockLoadChildren).toHaveBeenCalledWith(5)
    })

    it('should NOT redirect when deleting a node outside the current path', async () => {
      currentContainerId.value = 99
      breadcrumbs.value = [{ id: 99 }]
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 5 })

      const { deleteNode } = createNodeActionsUI()
      await deleteNode(1)

      // No navigation load - only the deleted node is gone, the view stays put.
      expect(mockLoadChildren).not.toHaveBeenCalledWith(5)
      expect(mockLoadChildren).not.toHaveBeenCalledWith(null)
    })
  })

  describe('deleteMultipleNodes', () => {
    it('should do nothing for empty array', async () => {
      const { deleteMultipleNodes } = createNodeActionsUI()

      await deleteMultipleNodes([])

      expect(mockNodeOps.deleteMultipleNodes).not.toHaveBeenCalled()
    })

    it('should delete single node without confirmation', async () => {
      const { deleteMultipleNodes } = createNodeActionsUI()

      await deleteMultipleNodes([1])

      expect(mockNodeOps.deleteMultipleNodes).toHaveBeenCalledWith([1])
      expect(mockRefreshAfterDelete).toHaveBeenCalled()
      expect(viewRendererRef.value.loadTasks).toHaveBeenCalled()
    })

    it('should ask for confirmation when deleting multiple nodes', async () => {
      global.confirm = vi.fn().mockReturnValue(true)
      const { deleteMultipleNodes } = createNodeActionsUI()

      await deleteMultipleNodes([1, 2, 3])

      expect(global.confirm).toHaveBeenCalled()
      expect(mockNodeOps.deleteMultipleNodes).toHaveBeenCalledWith([1, 2, 3])
    })

    it('should not delete if user cancels confirmation', async () => {
      global.confirm = vi.fn().mockReturnValue(false)
      const { deleteMultipleNodes } = createNodeActionsUI()

      await deleteMultipleNodes([1, 2, 3])

      expect(global.confirm).toHaveBeenCalled()
      expect(mockNodeOps.deleteMultipleNodes).not.toHaveBeenCalled()
    })

    it('should navigate back if deleting current container', async () => {
      global.confirm = vi.fn().mockReturnValue(true)
      currentContainerId.value = 2
      const { deleteMultipleNodes } = createNodeActionsUI()

      await deleteMultipleNodes([1, 2, 3])

      expect(mockNavigateBack).toHaveBeenCalled()
    })
  })

  describe('wrapWithParent', () => {
    it('should create parent and move node', async () => {
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 10 })
      mockApi.createNode.mockResolvedValue({ id: 100, title: 'New Group' })

      const { wrapWithParent } = createNodeActionsUI()
      await wrapWithParent({ nodeId: 1, parentTitle: 'New Group' })

      expect(mockApi.createNode).toHaveBeenCalledWith({
        title: 'New Group',
        type: 'group',
        parent_id: 10,
        workspace_id: 1,
      })
      expect(mockApi.moveNode).toHaveBeenCalledWith(1, 100)
      expect(mockRefreshAfterChange).toHaveBeenCalled()
      expect(mockRefreshGraphAfterStructureChange).toHaveBeenCalled()
    })

    it('should throw if node not found', async () => {
      mockApi.getNode.mockResolvedValue(null)

      const { wrapWithParent } = createNodeActionsUI()

      await expect(wrapWithParent({ nodeId: 1, parentTitle: 'Test' })).rejects.toThrow('Node not found')
    })

    it('should throw if parent creation fails', async () => {
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 10 })
      mockApi.createNode.mockResolvedValue(null)

      const { wrapWithParent } = createNodeActionsUI()

      await expect(wrapWithParent({ nodeId: 1, parentTitle: 'Test' })).rejects.toThrow('Failed to create parent node')
    })

    it('should update selected node if it was wrapped', async () => {
      selectedNode.value = { id: 1, title: 'Original' }
      flatChildren.value = [{ id: 1, title: 'Updated', parent_id: 100 }]
      mockApi.getNode.mockResolvedValue({ id: 1, parent_id: 10 })
      mockApi.createNode.mockResolvedValue({ id: 100, title: 'New Group' })

      const { wrapWithParent } = createNodeActionsUI()
      await wrapWithParent({ nodeId: 1, parentTitle: 'New Group' })

      expect(selectedNode.value.title).toBe('Updated')
    })
  })

  describe('moveNode', () => {
    it('should move node and refresh', async () => {
      const { moveNode } = createNodeActionsUI()

      await moveNode({ nodeId: 1, oldParentId: 5, newParentId: 10 })

      expect(mockNodeOps.moveNode).toHaveBeenCalledWith({ nodeId: 1, oldParentId: 5, newParentId: 10 })
      expect(expandedIds.value.has(10)).toBe(true)
      expect(mockRefreshAfterChange).toHaveBeenCalled()
      expect(mockRefreshGraphAfterStructureChange).toHaveBeenCalled()
    })

    it('should not refresh on failure', async () => {
      mockNodeOps.moveNode.mockResolvedValue(false)
      const { moveNode } = createNodeActionsUI()

      await moveNode({ nodeId: 1, oldParentId: 5, newParentId: 10 })

      expect(mockRefreshAfterChange).not.toHaveBeenCalled()
    })
  })

  describe('moveMultipleNodes', () => {
    it('should move nodes and clear selection', async () => {
      selectedIds.value = new Set([1, 2, 3])
      const { moveMultipleNodes } = createNodeActionsUI()

      await moveMultipleNodes({ nodeIds: [1, 2, 3], newParentId: 10 })

      expect(mockNodeOps.moveMultipleNodes).toHaveBeenCalledWith({ nodeIds: [1, 2, 3], newParentId: 10 })
      expect(expandedIds.value.has(10)).toBe(true)
      expect(selectedIds.value.size).toBe(0)
    })
  })

  describe('moveNodeToRoot', () => {
    it('should move node to root and refresh', async () => {
      const { moveNodeToRoot } = createNodeActionsUI()

      await moveNodeToRoot(1)

      expect(mockNodeOps.moveNodeToRoot).toHaveBeenCalledWith(1)
      expect(mockRefreshAfterChange).toHaveBeenCalled()
      expect(mockRefreshGraphAfterStructureChange).toHaveBeenCalled()
    })
  })

  describe('toggleComplete', () => {
    it('should toggle complete and reload children', async () => {
      currentContainerId.value = 5
      const { toggleComplete } = createNodeActionsUI()

      const result = await toggleComplete({ id: 1, completed: false })

      expect(mockNodeOps.toggleComplete).toHaveBeenCalledWith({ id: 1, completed: false })
      expect(mockLoadChildren).toHaveBeenCalledWith(5, { silent: true })
      expect(viewRendererRef.value.loadTasks).toHaveBeenCalled()
      expect(result).toBe(true)
    })
  })

  describe('toggleFavorite', () => {
    it('should toggle favorite and reload favorites', async () => {
      currentContainerId.value = 5
      const { toggleFavorite } = createNodeActionsUI()

      const result = await toggleFavorite({ id: 1, favorite: false })

      expect(mockNodeOps.toggleFavorite).toHaveBeenCalledWith({ id: 1, favorite: false })
      expect(mockRefreshAfterChange).toHaveBeenCalledWith({
        sidebar: false,
        recent: false,
        favorites: true,
        tags: false,
      })
      expect(result).toBe(true)
    })
  })

  describe('linkNodesFromGraph', () => {
    it('should link nodes and refresh', async () => {
      const { linkNodesFromGraph } = createNodeActionsUI()

      await linkNodesFromGraph({ sourceId: 1, targetId: 2 })

      expect(mockNodeOps.linkNodes).toHaveBeenCalledWith(1, 2)
      expect(mockRefreshGraphAfterStructureChange).toHaveBeenCalled()
      expect(mockRefreshDetailPanelLinks).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('unlinkNodesFromGraph', () => {
    it('should unlink nodes and refresh', async () => {
      const { unlinkNodesFromGraph } = createNodeActionsUI()

      await unlinkNodesFromGraph({ sourceId: 1, targetId: 2 })

      expect(mockNodeOps.unlinkNodes).toHaveBeenCalledWith(1, 2)
      expect(mockRefreshGraphAfterStructureChange).toHaveBeenCalled()
      expect(mockRefreshDetailPanelLinks).toHaveBeenCalledWith(1, 2)
    })
  })

  describe('handleAIImproveNotes', () => {
    it('should create command and update selected node', async () => {
      selectedNode.value = { id: 1, notes: 'old' }

      const { handleAIImproveNotes } = createNodeActionsUI()
      await handleAIImproveNotes({
        nodeId: 1,
        oldNotes: 'old',
        newNotes: 'new',
        prompt: 'improve this',
      })

      expect(mockPushCommand).toHaveBeenCalled()
      const command = mockPushCommand.mock.calls[0][0]
      expect(command.nodeId).toBe(1)
      expect(command.oldNotes).toBe('old')
      expect(command.newNotes).toBe('new')
      expect(command.prompt).toBe('improve this')
      expect(selectedNode.value.notes).toBe('new')
    })

    it('should handle selection range replacement', async () => {
      selectedNode.value = { id: 1, notes: 'Hello World' }

      const { handleAIImproveNotes } = createNodeActionsUI()
      await handleAIImproveNotes({
        nodeId: 1,
        oldNotes: 'World',
        newNotes: 'Universe',
        prompt: 'expand',
        selectionRange: { from: 6, to: 11 },
        fullNotes: 'Hello World',
      })

      expect(mockPushCommand).toHaveBeenCalled()
      const command = mockPushCommand.mock.calls[0][0]
      expect(command.oldNotes).toBe('Hello World')
      expect(command.newNotes).toBe('Hello Universe')
      expect(selectedNode.value.notes).toBe('Hello Universe')
    })

    it('should not update selected node if different node', async () => {
      selectedNode.value = { id: 2, notes: 'unchanged' }

      const { handleAIImproveNotes } = createNodeActionsUI()
      await handleAIImproveNotes({
        nodeId: 1,
        oldNotes: 'old',
        newNotes: 'new',
        prompt: 'improve',
      })

      expect(selectedNode.value.notes).toBe('unchanged')
    })
  })

  describe('updateNode', () => {
    it('should update node and refresh all data', async () => {
      currentContainerId.value = 5
      const { updateNode } = createNodeActionsUI()

      const result = await updateNode({ id: 1, title: 'Updated' })

      expect(mockNodeOps.updateNode).toHaveBeenCalledWith({ id: 1, title: 'Updated' }, { trackUndo: true })
      expect(mockRefreshAfterChange).toHaveBeenCalledWith({ favorites: true })
      expect(result).toBe(true)
    })

    it('should respect trackUndo option', async () => {
      const { updateNode } = createNodeActionsUI()

      await updateNode({ id: 1, title: 'Updated' }, false)

      expect(mockNodeOps.updateNode).toHaveBeenCalledWith({ id: 1, title: 'Updated' }, { trackUndo: false })
    })
  })

  describe('addChildNode', () => {
    it('should create child and expand parent', async () => {
      const { addChildNode } = createNodeActionsUI()

      const result = await addChildNode({ parentId: 5, title: 'New Child', type: 'note' })

      expect(mockNodeOps.createNode).toHaveBeenCalledWith({
        title: 'New Child',
        type: 'note',
        parentId: 5,
        x: undefined,
        y: undefined,
      })
      expect(expandedIds.value.has(5)).toBe(true)
      expect(mockRefreshAfterChange).toHaveBeenCalledWith({ sidebar: false, recent: false })
      expect(result).toEqual({ id: 3, title: 'Child Node' })
    })

    it('should return null if creation fails', async () => {
      mockNodeOps.createNode.mockResolvedValue(null)
      const { addChildNode } = createNodeActionsUI()

      const result = await addChildNode({ parentId: 5, title: 'New Child', type: 'note' })

      expect(result).toBeNull()
      expect(mockRefreshAfterChange).not.toHaveBeenCalled()
    })
  })

  describe('handleReorder', () => {
    it('should reorder node and create command', async () => {
      // Node 2 has sort_order 1, so node 1 (sort_order 0) is before it
      children.value = [
        { id: 1, sort_order: 0 },
        { id: 2, sort_order: 1 },
        { id: 3, sort_order: 2 },
      ]
      mockApi.getNode.mockResolvedValue({ id: 2, parent_id: null, sort_order: 1 })
      // getChildren returns siblings (excluding node being moved)
      mockApi.getChildren.mockResolvedValue([
        { id: 1, sort_order: 0 },
        { id: 3, sort_order: 2 },
      ])

      const { handleReorder } = createNodeActionsUI()
      await handleReorder({ nodeId: 2, targetId: 3, position: 'after' })

      expect(mockApi.reorderNode).toHaveBeenCalledWith(2, 3, 'after')
      expect(mockPushCommand).toHaveBeenCalled()
      expect(mockRefreshAfterChange).toHaveBeenCalled()
    })

    it('should set error on failure', async () => {
      mockApi.getNode.mockRejectedValue(new Error('Reorder failed'))

      const { handleReorder } = createNodeActionsUI()
      await handleReorder({ nodeId: 1, targetId: 2, position: 'before' })

      expect(error.value).toBe('Reorder failed')
    })
  })

  describe('deleteSelectedNodes', () => {
    it('should do nothing if no nodes selected', async () => {
      selectedIds.value = new Set()
      const { deleteSelectedNodes } = createNodeActionsUI()

      await deleteSelectedNodes()

      expect(mockNodeOps.deleteMultipleNodes).not.toHaveBeenCalled()
    })

    it('should delete selected nodes and clear selection', async () => {
      // Delegates to deleteMultipleNodes, so deleting >1 node asks to confirm.
      global.confirm = vi.fn().mockReturnValue(true)
      selectedIds.value = new Set([1, 2])
      selectedNode.value = { id: 1 }
      showDetail.value = true
      currentContainerId.value = 5

      const { deleteSelectedNodes } = createNodeActionsUI()
      await deleteSelectedNodes()

      expect(global.confirm).toHaveBeenCalled()
      expect(mockNodeOps.deleteMultipleNodes).toHaveBeenCalledWith([1, 2])
      expect(selectedIds.value.size).toBe(0)
      expect(selectedNode.value).toBeNull()
      expect(showDetail.value).toBe(false)
      expect(mockRefreshAfterDelete).toHaveBeenCalled()
    })
  })
})
