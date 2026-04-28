import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useAppLifecycle } from '../composables/useAppLifecycle.js'

// Mock Vue lifecycle hooks
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    onMounted: vi.fn(cb => cb()),
    onUnmounted: vi.fn(),
  }
})

describe('useAppLifecycle', () => {
  let mockDeps
  let mockContentBody

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock DOM elements
    mockContentBody = {
      clientWidth: 800,
      clientHeight: 600,
    }

    vi.spyOn(document, 'querySelector').mockImplementation(selector => {
      if (selector === '.content-body') return mockContentBody
      return null
    })

    // Mock ResizeObserver
    global.ResizeObserver = vi.fn().mockImplementation(() => ({
      observe: vi.fn(),
      disconnect: vi.fn(),
    }))

    // Mock window.electronAPI
    global.window.electronAPI = {
      onMenuUndo: vi.fn(),
      onMenuRedo: vi.fn(),
      onOpenSettings: vi.fn(),
      onShowShortcuts: vi.fn(),
      onBeforeQuit: vi.fn(),
    }

    // Mock dependencies
    mockDeps = {
      loadWorkspaces: vi.fn().mockResolvedValue([]),
      loadChildren: vi.fn().mockResolvedValue([]),
      loadExpandedState: vi.fn(),
      loadRecentItems: vi.fn().mockResolvedValue([]),
      loadFavorites: vi.fn().mockResolvedValue([]),
      loadTags: vi.fn().mockResolvedValue([]),
      savedContainerId: ref(null),
      containerWidth: ref(0),
      containerHeight: ref(0),
      handleKeydown: vi.fn(),
      handleExternalLinkClick: vi.fn(),
      handleOpenLinkSearchEvent: vi.fn(),
      onDetachedMessage: vi.fn(),
      refreshAfterChange: vi.fn().mockResolvedValue(undefined),
      loadFavoritesAfterSync: vi.fn(),
      clearSelectionAfterDelete: vi.fn(),
      selectedNode: ref(null),
      saveInlineNotes: vi.fn(),
      detailPanelRef: ref({ saveChanges: vi.fn() }),
      undo: vi.fn(),
      redo: vi.fn(),
      showSettings: ref(false),
      showShortcuts: ref(false),
    }
  })

  describe('initialization', () => {
    it('should return updateDimensions function', async () => {
      const result = useAppLifecycle(mockDeps)

      expect(result).toHaveProperty('updateDimensions')
      expect(typeof result.updateDimensions).toBe('function')
    })

    it('should call loadWorkspaces during initialization', async () => {
      useAppLifecycle(mockDeps)

      expect(mockDeps.loadWorkspaces).toHaveBeenCalled()
    })

    it('should call loadChildren during initialization', async () => {
      useAppLifecycle(mockDeps)

      // Wait for async initialization
      await vi.waitFor(() => {
        expect(mockDeps.loadChildren).toHaveBeenCalled()
      })
    })

    it('should call loadExpandedState during initialization', async () => {
      useAppLifecycle(mockDeps)

      await vi.waitFor(() => {
        expect(mockDeps.loadExpandedState).toHaveBeenCalled()
      })
    })

    it('should load recent items, favorites, and tags', async () => {
      useAppLifecycle(mockDeps)

      await vi.waitFor(() => {
        expect(mockDeps.loadRecentItems).toHaveBeenCalled()
        expect(mockDeps.loadFavorites).toHaveBeenCalled()
        expect(mockDeps.loadTags).toHaveBeenCalled()
      })
    })
  })

  describe('updateDimensions', () => {
    it('should update container dimensions from DOM', async () => {
      const { updateDimensions } = useAppLifecycle(mockDeps)

      updateDimensions()

      expect(mockDeps.containerWidth.value).toBe(800)
      expect(mockDeps.containerHeight.value).toBe(600)
    })

    it('should handle missing content-body element', async () => {
      vi.spyOn(document, 'querySelector').mockReturnValue(null)
      const { updateDimensions } = useAppLifecycle(mockDeps)

      // Should not throw
      expect(() => updateDimensions()).not.toThrow()
    })
  })

  describe('saved container restoration', () => {
    it('should load saved container if available', async () => {
      mockDeps.savedContainerId.value = '123'

      useAppLifecycle(mockDeps)

      await vi.waitFor(() => {
        expect(mockDeps.loadChildren).toHaveBeenCalledWith(123)
      })
    })

    it('should load root if no saved container', async () => {
      mockDeps.savedContainerId.value = null

      useAppLifecycle(mockDeps)

      await vi.waitFor(() => {
        expect(mockDeps.loadChildren).toHaveBeenCalledWith(null)
      })
    })

    it('should fallback to root if saved container fails', async () => {
      mockDeps.savedContainerId.value = '999'
      mockDeps.loadChildren.mockRejectedValueOnce(new Error('Not found'))

      useAppLifecycle(mockDeps)

      await vi.waitFor(() => {
        expect(mockDeps.loadChildren).toHaveBeenCalledWith(null)
      })
    })
  })

  describe('electron handlers', () => {
    it('should handle missing electronAPI gracefully', async () => {
      delete global.window.electronAPI

      expect(() => useAppLifecycle(mockDeps)).not.toThrow()
    })
  })
})
