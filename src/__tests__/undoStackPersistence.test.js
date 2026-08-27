import { describe, it, expect } from 'vitest'
import { serializeStack } from '../commands/commandFactory.js'
import { ApplyNotesEditCommand } from '../commands/ApplyNotesEditCommand.js'
import { EditCommand } from '../commands/EditCommand.js'
import { DeleteCommand } from '../commands/DeleteCommand.js'
import { CompleteCommand } from '../commands/CompleteCommand.js'
import { MoveCommand } from '../commands/MoveCommand.js'

/**
 * The undo stack is persisted to sessionStorage, which is disk-backed. Note
 * bodies must not go there: a sensitive note is decrypted only into memory for
 * an unlocked session (docs/architecture/sensitive-notes.md), so serializing
 * one would leave its plaintext on disk after the session relocks.
 *
 * Commands that carry note text are therefore not persistable. They still undo
 * and redo normally within the session; they are only excluded from the copy
 * written to storage.
 */

describe('commands carrying note text', () => {
  it('marks an AI notes edit as not persistable', () => {
    const cmd = new ApplyNotesEditCommand({
      nodeId: 1,
      oldNotes: 'the secret',
      newNotes: 'the rewritten secret',
      prompt: 'improve',
    })
    expect(cmd.isPersistable()).toBe(false)
  })

  it('marks an edit that touches notes as not persistable', () => {
    const cmd = new EditCommand({ nodeId: 1, oldValues: { notes: 'secret' }, newValues: { notes: 'new secret' } })
    expect(cmd.isPersistable()).toBe(false)
  })

  it('keeps an edit that does not touch notes persistable', () => {
    const cmd = new EditCommand({ nodeId: 1, oldValues: { title: 'a' }, newValues: { title: 'b' } })
    expect(cmd.isPersistable()).toBe(true)
  })

  it('marks a delete carrying note text as not persistable', () => {
    const cmd = new DeleteCommand({ nodeId: 1, nodeData: { id: 1, title: 'x', notes: 'secret' } })
    expect(cmd.isPersistable()).toBe(false)
  })

  it('keeps a delete of a node with no notes persistable', () => {
    const cmd = new DeleteCommand({ nodeId: 1, nodeData: { id: 1, title: 'x', notes: '' } })
    expect(cmd.isPersistable()).toBe(true)
  })

  it('keeps structural commands persistable', () => {
    expect(new CompleteCommand({ nodeId: 1, oldCompleted: false }).isPersistable()).toBe(true)
    expect(new MoveCommand({ nodeId: 1, oldParentId: null, newParentId: 2 }).isPersistable()).toBe(true)
  })
})

describe('serializeStack', () => {
  const notesCmd = () => new ApplyNotesEditCommand({ nodeId: 9, oldNotes: 'secret', newNotes: 'also secret' })
  const plainCmd = id => new CompleteCommand({ nodeId: id, oldCompleted: false })

  it('writes no note text to the serialized stack', () => {
    const json = JSON.stringify(serializeStack([plainCmd(1), notesCmd(), plainCmd(2)]))
    expect(json).not.toContain('secret')
  })

  it('keeps the commands that follow a non-persistable one', () => {
    // Those can still be undone without it, because undo pops from the end.
    const stack = [plainCmd(1), notesCmd(), plainCmd(2), plainCmd(3)]
    expect(serializeStack(stack).map(c => c.nodeId)).toEqual([2, 3])
  })

  it('drops everything when the newest command carries notes', () => {
    expect(serializeStack([plainCmd(1), notesCmd()])).toEqual([])
  })

  it('serializes a stack with no note commands unchanged', () => {
    expect(serializeStack([plainCmd(1), plainCmd(2)]).map(c => c.nodeId)).toEqual([1, 2])
  })
})
