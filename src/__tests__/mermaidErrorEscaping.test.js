import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

/**
 * A mermaid block that fails to render puts its own source on screen. That
 * source is note text, already decoded out of the sanitized HTML, so it must
 * be written as text. Writing it with innerHTML re-introduced markup that
 * DOMPurify had already removed, after sanitization had run, which in Electron
 * means script with the preload API in reach.
 */

const renderMock = vi.fn()
vi.mock('mermaid', () => ({
  default: { initialize: vi.fn(), render: (...a) => renderMock(...a) },
}))

const PAYLOAD = 'graph TD</pre><img src=x onerror="globalThis.__pwned = true">'

beforeEach(() => {
  renderMock.mockReset()
  delete globalThis.__pwned
})

async function renderNote(content) {
  const MarkdownRenderer = (await import('../components/MarkdownRenderer.vue')).default
  const w = mount(MarkdownRenderer, { props: { content }, attachTo: document.body })
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await w.vm.$nextTick()
  return w
}

describe('a mermaid block that fails to render', () => {
  it('shows its source as text instead of injecting it as markup', async () => {
    renderMock.mockRejectedValue(new Error('Parse error'))
    const w = await renderNote('```mermaid\n' + PAYLOAD + '\n```')

    expect(w.element.querySelector('img')).toBeNull()
    expect(globalThis.__pwned).toBeUndefined()
    // The source is still shown to the user, as text.
    expect(w.text()).toContain('onerror')
    expect(w.text()).toContain('Parse error')
  })

  it('does not inject markup carried in the error message either', async () => {
    renderMock.mockRejectedValue(new Error('bad token <img src=y onerror="globalThis.__pwned = true">'))
    const w = await renderNote('```mermaid\ngraph TD\n```')

    expect(w.element.querySelector('img')).toBeNull()
    expect(globalThis.__pwned).toBeUndefined()
  })

  it('still renders a diagram that succeeds', async () => {
    renderMock.mockResolvedValue({ svg: '<svg id="ok"></svg>' })
    const w = await renderNote('```mermaid\ngraph TD\n```')

    expect(w.element.querySelector('svg')).not.toBeNull()
  })
})

/**
 * mermaid's securityLevel is what sanitizes the SVG it generates and disables
 * HTML labels in it. Its default is 'strict', but dependabot auto-merges minor
 * and patch bumps here, so the value is pinned in source rather than inherited.
 */
describe('the mermaid security level', () => {
  it('is pinned to strict in the component', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const source = readFileSync(join(__dirname, '../components/MarkdownRenderer.vue'), 'utf-8')
    expect(source).toMatch(/securityLevel:\s*'strict'/)
  })
})
