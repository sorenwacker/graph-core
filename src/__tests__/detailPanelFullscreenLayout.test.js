import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

/**
 * In fullscreen and detached mode the bottom sections lay out side by side:
 * the table takes the full row, Children and Metadata share the next one.
 *
 * The base `.bottom-sections` rule stacks them with `flex-direction: column`.
 * The fullscreen override re-declares `display: flex` and `flex-wrap: wrap`,
 * but a wrap-enabled column container still stacks: `flex: 1 1 30%` becomes a
 * height basis, the sections shrink to their `min-width`, and the rest of the
 * window stays empty. The override has to reset the direction explicitly.
 */

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../components/DetailPanel.css'), 'utf-8')

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = css.match(new RegExp('^' + escaped + '\\s*\\{([^}]*)\\}', 'ms'))
  return m ? m[1] : null
}

describe('DetailPanel fullscreen bottom-sections layout', () => {
  const base = rule('.bottom-sections')
  const fullscreen = rule('.detail-panel.fullscreen .bottom-sections')

  it('stacks the sections in the narrow side panel', () => {
    expect(base).not.toBeNull()
    expect(base).toMatch(/flex-direction:\s*column/)
  })

  it('lays the sections out in a row in fullscreen mode', () => {
    expect(fullscreen).not.toBeNull()
    expect(fullscreen).toMatch(/flex-direction:\s*row/)
  })

  it('wraps so children and metadata share the row below the table', () => {
    expect(fullscreen).toMatch(/flex-wrap:\s*wrap/)
  })

  it('gives children and metadata a width basis that can share a row', () => {
    const shared = rule(
      '.detail-panel.fullscreen .children-section:not(.collapsed),\n.detail-panel.fullscreen .meta-section:not(.collapsed)'
    )
    expect(shared).not.toBeNull()
    expect(shared).toMatch(/flex:\s*1\s+1\s+\d+%/)
  })
})
