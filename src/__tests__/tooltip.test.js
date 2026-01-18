import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildTooltipHTML, tooltipOptions } from '../utils/tooltip.js'

/**
 * Tooltip Tests
 *
 * Tests for tooltip building and configuration:
 * - buildTooltipHTML generates correct HTML
 * - Sensitive content is hidden when hideSensitive is true
 * - Different node types display correctly
 */

describe('Tooltip Utils', () => {
  describe('buildTooltipHTML', () => {
    it('should return empty string for null node', () => {
      expect(buildTooltipHTML(null)).toBe('')
    })

    it('should include node title', () => {
      const node = { id: 1, title: 'Test Task', type: 'task' }
      const html = buildTooltipHTML(node)
      expect(html).toContain('Test Task')
    })

    it('should include node type badge', () => {
      const node = { id: 1, title: 'Test Task', type: 'task' }
      const html = buildTooltipHTML(node)
      expect(html).toContain('tt-type')
      expect(html).toContain('task')
    })

    it('should include checkbox for tasks when showCheckbox is true', () => {
      const node = { id: 1, title: 'Test Task', type: 'task' }
      const html = buildTooltipHTML(node, { showCheckbox: true })
      expect(html).toContain('type="checkbox"')
      expect(html).toContain('data-node-id="1"')
    })

    it('should not include checkbox when showCheckbox is false', () => {
      const node = { id: 1, title: 'Test Note', type: 'note' }
      const html = buildTooltipHTML(node, { showCheckbox: false })
      expect(html).not.toContain('type="checkbox"')
    })

    it('should show notes when present and not sensitive', () => {
      const node = { id: 1, title: 'Test', type: 'task', notes: 'Some notes here' }
      const html = buildTooltipHTML(node, { hideSensitive: false })
      expect(html).toContain('tt-notes')
    })

    it('should hide sensitive content when hideSensitive is true and node has notes_sensitive flag', () => {
      const node = { id: 1, title: 'Test', type: 'task', notes: 'Secret notes', notes_sensitive: true }
      const html = buildTooltipHTML(node, { hideSensitive: true })
      expect(html).toContain('Sensitive content hidden')
      expect(html).not.toContain('Secret notes')
    })

    it('should hide content with password keyword when hideSensitive is true', () => {
      const node = { id: 1, title: 'Test', type: 'task', notes: 'My password is secret123' }
      const html = buildTooltipHTML(node, { hideSensitive: true })
      expect(html).toContain('Sensitive content hidden')
      expect(html).not.toContain('secret123')
    })

    it('should hide content with api_key keyword when hideSensitive is true', () => {
      const node = { id: 1, title: 'Test', type: 'task', notes: 'api_key: abc123' }
      const html = buildTooltipHTML(node, { hideSensitive: true })
      expect(html).toContain('Sensitive content hidden')
      expect(html).not.toContain('abc123')
    })

    it('should show sensitive content when hideSensitive is false', () => {
      const node = { id: 1, title: 'Test', type: 'task', notes: 'My password is secret123', notes_sensitive: true }
      const html = buildTooltipHTML(node, { hideSensitive: false })
      expect(html).not.toContain('Sensitive content hidden')
    })

    // Detail button removed - now use Enter key to toggle details
    it('should include node-id data attribute for tasks', () => {
      const node = { id: 1, title: 'Test', type: 'task' }
      const html = buildTooltipHTML(node)
      expect(html).toContain('data-node-id="1"')
    })

    it('should include child count when present', () => {
      const node = { id: 1, title: 'Test', type: 'project', children: [{}, {}, {}] }
      const html = buildTooltipHTML(node)
      expect(html).toContain('3 items')
    })

    it('should include due date when present', () => {
      const node = { id: 1, title: 'Test', type: 'task', due_date: '2026-01-20' }
      const html = buildTooltipHTML(node)
      expect(html).toContain('Due:')
      expect(html).toContain('Jan')
    })

    it('should include importance label when present', () => {
      const node = { id: 1, title: 'Test', type: 'task', importance: 8 }
      const html = buildTooltipHTML(node)
      expect(html).toContain('tt-priority')
    })
  })

  describe('tooltipOptions', () => {
    it('should have allowHTML set to true', () => {
      expect(tooltipOptions.allowHTML).toBe(true)
    })

    it('should be interactive', () => {
      expect(tooltipOptions.interactive).toBe(true)
    })

    it('should have manual trigger', () => {
      expect(tooltipOptions.trigger).toBe('manual')
    })

    it('should have graph-tooltip theme', () => {
      expect(tooltipOptions.theme).toBe('graph-tooltip')
    })

    it('should have reasonable max width', () => {
      expect(tooltipOptions.maxWidth).toBe(400)
    })

    it('should have interactive border for easier interaction', () => {
      expect(tooltipOptions.interactiveBorder).toBe(20)
    })
  })
})
