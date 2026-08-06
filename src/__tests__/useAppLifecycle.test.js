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
      detailPanelRef: ref({ saveChanges: vi.fn(), saveChangesNow: vi.fn().mockResolvedValue(true) }),
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

    // The pre-quit handshake exists so no edit is lost when the main process
    // resumes quitting on the ack. These tests therefore assert the ORDER of
    // "save round-trip finished" vs "ack sent", not just that both happened:
    // an implementation that starts the saves without awaiting them (the bug
    // this replaced) acks first and fails on the order assertion.
    function setupQuitHandshake() {
      // The default vi.fn() ResizeObserver mock is not constructible, which
      // aborts initialize() before the electron handlers are registered.
      global.ResizeObserver = class {
        observe() {}
        disconnect() {}
      }
      const order = []
      global.window.electronAPI.quitSaveDone = vi.fn(() => order.push('ack'))
      return { order }
    }

    async function getBeforeQuitCallback() {
      await vi.waitFor(() => {
        expect(global.window.electronAPI.onBeforeQuit).toHaveBeenCalled()
      })
      return global.window.electronAPI.onBeforeQuit.mock.calls[0][0]
    }

    // Flush all pending microtasks: a handler that forgot to await would have
    // acked by the time this resolves.
    const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0))

    function deferred(order, label) {
      let resolve
      let reject
      const promise = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      return {
        promise,
        settle: () => {
          order.push(label)
          resolve()
        },
        fail: err => {
          order.push(label)
          reject(err)
        },
      }
    }

    it('should ack quitSaveDone only after the detail-panel update round-trip completes', async () => {
      const { order } = setupQuitHandshake()
      // Stands in for the db:updateNode invoke: resolves when the main process
      // has acknowledged the write.
      const update = deferred(order, 'update')
      mockDeps.detailPanelRef = ref({
        saveChanges: vi.fn(),
        saveChangesNow: vi.fn(() => update.promise),
      })
      mockDeps.saveInlineNotes = vi.fn().mockResolvedValue(undefined)

      useAppLifecycle(mockDeps)
      const beforeQuitCallback = await getBeforeQuitCallback()
      const done = beforeQuitCallback()

      expect(mockDeps.detailPanelRef.value.saveChangesNow).toHaveBeenCalled()
      expect(mockDeps.saveInlineNotes).toHaveBeenCalled()

      await flushMicrotasks()
      expect(global.window.electronAPI.quitSaveDone).not.toHaveBeenCalled()

      update.settle()
      await done

      expect(order).toEqual(['update', 'ack'])
      expect(global.window.electronAPI.quitSaveDone).toHaveBeenCalledTimes(1)
    })

    it('should ack quitSaveDone only after inline notes finish saving', async () => {
      const { order } = setupQuitHandshake()
      const inlineSave = deferred(order, 'inline-notes')
      mockDeps.detailPanelRef = ref({
        saveChanges: vi.fn(),
        saveChangesNow: vi.fn().mockResolvedValue(true),
      })
      mockDeps.saveInlineNotes = vi.fn(() => inlineSave.promise)

      useAppLifecycle(mockDeps)
      const beforeQuitCallback = await getBeforeQuitCallback()
      const done = beforeQuitCallback()

      await flushMicrotasks()
      expect(global.window.electronAPI.quitSaveDone).not.toHaveBeenCalled()

      inlineSave.settle()
      await done

      expect(order).toEqual(['inline-notes', 'ack'])
    })

    it('should still save inline notes when the detail-panel save fails, then ack', async () => {
      const { order } = setupQuitHandshake()
      const update = deferred(order, 'update-failed')
      const inlineSave = deferred(order, 'inline-notes')
      mockDeps.detailPanelRef = ref({
        saveChanges: vi.fn(),
        saveChangesNow: vi.fn(() => update.promise),
      })
      mockDeps.saveInlineNotes = vi.fn(() => inlineSave.promise)
      vi.spyOn(console, 'error').mockImplementation(() => {})

      useAppLifecycle(mockDeps)
      const beforeQuitCallback = await getBeforeQuitCallback()
      const done = beforeQuitCallback()

      update.fail(new Error('update failed'))
      await flushMicrotasks()
      // A failed panel save must not short-circuit the inline-notes save.
      expect(global.window.electronAPI.quitSaveDone).not.toHaveBeenCalled()

      inlineSave.settle()
      await done

      expect(order).toEqual(['update-failed', 'inline-notes', 'ack'])
      expect(global.window.electronAPI.quitSaveDone).toHaveBeenCalledTimes(1)
    })

    it('should still ack quitSaveDone when a pre-quit save fails', async () => {
      setupQuitHandshake()
      mockDeps.saveInlineNotes = vi.fn().mockRejectedValue(new Error('save failed'))
      vi.spyOn(console, 'error').mockImplementation(() => {})

      useAppLifecycle(mockDeps)
      const beforeQuitCallback = await getBeforeQuitCallback()
      await beforeQuitCallback().catch(() => {})

      expect(global.window.electronAPI.quitSaveDone).toHaveBeenCalledTimes(1)
    })

    it('should ack quitSaveDone when no detail panel is mounted', async () => {
      setupQuitHandshake()
      mockDeps.detailPanelRef = ref(null)
      mockDeps.saveInlineNotes = vi.fn().mockResolvedValue(undefined)

      useAppLifecycle(mockDeps)
      const beforeQuitCallback = await getBeforeQuitCallback()
      await beforeQuitCallback()

      expect(global.window.electronAPI.quitSaveDone).toHaveBeenCalledTimes(1)
    })
  })
})
