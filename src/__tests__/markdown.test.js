import { describe, it, expect } from 'vitest'
import { renderMarkdown, renderMarkdownHtml } from '../utils/markdown.js'

/**
 * Markdown rendering tests.
 *
 * renderMarkdown renders full markdown for detail views.
 * renderMarkdownHtml renders a length-bounded preview for graph node cards
 * and must keep multi-line constructs (lists, headings, tables) intact.
 */

describe('renderMarkdown', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
  })

  it('renders inline markdown to HTML', () => {
    expect(renderMarkdown('**bold**')).toContain('<strong>bold</strong>')
  })
})

describe('renderMarkdownHtml', () => {
  it('returns empty string for empty input', () => {
    expect(renderMarkdownHtml('')).toBe('')
    expect(renderMarkdownHtml(null)).toBe('')
  })

  it('renders a multi-item list across newlines, not just the first item', () => {
    const html = renderMarkdownHtml('- first\n- second\n- third')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('<li>second</li>')
    expect(html).toContain('<li>third</li>')
  })

  it('renders a heading followed by body text', () => {
    const html = renderMarkdownHtml('# Title\n\nBody paragraph here')
    expect(html).toContain('Title')
    expect(html).toContain('Body paragraph here')
  })

  it('renders a markdown table', () => {
    const html = renderMarkdownHtml('| a | b |\n| - | - |\n| 1 | 2 |')
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('truncates the source to maxLen characters', () => {
    const long = 'x'.repeat(500)
    const html = renderMarkdownHtml(long, 100)
    // Rendered text should not contain more than the truncated length of x's.
    const xCount = (html.match(/x/g) || []).length
    expect(xCount).toBeLessThanOrEqual(100)
  })

  it('does not cut in the middle of a markdown link', () => {
    // Link starts before maxLen but its closing paren is past it.
    const text = 'see [the link](https://example.com/very/long/path/that/exceeds/limit)'
    const html = renderMarkdownHtml(text, 12)
    // Truncated before the dangling '[' so no broken anchor or literal '[' leaks.
    expect(html).not.toContain('href="https://example.com')
    expect(html).not.toContain('[the link]')
  })
})
