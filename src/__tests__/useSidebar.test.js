import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useSidebar } from '../composables/useSidebar'

describe('useSidebar composable', () => {
  let sidebar
  let mockStorage

  beforeEach(() => {
    vi.useFakeTimers()

    // Mock localStorage
    mockStorage = {}
    global.localStorage = {
      getItem: vi.fn(key => mockStorage[key] ?? null),
      setItem: vi.fn((key, value) => {
        mockStorage[key] = value
      }),
      removeItem: vi.fn(key => {
        delete mockStorage[key]
      }),
      clear: vi.fn(() => {
        mockStorage = {}
      }),
    }

    sidebar = useSidebar({ pinned: ref(false) })
  })

  afterEach(() => {
    vi.useRealTimers()
    delete global.localStorage
  })

  describe('initial state', () => {
    it('should not be hovered initially', () => {
      expect(sidebar.hovered.value).toBe(false)
    })

    it('should have tree collapsed false by default', () => {
      expect(sidebar.treeCollapsed.value).toBe(false)
    })

    it('should have favorites collapsed false by default', () => {
      expect(sidebar.favoritesCollapsed.value).toBe(false)
    })

    it('should have recent collapsed false by default', () => {
      expect(sidebar.recentCollapsed.value).toBe(false)
    })

    it('should have tags collapsed false by default', () => {
      expect(sidebar.tagsCollapsed.value).toBe(false)
    })

    it('should have empty expanded ids', () => {
      expect(sidebar.expandedIds.value.size).toBe(0)
    })
  })

  describe('visibility', () => {
    it('should not be visible when not pinned and not hovered', () => {
      expect(sidebar.visible.value).toBe(false)
    })

    it('should be visible when hovered', () => {
      sidebar.hovered.value = true
      expect(sidebar.visible.value).toBe(true)
    })

    it('should be visible when pinned', () => {
      const pinnedSidebar = useSidebar({ pinned: ref(true) })
      expect(pinnedSidebar.visible.value).toBe(true)
    })
  })

  describe('hover handlers', () => {
    it('should set hovered to true on enter', () => {
      sidebar.onEnter()
      expect(sidebar.hovered.value).toBe(true)
    })

    it('should set hovered to false after delay on leave', async () => {
      sidebar.onEnter()
      expect(sidebar.hovered.value).toBe(true)

      sidebar.onLeave()
      expect(sidebar.hovered.value).toBe(true) // Still true during delay

      vi.advanceTimersByTime(150)
      expect(sidebar.hovered.value).toBe(false)
    })

    it('should cancel hide timeout on re-enter', () => {
      sidebar.onEnter()
      sidebar.onLeave()
      sidebar.onEnter() // Re-enter before timeout

      vi.advanceTimersByTime(150)
      expect(sidebar.hovered.value).toBe(true) // Should still be visible
    })

    it('should not hide when pinned', () => {
      const pinnedSidebar = useSidebar({ pinned: ref(true) })
      pinnedSidebar.onEnter()
      pinnedSidebar.onLeave()

      vi.advanceTimersByTime(200)
      expect(pinnedSidebar.hovered.value).toBe(true)
    })

    it('should not hide if mouse is still within sidebar bounds', () => {
      sidebar.onEnter()
      sidebar.onLeave({ clientX: 100 }) // Within 280px sidebar

      vi.advanceTimersByTime(200)
      expect(sidebar.hovered.value).toBe(true)
    })

    it('should hide if mouse is outside sidebar bounds', () => {
      sidebar.onEnter()
      sidebar.onLeave({ clientX: 300 }) // Outside 280px sidebar

      vi.advanceTimersByTime(200)
      expect(sidebar.hovered.value).toBe(false)
    })
  })

  describe('global pointer tracking', () => {
    function moveMouse(clientX) {
      document.dispatchEvent(new MouseEvent('mousemove', { clientX }))
    }

    it('closes when the pointer is outside the sidebar zone even without a mouseleave', async () => {
      sidebar.onEnter()
      await nextTick() // let the watcher attach the global listener

      moveMouse(400) // far outside the 280px zone, no mouseleave fired
      vi.advanceTimersByTime(150)
      expect(sidebar.hovered.value).toBe(false)
    })

    it('stays open while the pointer is within the sidebar zone', async () => {
      sidebar.onEnter()
      await nextTick()

      moveMouse(100) // inside the 280px zone
      vi.advanceTimersByTime(200)
      expect(sidebar.hovered.value).toBe(true)
    })

    it('cancels a pending hide when the pointer moves back into the zone', async () => {
      sidebar.onEnter()
      await nextTick()

      moveMouse(400) // schedules hide
      moveMouse(50) // back inside, should cancel
      vi.advanceTimersByTime(200)
      expect(sidebar.hovered.value).toBe(true)
    })

    it('does not close a pinned sidebar on pointer move', async () => {
      const pinnedSidebar = useSidebar({ pinned: ref(true) })
      pinnedSidebar.onEnter()
      await nextTick()

      moveMouse(400)
      vi.advanceTimersByTime(200)
      expect(pinnedSidebar.hovered.value).toBe(true)
    })
  })

  describe('toggleExpand', () => {
    it('should add node to expanded set', () => {
      sidebar.toggleExpand(1)
      expect(sidebar.expandedIds.value.has(1)).toBe(true)
    })

    it('should remove node from expanded set if already expanded', () => {
      sidebar.toggleExpand(1)
      sidebar.toggleExpand(1)
      expect(sidebar.expandedIds.value.has(1)).toBe(false)
    })

    it('should handle multiple nodes', () => {
      sidebar.toggleExpand(1)
      sidebar.toggleExpand(2)
      sidebar.toggleExpand(3)

      expect(sidebar.expandedIds.value.has(1)).toBe(true)
      expect(sidebar.expandedIds.value.has(2)).toBe(true)
      expect(sidebar.expandedIds.value.has(3)).toBe(true)
    })
  })

  describe('expandToPath', () => {
    it('should expand all nodes in path', () => {
      const path = [{ id: 1 }, { id: 2 }, { id: 3 }]
      sidebar.expandToPath(path)

      expect(sidebar.expandedIds.value.has(1)).toBe(true)
      expect(sidebar.expandedIds.value.has(2)).toBe(true)
      expect(sidebar.expandedIds.value.has(3)).toBe(true)
    })
  })

  describe('section toggles', () => {
    it('should toggle tree collapsed', () => {
      expect(sidebar.treeCollapsed.value).toBe(false)
      sidebar.toggleTreeCollapse()
      expect(sidebar.treeCollapsed.value).toBe(true)
      sidebar.toggleTreeCollapse()
      expect(sidebar.treeCollapsed.value).toBe(false)
    })

    it('should toggle favorites collapsed', () => {
      sidebar.toggleFavoritesCollapse()
      expect(sidebar.favoritesCollapsed.value).toBe(true)
    })

    it('should toggle recent collapsed', () => {
      sidebar.toggleRecentCollapse()
      expect(sidebar.recentCollapsed.value).toBe(true)
    })

    it('should toggle tags collapsed', () => {
      sidebar.toggleTagsCollapse()
      expect(sidebar.tagsCollapsed.value).toBe(true)
    })
  })
})
