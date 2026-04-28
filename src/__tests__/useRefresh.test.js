import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useRefresh } from '../composables/useRefresh.js'

describe('useRefresh', () => {
  let mockApi
  let mockLoadChildren
  let mockLoadSidebarTree
  let mockLoadRecentItems
  let currentContainerId
  let selectedNode
  let graphViewRef
  let detailPanelRef

  beforeEach(() => {
    vi.clearAllMocks()

    mockApi = {
      getNode: vi.fn().mockResolvedValue({ id: 1, title: 'Updated Node' }),
    }

    mockLoadChildren = vi.fn().mockResolvedValue([])
    mockLoadSidebarTree = vi.fn().mockResolvedValue([])
    mockLoadRecentItems = vi.fn()

    currentContainerId = ref(null)
    selectedNode = ref(null)

    graphViewRef = ref({
      updateGraph: vi.fn().mockResolvedValue(undefined),
    })

    detailPanelRef = ref({
      loadLinkedNodes: vi.fn(),
      loadLinkedOrganizations: vi.fn(),
      loadLinkedMembers: vi.fn(),
    })
  })

  function createRefresh() {
    return useRefresh({
      api: mockApi,
      loadChildren: mockLoadChildren,
      loadSidebarTree: mockLoadSidebarTree,
      loadRecentItems: mockLoadRecentItems,
      currentContainerId,
      selectedNode,
      graphViewRef,
      detailPanelRef,
    })
  }

  describe('initialization', () => {
    it('should return all expected functions', () => {
      const result = createRefresh()

      expect(result).toHaveProperty('refreshAfterChange')
      expect(result).toHaveProperty('refreshAfterDelete')
      expect(result).toHaveProperty('refreshGraphAfterStructureChange')
      expect(result).toHaveProperty('refreshDetailPanelLinks')
      expect(result).toHaveProperty('refreshAfterChildUpdate')
    })
  })

  describe('refreshAfterChange', () => {
    it('should call loadChildren with silent mode by default', async () => {
      const { refreshAfterChange } = createRefresh()
      currentContainerId.value = 5

      await refreshAfterChange()

      expect(mockLoadChildren).toHaveBeenCalledWith(5, { silent: true })
    })

    it('should call loadSidebarTree by default', async () => {
      const { refreshAfterChange } = createRefresh()

      await refreshAfterChange()

      expect(mockLoadSidebarTree).toHaveBeenCalled()
    })

    it('should call loadRecentItems by default', async () => {
      const { refreshAfterChange } = createRefresh()

      await refreshAfterChange()

      expect(mockLoadRecentItems).toHaveBeenCalled()
    })

    it('should skip sidebar refresh when option is false', async () => {
      const { refreshAfterChange } = createRefresh()

      await refreshAfterChange({ sidebar: false })

      expect(mockLoadSidebarTree).not.toHaveBeenCalled()
    })

    it('should skip recent refresh when option is false', async () => {
      const { refreshAfterChange } = createRefresh()

      await refreshAfterChange({ recent: false })

      expect(mockLoadRecentItems).not.toHaveBeenCalled()
    })

    it('should use non-silent mode when specified', async () => {
      const { refreshAfterChange } = createRefresh()
      currentContainerId.value = 3

      await refreshAfterChange({ silent: false })

      expect(mockLoadChildren).toHaveBeenCalledWith(3, { silent: false })
    })
  })

  describe('refreshAfterDelete', () => {
    it('should refresh children, sidebar, and recent items', async () => {
      const { refreshAfterDelete } = createRefresh()
      currentContainerId.value = 10

      await refreshAfterDelete()

      expect(mockLoadChildren).toHaveBeenCalledWith(10, { silent: true })
      expect(mockLoadSidebarTree).toHaveBeenCalled()
      expect(mockLoadRecentItems).toHaveBeenCalled()
    })
  })

  describe('refreshGraphAfterStructureChange', () => {
    it('should call updateGraph when reloadData is false', async () => {
      const { refreshGraphAfterStructureChange } = createRefresh()

      await refreshGraphAfterStructureChange(false)

      expect(graphViewRef.value.updateGraph).toHaveBeenCalled()
      expect(mockLoadChildren).not.toHaveBeenCalled()
    })

    it('should reload children when reloadData is true', async () => {
      const { refreshGraphAfterStructureChange } = createRefresh()
      currentContainerId.value = 7

      await refreshGraphAfterStructureChange(true)

      expect(mockLoadChildren).toHaveBeenCalledWith(7, { silent: true })
    })

    it('should handle missing graphViewRef gracefully', async () => {
      graphViewRef.value = null
      const { refreshGraphAfterStructureChange } = createRefresh()

      await expect(refreshGraphAfterStructureChange(false)).resolves.not.toThrow()
    })
  })

  describe('refreshDetailPanelLinks', () => {
    it('should refresh when selectedNode matches sourceId', async () => {
      const { refreshDetailPanelLinks } = createRefresh()
      selectedNode.value = { id: 1 }

      await refreshDetailPanelLinks(1, 2)

      expect(mockApi.getNode).toHaveBeenCalledWith(1)
      expect(detailPanelRef.value.loadLinkedNodes).toHaveBeenCalled()
      expect(detailPanelRef.value.loadLinkedOrganizations).toHaveBeenCalled()
      expect(detailPanelRef.value.loadLinkedMembers).toHaveBeenCalled()
    })

    it('should refresh when selectedNode matches targetId', async () => {
      const { refreshDetailPanelLinks } = createRefresh()
      selectedNode.value = { id: 2 }

      await refreshDetailPanelLinks(1, 2)

      expect(mockApi.getNode).toHaveBeenCalledWith(2)
    })

    it('should not refresh when selectedNode matches neither', async () => {
      const { refreshDetailPanelLinks } = createRefresh()
      selectedNode.value = { id: 99 }

      await refreshDetailPanelLinks(1, 2)

      expect(mockApi.getNode).not.toHaveBeenCalled()
      expect(detailPanelRef.value.loadLinkedNodes).not.toHaveBeenCalled()
    })

    it('should not refresh when no node is selected', async () => {
      const { refreshDetailPanelLinks } = createRefresh()
      selectedNode.value = null

      await refreshDetailPanelLinks(1, 2)

      expect(mockApi.getNode).not.toHaveBeenCalled()
    })

    it('should handle missing detailPanelRef gracefully', async () => {
      detailPanelRef.value = null
      const { refreshDetailPanelLinks } = createRefresh()
      selectedNode.value = { id: 1 }

      await expect(refreshDetailPanelLinks(1, 2)).resolves.not.toThrow()
    })
  })

  describe('refreshAfterChildUpdate', () => {
    it('should update graph and sidebar', () => {
      const { refreshAfterChildUpdate } = createRefresh()

      refreshAfterChildUpdate()

      expect(graphViewRef.value.updateGraph).toHaveBeenCalled()
      expect(mockLoadSidebarTree).toHaveBeenCalled()
    })

    it('should handle missing graphViewRef gracefully', () => {
      graphViewRef.value = null
      const { refreshAfterChildUpdate } = createRefresh()

      expect(() => refreshAfterChildUpdate()).not.toThrow()
      expect(mockLoadSidebarTree).toHaveBeenCalled()
    })
  })
})
