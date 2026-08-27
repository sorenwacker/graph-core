import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { ownsTextInput } from '../utils/inputOwnership.js'

/**
 * utils/inputOwnership.js is the one place that decides whether a focused
 * surface owns keyboard input. useKeyboardShortcuts kept a second, private
 * version of that decision, and the two had already drifted: the private one
 * knew that a checkbox is not a text field, and the shared one knew about
 * select elements, CodeMirror and contenteditable ancestors. Which rule applied
 * depended on which key was pressed.
 */

const here = dirname(fileURLToPath(import.meta.url))

function el(html) {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host.firstElementChild
}

describe('the ownership rule lives in one place', () => {
  it('the shortcut handler defines no rule of its own', () => {
    const source = readFileSync(join(here, '../composables/useKeyboardShortcuts.js'), 'utf-8')
    expect(source).not.toMatch(/function isTextInput\b/)
  })
})

describe('ownsTextInput', () => {
  it('claims text-entry fields', () => {
    expect(ownsTextInput(el('<input type="text" />'))).toBe(true)
    expect(ownsTextInput(el('<textarea></textarea>'))).toBe(true)
    expect(ownsTextInput(el('<select><option>a</option></select>'))).toBe(true)
  })

  it('claims a contenteditable and anything inside one', () => {
    expect(ownsTextInput(el('<div contenteditable="true"></div>'))).toBe(true)
    expect(ownsTextInput(el('<div contenteditable="true"><span>x</span></div>').firstElementChild)).toBe(true)
  })

  it('claims a CodeMirror editor', () => {
    expect(ownsTextInput(el('<div class="cm-editor"><span>x</span></div>').firstElementChild)).toBe(true)
  })

  it('does not claim inputs that take no text', () => {
    // A checkbox has focus but types nothing, so Space and Enter shortcuts
    // still belong to the app. This is the rule the private copy had.
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'reset']) {
      expect(ownsTextInput(el(`<input type="${type}" />`))).toBe(false)
    }
  })

  it('does not claim ordinary elements', () => {
    expect(ownsTextInput(el('<div></div>'))).toBe(false)
    expect(ownsTextInput(null)).toBe(false)
  })
})
