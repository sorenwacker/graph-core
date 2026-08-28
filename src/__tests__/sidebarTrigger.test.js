import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * The unpinned sidebar's hover target runs from the upper third of the left
 * edge down to the bottom of the window. It is not the full edge: a full-height
 * trigger opened the sidebar on every incidental mouse pass past the title bar
 * of a non-fullscreen window.
 */

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../style.css'), 'utf-8')

function rule(selector) {
  const m = css.match(new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 's'))
  return m ? m[1] : null
}

describe('sidebar trigger geometry', () => {
  const trigger = rule('.sidebar-trigger')

  it('exists', () => {
    expect(trigger).not.toBeNull()
  })

  it('reaches the bottom of the window', () => {
    // Aiming at the middle of the screen to reveal the sidebar is awkward; the
    // bottom corner is a natural place to throw the pointer.
    expect(trigger).toMatch(/bottom:\s*0/)
  })

  it('leaves the top of the edge inert', () => {
    // The pointer travels past the title bar and window controls constantly,
    // and that is where a full-height trigger fired by accident.
    expect(trigger).toMatch(/top:\s*3[0-9]%/)
    expect(trigger).not.toMatch(/top:\s*0/)
  })

  it('shows a visible handle so the hover target is discoverable', () => {
    const handle = rule('.sidebar-trigger::after')
    expect(handle).not.toBeNull()
    expect(handle).toMatch(/background/)
  })

  it('marks the full active zone, leaving no invisible hit area', () => {
    // A bar smaller than the zone reads as the whole target; hovering the
    // unmarked rest of the zone then works "sometimes", which is worse than
    // marking it all.
    const handle = rule('.sidebar-trigger::after')
    expect(handle).toMatch(/height:\s*100%/)
  })

  it('brightens the handle on hover as feedback', () => {
    expect(rule('.sidebar-trigger:hover::after')).not.toBeNull()
  })
})
