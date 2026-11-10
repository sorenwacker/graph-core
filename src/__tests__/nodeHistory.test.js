import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'
import {
  historySource,
  COALESCE_WINDOW_MS,
  MAX_VERSIONS_PER_NODE,
  SOURCE_APP,
  SOURCE_RESTORE,
} from '../../electron/database/history.js'

/**
 * Node history (docs/architecture/database.md, "node_history"): every write
 * that replaces a node's title or notes keeps the state it replaced, in the
 * real production database.
 */
describe('node history', () => {
  let db
  let factory
  let now

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
    now = 1_000_000
    db.clock = () => now
  })

  afterEach(() => {
    db.close()
  })

  it('keeps the version a write replaces, with the write that replaced it', () => {
    const node = factory.note({ title: 'Draft', notes: 'first text' })

    db.updateNode(node.id, { notes: 'second text' })

    const versions = db.getNodeHistory(node.id)
    expect(versions).toHaveLength(1)
    expect(versions[0]).toMatchObject({
      node_id: node.id,
      title: 'Draft',
      notes: 'first text',
      notes_withheld: false,
      source: SOURCE_APP,
      saved_at: now,
    })
    expect(db.getNode(node.id).notes).toBe('second text')
  })

  it('keeps nothing for a write that changes neither title nor notes', () => {
    const node = factory.note({ title: 'Draft', notes: 'same' })

    db.updateNode(node.id, { title: 'Draft', notes: 'same' })
    db.updateNode(node.id, { completed: true, color: '#ff0000' })

    expect(db.getNodeHistory(node.id)).toEqual([])
  })

  it('folds writes of one stretch into one version, and starts another after a pause or a restore', () => {
    const node = factory.note({ title: 'Draft', notes: 'v0' })

    db.updateNode(node.id, { notes: 'v1' })
    now += 1000
    db.updateNode(node.id, { notes: 'v2' })
    now += 1000
    db.updateNode(node.id, { title: 'Draft 2' })
    expect(db.getNodeHistory(node.id).map(v => v.notes)).toEqual(['v0'])

    // A restore is its own source: the state it replaces is kept at once
    now += 1000
    db.updateNode(node.id, { title: 'Draft', notes: 'v0', history_source: 'restore' })
    expect(db.getNodeHistory(node.id).map(v => [v.title, v.notes, v.source])).toEqual([
      ['Draft 2', 'v2', SOURCE_RESTORE],
      ['Draft', 'v0', SOURCE_APP],
    ])

    // After the window, the next edit keeps the restored state
    now += COALESCE_WINDOW_MS
    db.updateNode(node.id, { notes: 'v3' })
    expect(db.getNodeHistory(node.id).map(v => v.notes)).toEqual(['v0', 'v2', 'v0'])
  })

  it('never stores the restore flag on the node', () => {
    const node = factory.note({ title: 'Draft', notes: 'v0' })
    const updated = db.updateNode(node.id, { notes: 'v1', history_source: 'restore' })
    expect(updated).not.toHaveProperty('history_source')
    expect(db.getNode(node.id)).not.toHaveProperty('history_source')
  })

  it('keeps only the newest hundred versions', () => {
    const node = factory.note({ title: 'Draft', notes: 'v0' })
    for (let i = 1; i <= MAX_VERSIONS_PER_NODE + 5; i++) {
      now += COALESCE_WINDOW_MS + 1
      db.updateNode(node.id, { notes: `v${i}` })
    }
    const versions = db.getNodeHistory(node.id)
    expect(versions).toHaveLength(MAX_VERSIONS_PER_NODE)
    expect(versions[0].notes).toBe(`v${MAX_VERSIONS_PER_NODE + 4}`)
    expect(versions.at(-1).notes).toBe('v5')
  })

  it('goes with the node when it is deleted for good, and stays through the trash', () => {
    const node = factory.note({ title: 'Draft', notes: 'v0' })
    db.updateNode(node.id, { notes: 'v1' })

    db.deleteNode(node.id)
    expect(db.getNodeHistory(node.id)).toHaveLength(1)

    db.deleteNode(node.id, true)
    expect(db.getNodeHistory(node.id)).toEqual([])
  })

  it('withholds the notes of a sensitive node, and hands them out only through getNodeVersionNotes', () => {
    const node = factory.note({ title: 'Vault', notes: 'the secret', notes_sensitive: true })
    db.updateNode(node.id, { notes: 'the second secret', notes_revealed: true })

    const [version] = db.getNodeHistory(node.id)
    expect(version.notes).toBeNull()
    expect(version.notes_withheld).toBe(true)
    expect(db.getNodeVersionNotes(version.id)).toEqual({ notes: 'the secret', locked: false })
    expect(db.getNodeVersionNotes(999_999)).toEqual({ notes: null, locked: false })
  })

  it('accepts only the restore source from the renderer', () => {
    expect(historySource('restore')).toBe(SOURCE_RESTORE)
    expect(historySource('file')).toBe(SOURCE_APP)
    expect(historySource(undefined)).toBe(SOURCE_APP)
  })
})
