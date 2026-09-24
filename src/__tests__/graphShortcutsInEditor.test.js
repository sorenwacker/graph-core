import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import GraphView from '../components/GraphView.vue'

/**
 * The graph's window-level shortcuts must stand down while the user is typing.
 * They guarded only INPUT and TEXTAREA, but the notes editor is CodeMirror
 * (contenteditable), so Cmd+Enter opened the add-node modal mid-sentence and
 * Cmd+Backspace deleted the selected graph node. The project already has one
 * rule for this decision in utils/inputOwnership.js.
 *
 * Cmd+Arrow navigation is not the graph's to handle: useKeyboardShortcuts binds
 * it for every view and calls the same goTo* functions App binds here, so the
 * graph's copy ran them a second time.
 */

let host

function editorTarget() {
  const el = document.createElement('div')
  el.className = 'cm-editor'
  const inner = document.createElement('div')
  el.appendChild(inner)
  host.appendChild(el)
  return inner
}

function press(target, key, opts = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true, ...opts }))
}

async function renderGraph() {
  const w = mount(GraphView, {
    props: { nodes: [{ id: 1, title: 'a', type: 'note' }] },
    attachTo: host,
    global: { plugins: [createPinia()] },
  })
  for (let i = 0; i < 20; i++) await Promise.resolve()
  await w.vm.$nextTick()
  return w
}

const modalVisible = w => w.findComponent({ name: 'AddNodeModal' }).props('visible')

let teleportTarget

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  // GraphView teleports its controls here; the target must exist before mount.
  teleportTarget = document.createElement('div')
  teleportTarget.id = 'view-controls-target'
  document.body.appendChild(teleportTarget)
})
afterEach(() => {
  host.remove()
  teleportTarget.remove()
})

describe('graph shortcuts while typing in the notes editor', () => {
  it('does not open the add-node modal on Cmd+Enter inside the editor', async () => {
    const w = await renderGraph()
    press(editorTarget(), 'Enter')
    await w.vm.$nextTick()

    expect(modalVisible(w)).toBe(false)
    w.unmount()
  })

  it('still opens it on Cmd+Enter outside any editor', async () => {
    const w = await renderGraph()
    press(document.body, 'Enter')
    await w.vm.$nextTick()

    expect(modalVisible(w)).toBe(true)
    w.unmount()
  })
})

describe('Cmd+Arrow navigation', () => {
  it('is left to the app-wide handler, so the graph emits nothing', async () => {
    const w = await renderGraph()
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) press(document.body, key)
    await w.vm.$nextTick()

    for (const e of ['go-parent', 'go-first-child', 'go-prev-sibling', 'go-next-sibling']) {
      expect(w.emitted(e), `${e} was emitted a second time`).toBeUndefined()
    }
    w.unmount()
  })
})

describe('the ownership rule', () => {
  it('is the shared one, not a local tagName check', async () => {
    const { readFileSync } = await import('fs')
    const { join } = await import('path')
    const source = readFileSync(join(__dirname, '../components/GraphView.vue'), 'utf-8')

    expect(source).toMatch(/ownsTextInput/)
    expect(source).not.toMatch(/\['INPUT', 'TEXTAREA'\]/)
  })
})
