import { describe, it, expect, vi } from 'vitest'
import {
  handleNodeHover,
  handleNodeClick,
  handleNodeDoubleClick,
  handleKeydown,
  shouldShowTooltip
} from '../utils/nodeInteractions.js'

/**
 * Node Interaction Tests
 *
 * Based on docs/INTERACTIONS.md:
 * - Hover: Light select (updates detail panel if open)
 * - Click: Select + open detail panel
 * - Double-click: Navigate into node
 * - Cmd/Ctrl + Click: Add child node
 * - Option + Cmd/Ctrl + Click: Delete node
 * - Shift + Click: Range select
 * - Enter: Toggle detail panel
 */

describe('Node Interactions', () => {
  const mockNode = { id: 1, title: 'Test Node', type: 'project' }

  describe('Hover (Light Select)', () => {
    it('should call onHover when hovering', () => {
      const callbacks = { onHover: vi.fn() }

      handleNodeHover(mockNode, callbacks)

      expect(callbacks.onHover).toHaveBeenCalledWith(mockNode)
    })
  })

  describe('Click (Select + Open Detail)', () => {
    it('should call onSelect for plain click', () => {
      const callbacks = { onSelect: vi.fn() }
      const event = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onSelect).toHaveBeenCalledWith(mockNode)
    })

    it('should NOT call onAddChild for plain click', () => {
      const callbacks = { onSelect: vi.fn(), onAddChild: vi.fn() }
      const event = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onAddChild).not.toHaveBeenCalled()
    })
  })

  describe('Double-click (Navigate)', () => {
    it('should call onNavigate for double-click', () => {
      const callbacks = { onNavigate: vi.fn() }

      handleNodeDoubleClick(mockNode, callbacks)

      expect(callbacks.onNavigate).toHaveBeenCalledWith(mockNode)
    })
  })

  describe('Cmd/Ctrl + Click (Add Child)', () => {
    it('should call onAddChild for Ctrl+click', () => {
      const callbacks = { onAddChild: vi.fn() }
      const event = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onAddChild).toHaveBeenCalledWith(mockNode)
    })

    it('should call onAddChild for Cmd+click (macOS)', () => {
      const callbacks = { onAddChild: vi.fn() }
      const event = { ctrlKey: false, metaKey: true, shiftKey: false, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onAddChild).toHaveBeenCalledWith(mockNode)
    })

    it('should NOT call onSelect for Ctrl+click', () => {
      const callbacks = { onSelect: vi.fn(), onAddChild: vi.fn() }
      const event = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onSelect).not.toHaveBeenCalled()
    })
  })

  describe('Option + Cmd/Ctrl + Click (Delete)', () => {
    it('should call onDelete for Option+Ctrl+click', () => {
      const callbacks = { onDelete: vi.fn() }
      const event = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: true }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onDelete).toHaveBeenCalledWith(mockNode)
    })

    it('should call onDelete for Option+Cmd+click (macOS)', () => {
      const callbacks = { onDelete: vi.fn() }
      const event = { ctrlKey: false, metaKey: true, shiftKey: false, altKey: true }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onDelete).toHaveBeenCalledWith(mockNode)
    })

    it('should NOT call onAddChild for Option+Cmd+click', () => {
      const callbacks = { onAddChild: vi.fn(), onDelete: vi.fn() }
      const event = { ctrlKey: false, metaKey: true, shiftKey: false, altKey: true }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onAddChild).not.toHaveBeenCalled()
    })
  })

  describe('Shift + Click (Range select)', () => {
    it('should call onMultiSelect with range:true for Shift+click', () => {
      const callbacks = { onMultiSelect: vi.fn() }
      const event = { ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onMultiSelect).toHaveBeenCalledWith(mockNode, { range: true })
    })

    it('should NOT call onSelect for Shift+click', () => {
      const callbacks = { onSelect: vi.fn(), onMultiSelect: vi.fn() }
      const event = { ctrlKey: false, metaKey: false, shiftKey: true, altKey: false }

      handleNodeClick(event, mockNode, callbacks)

      expect(callbacks.onSelect).not.toHaveBeenCalled()
    })
  })

  describe('Enter key (Toggle Details)', () => {
    it('should call onToggleDetails when Enter is pressed', () => {
      const callbacks = { onToggleDetails: vi.fn() }
      const event = { key: 'Enter' }

      handleKeydown(event, callbacks)

      expect(callbacks.onToggleDetails).toHaveBeenCalled()
    })

    it('should NOT call onToggleDetails for other keys', () => {
      const callbacks = { onToggleDetails: vi.fn() }
      const event = { key: 'Space' }

      handleKeydown(event, callbacks)

      expect(callbacks.onToggleDetails).not.toHaveBeenCalled()
    })
  })

  describe('Tooltip visibility', () => {
    it('should show tooltip when detail panel is closed', () => {
      expect(shouldShowTooltip(false)).toBe(true)
    })

    it('should hide tooltip when detail panel is open', () => {
      expect(shouldShowTooltip(true)).toBe(false)
    })
  })
})
