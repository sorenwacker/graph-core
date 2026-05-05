import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { useDataLoading, sidebarCache } from '../composables/useDataLoading'
import { api } from '../services/api.js'

vi.mock('../services/api.js', () => ({
  api: {
    getRoots: vi.fn(),
    getDescendantsBatch: vi.fn(),
    getRecent: vi.fn(),
    getFavorites: vi.fn(),
    getAllTags: vi.fn(),
    getTrash: vi.fn(),
    getOrphanedNodes: vi.fn(),
    restoreNode: vi.fn(),
    reparentToRoot: vi.fn(),
    deleteNode: vi.fn(),
    emptyTrash: vi.fn(),
  },
}))

vi.mock('../composables/useErrorHandler.js', () => ({
  handleError: vi.fn(),
}))

describe('useDataLoading', () => {
  let currentWorkspace

  beforeEach(() => {
    vi.clearAllMocks()
    sidebarCache.clear()
    sidebarCache.resetStats()
    currentWorkspace = ref('work')
  })

  afterEach(() => {
    sidebarCache.clear()
  })

  describe('loadSidebarTree', () => {
    it('should use batch fetching for descendants', async () => {
      const roots = [
        { id: 1, title: 'Root 1', workspace_id: 'work' },
        { id: 2, title: 'Root 2', workspace_id: 'work' },
      ]
      const descendantsMap = new Map([
        [1, [{ id: 3, title: 'Child 1', parent_id: 1, workspace_id: 'work' }]],
        [2, [{ id: 4, title: 'Child 2', parent_id: 2, workspace_id: 'work' }]],
      ])

      api.getRoots.mockResolvedValue(roots)
      api.getDescendantsBatch.mockResolvedValue(descendantsMap)

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      // Should call batch API with both root IDs
      expect(api.getDescendantsBatch).toHaveBeenCalledWith([1, 2])
      // Should NOT call individual getDescendants
      expect(api.getDescendants).toBeUndefined()

      // Should build tree correctly
      expect(sidebarTree.value.length).toBe(2)
      expect(sidebarTree.value[0].children.length).toBe(1)
      expect(sidebarTree.value[1].children.length).toBe(1)
    })

    it('should cache sidebar data', async () => {
      const roots = [{ id: 1, title: 'Root', workspace_id: 'work' }]
      api.getRoots.mockResolvedValue(roots)
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree } = useDataLoading(currentWorkspace)

      // First load - should fetch
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Second load - should use cache
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)
    })

    it('should skip cache when requested', async () => {
      const roots = [{ id: 1, title: 'Root', workspace_id: 'work' }]
      api.getRoots.mockResolvedValue(roots)
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree } = useDataLoading(currentWorkspace)

      // First load
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Second load with skipCache=true
      await loadSidebarTree(true)
      expect(api.getRoots).toHaveBeenCalledTimes(2)
    })

    it('should use different cache keys per workspace', async () => {
      const roots = [{ id: 1, title: 'Root', workspace_id: 'work' }]
      api.getRoots.mockResolvedValue(roots)
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree } = useDataLoading(currentWorkspace)

      // Load for 'work' workspace
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Change workspace
      currentWorkspace.value = 'personal'
      api.getRoots.mockResolvedValue([{ id: 2, title: 'Root 2', workspace_id: 'personal' }])

      // Should fetch fresh data for new workspace
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(2)
    })
  })

  describe('invalidateSidebarCache', () => {
    it('should clear all sidebar caches', async () => {
      const roots = [{ id: 1, title: 'Root', workspace_id: 'work' }]
      api.getRoots.mockResolvedValue(roots)
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree, invalidateSidebarCache } = useDataLoading(currentWorkspace)

      // Load and cache
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Invalidate cache
      invalidateSidebarCache()

      // Should fetch fresh data
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(2)
    })
  })

  describe('restoreFromTrash', () => {
    it('should invalidate cache after restore', async () => {
      const node = { id: 1, title: 'Restored' }
      api.restoreNode.mockResolvedValue(node)
      api.getTrash.mockResolvedValue([])
      api.getRoots.mockResolvedValue([{ id: 1, title: 'Root', workspace_id: 'work' }])
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree, restoreFromTrash } = useDataLoading(currentWorkspace)

      // Initial load
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Restore triggers reload
      await restoreFromTrash(node)

      // Should have fetched fresh data (cache was invalidated)
      expect(api.getRoots).toHaveBeenCalledTimes(2)
    })
  })

  describe('moveToRoot', () => {
    it('should invalidate cache after moving to root', async () => {
      const node = { id: 1, title: 'Orphan' }
      api.reparentToRoot.mockResolvedValue(node)
      api.getOrphanedNodes.mockResolvedValue([])
      api.getRoots.mockResolvedValue([{ id: 1, title: 'Root', workspace_id: 'work' }])
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree, moveToRoot } = useDataLoading(currentWorkspace)

      // Initial load
      await loadSidebarTree()
      expect(api.getRoots).toHaveBeenCalledTimes(1)

      // Move to root triggers reload
      await moveToRoot(node)

      // Should have fetched fresh data (cache was invalidated)
      expect(api.getRoots).toHaveBeenCalledTimes(2)
    })
  })

  describe('buildChildTree', () => {
    it('should build nested tree structure', () => {
      const { buildChildTree } = useDataLoading(currentWorkspace)

      const flatNodes = [
        { id: 2, title: 'Child 1', parent_id: 1, completed: false },
        { id: 3, title: 'Child 2', parent_id: 1, completed: false },
        { id: 4, title: 'Grandchild', parent_id: 2, completed: false },
      ]

      const tree = buildChildTree(flatNodes, 1)

      expect(tree.length).toBe(2)
      expect(tree[0].id).toBe(2)
      expect(tree[0].children.length).toBe(1)
      expect(tree[0].children[0].id).toBe(4)
      expect(tree[1].id).toBe(3)
      expect(tree[1].children.length).toBe(0)
    })

    it('should track inherited completion status', () => {
      const { buildChildTree } = useDataLoading(currentWorkspace)

      const flatNodes = [
        { id: 2, title: 'Completed Parent', parent_id: 1, completed: true },
        { id: 3, title: 'Child', parent_id: 2, completed: false },
      ]

      const tree = buildChildTree(flatNodes, 1)

      expect(tree[0].completed).toBe(true)
      expect(tree[0].children[0].inheritedCompleted).toBe(true)
    })
  })
})
