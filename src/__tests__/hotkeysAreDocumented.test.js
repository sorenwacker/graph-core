import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { shortcuts } from '../utils/keyboardShortcuts.js'

/**
 * Every hotkey the app binds has to be explained in the shortcuts list the `?`
 * modal renders. A binding that is not listed is undiscoverable: quick capture
 * shipped in 1.16.0 with a global hotkey that appeared nowhere in the modal,
 * and so did view switching and `?` itself.
 *
 * The gate reads the three places hotkeys are actually bound rather than a list
 * maintained by hand, so a new binding fails this test until it is documented.
 */

const here = dirname(fileURLToPath(import.meta.url))
const read = p => readFileSync(join(here, p), 'utf-8')

const MENU = read('../../electron/main.js')
const GLOBAL = read('../../electron/quickCapture.js')
const RENDERER = read('../composables/useKeyboardShortcuts.js')

/** Reduce a key to a comparable token: case and naming differences removed. */
function canonical(key) {
  // Space is a real binding (`e.key === ' '`), so match it before trimming
  // would turn it into an empty string.
  if (key === ' ') return 'space'
  const k = String(key).trim().toLowerCase()
  const aliases = {
    '{modifier}': 'mod',
    cmdorctrl: 'mod',
    commandorcontrol: 'mod',
    cmd: 'mod',
    ctrl: 'mod',
    '{shift}': 'shift',
    '{option}': 'alt',
    option: 'alt',
    alt: 'alt',
    '{delete}': 'delete',
    backspace: 'delete',
    del: 'delete',
    esc: 'escape',
    ' ': 'space',
    spacebar: 'space',
  }
  return aliases[k] ?? k
}

/** The set of every key token named anywhere in the documented list. */
const documentedTokens = new Set(
  Object.values(shortcuts)
    .flat()
    .flatMap(s => s.keys.map(canonical))
)

/** Accelerators are combinations; compare them as sorted token sets. */
const documentedCombos = new Set(
  Object.values(shortcuts)
    .flat()
    .map(s => s.keys.map(canonical).sort().join('+'))
)

const combo = accelerator => accelerator.split('+').map(canonical).sort().join('+')

describe('menu accelerators', () => {
  const accelerators = [...MENU.matchAll(/accelerator:\s*'([^']+)'/g)].map(m => m[1])

  it('finds the accelerators to check', () => {
    expect(accelerators.length).toBeGreaterThan(0)
  })

  it.each(accelerators)('%s is explained in the shortcuts list', accelerator => {
    expect(documentedCombos).toContain(combo(accelerator))
  })
})

describe('the global quick-capture hotkey', () => {
  const fallback = GLOBAL.match(/DEFAULT_ACCELERATOR\s*=\s*'([^']+)'/)?.[1]

  it('has a default to check', () => {
    expect(fallback).toBeTruthy()
  })

  it('is explained in the shortcuts list', () => {
    // It fires while another app has focus, so it is the one hotkey a user
    // cannot discover by poking around inside this window.
    expect(documentedCombos).toContain(combo(fallback))
  })
})

describe('keys handled in the renderer', () => {
  // Keys the handler consumes without them being shortcuts to advertise.
  const NOT_ADVERTISED = new Set([
    'arrowup',
    'arrowdown',
    'arrowleft',
    'arrowright', // listed as a group ("Navigate items"), not per-arrow
    'escape', // listed as Esc
    'a', // listed as Select all
    'z',
    'y',
    'k',
    'n', // listed with their modifiers
    'enter',
    'tab',
    'space',
    'delete',
  ])

  const handled = [...RENDERER.matchAll(/e\.key(?:\.toLowerCase\(\))? === '([^']+)'/g)]
    .map(m => canonical(m[1]))
    .filter(k => !NOT_ADVERTISED.has(k))

  it('finds the keys to check', () => {
    expect(RENDERER).toMatch(/e\.key/)
  })

  it.each([...new Set(handled)])('%s is explained in the shortcuts list', key => {
    expect(documentedTokens).toContain(key)
  })

  it('explains view switching, which is bound by a pattern rather than a literal', () => {
    // Matched as /^[0-9]$/ with a modifier, so it never appears as a literal.
    expect(RENDERER).toMatch(/\[0-9\]/)
    for (const digit of ['1', '2', '3', '4', '5', '6', '7']) {
      expect(documentedCombos).toContain(combo(`CmdOrCtrl+${digit}`))
    }
  })
})
