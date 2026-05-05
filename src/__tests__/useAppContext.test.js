import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'

// Mock Vue's provide/inject at module level
const mockProvide = vi.fn()
const mockInject = vi.fn()

vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    provide: (...args) => mockProvide(...args),
    inject: (...args) => mockInject(...args),
  }
})

// We need to test the module-level state, so we need to reset it between tests
let provideAppContext, useAppContext, APP_CONTEXT_KEY

describe('useAppContext composable', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset the module to clear the currentContext state
    vi.resetModules()
    // Re-import after reset to get fresh module state
    const module = await import('../composables/useAppContext.ts')
    provideAppContext = module.provideAppContext
    useAppContext = module.useAppContext
    APP_CONTEXT_KEY = module.APP_CONTEXT_KEY
  })

  describe('APP_CONTEXT_KEY', () => {
    it('should be a Symbol', () => {
      expect(typeof APP_CONTEXT_KEY).toBe('symbol')
    })

    it('should have AppContext description', () => {
      expect(APP_CONTEXT_KEY.description).toBe('AppContext')
    })
  })

  describe('provideAppContext', () => {
    it('should store context in module-level variable', () => {
      const mockContext = createMockContext()

      provideAppContext(mockContext)

      // Should be retrievable via useAppContext
      const retrieved = useAppContext()
      expect(retrieved).toBe(mockContext)
    })

    it('should call Vue provide with the context', () => {
      const mockContext = createMockContext()

      provideAppContext(mockContext)

      expect(mockProvide).toHaveBeenCalledWith(APP_CONTEXT_KEY, mockContext)
    })
  })

  describe('useAppContext', () => {
    it('should return context from module-level storage', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const result = useAppContext()

      expect(result).toBe(mockContext)
    })

    it('should fallback to inject when module storage is empty', async () => {
      // Reset module to clear currentContext
      vi.resetModules()
      const module = await import('../composables/useAppContext.ts')
      const { useAppContext: freshUseAppContext } = module

      const mockContext = createMockContext()
      mockInject.mockReturnValue(mockContext)

      const result = freshUseAppContext()

      expect(result).toBe(mockContext)
    })

    it('should throw error when context is not provided', async () => {
      // Reset module to clear currentContext
      vi.resetModules()
      const module = await import('../composables/useAppContext.ts')
      const { useAppContext: freshUseAppContext } = module

      mockInject.mockReturnValue(undefined)

      expect(() => freshUseAppContext()).toThrow('useAppContext must be used after provideAppContext is called')
    })
  })

  describe('context properties', () => {
    it('should provide api', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const context = useAppContext()

      expect(context.api).toBeDefined()
    })

    it('should provide nodeOps', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const context = useAppContext()

      expect(context.nodeOps).toBeDefined()
    })

    it('should provide pushCommand', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const context = useAppContext()

      expect(typeof context.pushCommand).toBe('function')
    })

    it('should provide reactive refs', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const context = useAppContext()

      expect(context.currentWorkspace.value).toBeDefined()
      expect(context.selectedNode.value).toBeDefined()
      expect(context.showDetail.value).toBeDefined()
    })

    it('should provide navigation functions', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const context = useAppContext()

      expect(typeof context.enterContainer).toBe('function')
      expect(typeof context.navigateBack).toBe('function')
      expect(typeof context.refreshAfterChange).toBe('function')
    })
  })

  describe('context reuse', () => {
    it('should return the same context on multiple calls', () => {
      const mockContext = createMockContext()
      provideAppContext(mockContext)

      const result1 = useAppContext()
      const result2 = useAppContext()

      expect(result1).toBe(result2)
    })

    it('should update when new context is provided', () => {
      const context1 = createMockContext()
      const context2 = createMockContext()

      provideAppContext(context1)
      expect(useAppContext()).toBe(context1)

      provideAppContext(context2)
      expect(useAppContext()).toBe(context2)
    })
  })
})

/**
 * Create a mock AppContext for testing.
 */
function createMockContext() {
  return {
    api: {
      getNodes: vi.fn(),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
    },
    nodeOps: {
      isProcessing: ref(false),
      createNode: vi.fn(),
      updateNode: vi.fn(),
      deleteNode: vi.fn(),
      deleteMultipleNodes: vi.fn(),
      moveNode: vi.fn(),
      moveMultipleNodes: vi.fn(),
      moveNodeToRoot: vi.fn(),
      toggleComplete: vi.fn(),
      toggleFavorite: vi.fn(),
      linkNodes: vi.fn(),
      unlinkNodes: vi.fn(),
    },
    pushCommand: vi.fn(),
    getWorkspaceIdForNode: vi.fn(),
    currentWorkspace: ref(1),
    currentContainerId: ref(null),
    selectedNode: ref(null),
    selectedIds: ref(new Set()),
    showDetail: ref(false),
    expandedIds: ref(new Set()),
    breadcrumbs: ref([]),
    children: ref([]),
    flatChildren: ref([]),
    viewRendererRef: ref(null),
    detailPanelRef: ref(null),
    error: ref(null),
    enterContainer: vi.fn(),
    navigateBack: vi.fn(),
    refreshAfterChange: vi.fn(),
    refreshAfterDelete: vi.fn(),
    refreshGraphAfterStructureChange: vi.fn(),
    refreshDetailPanelLinks: vi.fn(),
    loadSidebarTree: vi.fn(),
    loadFavorites: vi.fn(),
    loadChildren: vi.fn(),
    invalidateSidebarCache: vi.fn(),
    loadRecentItems: vi.fn(),
    loadTags: vi.fn(),
  }
}
