import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useViewStateController } from '../composables/useViewStateController.js'

describe('useViewStateController composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial state', () => {
    it('should have viewMode as graph by default', () => {
      const controller = useViewStateController()
      expect(controller.viewMode.value).toBe('graph')
    })

    it('should use provided viewMode ref', () => {
      const externalViewMode = ref('list')
      const controller = useViewStateController({ viewMode: externalViewMode })
      expect(controller.viewMode.value).toBe('list')
    })

    it('should have sortAlphabetically as false', () => {
      const controller = useViewStateController()
      expect(controller.sortAlphabetically.value).toBe(false)
    })

    it('should have transitioning as false', () => {
      const controller = useViewStateController()
      expect(controller.transitioning.value).toBe(false)
    })

    it('should have transitionDirection as forward', () => {
      const controller = useViewStateController()
      expect(controller.transitionDirection.value).toBe('forward')
    })

    it('should have currentContainerId as null', () => {
      const controller = useViewStateController()
      expect(controller.currentContainerId.value).toBeNull()
    })

    it('should have currentContainer as null', () => {
      const controller = useViewStateController()
      expect(controller.currentContainer.value).toBeNull()
    })

    it('should have empty breadcrumbs', () => {
      const controller = useViewStateController()
      expect(controller.breadcrumbs.value).toEqual([])
    })

    it('should have empty children', () => {
      const controller = useViewStateController()
      expect(controller.children.value).toEqual([])
    })
  })

  describe('sortAlphabetically toggle', () => {
    it('should toggle from false to true', () => {
      const controller = useViewStateController()

      controller.toggleSortAlphabetically()

      expect(controller.sortAlphabetically.value).toBe(true)
    })

    it('should toggle from true to false', () => {
      const controller = useViewStateController()
      controller.sortAlphabetically.value = true

      controller.toggleSortAlphabetically()

      expect(controller.sortAlphabetically.value).toBe(false)
    })

    it('should toggle multiple times', () => {
      const controller = useViewStateController()

      controller.toggleSortAlphabetically()
      expect(controller.sortAlphabetically.value).toBe(true)

      controller.toggleSortAlphabetically()
      expect(controller.sortAlphabetically.value).toBe(false)

      controller.toggleSortAlphabetically()
      expect(controller.sortAlphabetically.value).toBe(true)
    })
  })

  describe('setViewMode', () => {
    it('should set view mode to list', () => {
      const controller = useViewStateController()

      controller.setViewMode('list')

      expect(controller.viewMode.value).toBe('list')
    })

    it('should set view mode to graph', () => {
      const controller = useViewStateController()
      controller.viewMode.value = 'list'

      controller.setViewMode('graph')

      expect(controller.viewMode.value).toBe('graph')
    })

    it('should set view mode to cards', () => {
      const controller = useViewStateController()

      controller.setViewMode('cards')

      expect(controller.viewMode.value).toBe('cards')
    })

    it('should set view mode to trash', () => {
      const controller = useViewStateController()

      controller.setViewMode('trash')

      expect(controller.viewMode.value).toBe('trash')
    })
  })

  describe('transition state management', () => {
    it('should start transition with forward direction', () => {
      const controller = useViewStateController()

      controller.startTransition('forward')

      expect(controller.transitioning.value).toBe(true)
      expect(controller.transitionDirection.value).toBe('forward')
    })

    it('should start transition with back direction', () => {
      const controller = useViewStateController()

      controller.startTransition('back')

      expect(controller.transitioning.value).toBe(true)
      expect(controller.transitionDirection.value).toBe('back')
    })

    it('should end transition', () => {
      const controller = useViewStateController()
      controller.startTransition('forward')

      controller.endTransition()

      expect(controller.transitioning.value).toBe(false)
    })

    it('should preserve direction after end transition', () => {
      const controller = useViewStateController()
      controller.startTransition('back')
      controller.endTransition()

      expect(controller.transitionDirection.value).toBe('back')
    })
  })

  describe('resetNavigationState', () => {
    it('should reset currentContainerId to null', () => {
      const controller = useViewStateController()
      controller.currentContainerId.value = 123

      controller.resetNavigationState()

      expect(controller.currentContainerId.value).toBeNull()
    })

    it('should reset currentContainer to null', () => {
      const controller = useViewStateController()
      controller.currentContainer.value = { id: 1, title: 'Test' }

      controller.resetNavigationState()

      expect(controller.currentContainer.value).toBeNull()
    })

    it('should reset breadcrumbs to empty array', () => {
      const controller = useViewStateController()
      controller.breadcrumbs.value = [{ id: 1 }, { id: 2 }]

      controller.resetNavigationState()

      expect(controller.breadcrumbs.value).toEqual([])
    })

    it('should reset children to empty array', () => {
      const controller = useViewStateController()
      controller.children.value = [{ id: 1 }, { id: 2 }]

      controller.resetNavigationState()

      expect(controller.children.value).toEqual([])
    })

    it('should reset all navigation state at once', () => {
      const controller = useViewStateController()
      controller.currentContainerId.value = 123
      controller.currentContainer.value = { id: 123, title: 'Test' }
      controller.breadcrumbs.value = [{ id: 1 }, { id: 2 }]
      controller.children.value = [{ id: 3 }, { id: 4 }]

      controller.resetNavigationState()

      expect(controller.currentContainerId.value).toBeNull()
      expect(controller.currentContainer.value).toBeNull()
      expect(controller.breadcrumbs.value).toEqual([])
      expect(controller.children.value).toEqual([])
    })
  })

  describe('navigation composable sync', () => {
    it('should sync children from navigation composable', async () => {
      const mockNavigation = {
        children: ref([{ id: 1, title: 'Node 1' }]),
        breadcrumbs: ref([]),
        currentContainer: ref(null),
        currentContainerId: ref(null),
      }

      const controller = useViewStateController({ navigation: mockNavigation })
      await nextTick()

      expect(controller.children.value).toEqual([{ id: 1, title: 'Node 1' }])
    })

    it('should sync breadcrumbs from navigation composable', async () => {
      const mockNavigation = {
        children: ref([]),
        breadcrumbs: ref([{ id: 1, title: 'Parent' }]),
        currentContainer: ref(null),
        currentContainerId: ref(null),
      }

      const controller = useViewStateController({ navigation: mockNavigation })
      await nextTick()

      expect(controller.breadcrumbs.value).toEqual([{ id: 1, title: 'Parent' }])
    })

    it('should sync currentContainer from navigation composable', async () => {
      const mockContainer = { id: 5, title: 'Container' }
      const mockNavigation = {
        children: ref([]),
        breadcrumbs: ref([]),
        currentContainer: ref(mockContainer),
        currentContainerId: ref(5),
      }

      const controller = useViewStateController({ navigation: mockNavigation })
      await nextTick()

      expect(controller.currentContainer.value).toEqual(mockContainer)
      expect(controller.currentContainerId.value).toBe(5)
    })

    it('should react to navigation state changes', async () => {
      const mockNavigation = {
        children: ref([]),
        breadcrumbs: ref([]),
        currentContainer: ref(null),
        currentContainerId: ref(null),
      }

      const controller = useViewStateController({ navigation: mockNavigation })
      await nextTick()

      expect(controller.children.value).toEqual([])

      mockNavigation.children.value = [{ id: 1 }, { id: 2 }]
      await nextTick()

      expect(controller.children.value).toEqual([{ id: 1 }, { id: 2 }])
    })
  })

  describe('loadTrashedItems callback', () => {
    it('should call loadTrashedItems when viewMode changes to trash', async () => {
      const loadTrashedItems = vi.fn()
      const controller = useViewStateController({ loadTrashedItems })

      controller.setViewMode('trash')
      await nextTick()

      expect(loadTrashedItems).toHaveBeenCalled()
    })

    it('should not call loadTrashedItems for other view modes', async () => {
      const loadTrashedItems = vi.fn()
      const controller = useViewStateController({ loadTrashedItems })

      controller.setViewMode('list')
      await nextTick()
      controller.setViewMode('cards')
      await nextTick()
      controller.setViewMode('graph')
      await nextTick()

      expect(loadTrashedItems).not.toHaveBeenCalled()
    })

    it('should work without loadTrashedItems callback', async () => {
      const controller = useViewStateController()

      expect(() => controller.setViewMode('trash')).not.toThrow()
    })
  })

  describe('return values', () => {
    it('should return all expected state and methods', () => {
      const controller = useViewStateController()

      // State refs
      expect(controller.viewMode).toBeDefined()
      expect(controller.sortAlphabetically).toBeDefined()
      expect(controller.transitioning).toBeDefined()
      expect(controller.transitionDirection).toBeDefined()
      expect(controller.currentContainerId).toBeDefined()
      expect(controller.currentContainer).toBeDefined()
      expect(controller.breadcrumbs).toBeDefined()
      expect(controller.children).toBeDefined()

      // Methods
      expect(typeof controller.setViewMode).toBe('function')
      expect(typeof controller.toggleSortAlphabetically).toBe('function')
      expect(typeof controller.startTransition).toBe('function')
      expect(typeof controller.endTransition).toBe('function')
      expect(typeof controller.resetNavigationState).toBe('function')
    })
  })
})
