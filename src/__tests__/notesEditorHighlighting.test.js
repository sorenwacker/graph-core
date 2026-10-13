import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import NotesEditor from '../components/NotesEditor.vue'

/**
 * The Edit view shows Markdown source with syntax highlighting (docs/guides/
 * detail-panel.md, "Syntax highlighting in Edit and Split mode"). Markers get a
 * dimmed class, content inside them its own class, so "**Goals**" reads as
 * markup around a word rather than as four oddly styled asterisks. The editor
 * used to register no highlight style at all, so every character was plain.
 */

async function mountWith(doc) {
  const wrapper = mount(NotesEditor, {
    props: { modelValue: doc, workspaceId: 1, nodeId: 1 },
    attachTo: document.body,
  })
  await new Promise(resolve => setTimeout(resolve, 20))
  return wrapper
}

function texts(wrapper, selector) {
  return wrapper.element.querySelectorAll(selector).length
    ? [...wrapper.element.querySelectorAll(selector)].map(el => el.textContent)
    : []
}

describe('NotesEditor syntax highlighting', () => {
  it('dims the bold markers and emboldens the word between them', async () => {
    const wrapper = await mountWith('**Goals**')
    expect(texts(wrapper, '.md-marker')).toEqual(['**', '**'])
    // The markers inside bold text inherit md-strong too; content is what is left.
    expect(texts(wrapper, '.md-strong:not(.md-marker)')).toEqual(['Goals'])
    wrapper.unmount()
  })

  it('marks emphasis, headings, inline code and links', async () => {
    const wrapper = await mountWith('# Head\n*it* `c` [t](http://x.example.org)')
    expect(texts(wrapper, '.md-heading').join('')).toContain('Head')
    expect(texts(wrapper, '.md-emphasis:not(.md-marker)')).toEqual(['it'])
    expect(texts(wrapper, '.md-code:not(.md-marker)')).toEqual(['c'])
    expect(texts(wrapper, '.md-url')).toEqual(['http://x.example.org'])
    expect(texts(wrapper, '.md-marker')).toContain('#')
    wrapper.unmount()
  })

  it('declares the highlighter packages it imports as direct dependencies', () => {
    // Both arrive transitively through @codemirror/lang-markdown today; an
    // undeclared import breaks the moment that package drops them.
    const here = dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(readFileSync(join(here, '../../package.json'), 'utf-8'))
    expect(pkg.dependencies['@codemirror/language']).toMatch(/^\^6\./)
    expect(pkg.dependencies['@lezer/highlight']).toMatch(/^\^1\./)
  })
})
