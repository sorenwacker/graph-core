import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDetailResize } from '../composables/useDetailResize.js'

describe('useDetailResize composable', () => {
  let mockLocalStorage
  let addEventListenerSpy
  let removeEventListenerSpy

  beforeEach(() => {
    mockLocalStorage = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => mockLocalStorage[key] || null),
      setItem: vi.fn((key, value) => { mockLocalStorage[key] = value })
    })

    vi.stubGlobal('window', {
      innerWidth: 1200
    })

    addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should use default width when no stored value', () => {
      const resize = useDetailResize()
      expect(resize.detailWidth.value).toBe(400)
    })

    it('should use stored width from localStorage', () => {
      mockLocalStorage['graphcore-detailWidth'] = '500'
      const resize = useDetailResize()
      expect(resize.detailWidth.value).toBe(500)
    })

    it('should use custom default width', () => {
      const resize = useDetailResize({ defaultWidth: 350 })
      expect(resize.detailWidth.value).toBe(350)
    })

    it('should use custom storage key', () => {
      mockLocalStorage['custom-width'] = '600'
      const resize = useDetailResize({ storageKey: 'custom-width' })
      expect(resize.detailWidth.value).toBe(600)
    })

    it('should have isResizing as false', () => {
      const resize = useDetailResize()
      expect(resize.isResizing.value).toBe(false)
    })
  })

  describe('onResizeStart', () => {
    it('should set isResizing to true', () => {
      const resize = useDetailResize()
      const event = { preventDefault: vi.fn() }

      resize.onResizeStart(event)

      expect(resize.isResizing.value).toBe(true)
    })

    it('should call preventDefault', () => {
      const resize = useDetailResize()
      const event = { preventDefault: vi.fn() }

      resize.onResizeStart(event)

      expect(event.preventDefault).toHaveBeenCalled()
    })

    it('should add mousemove and mouseup listeners', () => {
      const resize = useDetailResize()
      const event = { preventDefault: vi.fn() }

      resize.onResizeStart(event)

      expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })
  })

  describe('resize behavior', () => {
    it('should update width on mousemove when resizing', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })

      // Simulate mousemove - width = window.innerWidth - clientX = 1200 - 700 = 500
      const moveHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mousemove')[1]
      moveHandler({ clientX: 700 })

      expect(resize.detailWidth.value).toBe(500)
    })

    it('should respect minimum width', () => {
      const resize = useDetailResize({ minWidth: 300 })
      resize.onResizeStart({ preventDefault: vi.fn() })

      // clientX of 1100 would give width of 100, but min is 300
      const moveHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mousemove')[1]
      moveHandler({ clientX: 1100 })

      expect(resize.detailWidth.value).toBe(300)
    })

    it('should respect maximum width percent', () => {
      const resize = useDetailResize({ maxWidthPercent: 0.5 })
      resize.onResizeStart({ preventDefault: vi.fn() })

      // clientX of 0 would give width of 1200, but max is 50% = 600
      const moveHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mousemove')[1]
      moveHandler({ clientX: 0 })

      expect(resize.detailWidth.value).toBe(600)
    })

    it('should not update width when not resizing', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })

      // Get the move handler
      const moveHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mousemove')[1]

      // Simulate mouseup to stop resizing
      const upHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mouseup')[1]
      upHandler()

      // Now try to move - should not change width
      const widthBefore = resize.detailWidth.value
      moveHandler({ clientX: 500 })

      expect(resize.detailWidth.value).toBe(widthBefore)
    })
  })

  describe('onResizeEnd (via mouseup)', () => {
    it('should set isResizing to false', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })
      expect(resize.isResizing.value).toBe(true)

      const upHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mouseup')[1]
      upHandler()

      expect(resize.isResizing.value).toBe(false)
    })

    it('should remove event listeners', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })

      const upHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mouseup')[1]
      upHandler()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should save width to localStorage', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })

      // Change width
      const moveHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mousemove')[1]
      moveHandler({ clientX: 700 })

      // End resize
      const upHandler = addEventListenerSpy.mock.calls.find(c => c[0] === 'mouseup')[1]
      upHandler()

      expect(localStorage.setItem).toHaveBeenCalledWith('graphcore-detailWidth', '500')
    })
  })

  describe('setWidth', () => {
    it('should set width directly', () => {
      const resize = useDetailResize()

      resize.setWidth(550)

      expect(resize.detailWidth.value).toBe(550)
    })

    it('should respect minimum width', () => {
      const resize = useDetailResize({ minWidth: 300 })

      resize.setWidth(100)

      expect(resize.detailWidth.value).toBe(300)
    })

    it('should respect maximum width', () => {
      const resize = useDetailResize({ maxWidthPercent: 0.5 })

      resize.setWidth(1000)

      expect(resize.detailWidth.value).toBe(600) // 50% of 1200
    })

    it('should save to localStorage', () => {
      const resize = useDetailResize()

      resize.setWidth(450)

      expect(localStorage.setItem).toHaveBeenCalledWith('graphcore-detailWidth', '450')
    })
  })

  describe('cleanup', () => {
    it('should remove event listeners', () => {
      const resize = useDetailResize()
      resize.onResizeStart({ preventDefault: vi.fn() })

      resize.cleanup()

      expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
      expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should be safe to call multiple times', () => {
      const resize = useDetailResize()

      expect(() => {
        resize.cleanup()
        resize.cleanup()
      }).not.toThrow()
    })
  })

  describe('without localStorage', () => {
    it('should work with undefined localStorage', () => {
      vi.stubGlobal('localStorage', undefined)

      // This would throw if not handled
      expect(() => useDetailResize()).not.toThrow()
    })
  })
})
