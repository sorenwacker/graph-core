import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../electron/database/index.js'

/**
 * Links are stored as a single directed row but read bidirectionally
 * (getLinkedNodes matches source_id OR target_id). unlinkNodes must therefore
 * remove the link regardless of the argument order, otherwise a neighbour
 * obtained from getLinkedNodes (which does not preserve direction) cannot be
 * reliably unlinked.
 */

let dbPath
let db
let counter = 0

beforeEach(async () => {
  dbPath = path.join(os.tmpdir(), `graphcore-links-${process.pid}-${counter++}.db`)
  db = new Database(dbPath)
  await db.ready
})

afterEach(() => {
  if (dbPath && fs.existsSync(dbPath)) fs.rmSync(dbPath)
})

function node(title) {
  return db.createNode({ title, type: 'note', workspace_id: 'w' })
}

describe('node links', () => {
  it('unlinks regardless of the argument direction', () => {
    const a = node('A')
    const b = node('B')
    db.linkNodes(a.id, b.id)
    expect(db.getLinkedNodes(a.id).map(n => n.id)).toEqual([b.id])

    // Unlink with the arguments reversed relative to how the row was stored.
    db.unlinkNodes(b.id, a.id)

    expect(db.getLinkedNodes(a.id)).toHaveLength(0)
    expect(db.getLinkedNodes(b.id)).toHaveLength(0)
  })
})
