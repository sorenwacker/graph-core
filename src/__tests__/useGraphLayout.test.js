import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { useGraphLayout, LAYOUTS } from '../composables/useGraphLayout.js'

describe('useGraphLayout', () => {
  let mockCy
  let mockLayout
  let mockLayoutMode
  let mockRadialSettings
  let mockSavePositions
  let mockClearPositions
  let relaxLocked
  let fitLocked

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()

    // Mock layout object
    mockLayout = {
      run: vi.fn(),
      stop: vi.fn(),
      on: vi.fn((event, callback) => {
        if (event === 'layoutstop') {
          // Store callback for manual triggering
          mockLayout._layoutstopCallback = callback
        }
        return mockLayout
      }),
    }

    // Mock cytoscape instance
    mockCy = {
      layout: vi.fn().mockReturnValue(mockLayout),
      nodes: vi.fn().mockReturnValue({
        length: 10,
        forEach: vi.fn(),
        toArray: vi.fn().mockReturnValue([]),
        boundingBox: vi.fn().mockReturnValue({ x1: 0, y1: 0, x2: 100, y2: 100 }),
        not: vi.fn().mockReturnValue({ lock: vi.fn() }),
        unlock: vi.fn(),
      }),
      batch: vi.fn(fn => fn()),
      fit: vi.fn(),
      animate: vi.fn(),
      zoom: vi.fn().mockReturnValue(1),
      pan: vi.fn().mockReturnValue({ x: 0, y: 0 }),
      width: vi.fn().mockReturnValue(1200),
      height: vi.fn().mockReturnValue(800),
      getElementById: vi.fn().mockReturnValue({
        length: 1,
        neighborhood: vi.fn().mockReturnValue({
          add: vi.fn().mockReturnValue({
            layout: vi.fn().mockReturnValue({ run: vi.fn() }),
          }),
        }),
      }),
      collection: vi.fn().mockReturnValue({
        add: vi.fn().mockReturnThis(),
        union: vi.fn().mockReturnThis(),
        layout: vi.fn().mockReturnValue(mockLayout),
      }),
    }

    mockLayoutMode = 'tree'
    mockRadialSettings = {
      nodeRepulsion: 4500,
      edgeLength: 100,
      elasticity: 0.45,
      gravity: 10000,
      iterations: 2500,
    }

    mockSavePositions = vi.fn()
    mockClearPositions = vi.fn()
    relaxLocked = ref(false)
    fitLocked = ref(false)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createGraphLayout() {
    return useGraphLayout({
      getCy: () => mockCy,
      getLayoutMode: () => mockLayoutMode,
      setLayoutMode: mode => {
        mockLayoutMode = mode
      },
      getRadialSettings: () => mockRadialSettings,
      savePositions: mockSavePositions,
      clearPositions: mockClearPositions,
      relaxLocked,
      fitLocked,
    })
  }

  describe('LAYOUTS export', () => {
    it('should export layout configurations', () => {
      expect(LAYOUTS).toHaveProperty('tree')
      expect(LAYOUTS).toHaveProperty('horizontal')
      expect(LAYOUTS).toHaveProperty('radial')
      expect(LAYOUTS).toHaveProperty('grid')
      expect(LAYOUTS).toHaveProperty('circle')
      expect(LAYOUTS).toHaveProperty('relax')
      expect(LAYOUTS).toHaveProperty('continuous')
    })

    it('should have correct dagre config for tree layout', () => {
      expect(LAYOUTS.tree.name).toBe('dagre')
      expect(LAYOUTS.tree.rankDir).toBe('TB')
    })

    it('should have correct dagre config for horizontal layout', () => {
      expect(LAYOUTS.horizontal.name).toBe('dagre')
      expect(LAYOUTS.horizontal.rankDir).toBe('LR')
    })

    it('should have correct cose-bilkent config for radial layout', () => {
      expect(LAYOUTS.radial.name).toBe('cose-bilkent')
    })
  })

  describe('initialization', () => {
    it('should return all expected functions', () => {
      const result = createGraphLayout()

      expect(result).toHaveProperty('LAYOUTS')
      expect(result).toHaveProperty('getLayoutOptions')
      expect(result).toHaveProperty('setLayout')
      expect(result).toHaveProperty('reLayout')
      expect(result).toHaveProperty('resetLayout')
      expect(result).toHaveProperty('applyRadialSettings')
      expect(result).toHaveProperty('relaxLayout')
      expect(result).toHaveProperty('localRelax')
      expect(result).toHaveProperty('autoRelaxNewNodes')
      expect(result).toHaveProperty('startContinuousRelax')
      expect(result).toHaveProperty('stopContinuousRelax')
      expect(result).toHaveProperty('restartContinuousRelax')
      expect(result).toHaveProperty('handleRelaxClick')
      expect(result).toHaveProperty('fitView')
      expect(result).toHaveProperty('startContinuousFit')
      expect(result).toHaveProperty('stopContinuousFit')
      expect(result).toHaveProperty('handleFitClick')
      expect(result).toHaveProperty('cleanup')
    })
  })

  describe('getLayoutOptions', () => {
    it('should return tree layout options by default', () => {
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions()

      expect(options.name).toBe('dagre')
      expect(options.rankDir).toBe('TB')
    })

    it('should return horizontal layout options', () => {
      mockLayoutMode = 'horizontal'
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions('horizontal')

      expect(options.name).toBe('dagre')
      expect(options.rankDir).toBe('LR')
    })

    it('should return radial layout with custom settings', () => {
      mockLayoutMode = 'radial'
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions('radial')

      expect(options.name).toBe('cose-bilkent')
      expect(options.nodeRepulsion).toBe(4500)
      expect(options.idealEdgeLength).toBe(100)
      expect(options.edgeElasticity).toBe(0.45)
      expect(options.gravity).toBe(1) // 10000 / 10000
    })

    it('should return grid layout options', () => {
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions('grid')

      // Grid uses 'preset' because positions are calculated by custom Tetris layout
      expect(options.name).toBe('preset')
      expect(options.animate).toBe(true)
    })

    it('should return circle layout with concentric function', () => {
      mockLayoutMode = 'circle'
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions('circle')

      expect(options.name).toBe('circle')
      expect(typeof options.concentric).toBe('function')
    })

    it('should fallback to tree for unknown mode', () => {
      const { getLayoutOptions } = createGraphLayout()

      const options = getLayoutOptions('unknown')

      expect(options.name).toBe('dagre')
    })
  })

  describe('setLayout', () => {
    it('should change layout mode and re-layout', () => {
      const { setLayout } = createGraphLayout()

      setLayout('horizontal')

      expect(mockLayoutMode).toBe('horizontal')
      expect(mockClearPositions).toHaveBeenCalled()
      expect(mockCy.layout).toHaveBeenCalled()
      expect(mockLayout.run).toHaveBeenCalled()
    })

    it('should stop continuous relax when switching layouts', () => {
      relaxLocked.value = true
      const { setLayout, stopContinuousRelax } = createGraphLayout()

      setLayout('grid')

      expect(relaxLocked.value).toBe(false)
    })

    it('should stop continuous fit when switching layouts', () => {
      fitLocked.value = true
      const { setLayout } = createGraphLayout()

      setLayout('circle')

      expect(fitLocked.value).toBe(false)
    })
  })

  describe('reLayout', () => {
    it('should clear positions and run layout', () => {
      const { reLayout } = createGraphLayout()

      reLayout()

      expect(mockClearPositions).toHaveBeenCalled()
      expect(mockCy.layout).toHaveBeenCalled()
      expect(mockLayout.run).toHaveBeenCalled()
    })

    it('should save positions after delay', () => {
      const { reLayout } = createGraphLayout()

      reLayout()
      expect(mockSavePositions).not.toHaveBeenCalled()

      vi.advanceTimersByTime(800)
      expect(mockSavePositions).toHaveBeenCalled()
    })

    it('should handle missing cy gracefully', () => {
      const layout = useGraphLayout({
        getCy: () => null,
        getLayoutMode: () => 'tree',
      })

      expect(() => layout.reLayout()).not.toThrow()
    })
  })

  describe('resetLayout', () => {
    it('should clear positions and run randomized layout', () => {
      const { resetLayout } = createGraphLayout()

      resetLayout()

      expect(mockClearPositions).toHaveBeenCalled()
      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.randomize).toBe(true)
      expect(layoutCall.animate).toBe('end')
    })

    it('should save positions after delay', () => {
      const { resetLayout } = createGraphLayout()

      resetLayout()
      vi.advanceTimersByTime(1000)

      expect(mockSavePositions).toHaveBeenCalled()
    })
  })

  describe('applyRadialSettings', () => {
    it('should run cose-bilkent layout with settings', () => {
      const { applyRadialSettings } = createGraphLayout()

      applyRadialSettings()

      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.name).toBe('cose-bilkent')
      expect(layoutCall.nodeRepulsion).toBe(4500)
      expect(layoutCall.idealEdgeLength).toBe(100)
    })

    it('should set gravity center to graph center', () => {
      mockCy.nodes().boundingBox = vi.fn().mockReturnValue({ x1: 0, y1: 0, x2: 200, y2: 200 })
      const { applyRadialSettings } = createGraphLayout()

      applyRadialSettings()

      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.gravityCenter).toEqual({ x: 100, y: 100 })
    })
  })

  describe('relaxLayout', () => {
    it('should run cola layout', () => {
      const { relaxLayout } = createGraphLayout()

      relaxLayout()

      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.name).toBe('cola')
      expect(layoutCall.animate).toBe(true)
      expect(layoutCall.fit).toBe(false)
    })

    it('should fit view after layout stop', () => {
      const { relaxLayout } = createGraphLayout()

      relaxLayout()

      // Trigger layoutstop callback
      if (mockLayout._layoutstopCallback) {
        mockLayout._layoutstopCallback()
      }

      expect(mockCy.animate).toHaveBeenCalled()
      expect(mockSavePositions).toHaveBeenCalled()
    })
  })

  describe('localRelax', () => {
    it('should relax only node and its neighbors', () => {
      const mockNode = {
        length: 1,
        neighborhood: vi.fn().mockReturnValue({
          add: vi.fn().mockReturnValue({
            layout: vi.fn().mockReturnValue({ run: vi.fn() }),
          }),
        }),
      }
      mockCy.getElementById.mockReturnValue(mockNode)
      const { localRelax } = createGraphLayout()

      localRelax(1)

      expect(mockCy.getElementById).toHaveBeenCalledWith('1')
      expect(mockNode.neighborhood).toHaveBeenCalled()
    })

    it('should restore zoom and pan after relax', () => {
      const mockNeighborhood = {
        layout: vi.fn().mockReturnValue({ run: vi.fn() }),
      }
      const mockNode = {
        length: 1,
        neighborhood: vi.fn().mockReturnValue({
          add: vi.fn().mockReturnValue(mockNeighborhood),
        }),
      }
      mockCy.getElementById.mockReturnValue(mockNode)
      mockCy.zoom.mockReturnValue(2)
      mockCy.pan.mockReturnValue({ x: 50, y: 50 })

      const { localRelax } = createGraphLayout()
      localRelax(1)

      vi.advanceTimersByTime(300)

      expect(mockCy.zoom).toHaveBeenCalledWith(2)
      expect(mockCy.pan).toHaveBeenCalledWith({ x: 50, y: 50 })
    })

    it('should handle missing node gracefully', () => {
      mockCy.getElementById.mockReturnValue({ length: 0 })
      const { localRelax } = createGraphLayout()

      expect(() => localRelax(999)).not.toThrow()
    })
  })

  describe('autoRelaxNewNodes', () => {
    it('should do nothing for empty array', () => {
      const { autoRelaxNewNodes } = createGraphLayout()

      autoRelaxNewNodes([])

      expect(mockCy.layout).not.toHaveBeenCalled()
    })

    it('should skip if continuous relax is running', () => {
      relaxLocked.value = true
      const { autoRelaxNewNodes } = createGraphLayout()

      autoRelaxNewNodes([1, 2])

      expect(mockCy.layout).not.toHaveBeenCalled()
    })
  })

  describe('continuous relax', () => {
    it('should start infinite cola layout', () => {
      const { startContinuousRelax } = createGraphLayout()

      startContinuousRelax()

      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.name).toBe('cola')
      expect(layoutCall.infinite).toBe(true)
    })

    it('should stop continuous layout', () => {
      const { startContinuousRelax, stopContinuousRelax } = createGraphLayout()

      startContinuousRelax()
      stopContinuousRelax()

      expect(mockLayout.stop).toHaveBeenCalled()
      expect(mockSavePositions).toHaveBeenCalled()
    })

    it('should restart continuous relax when locked', () => {
      relaxLocked.value = true
      const { startContinuousRelax, restartContinuousRelax } = createGraphLayout()

      startContinuousRelax()
      restartContinuousRelax()

      expect(mockLayout.stop).toHaveBeenCalled()
      expect(mockCy.layout).toHaveBeenCalledTimes(2)
    })

    it('should not restart when not locked', () => {
      relaxLocked.value = false
      const { restartContinuousRelax } = createGraphLayout()

      restartContinuousRelax()

      expect(mockCy.layout).not.toHaveBeenCalled()
    })
  })

  describe('handleRelaxClick', () => {
    it('should run relax once on single click', () => {
      const { handleRelaxClick } = createGraphLayout()

      handleRelaxClick()

      const layoutCall = mockCy.layout.mock.calls[0][0]
      expect(layoutCall.name).toBe('cola')
      expect(layoutCall.infinite).toBeUndefined()
    })

    it('should toggle continuous relax on double click', () => {
      const { handleRelaxClick } = createGraphLayout()

      handleRelaxClick()
      vi.advanceTimersByTime(100)
      handleRelaxClick()

      expect(relaxLocked.value).toBe(true)
    })

    it('should stop continuous relax on second double click', () => {
      relaxLocked.value = true
      const { handleRelaxClick, startContinuousRelax } = createGraphLayout()

      startContinuousRelax()

      handleRelaxClick()
      vi.advanceTimersByTime(100)
      handleRelaxClick()

      expect(relaxLocked.value).toBe(false)
      expect(mockLayout.stop).toHaveBeenCalled()
    })

    it('should not run relax when locked', () => {
      relaxLocked.value = true
      const { handleRelaxClick } = createGraphLayout()

      // Reset mock calls after setup
      mockCy.layout.mockClear()

      // Wait for double-click timeout
      vi.advanceTimersByTime(400)
      handleRelaxClick()

      // Should not run single relax when locked
      expect(mockCy.layout).not.toHaveBeenCalled()
    })
  })

  describe('fitView', () => {
    it('should call cy.fit with padding', () => {
      const { fitView } = createGraphLayout()

      fitView()

      expect(mockCy.fit).toHaveBeenCalledWith(50)
    })
  })

  describe('continuous fit', () => {
    it('should start interval for continuous fit', () => {
      const { startContinuousFit } = createGraphLayout()

      startContinuousFit()

      expect(mockCy.animate).toHaveBeenCalled()

      vi.advanceTimersByTime(300)
      expect(mockCy.animate).toHaveBeenCalledTimes(2)
    })

    it('should stop continuous fit', () => {
      const { startContinuousFit, stopContinuousFit } = createGraphLayout()

      startContinuousFit()
      mockCy.animate.mockClear()

      stopContinuousFit()
      vi.advanceTimersByTime(600)

      expect(mockCy.animate).not.toHaveBeenCalled()
    })
  })

  describe('handleFitClick', () => {
    it('should fit once on single click', () => {
      const { handleFitClick } = createGraphLayout()

      handleFitClick()

      expect(mockCy.fit).toHaveBeenCalledWith(50)
    })

    it('should toggle continuous fit on double click', () => {
      const { handleFitClick } = createGraphLayout()

      handleFitClick()
      vi.advanceTimersByTime(100)
      handleFitClick()

      expect(fitLocked.value).toBe(true)
    })

    it('should not fit when locked', () => {
      fitLocked.value = true
      const { handleFitClick } = createGraphLayout()

      vi.advanceTimersByTime(400)
      handleFitClick()

      expect(mockCy.fit).not.toHaveBeenCalled()
    })
  })

  describe('cleanup', () => {
    it('should stop continuous relax and fit', () => {
      const { startContinuousRelax, startContinuousFit, cleanup } = createGraphLayout()

      startContinuousRelax()
      startContinuousFit()

      cleanup()

      expect(mockLayout.stop).toHaveBeenCalled()
      // Continuous fit interval should be cleared
      mockCy.animate.mockClear()
      vi.advanceTimersByTime(600)
      expect(mockCy.animate).not.toHaveBeenCalled()
    })
  })

  describe('continuous layout edge length function', () => {
    it('should calculate edge length based on node count and dimensions', () => {
      const edgeLengthFn = LAYOUTS.continuous.edgeLength

      const mockEdge = {
        cy: () => ({ nodes: () => ({ length: 60 }) }),
        source: () => ({ degree: () => 3, width: () => 100, height: () => 50 }),
        target: () => ({ degree: () => 5, width: () => 100, height: () => 50 }),
      }

      const length = edgeLengthFn(mockEdge)

      // Edge length now considers node dimensions
      // Should be greater than base (accounts for node sizes)
      expect(length).toBeGreaterThan(50)
    })

    it('should use different base for large graphs', () => {
      const edgeLengthFn = LAYOUTS.continuous.edgeLength

      const mockEdge = {
        cy: () => ({ nodes: () => ({ length: 150 }) }),
        source: () => ({ degree: () => 2, width: () => 100, height: () => 50 }),
        target: () => ({ degree: () => 2, width: () => 100, height: () => 50 }),
      }

      const length = edgeLengthFn(mockEdge)

      // Edge length now considers node dimensions
      // base 60 + degree contribution + dimension contribution
      expect(length).toBeGreaterThan(60)
    })
  })

  describe('continuous layout node spacing function', () => {
    it('should return correct spacing based on node dimensions', () => {
      const nodeSpacingFn = LAYOUTS.continuous.nodeSpacing

      // Node spacing now based on actual node dimensions
      const mockNode = {
        cy: () => ({ nodes: () => ({ length: 50 }) }),
        width: () => 100,
        height: () => 50,
      }

      const spacing = nodeSpacingFn(mockNode)

      // Should return spacing based on node size (max dimension / 2 + base)
      expect(spacing).toBeGreaterThan(0)
    })
  })
})
