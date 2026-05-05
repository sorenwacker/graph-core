import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { useDetailController } from '../composables/useDetailController.js'

// Mock useDetailResize
vi.mock('../composables/useDetailResize.js', () => ({
  useDetailResize: vi.fn(() => ({
    detailWidth: ref(400),
    isResizing: ref(false),
    onResizeStart: vi.fn(),
    setWidth: vi.fn(),
    cleanup: vi.fn(),
  })),
}))

describe('useDetailController composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have showDetail as false', () => {
      const controller = useDetailController()
      expect(controller.showDetail.value).toBe(false)
    })

    it('should have fullscreenDetail as false', () => {
      const controller = useDetailController()
      expect(controller.fullscreenDetail.value).toBe(false)
    })

    it('should have detailPinned as false', () => {
      const controller = useDetailController()
      expect(controller.detailPinned.value).toBe(false)
    })

    it('should have detailWidth from useDetailResize', () => {
      const controller = useDetailController()
      expect(controller.detailWidth.value).toBe(400)
    })

    it('should have isResizingDetail as false', () => {
      const controller = useDetailController()
      expect(controller.isResizingDetail.value).toBe(false)
    })

    it('should have detailPanelRef as null', () => {
      const controller = useDetailController()
      expect(controller.detailPanelRef.value).toBeNull()
    })

    it('should use provided detailPinned ref', () => {
      const externalPinned = ref(true)
      const controller = useDetailController({ detailPinned: externalPinned })
      expect(controller.detailPinned.value).toBe(true)

      // Should be the same ref
      externalPinned.value = false
      expect(controller.detailPinned.value).toBe(false)
    })
  })

  describe('closeDetail', () => {
    it('should set showDetail to false', () => {
      const controller = useDetailController()
      controller.showDetail.value = true

      controller.closeDetail()

      expect(controller.showDetail.value).toBe(false)
    })

    it('should set fullscreenDetail to false', () => {
      const controller = useDetailController()
      controller.fullscreenDetail.value = true

      controller.closeDetail()

      expect(controller.fullscreenDetail.value).toBe(false)
    })

    it('should set detailPinned to false', () => {
      const controller = useDetailController()
      controller.detailPinned.value = true

      controller.closeDetail()

      expect(controller.detailPinned.value).toBe(false)
    })

    it('should reset all state at once', () => {
      const controller = useDetailController()
      controller.showDetail.value = true
      controller.fullscreenDetail.value = true
      controller.detailPinned.value = true

      controller.closeDetail()

      expect(controller.showDetail.value).toBe(false)
      expect(controller.fullscreenDetail.value).toBe(false)
      expect(controller.detailPinned.value).toBe(false)
    })
  })

  describe('openDetail', () => {
    it('should set showDetail to true', () => {
      const controller = useDetailController()

      controller.openDetail()

      expect(controller.showDetail.value).toBe(true)
    })

    it('should not set fullscreen by default', () => {
      const controller = useDetailController()

      controller.openDetail()

      expect(controller.fullscreenDetail.value).toBe(false)
    })

    it('should set fullscreen when option is true', () => {
      const controller = useDetailController()

      controller.openDetail({ fullscreen: true })

      expect(controller.showDetail.value).toBe(true)
      expect(controller.fullscreenDetail.value).toBe(true)
    })
  })

  describe('toggleFullscreen', () => {
    it('should toggle fullscreenDetail from false to true', () => {
      const controller = useDetailController()
      expect(controller.fullscreenDetail.value).toBe(false)

      controller.toggleFullscreen()

      expect(controller.fullscreenDetail.value).toBe(true)
    })

    it('should toggle fullscreenDetail from true to false', () => {
      const controller = useDetailController()
      controller.fullscreenDetail.value = true

      controller.toggleFullscreen()

      expect(controller.fullscreenDetail.value).toBe(false)
    })

    it('should toggle multiple times', () => {
      const controller = useDetailController()

      controller.toggleFullscreen()
      expect(controller.fullscreenDetail.value).toBe(true)

      controller.toggleFullscreen()
      expect(controller.fullscreenDetail.value).toBe(false)

      controller.toggleFullscreen()
      expect(controller.fullscreenDetail.value).toBe(true)
    })
  })

  describe('togglePin', () => {
    it('should toggle detailPinned from false to true', () => {
      const controller = useDetailController()
      expect(controller.detailPinned.value).toBe(false)

      controller.togglePin()

      expect(controller.detailPinned.value).toBe(true)
    })

    it('should toggle detailPinned from true to false', () => {
      const controller = useDetailController()
      controller.detailPinned.value = true

      controller.togglePin()

      expect(controller.detailPinned.value).toBe(false)
    })

    it('should toggle multiple times', () => {
      const controller = useDetailController()

      controller.togglePin()
      expect(controller.detailPinned.value).toBe(true)

      controller.togglePin()
      expect(controller.detailPinned.value).toBe(false)

      controller.togglePin()
      expect(controller.detailPinned.value).toBe(true)
    })

    it('should work with external detailPinned ref', () => {
      const externalPinned = ref(false)
      const controller = useDetailController({ detailPinned: externalPinned })

      controller.togglePin()

      expect(externalPinned.value).toBe(true)
      expect(controller.detailPinned.value).toBe(true)
    })
  })

  describe('resize functionality', () => {
    it('should expose onDetailResizeStart', () => {
      const controller = useDetailController()
      expect(typeof controller.onDetailResizeStart).toBe('function')
    })

    it('should expose detailWidth ref', () => {
      const controller = useDetailController()
      expect(controller.detailWidth.value).toBe(400)
    })

    it('should expose isResizingDetail ref', () => {
      const controller = useDetailController()
      expect(controller.isResizingDetail.value).toBe(false)
    })
  })

  describe('delegation methods', () => {
    it('should expose loadLinkedNodes method', () => {
      const controller = useDetailController()
      expect(typeof controller.loadLinkedNodes).toBe('function')
    })

    it('should expose loadChildren method', () => {
      const controller = useDetailController()
      expect(typeof controller.loadChildren).toBe('function')
    })

    it('should call loadLinkedNodes on detailPanelRef when available', () => {
      const controller = useDetailController()
      const mockLoadLinkedNodes = vi.fn()
      controller.detailPanelRef.value = { loadLinkedNodes: mockLoadLinkedNodes }

      controller.loadLinkedNodes()

      expect(mockLoadLinkedNodes).toHaveBeenCalled()
    })

    it('should call loadChildren on detailPanelRef when available', () => {
      const controller = useDetailController()
      const mockLoadChildren = vi.fn()
      controller.detailPanelRef.value = { loadChildren: mockLoadChildren }

      controller.loadChildren()

      expect(mockLoadChildren).toHaveBeenCalled()
    })

    it('should not throw when detailPanelRef is null', () => {
      const controller = useDetailController()

      expect(() => controller.loadLinkedNodes()).not.toThrow()
      expect(() => controller.loadChildren()).not.toThrow()
    })
  })
})
