/**
 * A tag view and a type listing show each node with its own children beneath
 * it, not as a bare row (docs/reference/node-types.md, "Every type is also a
 * list").
 */
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useNavigation } from '../composables/useNavigation.js'

const project = { id: 7, title: 'Project', type: 'project', parent_id: 1, workspace_id: 'work' }
const task = { id: 8, title: 'Task', type: 'task', parent_id: 7, workspace_id: 'work' }
const subtask = { id: 9, title: 'Subtask', type: 'task', parent_id: 8, workspace_id: 'work' }
const nestedTag = { id: 10, title: 'Nested tag', type: 'tag', parent_id: 7, workspace_id: 'work' }

function setup(extra) {
  const api = {
    getNode: vi.fn(async id => (id === 5 ? { id: 5, title: 'A tag', type: 'tag', parent_id: null } : null)),
    getChildren: vi.fn().mockResolvedValue([]),
    getDescendants: vi.fn(async id => (id === 7 ? [task, subtask, nestedTag] : [])),
    getAncestors: vi.fn().mockResolvedValue([]),
    getRoots: vi.fn().mockResolvedValue([]),
    getLinkedNodes: vi.fn().mockResolvedValue([project]),
    getNodesOfType: vi.fn().mockResolvedValue([project]),
    ...extra,
  }
  return useNavigation({ api, workspace: ref('work') })
}

const titles = nodes => nodes.map(n => n.title)

describe('tag views show children', () => {
  it("a tag shows each linked node's children nested beneath it", async () => {
    const nav = setup()
    await nav.loadChildren(5)
    const [row] = nav.children.value
    expect(titles(nav.children.value)).toEqual(['Project'])
    expect(titles(row.children)).toEqual(['Task'])
    expect(titles(row.children[0].children)).toEqual(['Subtask'])
  })

  it("a type listing shows each node's children nested beneath it", async () => {
    const nav = setup()
    await nav.loadChildren('type:project')
    const [row] = nav.children.value
    expect(titles(row.children)).toEqual(['Task'])
    expect(titles(row.children[0].children)).toEqual(['Subtask'])
  })

  it('tag nodes stay hidden among the children', async () => {
    const nav = setup()
    await nav.loadChildren(5)
    expect(titles(nav.children.value[0].children)).not.toContain('Nested tag')
  })
})
