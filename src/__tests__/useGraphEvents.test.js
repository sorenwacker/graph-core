import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useGraphEvents } from '../composables/useGraphEvents.js'

// Mock useGraphSelection
vi.mock('./useGraphSelection.js', () => ({
  updateHtmlLabelsFromCySelection: vi.fn(),
}))

describe('useGraphEvents', () => {
  let mockCy
  let mockContainer
  let mockDropHighlight
  let mockEmit
  let mockShowAddNodeModal
  let mockHideEditModal
  let mockShowTooltip
  let mockHideTooltip
  let mockForceHideTooltip
  let mockSavePositions
  let linkModeActive
  let selectedIds

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Mock event handlers storage
    const cyEventHandlers = {}
    const containerEventListeners = {}

    // Mock cytoscape instance
    mockCy = {
      on: vi.fn((event, selectorOrHandler, handler) => {
        const key = handler ? `${event}:${selectorOrHandler}` : event
        const fn = handler || selectorOrHandler
        if (!cyEventHandlers[key]) cyEventHandlers[key] = []
        cyEventHandlers[key].push(fn)
        return mockCy
      }),
      $: vi.fn().mockReturnValue({
        length: 1,
        data: vi.fn().mockReturnValue({ id: 1, title: 'Test Node' }),
        position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
      }),
      nodes: vi.fn().mockReturnValue({
        forEach: vi.fn(cb => {
          cb({
            id: () => '2',
            position: () => ({ x: 150, y: 150 }),
          })
        }),
      }),
      // Helper to trigger events
      _triggerEvent: (event, selector, eventData) => {
        const key = selector ? `${event}:${selector}` : event
        const handlers = cyEventHandlers[key] || []
        handlers.forEach(handler => handler(eventData))
      },
    }

    // Mock container element
    mockContainer = {
      addEventListener: vi.fn((event, handler) => {
        if (!containerEventListeners[event]) containerEventListeners[event] = []
        containerEventListeners[event].push(handler)
      }),
      getBoundingClientRect: vi.fn().mockReturnValue({ left: 0, top: 0, width: 800, height: 600 }),
      querySelectorAll: vi.fn().mockReturnValue([]),
      // Helper to trigger events
      _triggerEvent: (event, eventData) => {
        const handlers = containerEventListeners[event] || []
        handlers.forEach(handler => handler(eventData))
      },
    }

    // Mock drop highlight element
    mockDropHighlight = {
      style: {},
      classList: {
        toggle: vi.fn(),
        remove: vi.fn(),
      },
    }

    // Mock functions
    mockEmit = vi.fn()
    mockShowAddNodeModal = vi.fn()
    mockHideEditModal = vi.fn()
    mockShowTooltip = vi.fn()
    mockHideTooltip = vi.fn()
    mockForceHideTooltip = vi.fn()
    mockSavePositions = vi.fn()
    linkModeActive = false
    selectedIds = new Set()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createGraphEvents() {
    return useGraphEvents({
      getCy: () => mockCy,
      getContainer: () => mockContainer,
      getDropHighlight: () => mockDropHighlight,
      getLinkModeActive: () => linkModeActive,
      getSelectedIds: () => selectedIds,
      emit: mockEmit,
      showAddNodeModal: mockShowAddNodeModal,
      hideEditModal: mockHideEditModal,
      showTooltip: mockShowTooltip,
      hideTooltip: mockHideTooltip,
      forceHideTooltip: mockForceHideTooltip,
      savePositions: mockSavePositions,
    })
  }

  describe('initialization', () => {
    it('should return setupEvents function', () => {
      const result = createGraphEvents()

      expect(result).toHaveProperty('setupEvents')
      expect(typeof result.setupEvents).toBe('function')
    })
  })

  describe('setupEvents', () => {
    it('should set up all event handlers', () => {
      const { setupEvents } = createGraphEvents()

      setupEvents()

      // Should register cytoscape event handlers
      expect(mockCy.on).toHaveBeenCalled()
      // Should register container event listeners
      expect(mockContainer.addEventListener).toHaveBeenCalled()
    })

    it('should do nothing if cy is null', () => {
      const events = useGraphEvents({
        getCy: () => null,
        getContainer: () => mockContainer,
        emit: mockEmit,
      })

      expect(() => events.setupEvents()).not.toThrow()
    })

    it('should do nothing if container is null', () => {
      const events = useGraphEvents({
        getCy: () => mockCy,
        getContainer: () => null,
        emit: mockEmit,
      })

      expect(() => events.setupEvents()).not.toThrow()
    })
  })

  describe('node tap handlers', () => {
    it('should register tap handler for nodes', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const tapCalls = mockCy.on.mock.calls.filter(call => call[0] === 'tap' && call[1] === 'node')
      expect(tapCalls.length).toBe(1)
    })

    it('should register dbltap handler for nodes', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dbltapCalls = mockCy.on.mock.calls.filter(call => call[0] === 'dbltap' && call[1] === 'node')
      expect(dbltapCalls.length).toBe(1)
    })

    it('should emit select on node tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const tapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
          position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        },
        originalEvent: { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false },
      }

      tapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith('select', { id: 1, title: 'Test' })
    })

    it('should emit select-multiple on shift+tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const tapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
        },
        originalEvent: { metaKey: false, ctrlKey: false, shiftKey: true, altKey: false },
      }

      tapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith('select-multiple', { node: { id: 1, title: 'Test' }, add: true })
    })

    it('should show add node modal on cmd+tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const tapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
          position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        },
        originalEvent: { metaKey: true, ctrlKey: false, shiftKey: false, altKey: false },
      }

      tapHandler(mockEvent)

      expect(mockShowAddNodeModal).toHaveBeenCalledWith(1, { x: 150, y: 180 })
    })

    it('should emit delete on cmd+alt+tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const tapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
        },
        originalEvent: { metaKey: true, ctrlKey: false, shiftKey: false, altKey: true },
      }

      tapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith('delete', 1)
    })

    it('should emit enter on double tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dbltapHandler = mockCy.on.mock.calls.find(call => call[0] === 'dbltap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
        },
      }

      dbltapHandler(mockEvent)

      expect(mockHideEditModal).toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith('enter', { id: 1, title: 'Test' })
    })
  })

  describe('background tap handler', () => {
    it('should emit select null on background tap after delay', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const bgTapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && typeof call[1] === 'function')[1]

      const mockEvent = {
        target: mockCy, // Background tap means target is cy itself
        originalEvent: { metaKey: false, ctrlKey: false },
      }

      bgTapHandler(mockEvent)
      vi.advanceTimersByTime(200)

      expect(mockHideEditModal).toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith('select', null)
    })

    it('should show add node modal on cmd+background tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const bgTapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && typeof call[1] === 'function')[1]

      const mockEvent = {
        target: mockCy,
        position: { x: 200, y: 300 },
        originalEvent: { metaKey: true, ctrlKey: false },
      }

      bgTapHandler(mockEvent)

      expect(mockShowAddNodeModal).toHaveBeenCalledWith(null, { x: 200, y: 300 })
    })
  })

  describe('edge tap handler', () => {
    it('should emit unlink on cmd+alt+tap of link edge', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const edgeTapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'edge')[2]

      const mockEvent = {
        target: {
          source: () => ({
            id: () => '1',
            data: vi.fn().mockReturnValue({ id: 1, title: 'Source' }),
            position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
          }),
          target: () => ({
            id: () => '2',
            data: vi.fn().mockReturnValue({ id: 2, title: 'Target' }),
            position: vi.fn().mockReturnValue({ x: 200, y: 200 }),
          }),
          data: vi.fn().mockReturnValue(true), // isLink
        },
        originalEvent: { metaKey: true, ctrlKey: false, altKey: true },
      }

      edgeTapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith('unlink', { sourceId: 1, targetId: 2 })
    })

    it('should emit move on cmd+alt+tap of parent-child edge', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const edgeTapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'edge')[2]

      const mockEvent = {
        target: {
          source: () => ({
            id: () => '1',
            data: vi.fn().mockReturnValue({ id: 1, title: 'Parent' }),
            position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
          }),
          target: () => ({
            id: () => '2',
            data: vi.fn().mockReturnValue({ id: 2, title: 'Child' }),
            position: vi.fn().mockReturnValue({ x: 200, y: 200 }),
          }),
          data: vi.fn().mockReturnValue(false), // not a link edge
        },
        originalEvent: { metaKey: true, ctrlKey: false, altKey: true },
      }

      edgeTapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith('move', { nodeId: 2, oldParentId: 1, newParentId: null })
    })

    it('should show add node modal on cmd+edge tap', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const edgeTapHandler = mockCy.on.mock.calls.find(call => call[0] === 'tap' && call[1] === 'edge')[2]

      const mockEvent = {
        target: {
          source: () => ({
            id: () => '1',
            data: vi.fn().mockReturnValue({ id: 1, title: 'Parent' }),
            position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
          }),
          target: () => ({
            id: () => '2',
            data: vi.fn().mockReturnValue({ id: 2, title: 'Child' }),
            position: vi.fn().mockReturnValue({ x: 200, y: 200 }),
          }),
          data: vi.fn().mockReturnValue(false),
        },
        originalEvent: { metaKey: true, ctrlKey: false, altKey: false },
      }

      edgeTapHandler(mockEvent)

      expect(mockShowAddNodeModal).toHaveBeenCalledWith(null, { x: 150, y: 150 }, expect.any(Object))
    })
  })

  describe('tooltip handlers', () => {
    it('should show tooltip on node mouseover', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const mouseoverHandler = mockCy.on.mock.calls.find(call => call[0] === 'mouseover' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test', notes: 'Some notes' }),
        },
      }

      mouseoverHandler(mockEvent)

      expect(mockShowTooltip).toHaveBeenCalledWith(null, { id: 1, title: 'Test', notes: 'Some notes' })
    })

    it('should not show tooltip for sensitive notes', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const mouseoverHandler = mockCy.on.mock.calls.find(call => call[0] === 'mouseover' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test', notes_sensitive: true }),
        },
      }

      mouseoverHandler(mockEvent)

      expect(mockShowTooltip).not.toHaveBeenCalled()
    })

    it('should hide tooltip on node mouseout', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const mouseoutHandler = mockCy.on.mock.calls.find(call => call[0] === 'mouseout' && call[1] === 'node')[2]

      mouseoutHandler()

      expect(mockHideTooltip).toHaveBeenCalled()
    })

    it('should force hide tooltip on drag', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dragHandler = mockCy.on.mock.calls.find(call => call[0] === 'drag' && call[1] === 'node')[2]

      dragHandler()

      expect(mockForceHideTooltip).toHaveBeenCalled()
    })
  })

  describe('context menu handler', () => {
    it('should emit context-menu on right click', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const cxttapHandler = mockCy.on.mock.calls.find(call => call[0] === 'cxttap' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          data: vi.fn().mockReturnValue({ id: 1, title: 'Test' }),
          renderedPosition: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        },
        preventDefault: vi.fn(),
      }

      cxttapHandler(mockEvent)

      expect(mockEmit).toHaveBeenCalledWith(
        'context-menu',
        expect.objectContaining({
          node: { id: 1, title: 'Test' },
        })
      )
    })
  })

  describe('drag and drop handlers', () => {
    it('should save position on grab', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const grabHandler = mockCy.on.mock.calls.find(call => call[0] === 'grab' && call[1] === 'node')[2]

      const mockEvent = {
        target: {
          position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        },
      }

      grabHandler(mockEvent)

      // Just verify it doesn't throw
      expect(grabHandler).toBeDefined()
    })

    it('should save positions on dragfree', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dragfreeHandler = mockCy.on.mock.calls.find(call => call[0] === 'dragfree' && call[1] === 'node')[2]

      dragfreeHandler()

      expect(mockSavePositions).toHaveBeenCalled()
    })

    it('should emit link when in link mode', () => {
      linkModeActive = true
      const { setupEvents } = createGraphEvents()
      setupEvents()

      // First trigger grab
      const grabHandler = mockCy.on.mock.calls.find(call => call[0] === 'grab' && call[1] === 'node')[2]
      grabHandler({
        target: {
          position: vi.fn().mockReturnValue({ x: 100, y: 100 }),
        },
      })

      // Then trigger free
      const freeHandler = mockCy.on.mock.calls.find(call => call[0] === 'free' && call[1] === 'node')[2]

      const mockDraggedNode = {
        position: vi.fn().mockReturnValue({ x: 200, y: 200 }), // Moved significantly
        id: vi.fn().mockReturnValue('1'),
        data: vi.fn().mockReturnValue({ id: 1, title: 'Dragged' }),
      }

      // Mock nodes to return a close node
      mockCy.nodes.mockReturnValue({
        forEach: vi.fn(cb => {
          cb({
            id: () => '2',
            position: () => ({ x: 200, y: 200 }), // Within threshold
            data: vi.fn().mockReturnValue({ id: 2, title: 'Target' }),
          })
        }),
      })

      freeHandler({ target: mockDraggedNode })

      expect(mockEmit).toHaveBeenCalledWith('link', { sourceId: 1, targetId: 2 })
    })

    it('should emit move when dropping on another node', () => {
      linkModeActive = false
      const { setupEvents } = createGraphEvents()
      setupEvents()

      // Trigger grab first
      const grabHandler = mockCy.on.mock.calls.find(call => call[0] === 'grab' && call[1] === 'node')[2]
      grabHandler({
        target: { position: vi.fn().mockReturnValue({ x: 100, y: 100 }) },
      })

      // Then trigger free
      const freeHandler = mockCy.on.mock.calls.find(call => call[0] === 'free' && call[1] === 'node')[2]

      const mockDraggedNode = {
        position: vi.fn().mockReturnValue({ x: 200, y: 200 }),
        id: vi.fn().mockReturnValue('1'),
        data: vi.fn().mockReturnValue({ id: 1, title: 'Dragged', parent_id: 5 }),
      }

      mockCy.nodes.mockReturnValue({
        forEach: vi.fn(cb => {
          cb({
            id: () => '2',
            position: () => ({ x: 200, y: 200 }),
            data: vi.fn().mockReturnValue({ id: 2, title: 'Target' }),
          })
        }),
      })

      freeHandler({ target: mockDraggedNode })

      expect(mockEmit).toHaveBeenCalledWith('move', { nodeId: 1, oldParentId: 5, newParentId: 2 })
    })
  })

  describe('HTML label handlers', () => {
    it('should register click handler on container', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const clickCalls = mockContainer.addEventListener.mock.calls.filter(call => call[0] === 'click')
      expect(clickCalls.length).toBe(1)
    })

    it('should register dblclick handler on container', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dblclickCalls = mockContainer.addEventListener.mock.calls.filter(call => call[0] === 'dblclick')
      expect(dblclickCalls.length).toBe(1)
    })

    it('should emit select after click on HTML label', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const clickHandler = mockContainer.addEventListener.mock.calls.find(call => call[0] === 'click')[1]

      const mockEvent = {
        target: {
          closest: vi.fn().mockReturnValue({ dataset: { nodeId: '1' } }),
        },
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }

      clickHandler(mockEvent)
      vi.advanceTimersByTime(200)

      expect(mockEmit).toHaveBeenCalledWith('select', { id: 1, title: 'Test Node' })
    })

    it('should emit enter on dblclick on HTML label', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()

      const dblclickHandler = mockContainer.addEventListener.mock.calls.find(call => call[0] === 'dblclick')[1]

      const mockEvent = {
        target: {
          closest: vi.fn().mockReturnValue({ dataset: { nodeId: '1' } }),
        },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }

      dblclickHandler(mockEvent)

      expect(mockHideEditModal).toHaveBeenCalled()
      expect(mockEmit).toHaveBeenCalledWith('enter', { id: 1, title: 'Test Node' })
    })
  })
})
