import { describe, it, expect } from 'vitest'
import { ownsTextInput, ownsAllKeys } from '../utils/inputOwnership.js'

/**
 * The input-ownership model decides, for a key event, whether a focused surface
 * owns keyboard input so the global shortcuts stand down. It replaces the
 * scattered isEditableElement / isSelfManagedKeySurface checks with one place,
 * and lets a surface opt in declaratively with data-owns-keys rather than by
 * being hardcoded in the global handler.
 */

function el(html) {
  const container = document.createElement('div')
  container.innerHTML = html
  document.body.appendChild(container)
  return container
}

describe('ownsTextInput', () => {
  it('is true for form text inputs, textareas, selects, and contenteditable', () => {
    const c = el(`
      <input id="i" />
      <textarea id="t"></textarea>
      <select id="s"></select>
      <div id="ce" contenteditable="true"></div>
    `)
    for (const id of ['i', 't', 's', 'ce']) {
      expect(ownsTextInput(c.querySelector('#' + id)), id).toBe(true)
    }
  })

  it('is true inside a CodeMirror editor', () => {
    const c = el('<div class="cm-editor"><span id="x">a</span></div>')
    expect(ownsTextInput(c.querySelector('#x'))).toBe(true)
  })

  it('is false for a plain element or button', () => {
    const c = el('<div id="d"></div><button id="b"></button>')
    expect(ownsTextInput(c.querySelector('#d'))).toBe(false)
    expect(ownsTextInput(c.querySelector('#b'))).toBe(false)
  })

  it('handles null safely', () => {
    expect(ownsTextInput(null)).toBe(false)
  })
})

describe('ownsAllKeys', () => {
  it('is true inside a surface that declares data-owns-keys', () => {
    const c = el('<div data-owns-keys><div id="inner"></div></div>')
    expect(ownsAllKeys(c.querySelector('#inner'))).toBe(true)
  })

  it('is false outside any owning surface', () => {
    const c = el('<div id="d"></div>')
    expect(ownsAllKeys(c.querySelector('#d'))).toBe(false)
  })

  it('handles null safely', () => {
    expect(ownsAllKeys(null)).toBe(false)
  })
})
