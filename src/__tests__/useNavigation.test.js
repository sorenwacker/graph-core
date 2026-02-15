import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'

describe('useNavigation composable', () => {
  let mockApi, navigation

  beforeEach(() => {
    mockApi = {
      getNode: vi.fn().mockResolvedValue({ id: 1, title: 'Test', parent_id: null }),
      getChildren: vi.fn().mockResolvedValue([]),
      getDescendants: vi.fn().mockResolvedValue([]),
      getAncestors: vi.fn().mockResolvedValue([]),
      getRoots: vi.fn().mockResolvedValue([])
    }
    navigation = useNavigation({ api: mockApi, workspace: ref('work') })
  })

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

      await navigation.enterContainer({ id: 5 })

      expect(navigation.currentContainerId.value).toBe(5)
    })

    it('should push previous location to history', async () => {
      navigation.currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })

      await navigation.enterContainer({ id: 5 })

      expect(navigation.navigationHistory.value).toContain(1)
    })

    it('should not push to history when skipHistory is true', async () => {
      navigation.currentContainerId.value = 1
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: null })

      await navigation.enterContainer({ id: 5 }, { skipHistory: true })

      expect(navigation.navigationHistory.value).not.toContain(1)
    })

    it('should build breadcrumbs from ancestors', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Container', parent_id: 1 })
      mockApi.getAncestors.mockResolvedValue([
        { id: 1, title: 'Root' }
      ])

      await navigation.enterContainer({ id: 5 })

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
        { id: 5, title: 'Container' }
      ]
      navigation.currentContainerId.value = 5
      mockApi.getNode.mockResolvedValue({ id: 1, title: 'Root', parent_id: null })

      await navigation.goToParent()

      expect(navigation.currentContainerId.value).toBe(1)
    })

    it('should go to null (root) when at first level', async () => {
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      navigation.currentContainerId.value = 1
      mockApi.getRoots.mockResolvedValue([{ id: 1, title: 'Root' }])

      await navigation.goToParent()

      expect(navigation.currentContainerId.value).toBe(null)
    })
  })

  describe('navigateBack', () => {
    it('should pop from history and navigate', async () => {
      navigation.navigationHistory.value = [1, 2, 3]
      mockApi.getNode.mockResolvedValue({ id: 3, title: 'Previous', parent_id: null })

      await navigation.navigateBack()

      expect(navigation.navigationHistory.value).toEqual([1, 2])
      expect(navigation.currentContainerId.value).toBe(3)
    })

    it('should call goToParent when history is empty', async () => {
      navigation.navigationHistory.value = []
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      navigation.currentContainerId.value = 1
      mockApi.getRoots.mockResolvedValue([])

      await navigation.navigateBack()

      expect(navigation.currentContainerId.value).toBe(null)
    })
  })

  describe('navigateToBreadcrumb', () => {
    it('should navigate to root when index is -1', async () => {
      navigation.breadcrumbs.value = [{ id: 1, title: 'Root' }]
      mockApi.getRoots.mockResolvedValue([])

      await navigation.navigateToBreadcrumb(-1)

      expect(navigation.currentContainerId.value).toBe(null)
    })

    it('should navigate to specific breadcrumb by index', async () => {
      navigation.breadcrumbs.value = [
        { id: 1, title: 'Root' },
        { id: 5, title: 'Container' }
      ]
      mockApi.getNode.mockResolvedValue({ id: 1, title: 'Root', parent_id: null })

      await navigation.navigateToBreadcrumb(0)

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
        await navigation.enterContainer({ id: i + 1 })
      }

      // History should be limited to 50
      expect(navigation.navigationHistory.value.length).toBeLessThanOrEqual(50)
    })
  })
})
