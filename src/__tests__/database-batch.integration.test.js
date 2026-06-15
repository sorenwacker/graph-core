import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../electron/database/index.js'

/**
 * Disk-level integration tests for the real Database persistence path.
 *
 * Unlike the in-memory TestDatabase helper, these exercise electron/database
 * index.js against an actual file, covering _batch()/_save() behaviour:
 * deferred single write, transactional rollback, and durable persistence.
 */

let dbPath
let db
let counter = 0

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `graphcore-batch-${process.pid}-${counter++}.db`)
  db = new Database(dbPath)
  await db.ready
})

afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.rmSync(dbPath)
})

describe('Database _batch', () => {
  it('writes to disk once for the whole batch, not per statement', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    db._batch(() => {
      db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'C', type: 'task', workspace_id: 'w' })
    })

    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()
  })

  it('persists all batched rows', () => {
    db._batch(() => {
      db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
      db.createNode({ title: 'B', type: 'task', workspace_id: 'w' })
    })

    const roots = db.getRoots('w').filter(Boolean)
    expect(roots.map(n => n.title).sort()).toEqual(['A', 'B'])
  })

  it('rolls back and does not persist when the batch throws', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    expect(() =>
      db._batch(() => {
        db.createNode({ title: 'Keep?', type: 'task', workspace_id: 'w' })
        throw new Error('boom')
      })
    ).toThrow('boom')

    // Nothing written to disk, and the in-memory row was rolled back.
    expect(writeSpy).not.toHaveBeenCalled()
    expect(db.getRoots('w').filter(Boolean)).toHaveLength(0)
    writeSpy.mockRestore()
  })

  it('still writes once per statement outside a batch', () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')
    db.createNode({ title: 'solo', type: 'task', workspace_id: 'w' })
    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()
  })
})

describe('Database importJSON persistence', () => {
  it('imports a tree in one write and survives a reload from disk', async () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync')

    const result = db.importJSON(
      {
        root: {
          id: 1,
          title: 'Root',
          type: 'project',
          children: [
            { id: 2, title: 'Child 1', type: 'task' },
            { id: 3, title: 'Child 2', type: 'task', children: [{ id: 4, title: 'Grandchild', type: 'task' }] },
          ],
        },
      },
      null,
      'w'
    )

    expect(result.nodesImported).toBe(4)
    expect(writeSpy).toHaveBeenCalledTimes(1)
    writeSpy.mockRestore()

    // Reload from disk in a fresh instance and confirm the tree persisted.
    const reloaded = new Database(dbPath)
    await reloaded.ready
    const root = reloaded.getRoots('w').filter(Boolean)[0]
    expect(root.title).toBe('Root')
    const descendants = reloaded.getDescendants(root.id)
    expect(descendants).toHaveLength(3)
  })
})
