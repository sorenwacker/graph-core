import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useGraphEvents } from '../composables/useGraphEvents.js'

// Mock useGraphSelection
vi.mock('../composables/useGraphSelection.js', () => ({
  updateHtmlLabelsFromCySelection: vi.fn(),
}))

describe('useGraphEvents', () => {
  let mockCy
  let mockContainer
  let mockDropHighlight
  let mockLinkLine
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
      removeEventListener: vi.fn((event, handler) => {
        const handlers = containerEventListeners[event]
        if (!handlers) return
        const index = handlers.indexOf(handler)
        if (index !== -1) handlers.splice(index, 1)
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

    // Mock link connector overlay (a positioned div)
    mockLinkLine = { style: {} }

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
      getLinkLine: () => mockLinkLine,
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

    it('should emit link when option-dragging a connector onto another node', () => {
      linkModeActive = true
      const { setupEvents } = createGraphEvents()
      setupEvents()

      // SVG overlay is created lazily on the container.
      mockContainer.querySelector = vi.fn().mockReturnValue(null)
      mockContainer.appendChild = vi.fn()

      const sourceNode = {
        length: 1,
        id: () => '1',
        data: vi.fn().mockReturnValue({ id: 1, title: 'Source' }),
        renderedPosition: () => ({ x: 100, y: 100 }),
      }
      const targetNode = {
        length: 1,
        id: () => '2',
        data: vi.fn().mockReturnValue({ id: 2, title: 'Target' }),
        addClass: vi.fn(),
        removeClass: vi.fn(),
      }
      mockCy.$ = vi.fn(sel => (sel === '#1' ? sourceNode : targetNode))

      // Option-mousedown on the source node label starts the connector draw.
      const sourceLabel = { dataset: { nodeId: '1' } }
      const mousedownTarget = {
        closest: vi.fn(sel => (sel === '.node-html, .node-person' ? sourceLabel : null)),
      }
      mockContainer._triggerEvent('mousedown', {
        target: mousedownTarget,
        altKey: true,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      })

      // Pointer moves over the target node, then releases there.
      const targetLabel = { dataset: { nodeId: '2' } }
      document.elementFromPoint = vi.fn().mockReturnValue({
        closest: vi.fn().mockReturnValue(targetLabel),
      })

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 300 }))
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 300, clientY: 300 }))

      expect(mockEmit).toHaveBeenCalledWith('link', { sourceId: 1, targetId: 2 })
    })

    it('should not emit link when releasing the connector away from any node', () => {
      linkModeActive = true
      const { setupEvents } = createGraphEvents()
      setupEvents()

      mockContainer.querySelector = vi.fn().mockReturnValue(null)
      mockContainer.appendChild = vi.fn()
      mockCy.$ = vi.fn().mockReturnValue({
        length: 1,
        id: () => '1',
        data: vi.fn().mockReturnValue({ id: 1, title: 'Source' }),
        renderedPosition: () => ({ x: 100, y: 100 }),
      })

      const mousedownTarget = {
        closest: vi.fn(sel => (sel === '.node-html, .node-person' ? { dataset: { nodeId: '1' } } : null)),
      }
      mockContainer._triggerEvent('mousedown', {
        target: mousedownTarget,
        altKey: true,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      })

      // Released over empty canvas (no node label under the pointer).
      document.elementFromPoint = vi.fn().mockReturnValue({
        closest: vi.fn().mockReturnValue(null),
      })
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400, clientY: 400 }))
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 400, clientY: 400 }))

      expect(mockEmit).not.toHaveBeenCalledWith('link', expect.anything())
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

  describe('re-initialization', () => {
    function makeDblclickEvent() {
      return {
        target: {
          closest: vi.fn().mockReturnValue({ dataset: { nodeId: '1' } }),
        },
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
    }

    it('does not accumulate container listeners across repeated setupEvents calls', () => {
      const { setupEvents } = createGraphEvents()

      // Simulate graph re-inits (cy.destroy() + recreate reuses the container)
      setupEvents()
      setupEvents()
      setupEvents()

      mockContainer._triggerEvent('dblclick', makeDblclickEvent())

      // With accumulated listeners this would emit 'enter' three times
      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('enter', { id: 1, title: 'Test Node' })
    })

    it('removes old click listeners on re-init so select fires once', () => {
      const { setupEvents } = createGraphEvents()
      setupEvents()
      setupEvents()

      const clickEvent = {
        target: {
          closest: vi.fn().mockImplementation(selector => {
            if (selector === '.collapse-btn') return null
            return { dataset: { nodeId: '1' } }
          }),
        },
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      }
      mockContainer._triggerEvent('click', clickEvent)
      vi.advanceTimersByTime(200)

      expect(mockEmit).toHaveBeenCalledTimes(1)
      expect(mockEmit).toHaveBeenCalledWith('select', { id: 1, title: 'Test Node' })
    })

    it('teardownEvents removes container listeners', () => {
      const { setupEvents, teardownEvents } = createGraphEvents()
      setupEvents()
      teardownEvents()

      mockContainer._triggerEvent('dblclick', makeDblclickEvent())

      expect(mockEmit).not.toHaveBeenCalled()
    })

    it('teardownEvents is safe to call multiple times and before setup', () => {
      const { setupEvents, teardownEvents } = createGraphEvents()

      expect(() => teardownEvents()).not.toThrow()
      setupEvents()
      teardownEvents()
      expect(() => teardownEvents()).not.toThrow()
    })

    it('teardownEvents removes the document listeners of an in-progress link draw', () => {
      linkModeActive = true
      const { setupEvents, teardownEvents } = createGraphEvents()
      setupEvents()

      const sourceNode = {
        length: 1,
        id: () => '1',
        data: vi.fn().mockReturnValue({ id: 1, title: 'Source' }),
        renderedPosition: () => ({ x: 100, y: 100 }),
      }
      const targetNode = {
        length: 1,
        id: () => '2',
        data: vi.fn().mockReturnValue({ id: 2, title: 'Target' }),
        addClass: vi.fn(),
        removeClass: vi.fn(),
      }
      mockCy.$ = vi.fn(sel => (sel === '#1' ? sourceNode : targetNode))

      const mousedownTarget = {
        closest: vi.fn(sel => (sel === '.node-html, .node-person' ? { dataset: { nodeId: '1' } } : null)),
      }
      mockContainer._triggerEvent('mousedown', {
        target: mousedownTarget,
        altKey: true,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      })

      // Unmount (or graph re-init) while the drag is still in progress.
      teardownEvents()

      // Hidden connector, target highlight cleared, and no stray document
      // listeners: a later mousemove/mouseup must be inert.
      expect(mockLinkLine.style.display).toBe('none')
      expect(targetNode.removeClass).not.toHaveBeenCalled()

      document.elementFromPoint = vi.fn().mockReturnValue({
        closest: vi.fn().mockReturnValue({ dataset: { nodeId: '2' } }),
      })
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 300, clientY: 300 }))
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: 300, clientY: 300 }))

      expect(targetNode.addClass).not.toHaveBeenCalled()
      expect(mockEmit).not.toHaveBeenCalledWith('link', expect.anything())
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
          closest: vi.fn().mockImplementation(selector => {
            // Return null for collapse button, return node-html for other selectors
            if (selector === '.collapse-btn') return null
            return { dataset: { nodeId: '1' } }
          }),
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
