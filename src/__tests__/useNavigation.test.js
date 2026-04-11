import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'

describe('useNavigation composable', () => {
  let mockApi, navigation

  beforeEach(() => {
    vi.useFakeTimers()
    mockApi = {
      getNode: vi.fn().mockResolvedValue({ id: 1, title: 'Test', parent_id: null }),
      getChildren: vi.fn().mockResolvedValue([]),
      getDescendants: vi.fn().mockResolvedValue([]),
      getAncestors: vi.fn().mockResolvedValue([]),
      getRoots: vi.fn().mockResolvedValue([]),
    }
    navigation = useNavigation({ api: mockApi, workspace: ref('work') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // Helper to advance timers and flush promises
  async function flushTimersAndPromises() {
    await vi.runAllTimersAsync()
    await vi.waitFor(() => {})
  }

  describe('initial state', () => {
    it('should have null currentContainerId', () => {
      expect(navigation.currentContainerId.value).toBe(null)
    })

    it('should have null currentContainer', () => {
      expect(navigation.currentContainer.value).toBe(null)
    })

    it('should have empty breadcrumbs', () => {
      expect(navigation.breadcrumbs.value).toEqual([])
    })

    it('should have empty navigationHistory', () => {
      expect(navigation.navigationHistory.value).toEqual([])
    })

    it('should not be loading initially', () => {
      expect(navigation.loading.value).toBe(false)
    })
  })

  describe('enterContainer', () => {
    it('should update currentContainerId when entering a container', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })
      mockApi.getChildren.mockResolvedValue([])

      navigation.enterContainer({ id: 5, children: [{}] }) // has children so it doesn't trigger leaf node
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(5)
    })

    it('should push previous location to history', async () => {
      navigation.currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })

      navigation.enterContainer({ id: 5, children: [{}] })
      await flushTimersAndPromises()

      expect(navigation.navigationHistory.value).toContain(1)
    })

    it('should not push to history when skipHistory is true', async () => {
      navigation.currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })

      navigation.enterContainer({ id: 5, children: [{}] }, { skipHistory: true })
      await flushTimersAndPromises()

      expect(navigation.navigationHistory.value).not.toContain(1)
    })

    it('should build breadcrumbs from ancestors', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: 1 })
      mockApi.getAncestors.mockResolvedValue([{ id: 1, title: 'Root' }])

      navigation.enterContainer({ id: 5, children: [{}] })
      await flushTimersAndPromises()

      expect(navigation.breadcrumbs.value).toHaveLength(2)
      expect(navigation.breadcrumbs.value[0].id).toBe(1)
      expect(navigation.breadcrumbs.value[1].id).toBe(5)
    })
  })

  describe('goToParent', () => {
    it('should navigate to parent when in nested container', async () => {
      // Setup: we're at container 5, with parent 1
      navigation.breadcrumbs.value = [
        { id: 1, title: 'Root' },
        { id: 5, title: 'Container' },
      ]
      navigation.currentContainerId.value = 5
      mockApi.getNode.mockResolvedValue({ id: 1, title: 'Root', parent_id: null })

      navigation.goToParent()
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(1)
    })

    it('should go to null (root) when at first level', async () => {
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      navigation.currentContainerId.value = 1
      mockApi.getRoots.mockResolvedValue([{ id: 1, title: 'Root' }])

      navigation.goToParent()
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(null)
    })
  })

  describe('navigateBack', () => {
    it('should pop from history and navigate', async () => {
      navigation.navigationHistory.value = [1, 2, 3]
      mockApi.getNode.mockResolvedValue({ id: 3, title: 'Previous', parent_id: null })

      navigation.navigateBack()
      await flushTimersAndPromises()

      expect(navigation.navigationHistory.value).toEqual([1, 2])
      expect(navigation.currentContainerId.value).toBe(3)
    })

    it('should call goToParent when history is empty', async () => {
      navigation.navigationHistory.value = []
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      navigation.currentContainerId.value = 1
      mockApi.getRoots.mockResolvedValue([])

      navigation.navigateBack()
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(null)
    })
  })

  describe('navigateToBreadcrumb', () => {
    it('should navigate to root when index is -1', async () => {
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      mockApi.getRoots.mockResolvedValue([])

      navigation.navigateToBreadcrumb(-1)
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(null)
    })

    it('should navigate to specific breadcrumb by index', async () => {
      navigation.breadcrumbs.value = [
        { id: 1, title: 'Root' },
        { id: 5, title: 'Container' },
      ]
      mockApi.getNode.mockResolvedValue({ id: 1, title: 'Root', parent_id: null })

      navigation.navigateToBreadcrumb(0)
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(1)
    })
  })

  describe('isAtRoot', () => {
    it('should return true when currentContainerId is null', () => {
      navigation.currentContainerId.value = null
      expect(navigation.isAtRoot.value).toBe(true)
    })

    it('should return false when in a container', () => {
      navigation.currentContainerId.value = 5
      expect(navigation.isAtRoot.value).toBe(false)
    })
  })

  describe('history limit', () => {
    it('should limit history to 50 entries when navigating', async () => {
      // Start with empty history and navigate 55 times
      for (let i = 0; i < 55; i++) {
        navigation.currentContainerId.value = i
        mockApi.getNode.mockResolvedValue({ id: i + 1, title: `Container ${i + 1}`, parent_id: null })
        navigation.enterContainer({ id: i + 1, children: [{}] })
        await flushTimersAndPromises()
      }

      // History should be limited to 50
      expect(navigation.navigationHistory.value.length).toBeLessThanOrEqual(50)
    })
  })

  describe('loadChildren', () => {
    it('should load children directly without transition', async () => {
      mockApi.getRoots.mockResolvedValue([{ id: 1, title: 'Root' }])
      mockApi.getDescendants.mockResolvedValue([])

      await navigation.loadChildren(null)

      expect(navigation.currentContainerId.value).toBe(null)
      expect(navigation.children.value).toHaveLength(1)
    })

    it('should load container children', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })
      mockApi.getChildren.mockResolvedValue([{ id: 6, title: 'Child' }])
      mockApi.getDescendants.mockResolvedValue([{ id: 7, title: 'Grandchild', parent_id: 6 }])
      mockApi.getAncestors.mockResolvedValue([])

      await navigation.loadChildren(5)

      expect(navigation.currentContainerId.value).toBe(5)
      expect(navigation.children.value).toHaveLength(1)
    })
  })

  describe('sibling navigation', () => {
    it('should navigate to next sibling', async () => {
      navigation.currentContainer.value = { id: 2, parent_id: 1 }
      mockApi.getChildren.mockResolvedValue([
        { id: 2, title: 'Current' },
        { id: 3, title: 'Next' },
      ])
      mockApi.getNode.mockResolvedValue({ id: 3, title: 'Next', parent_id: 1 })

      navigation.goToNextSibling()
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(3)
    })

    it('should navigate to previous sibling', async () => {
      navigation.currentContainer.value = { id: 3, parent_id: 1 }
      mockApi.getChildren.mockResolvedValue([
        { id: 2, title: 'Prev' },
        { id: 3, title: 'Current' },
      ])
      mockApi.getNode.mockResolvedValue({ id: 2, title: 'Prev', parent_id: 1 })

      navigation.goToPrevSibling()
      await flushTimersAndPromises()

      expect(navigation.currentContainerId.value).toBe(2)
    })
  })
})
