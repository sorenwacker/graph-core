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

  describe('entering a node without children', () => {
    function navigationWithHook(extra = {}) {
      const onOpenLeaf = vi.fn()
      const nav = useNavigation({ api: mockApi, workspace: ref('work'), onOpenLeaf, ...extra })
      return { nav, onOpenLeaf }
    }

    // Put the navigation at the top level, listing the given nodes.
    async function atTopLevel(nav, roots) {
      mockApi.getRoots.mockResolvedValue(roots)
      nav.enterContainer(null)
      await flushTimersAndPromises()
    }

    it('opens a leaf the current view lists without navigating into it', async () => {
      const leaf = { id: 5, title: 'Leaf', parent_id: null }
      const { nav, onOpenLeaf } = navigationWithHook()
      await atTopLevel(nav, [leaf])
      mockApi.getNode.mockResolvedValue(leaf)
      mockApi.getChildren.mockResolvedValue([])

      const result = await nav.enterContainer({ id: 5, children: [] })
      await flushTimersAndPromises()

      expect(result).toBe('leaf')
      expect(nav.currentContainerId.value).toBe(null)
      expect(onOpenLeaf).toHaveBeenCalledTimes(1)
      expect(onOpenLeaf).toHaveBeenCalledWith(leaf)
    })

    it('goes to the parent of a leaf that the current view does not list', async () => {
      const leaf = { id: 5, title: 'Leaf', parent_id: 3 }
      mockApi.getNode.mockImplementation(async id => (id === 5 ? leaf : { id, title: `Node ${id}`, parent_id: null }))
      mockApi.getChildren.mockImplementation(async id => (id === 3 ? [leaf] : []))
      const { nav, onOpenLeaf } = navigationWithHook()

      const pending = nav.enterContainer(5)
      await flushTimersAndPromises()

      expect(await pending).toBe('leaf')
      expect(nav.currentContainerId.value).toBe(3)
      expect(onOpenLeaf).toHaveBeenCalledWith(leaf)
    })

    it('goes by the children in the database, not by the object it was handed', async () => {
      const { nav, onOpenLeaf } = navigationWithHook()
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Leaf', parent_id: null })
      mockApi.getChildren.mockResolvedValue([])

      // A caller holding a stale or filtered copy that still lists a child
      nav.enterContainer({ id: 5, children: [{ id: 6 }] })
      await flushTimersAndPromises()

      expect(onOpenLeaf).toHaveBeenCalledTimes(1)
      expect(nav.currentContainerId.value).not.toBe(5)
    })

    it('opens only the last node when a second navigation follows at once', async () => {
      mockApi.getNode.mockImplementation(async id => ({ id, title: `Node ${id}`, parent_id: null }))
      mockApi.getChildren.mockResolvedValue([])
      const { nav, onOpenLeaf } = navigationWithHook()

      nav.enterContainer({ id: 5, children: [] })
      nav.enterContainer({ id: 6, children: [] })
      await flushTimersAndPromises()

      expect(onOpenLeaf).toHaveBeenCalledTimes(1)
      expect(onOpenLeaf.mock.calls[0][0].id).toBe(6)
    })

    it('counts the nodes a tag is linked to as its children', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'A tag', type: 'tag', parent_id: null })
      mockApi.getChildren.mockResolvedValue([])
      mockApi.getLinkedNodes = vi.fn().mockResolvedValue([{ id: 7, title: 'Tagged', type: 'note' }])
      const { nav, onOpenLeaf } = navigationWithHook()

      nav.enterContainer({ id: 5, children: [] })
      await flushTimersAndPromises()

      expect(onOpenLeaf).not.toHaveBeenCalled()
      expect(nav.currentContainerId.value).toBe(5)
    })

    it('treats a node whose children the view hides as having none', async () => {
      const parent = { id: 5, title: 'Parent', parent_id: null }
      mockApi.getNode.mockResolvedValue(parent)
      mockApi.getChildren.mockResolvedValue([
        { id: 6, title: 'Done', parent_id: 5, completed: true },
        { id: 7, title: 'Also done', parent_id: 5, completed: true },
      ])
      const { nav, onOpenLeaf } = navigationWithHook({ isShownInView: node => !node.completed })

      nav.enterContainer({ id: 5, children: [] })
      await flushTimersAndPromises()

      expect(onOpenLeaf).toHaveBeenCalledWith(parent)
    })

    it('enters a node when at least one child is shown', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Parent', parent_id: null })
      mockApi.getChildren.mockResolvedValue([
        { id: 6, title: 'Done', parent_id: 5, completed: true },
        { id: 7, title: 'Open', parent_id: 5, completed: false },
      ])
      const { nav, onOpenLeaf } = navigationWithHook({ isShownInView: node => !node.completed })

      nav.enterContainer({ id: 5, children: [] })
      await flushTimersAndPromises()

      expect(onOpenLeaf).not.toHaveBeenCalled()
      expect(nav.currentContainerId.value).toBe(5)
    })

    it('enters a node that has children', async () => {
      const child = { id: 6, title: 'Child', parent_id: 5 }
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Parent', parent_id: null })
      mockApi.getChildren.mockResolvedValue([child])
      mockApi.getDescendants.mockResolvedValue([child])
      const { nav, onOpenLeaf } = navigationWithHook()

      const pending = nav.enterContainer({ id: 5, children: [child] })
      await flushTimersAndPromises()

      expect(await pending).toBe('entered')
      expect(onOpenLeaf).not.toHaveBeenCalled()
      expect(nav.currentContainerId.value).toBe(5)
    })

    it('still enters a leaf reached by going back', async () => {
      mockApi.getNode.mockResolvedValue({ id: 5, title: 'Leaf', parent_id: null })
      mockApi.getChildren.mockResolvedValue([])
      const { nav, onOpenLeaf } = navigationWithHook()

      nav.enterContainer(5, { skipHistory: true, direction: 'back' })
      await flushTimersAndPromises()

      expect(onOpenLeaf).not.toHaveBeenCalled()
      expect(nav.currentContainerId.value).toBe(5)
    })

    it('stays quiet at the top level', async () => {
      const { nav, onOpenLeaf } = navigationWithHook()

      nav.enterContainer(null)
      await flushTimersAndPromises()

      expect(onOpenLeaf).not.toHaveBeenCalled()
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

    it('should filter out tag nodes from root level', async () => {
      mockApi.getRoots.mockResolvedValue([
        { id: 1, title: 'Project', type: 'project' },
        { id: 2, title: 'My Tag', type: 'tag' },
        { id: 3, title: 'Note', type: 'note' },
      ])
      mockApi.getDescendants.mockResolvedValue([])

      await navigation.loadChildren(null)

      expect(navigation.children.value).toHaveLength(2)
      expect(navigation.children.value.map(c => c.id)).toEqual([1, 3])
      expect(navigation.children.value.find(c => c.type === 'tag')).toBeUndefined()
    })

    it('should filter out tag nodes from descendants', async () => {
      mockApi.getRoots.mockResolvedValue([{ id: 1, title: 'Project', type: 'project' }])
      mockApi.getDescendants.mockResolvedValue([
        { id: 2, title: 'Child Note', type: 'note', parent_id: 1 },
        { id: 3, title: 'Child Tag', type: 'tag', parent_id: 1 },
        { id: 4, title: 'Another Note', type: 'note', parent_id: 1 },
      ])

      await navigation.loadChildren(null)

      expect(navigation.children.value).toHaveLength(1)
      const root = navigation.children.value[0]
      expect(root.children).toHaveLength(2)
      expect(root.children.map(c => c.id)).toEqual([2, 4])
      expect(root.children.find(c => c.type === 'tag')).toBeUndefined()
    })
  })

  describe('sidebar sync', () => {
    it('should sync sidebar without tag nodes', async () => {
      const sidebarData = []
      const navWithSync = useNavigation({
        api: mockApi,
        workspace: ref('work'),
        onSidebarSync: roots => {
          sidebarData.push(...roots)
        },
      })

      mockApi.getRoots.mockResolvedValue([
        { id: 1, title: 'Project', type: 'project' },
        { id: 2, title: 'My Tag', type: 'tag' },
      ])
      mockApi.getDescendants.mockResolvedValue([])

      await navWithSync.loadChildren(null)

      expect(sidebarData).toHaveLength(1)
      expect(sidebarData[0].type).toBe('project')
      expect(sidebarData.find(n => n.type === 'tag')).toBeUndefined()
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
