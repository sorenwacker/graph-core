import { describe, it, expect } from 'vitest'
import { escapeHtml } from '../utils/html.js'
import { sanitizeHtml, renderMarkdown } from '../utils/markdown.js'
import { buildTooltipHTML } from '../utils/tooltip.js'

/**
 * HTML sanitization / escaping tests.
 *
 * Covers the XSS-prevention helpers and the rendering paths that feed user
 * content into v-html / innerHTML.
 */

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;')
  })

  it('neutralizes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).not.toContain('<script>')
  })
})

describe('sanitizeHtml', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeHtml('')).toBe('')
  })

  it('strips script tags', () => {
    expect(sanitizeHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>')
  })

  it('strips inline event handlers', () => {
    expect(sanitizeHtml('<img src=x onerror="alert(1)">')).not.toContain('onerror')
  })

  it('preserves safe markup', () => {
    const out = sanitizeHtml('<p><strong>bold</strong> <em>i</em></p>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>i</em>')
  })
})

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
  })

  it('renders markdown to HTML', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
  })

  it('strips a script smuggled through markdown', () => {
    expect(renderMarkdown('text\n\n<script>alert(1)</script>')).not.toContain('<script>')
  })

  it('drops javascript: URLs from links', () => {
    const out = renderMarkdown('[click](javascript:alert(1))')
    expect(out).not.toContain('javascript:')
  })
})

describe('buildTooltipHTML XSS', () => {
  it('escapes a malicious node title', () => {
    const html = buildTooltipHTML({ id: 1, type: 'task', title: '<img src=x onerror=alert(1)>' })
    expect(html).not.toContain('<img src=x onerror')
    expect(html).toContain('&lt;img')
  })

  it('escapes a malicious node type', () => {
    const html = buildTooltipHTML({ id: 1, type: '"><script>alert(1)</script>', title: 'x' })
    expect(html).not.toContain('<script>')
  })
})
