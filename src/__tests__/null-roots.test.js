import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

/**
 * Tests for null/undefined handling in root node loading.
 *
 * Exercises the real useDataLoading.loadSidebarTree/buildChildTree: when
 * api.getRoots or api.getDescendantsBatch return null-containing arrays (the
 * 2026-01-20 black screen issue), the sidebar tree must be built without
 * crashing and null entries must be filtered out.
 */
describe('Null Root Handling (useDataLoading)', () => {
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

  describe('loadSidebarTree with null roots', () => {
    it('should not crash and should filter out null/undefined root entries', async () => {
      api.getRoots.mockResolvedValue([
        { id: 1, type: 'task', title: 'Task 1', workspace_id: 'work' },
        null,
        { id: 2, type: 'note', title: 'Note 1', workspace_id: 'work' },
        undefined,
      ])
      api.getDescendantsBatch.mockResolvedValue(
        new Map([
          [1, []],
          [2, []],
        ])
      )

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toHaveLength(2)
      expect(sidebarTree.value.map(n => n.id)).toEqual([1, 2])
      // Only valid ids reach the batch descendants call
      expect(api.getDescendantsBatch).toHaveBeenCalledWith([1, 2])
    })

    it('should produce an empty tree when getRoots returns only null entries', async () => {
      api.getRoots.mockResolvedValue([null, undefined, null])

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toEqual([])
      expect(api.getDescendantsBatch).not.toHaveBeenCalled()
    })

    it('should produce an empty tree when getRoots returns null', async () => {
      api.getRoots.mockResolvedValue(null)

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toEqual([])
      expect(api.getDescendantsBatch).not.toHaveBeenCalled()
    })

    it('should produce an empty tree when getRoots returns an empty array', async () => {
      api.getRoots.mockResolvedValue([])

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toEqual([])
      expect(api.getDescendantsBatch).not.toHaveBeenCalled()
    })

    it('should not crash when descendants contain null entries', async () => {
      api.getRoots.mockResolvedValue([{ id: 1, type: 'task', title: 'Root', workspace_id: 'work' }])
      api.getDescendantsBatch.mockResolvedValue(
        new Map([[1, [{ id: 3, title: 'Child', parent_id: 1, workspace_id: 'work' }, null, undefined]]])
      )

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toHaveLength(1)
      expect(sidebarTree.value[0].children).toHaveLength(1)
      expect(sidebarTree.value[0].children[0].id).toBe(3)
    })

    it('should skip roots that do not match the current workspace', async () => {
      api.getRoots.mockResolvedValue([
        { id: 1, type: 'task', title: 'Mine', workspace_id: 'work' },
        { id: 2, type: 'task', title: 'Other', workspace_id: 'personal' },
        null,
      ])
      api.getDescendantsBatch.mockResolvedValue(new Map([[1, []]]))

      const { loadSidebarTree, sidebarTree } = useDataLoading(currentWorkspace)
      await loadSidebarTree()

      expect(sidebarTree.value).toHaveLength(1)
      expect(sidebarTree.value[0].id).toBe(1)
      expect(api.getDescendantsBatch).toHaveBeenCalledWith([1])
    })
  })

  describe('buildChildTree with null entries', () => {
    it('should skip null and undefined entries in flatNodes', () => {
      const { buildChildTree } = useDataLoading(currentWorkspace)

      const flatNodes = [
        { id: 2, title: 'Child 1', parent_id: 1, completed: false },
        null,
        undefined,
        { id: 3, title: 'Child 2', parent_id: 1, completed: false },
      ]

      const tree = buildChildTree(flatNodes, 1)

      expect(tree).toHaveLength(2)
      expect(tree.map(n => n.id)).toEqual([2, 3])
    })

    it('should skip entries with a missing id', () => {
      const { buildChildTree } = useDataLoading(currentWorkspace)

      const flatNodes = [
        { id: 2, title: 'Child 1', parent_id: 1, completed: false },
        { title: 'No id', parent_id: 1, completed: false },
      ]

      const tree = buildChildTree(flatNodes, 1)

      expect(tree).toHaveLength(1)
      expect(tree[0].id).toBe(2)
    })

    it('should return an empty array for null flatNodes', () => {
      const { buildChildTree } = useDataLoading(currentWorkspace)

      expect(buildChildTree(null, 1)).toEqual([])
    })
  })
})
