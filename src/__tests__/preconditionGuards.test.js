import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * A control that can fail must know, before it is offered, whether it can
 * succeed. Marking a note sensitive encrypts it, so any surface offering that
 * flag needs the sensitive-notes session state - not a property of the note.
 *
 * The graph edit modal offered the flag with no guard at all and reached the
 * same failing write as the detail panel, so guarding one surface only moved
 * the error. See docs/contributing/standards.md.
 */

const componentsDir = join(dirname(fileURLToPath(import.meta.url)), '../components')

/** Every .vue file under src/components, recursively. */
function componentFiles(dir = componentsDir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return componentFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

/** Components that let the user change a node's sensitivity flag. */
function surfacesTogglingSensitivity() {
  return componentFiles().filter(path => {
    const source = readFileSync(path, 'utf-8')
    return /updateField\('notes_sensitive'|notes_sensitive\s*=(?!=)/.test(source)
  })
}

describe("surfaces that toggle a note's sensitivity", () => {
  it('are found at all, so the gate cannot pass by matching nothing', () => {
    expect(surfacesTogglingSensitivity().length).toBeGreaterThan(0)
  })

  it('consult the sensitive-notes session before offering the control', () => {
    const unguarded = surfacesTogglingSensitivity().filter(path => {
      const source = readFileSync(path, 'utf-8')
      const readsSession = source.includes('useSensitiveNotes')
      const checksUnlocked = /unlocked/.test(source)
      return !(readsSession && checksUnlocked)
    })

    expect(unguarded.map(p => p.split('/').pop())).toEqual([])
  })
})
