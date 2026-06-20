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

  it('keeps a multi-line first block (no blank line) intact', () => {
    const html = renderMarkdownHtml('- first\n- second\n- third')
    expect(html).toContain('<li>first</li>')
    expect(html).toContain('<li>second</li>')
    expect(html).toContain('<li>third</li>')
  })

  it('cuts off at the first empty line', () => {
    const html = renderMarkdownHtml('Intro line one\nstill first block\n\nSecond paragraph')
    expect(html).toContain('Intro line one')
    expect(html).toContain('still first block')
    expect(html).not.toContain('Second paragraph')
  })

  it('treats a whitespace-only line as an empty line', () => {
    const html = renderMarkdownHtml('First block\n   \nDropped paragraph')
    expect(html).toContain('First block')
    expect(html).not.toContain('Dropped paragraph')
  })

  it('suppresses the preview entirely when the first line is empty', () => {
    expect(renderMarkdownHtml('\nHidden note text')).toBe('')
    expect(renderMarkdownHtml('\n\nHidden note text')).toBe('')
    expect(renderMarkdownHtml('   \nHidden note text')).toBe('')
  })

  it('recognizes a single empty line with CRLF line endings', () => {
    const html = renderMarkdownHtml('First block\r\n\r\nDropped paragraph')
    expect(html).toContain('First block')
    expect(html).not.toContain('Dropped paragraph')
  })

  it('keeps a leading fenced code block intact despite blank lines inside it', () => {
    const text = '```\nimport x\n\nclass Y:\n    z: str\n```\n\n## Dropped heading'
    const html = renderMarkdownHtml(text)
    expect(html).toContain('import x')
    expect(html).toContain('class Y:')
    expect(html).toContain('z: str')
    expect(html).not.toContain('Dropped heading')
  })

  it('truncates the first block to maxLen characters', () => {
    const long = 'x'.repeat(500)
    const html = renderMarkdownHtml(long, 100)
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
