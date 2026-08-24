import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * The unpinned sidebar's hover target is a handle centered on the left edge,
 * not the full window edge. A full-height trigger opened the sidebar on every
 * incidental mouse pass along the edge of a non-fullscreen window.
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

  it('is vertically centered instead of spanning the full edge', () => {
    expect(trigger).toMatch(/top:\s*50%/)
    expect(trigger).toMatch(/translateY\(-50%\)/)
    expect(trigger).not.toMatch(/bottom:\s*0/)
  })

  it('has a bounded height so most of the edge stays inert', () => {
    // clamp keeps the zone usable on small windows without ever approaching
    // full height on large ones.
    expect(trigger).toMatch(/height:\s*clamp\(/)
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
