import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchLinkedNodes } from '../composables/useGraphElements.js'

/**
 * A node linked from outside the current container is added to the graph by
 * its own code path. That path left out the flag that says the graph is
 * showing note previews, so a linked node showed its title only, whatever its
 * notes held (docs/guides/linking.md, "In Graph View").
 */

vi.mock('../services/api', () => ({
  api: { getNode: vi.fn() },
}))

const link = { source_id: 1, target_id: 9 }

function hierarchyNode(showDetails) {
  return { data: { id: '1', nodeData: { id: 1, title: 'Inside' }, showDetails }, position: { x: 0, y: 0 } }
}

async function addLinked(showDetails) {
  const elements = [hierarchyNode(showDetails)]
  await fetchLinkedNodes({ elements, links: [link], savedPositions: {} })
  return elements.find(el => el.data.id === '9')
}

describe('a node linked from outside the current container', () => {
  beforeEach(async () => {
    const { api } = await import('../services/api')
    api.getNode.mockResolvedValue({ id: 9, title: 'Outside', type: 'note', notes: 'First line of the note' })
  })

  it('shows its note preview when the graph is showing previews', async () => {
    const linked = await addLinked(true)
    expect(linked.data.nodeData.notes).toBe('First line of the note')
    expect(linked.data.showDetails).toBe(true)
  })

  it('shows its title only when the graph is past the preview threshold', async () => {
    const linked = await addLinked(false)
    expect(linked.data.showDetails).toBe(false)
  })
})
