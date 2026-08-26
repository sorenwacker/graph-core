import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { useUndoRedo } from '../composables/useUndoRedo'
import { CreateCommand } from '../commands/CreateCommand.js'
import { EditCommand } from '../commands/EditCommand.js'
import { CompleteCommand } from '../commands/CompleteCommand.js'
import { DeleteMultipleCommand } from '../commands/DeleteMultipleCommand.js'

/**
 * Redoing a creation cannot reuse the original row id, because the node was
 * hard-deleted by the undo. Every command still queued for redo was recorded
 * after that creation and may name the old id, so the new id has to be carried
 * into them; otherwise redo silently edits a node that no longer exists.
 */

function fakeApi() {
  let nextId = 100
  const calls = []
  return {
    calls,
    createNode: vi.fn(async data => {
      const node = { id: ++nextId, ...data }
      calls.push(['createNode', node.id])
      return node
    }),
    updateNode: vi.fn(async (id, values) => {
      calls.push(['updateNode', id, values])
      return { id, ...values }
    }),
    deleteNode: vi.fn(async (id, hard) => {
      calls.push(['deleteNode', id, hard])
    }),
    restoreNode: vi.fn(async id => {
      calls.push(['restoreNode', id])
      return { id }
    }),
    linkNodes: vi.fn(async () => {}),
    unlinkNodes: vi.fn(async () => {}),
  }
}

async function buildNodeOps(api, pushed) {
  const { useNodeOperations } = await import('../composables/useNodeOperations')
  return useNodeOperations({ api, pushCommand: cmd => pushed.push(cmd) })
}

const setup = () => {
  const api = fakeApi()
  return { api, ...useUndoRedo({ api, persist: false }) }
}

describe('redoing a creation', () => {
  it('carries the new id into the commands queued behind it', async () => {
    const { api, pushCommand, undo, redo } = setup()

    const create = new CreateCommand({ nodeId: 7, nodeData: { title: 'New' }, parentId: null })
    const edit = new EditCommand({ nodeId: 7, oldValues: { title: 'New' }, newValues: { title: 'Renamed' } })
    pushCommand(create)
    pushCommand(edit)

    await undo() // undo the edit
    await undo() // undo the create, hard-deleting node 7
    await redo() // redo the create; the row comes back with a fresh id
    await redo() // redo the edit, which must target that fresh id

    const created = api.calls.find(c => c[0] === 'createNode')[1]
    const edited = api.calls.filter(c => c[0] === 'updateNode').pop()
    expect(edited[1]).toBe(created)
    expect(edited[1]).not.toBe(7)
  })

  it('leaves commands alone when the id does not change', async () => {
    const { pushCommand, undo, redo } = setup()
    const complete = new CompleteCommand({ nodeId: 7, oldCompleted: false, newCompleted: true })
    pushCommand(complete)

    await undo()
    await redo()

    expect(complete.nodeId).toBe(7)
  })
})

describe('a command that names several nodes', () => {
  it('remaps every id it holds', () => {
    const cmd = new DeleteMultipleCommand({
      nodes: [
        { id: 7, title: 'A', parent_id: null },
        { id: 8, title: 'B', parent_id: 7 },
      ],
    })
    cmd.remapNodeId(7, 101)

    expect(cmd.nodes[0].id).toBe(101)
    expect(cmd.nodes[1].parent_id).toBe(101)
  })
})

describe('deleting several nodes', () => {
  it('deletes children before their parents so the subtree keeps its shape', async () => {
    const { api } = setup()
    const cmd = new DeleteMultipleCommand({
      nodes: [
        { id: 1, title: 'Parent', parent_id: null },
        { id: 2, title: 'Child', parent_id: 1 },
      ],
    })

    await cmd.execute(api)

    // Deleting the parent first reparents the live child to the grandparent,
    // flattening the subtree that undo is supposed to restore.
    const deleted = api.calls.filter(c => c[0] === 'deleteNode').map(c => c[1])
    expect(deleted.indexOf(2)).toBeLessThan(deleted.indexOf(1))
  })
})

describe('undoing a completion', () => {
  it('clears the end date that completing set', async () => {
    const api = fakeApi()
    const cmd = new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true, oldEndDate: null })

    await cmd.execute(api)
    await cmd.undo(api)

    const undone = api.calls.filter(c => c[0] === 'updateNode').pop()
    expect(undone[2]).toMatchObject({ completed: false, end_date: null })
  })

  it('puts back an end date that was already there', async () => {
    const api = fakeApi()
    const cmd = new CompleteCommand({
      nodeId: 1,
      oldCompleted: false,
      newCompleted: true,
      oldEndDate: '2026-01-01',
    })

    await cmd.undo(api)

    const undone = api.calls.filter(c => c[0] === 'updateNode').pop()
    expect(undone[2]).toMatchObject({ end_date: '2026-01-01' })
  })
})

describe('moving nodes', () => {
  function ops(overrides = {}) {
    const pushed = []
    const api = fakeApi()
    api.getNode = vi.fn(async id => ({ id, parent_id: id === 2 ? 1 : 5 }))
    api.moveNode = vi.fn(async () => {})
    return { pushed, api, overrides }
  }

  it('records an undo step when a node is moved to the top level', async () => {
    const { pushed, api } = ops()
    const { moveNodeToRoot } = await buildNodeOps(api, pushed)

    await moveNodeToRoot(2)

    expect(pushed).toHaveLength(1)
    expect(pushed[0].oldParentId).toBe(1)
    expect(pushed[0].newParentId).toBeNull()
  })

  it('records a single undo step for a multi-node move', async () => {
    const { pushed, api } = ops()
    const { moveMultipleNodes } = await buildNodeOps(api, pushed)

    await moveMultipleNodes({ nodeIds: [2, 3], newParentId: 9 })

    // One user action is one undo step, as everywhere else in this module.
    expect(pushed).toHaveLength(1)
    expect(pushed[0].getDescription()).toMatch(/move/i)
  })

  it('undoes a multi-node move back to each original parent', async () => {
    const { pushed, api } = ops()
    const { moveMultipleNodes } = await buildNodeOps(api, pushed)

    await moveMultipleNodes({ nodeIds: [2, 3], newParentId: 9 })
    api.moveNode.mockClear()
    await pushed[0].undo(api)

    expect(api.moveNode.mock.calls).toEqual([
      [2, 1],
      [3, 5],
    ])
  })
})

describe('switching workspace', () => {
  it('is wired to clear the stacks in App', () => {
    // The composable's clear() has always worked; what was missing was anyone
    // calling it on a switch, so assert the wiring and not just the helper.
    const app = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../App.vue'), 'utf-8')
    const handler = app.slice(app.indexOf('onWorkspaceChange:'), app.indexOf('async function deleteCurrentWorkspace'))
    expect(handler).toMatch(/clearUndoRedo\(\)/)
    expect(app).toMatch(/clear:\s*clearUndoRedo/)
  })

  it('drops both stacks, so undo cannot reach into the workspace you left', async () => {
    const { pushCommand, undo, clear, canUndo, canRedo } = setup()

    pushCommand(new CompleteCommand({ nodeId: 1, oldCompleted: false, newCompleted: true }))
    pushCommand(new CompleteCommand({ nodeId: 2, oldCompleted: false, newCompleted: true }))
    await undo()

    expect(canUndo.value).toBe(true)
    expect(canRedo.value).toBe(true)

    clear()

    // Commands name node ids, which say nothing about which workspace they are
    // in; an undo after the switch would edit a node the user cannot see.
    expect(canUndo.value).toBe(false)
    expect(canRedo.value).toBe(false)
  })
})
