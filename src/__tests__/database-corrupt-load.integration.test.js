import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../electron/database/index.js'

/**
 * When an existing database file cannot be read/parsed, the Database must not
 * silently discard it: a later write would overwrite the original with an empty
 * DB and destroy potentially recoverable data. The file is preserved to a
 * sibling ".corrupt-*" backup before a fresh empty database takes its place.
 */

let dbPath
let counter = 0

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `graphcore-corrupt-${process.pid}-${counter++}.db`)
})

afterEach(() => {
  const dir = os.tmpdir()
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith(path.basename(dbPath))) fs.rmSync(path.join(dir, f))
  }
})

describe('Database load failure handling', () => {
  it('preserves an unreadable database file instead of discarding it', async () => {
    const garbage = Buffer.from('this is not a valid sqlite database')
    fs.writeFileSync(dbPath, garbage)

    const db = new Database(dbPath)
    await db.ready

    // A backup of the original bytes exists alongside the db.
    const backups = fs.readdirSync(os.tmpdir()).filter(f => f.startsWith(`${path.basename(dbPath)}.corrupt`))
    expect(backups).toHaveLength(1)
    expect(fs.readFileSync(path.join(os.tmpdir(), backups[0]))).toEqual(garbage)

    // The database still comes up usable (empty), and persisting it does not
    // destroy the preserved backup.
    db.createNode({ title: 'A', type: 'task', workspace_id: 'w' })
    expect(db.getRoots('w').filter(Boolean)).toHaveLength(1)
    expect(fs.readFileSync(path.join(os.tmpdir(), backups[0]))).toEqual(garbage)
  })
})
