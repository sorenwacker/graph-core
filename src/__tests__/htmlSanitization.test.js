import { describe, it, expect, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { escapeHtml } from '../utils/html.js'
import { sanitizeHtml, renderMarkdown } from '../utils/markdown.js'
import { buildTooltipHTML } from '../utils/tooltip.js'
import { useGraphInit } from '../composables/useGraphInit.js'
import { useTableDrag } from '../composables/useTableDrag.js'

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

describe('graph node HTML template XSS', () => {
  // Capture the tpl function that setupHtmlLabels passes to cy.nodeHtmlLabel
  function getGraphTpl() {
    const init = useGraphInit({
      getContainer: () => null,
      getLayoutOptions: () => ({}),
      getProps: () => ({ hideSensitive: false, notesPreviewLength: 100 }),
      savePositions: vi.fn(),
      relaxLocked: ref(false),
      fitLocked: ref(false),
      layout: null,
    })
    const nodeHtmlLabel = vi.fn()
    init.setupHtmlLabels({ nodeHtmlLabel })
    return nodeHtmlLabel.mock.calls[0][0][0].tpl
  }

  it('escapes a malicious title in the person node template', () => {
    const tpl = getGraphTpl()
    const html = tpl({
      nodeData: { id: 1, type: 'person', title: '<script>alert(1)</script>' },
      isSelected: false,
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('escapes quotes in a person title', () => {
    const tpl = getGraphTpl()
    const html = tpl({
      nodeData: { id: 1, type: 'person', title: `"><img src=x onerror=alert(1)>'` },
      isSelected: false,
    })
    expect(html).not.toContain('<img')
    expect(html).toContain('&quot;&gt;&lt;img')
    expect(html).toContain('&#39;')
  })

  it('escapes a malicious title in the regular node template', () => {
    const tpl = getGraphTpl()
    const html = tpl({
      nodeData: { id: 2, type: 'task', title: '<script>alert(1)</script>"' },
      isSelected: false,
      showDetails: false,
      childCount: 0,
      hasChildren: false,
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('useTableDrag drag ghost XSS', () => {
  function startDrag(node) {
    const drag = useTableDrag({
      findNodeById: () => null,
      selectedIds: ref(new Set()),
      onMove: vi.fn(),
      onMoveMultiple: vi.fn(),
      onReorder: vi.fn(),
    })
    const cell = document.createElement('td')
    document.body.appendChild(cell)
    drag.onMouseDown({ target: cell, preventDefault: vi.fn(), clientX: 5, clientY: 5 }, node)
    return document.querySelector('.drag-ghost')
  }

  function endDrag() {
    // Removes the ghost and the document listeners registered by onMouseDown
    document.dispatchEvent(new MouseEvent('mouseup'))
    document.body.innerHTML = ''
  }

  afterEach(endDrag)

  it('renders a malicious title as text, not markup', () => {
    const ghost = startDrag({ id: 1, type: 'task', title: '<img src=x onerror=alert(1)>', color: '#123456' })
    expect(ghost).not.toBeNull()
    expect(ghost.querySelector('img')).toBeNull()
    expect(ghost.querySelector('.ghost-title').textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it('renders quotes and script tags in titles literally', () => {
    const title = `"'<script>alert(1)</script>`
    const ghost = startDrag({ id: 1, type: 'note', title, color: null })
    expect(ghost.querySelector('script')).toBeNull()
    expect(ghost.querySelector('.ghost-title').textContent).toBe(title)
  })

  it('rejects unsafe color strings and falls back to the default', () => {
    const unsafe = startDrag({
      id: 1,
      type: 'task',
      title: 't',
      color: 'red;background:url(javascript:alert(1))',
    })
    const unsafeBg = unsafe.querySelector('.ghost-type').style.background
    const unsafeStyle = unsafe.querySelector('.ghost-type').getAttribute('style') || ''
    endDrag()
    const none = startDrag({ id: 2, type: 'task', title: 't' })
    const defaultBg = none.querySelector('.ghost-type').style.background

    expect(unsafeStyle).not.toContain('url(')
    expect(unsafeBg).toBe(defaultBg)
  })

  it('accepts a plain hex color', () => {
    const ghost = startDrag({ id: 1, type: 'task', title: 't', color: '#a1b2c3' })
    const bg = ghost.querySelector('.ghost-type').style.background
    expect(bg).toBeTruthy()
    expect(bg).not.toBe('')
  })
})
