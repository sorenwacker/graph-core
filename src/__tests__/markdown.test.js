import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { renderMarkdown, renderMarkdownHtml } from '../utils/markdown.js'
import MarkdownRenderer from '../components/MarkdownRenderer.vue'

// Mermaid pulls in a heavy browser bundle; the tests below never render diagrams.
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg></svg>' }),
  },
}))

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

describe('MarkdownRenderer person mentions', () => {
  async function render(content) {
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    await flushPromises()
    return wrapper
  }

  it('renders @[Name](person:id) mentions as chips that survive sanitization', async () => {
    const wrapper = await render('Hello @[Jane Doe](person:12)!')
    const chip = wrapper.find('.person-mention')
    expect(chip.exists()).toBe(true)
    expect(chip.attributes('data-person-id')).toBe('12')
    expect(chip.text()).toBe('@Jane Doe')
    // No stray mention syntax or dead link left behind
    expect(wrapper.html()).not.toContain('person:12')
    expect(wrapper.find('a').exists()).toBe(false)
  })

  it('renders bare [Name](person:id) links as mention chips too', async () => {
    const wrapper = await render('Ask [Bob](person:7) about it')
    const chip = wrapper.find('.person-mention')
    expect(chip.exists()).toBe(true)
    expect(chip.attributes('data-person-id')).toBe('7')
    expect(chip.text()).toBe('@Bob')
  })

  it('escapes markup in a mention name', async () => {
    const wrapper = await render('@[<img src=x onerror=alert(1)>](person:3)')
    const chip = wrapper.find('.person-mention')
    expect(chip.exists()).toBe(true)
    expect(chip.find('img').exists()).toBe(false)
    expect(chip.text()).toContain('<img')
  })

  it('leaves regular external links alone', async () => {
    const wrapper = await render('See [docs](https://example.com)')
    const link = wrapper.find('a')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://example.com')
    expect(wrapper.find('.person-mention').exists()).toBe(false)
  })
})

describe('MarkdownRenderer hashtags', () => {
  async function render(content) {
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    await flushPromises()
    return wrapper
  }

  it('styles a real hashtag as a chip', async () => {
    const wrapper = await render('Ship it #project soon')
    const tags = wrapper.findAll('.hashtag')
    expect(tags).toHaveLength(1)
    expect(tags[0].text()).toBe('#project')
    expect(wrapper.text()).toContain('Ship it #project soon')
  })

  it('styles multiple hashtags including hyphenated ones', async () => {
    const wrapper = await render('#alpha and #multi-word-tag')
    expect(wrapper.findAll('.hashtag').map(t => t.text())).toEqual(['#alpha', '#multi-word-tag'])
  })

  it('does not treat a mid-word # as a hashtag', async () => {
    const wrapper = await render('issue foo#42 here')
    expect(wrapper.find('.hashtag').exists()).toBe(false)
  })

  it('does not style hashtags inside code or links', async () => {
    const wrapper = await render('`#include <stdio.h>` and [#anchor](https://example.com/#top)')
    expect(wrapper.find('.hashtag').exists()).toBe(false)
    expect(wrapper.find('code').text()).toBe('#include <stdio.h>')
    expect(wrapper.find('a').text()).toBe('#anchor')
  })
})

// Regression: marked escapes ' as &#39;, and a regex over the serialized HTML
// matched the "#39" inside that entity, turning every apostrophe into a literal
// "&#39;" followed by a bogus #39 chip. Same for any other numeric entity.
describe('MarkdownRenderer entities are never mistaken for hashtags', () => {
  async function render(content) {
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    await flushPromises()
    return wrapper
  }

  it('leaves apostrophes in plain text alone', async () => {
    const wrapper = await render("Bob's meeting notes")
    expect(wrapper.text()).toBe("Bob's meeting notes")
    expect(wrapper.find('.hashtag').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('#39')
  })

  it('leaves apostrophes in inline code alone', async () => {
    const wrapper = await render("Use `don't` here")
    expect(wrapper.find('code').text()).toBe("don't")
    expect(wrapper.find('.hashtag').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('#39')
  })

  it('leaves apostrophes in a fenced code block alone', async () => {
    const wrapper = await render("```\nprint('hi')\n```")
    expect(wrapper.find('pre code').text()).toBe("print('hi')")
    expect(wrapper.find('.hashtag').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('#39')
  })

  it('leaves apostrophes in a mention name alone', async () => {
    const wrapper = await render("@[O'Brien](person:4) replied")
    const chip = wrapper.find('.person-mention')
    expect(chip.text()).toBe("@O'Brien")
    expect(wrapper.find('.hashtag').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('#39')
  })

  it('leaves other numeric character references alone', async () => {
    // Any &#NN; used to yield a #NN chip, not just the &#39; marked emits.
    const wrapper = await render('entities &#34; and &#96; stay literal')
    expect(wrapper.text()).toBe('entities " and ` stay literal')
    expect(wrapper.find('.hashtag').exists()).toBe(false)
  })

  it('keeps quotes and ampersands in plain text intact', async () => {
    const wrapper = await render('She said "hi" & left')
    expect(wrapper.text()).toBe('She said "hi" & left')
    expect(wrapper.find('.hashtag').exists()).toBe(false)
  })
})

describe('MarkdownRenderer code blocks keep escaped entities', () => {
  async function render(content) {
    const wrapper = mount(MarkdownRenderer, { props: { content } })
    await flushPromises()
    return wrapper
  }

  it('renders HTML in a fenced code block as literal text', async () => {
    const wrapper = await render('```\n<div>&amp;</div>\n```')
    const code = wrapper.find('pre code')
    expect(code.exists()).toBe(true)
    // The markup must stay text content, not become live elements
    expect(code.element.querySelector('div')).toBeNull()
    expect(code.text()).toBe('<div>&amp;</div>')
  })

  it('renders a script tag in inline code as literal text', async () => {
    const wrapper = await render('Use `<script>alert(1)</script>` carefully')
    const code = wrapper.find('code')
    expect(code.exists()).toBe(true)
    expect(code.text()).toBe('<script>alert(1)</script>')
    expect(wrapper.element.querySelector('script')).toBeNull()
  })
})
