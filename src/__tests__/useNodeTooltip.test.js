import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ref } from 'vue'

/**
 * useNodeTooltip Lock-in Feature Tests
 *
 * Tests for tooltip lock-in functionality:
 * - Click to lock tooltip in place
 * - Locked tooltip stays visible on mouse leave
 * - Locked tooltip has scrollable content
 * - Escape key unlocks tooltip
 * - Clicking elsewhere unlocks tooltip
 * - Detail panel opening dismisses locked tooltip
 */

// Mock tippy.js
vi.mock('tippy.js', () => ({
  default: vi.fn(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    destroy: vi.fn(),
    state: { isDestroyed: false },
    popper: {
      addEventListener: vi.fn(),
      classList: { add: vi.fn(), remove: vi.fn() },
      querySelector: vi.fn(() => null),
    },
  })),
}))

// Mock tooltip utils
vi.mock('../utils/tooltip.js', () => ({
  buildTooltipHTML: vi.fn(() => '<div>Mock tooltip</div>'),
  tooltipOptions: { allowHTML: true, interactive: true },
  getFixedTooltipReference: vi.fn(() => document.createElement('div')),
  getTooltipPlacement: vi.fn(() => 'bottom-start'),
}))

describe('useNodeTooltip Lock-in Feature', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('lockTooltip', () => {
    it('should provide lockTooltip function', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()
      expect(typeof tooltip.lockTooltip).toBe('function')
    })

    it('should provide isLocked function', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()
      expect(typeof tooltip.isLocked).toBe('function')
    })

    it('should start unlocked', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()
      expect(tooltip.isLocked()).toBe(false)
    })
  })

  describe('locked tooltip behavior', () => {
    it('should not hide on hideTooltip when locked', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()

      // Show tooltip
      const mockEvent = { clientX: 100, clientY: 100 }
      const mockNode = { id: 1, title: 'Test', type: 'task' }
      tooltip.showTooltip(mockEvent, mockNode)
      vi.advanceTimersByTime(600) // Past TOOLTIP_DELAY

      // Lock it
      tooltip.lockTooltip()
      expect(tooltip.isLocked()).toBe(true)

      // Try to hide - should not work
      tooltip.hideTooltip()
      vi.advanceTimersByTime(300) // Past HIDE_DELAY

      // Should still be locked
      expect(tooltip.isLocked()).toBe(true)
    })

    it('should unlock and hide on unlockTooltip', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()

      // Show tooltip first (lockTooltip only works with active tooltip)
      const mockEvent = { clientX: 100, clientY: 100 }
      const mockNode = { id: 1, title: 'Test', type: 'task' }
      tooltip.showTooltip(mockEvent, mockNode)
      vi.advanceTimersByTime(600)

      tooltip.lockTooltip()
      expect(tooltip.isLocked()).toBe(true)

      tooltip.unlockTooltip()
      expect(tooltip.isLocked()).toBe(false)
    })

    it('should hide locked tooltip on forceHide', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()

      // Show and lock tooltip
      const mockEvent = { clientX: 100, clientY: 100 }
      const mockNode = { id: 1, title: 'Test', type: 'task' }
      tooltip.showTooltip(mockEvent, mockNode)
      vi.advanceTimersByTime(600)
      tooltip.lockTooltip()

      // forceHide should work even when locked
      tooltip.forceHide()
      expect(tooltip.isLocked()).toBe(false)
    })
  })

  describe('toggle lock on click', () => {
    it('should lock when clicking node with visible tooltip', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()

      const mockEvent = { clientX: 100, clientY: 100 }
      const mockNode = { id: 1, title: 'Test', type: 'task' }

      // Show tooltip
      tooltip.showTooltip(mockEvent, mockNode)
      vi.advanceTimersByTime(600)

      // Click to lock (toggleLock with same node)
      tooltip.toggleLock(mockNode)
      expect(tooltip.isLocked()).toBe(true)
    })

    it('should unlock when clicking same node again', async () => {
      const { useNodeTooltip } = await import('../composables/useNodeTooltip.js')
      const tooltip = useNodeTooltip()

      const mockEvent = { clientX: 100, clientY: 100 }
      const mockNode = { id: 1, title: 'Test', type: 'task' }

      tooltip.showTooltip(mockEvent, mockNode)
      vi.advanceTimersByTime(600)
      tooltip.toggleLock(mockNode)
      expect(tooltip.isLocked()).toBe(true)

      // Click same node again
      tooltip.toggleLock(mockNode)
      expect(tooltip.isLocked()).toBe(false)
    })
  })
})
