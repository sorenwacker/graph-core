import { describe, it, expect } from 'vitest'
import { colaSpacingOptions, useGraphLayout } from '../composables/useGraphLayout'
import { RADIAL_DEFAULTS } from '../utils/uiConstants'

/**
 * Relax runs cola, which has no repulsion force. Its only spacing controls are
 * `nodeSpacing` - padding on each node's bounding box, consumed by overlap
 * avoidance - and `edgeLength`. Padding alone reads as vertical-only spread,
 * because nodes are much wider than tall and so overlap vertically long before
 * they overlap horizontally. See docs/guides/views.md.
 */

const settings = over => ({
  nodeRepulsion: RADIAL_DEFAULTS.repulsion,
  edgeLength: RADIAL_DEFAULTS.edgeLength,
  gravity: RADIAL_DEFAULTS.gravity,
  ...over,
})

describe('cola spacing derived from the repulsion setting', () => {
  it('lengthens edges as repulsion rises, which is what spreads nodes sideways', () => {
    const low = colaSpacingOptions(settings({ nodeRepulsion: 2000 }))
    const high = colaSpacingOptions(settings({ nodeRepulsion: 9000 }))

    expect(high.edgeLength).toBeGreaterThan(low.edgeLength)
  })

  it('still widens node padding as repulsion rises', () => {
    const low = colaSpacingOptions(settings({ nodeRepulsion: 2000 }))
    const high = colaSpacingOptions(settings({ nodeRepulsion: 9000 }))

    expect(high.nodeSpacing).toBeGreaterThan(low.nodeSpacing)
  })

  it('leaves the edge length alone at the default repulsion', () => {
    // The Edge Length slider must mean what it says at the neutral point, or
    // the two controls fight each other.
    const { edgeLength } = colaSpacingOptions(settings({ gravity: 0 }))

    expect(edgeLength).toBe(RADIAL_DEFAULTS.edgeLength)
  })

  it('never returns a degenerate value for empty settings', () => {
    const { nodeSpacing, edgeLength } = colaSpacingOptions({})

    expect(nodeSpacing).toBeGreaterThanOrEqual(5)
    expect(edgeLength).toBeGreaterThanOrEqual(20)
  })
})

/**
 * The derivation is only worth anything if both relax paths actually use it.
 * They each computed their own spacing before, and disagreed: the single pass
 * damped edge length by gravity and the continuous one did not.
 */
function fakeCy(captured) {
  const layout = { on: () => {}, run: () => {} }
  return {
    zoom: () => 1,
    batch: fn => fn(),
    nodes: () => ({ forEach: () => {} }),
    animate: () => {},
    layout: opts => {
      captured.push(opts)
      return layout
    },
  }
}

describe('both relax paths', () => {
  const radial = settings({ nodeRepulsion: 9000, edgeLength: 220, gravity: 5000 })

  function optionsFrom(run) {
    const captured = []
    const layout = useGraphLayout({
      getCy: () => fakeCy(captured),
      getLayoutMode: () => 'radial',
      getRadialSettings: () => radial,
    })
    run(layout)
    return captured.find(o => o.name === 'cola')
  }

  it('space the single pass by the shared derivation', () => {
    const opts = optionsFrom(l => l.relaxLayout())
    const expected = colaSpacingOptions(radial)

    expect(opts.nodeSpacing).toBe(expected.nodeSpacing)
    expect(opts.edgeLength).toBe(expected.edgeLength)
  })

  it('space continuous relax identically, rather than from its own arithmetic', () => {
    const single = optionsFrom(l => l.relaxLayout())
    const continuous = optionsFrom(l => l.startContinuousRelax())

    expect(continuous.nodeSpacing).toBe(single.nodeSpacing)
    expect(continuous.edgeLength).toBe(single.edgeLength)
  })
})
