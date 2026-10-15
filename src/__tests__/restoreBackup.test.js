import { describe, it, expect, afterEach, vi } from 'vitest'
import fs from 'fs'
import { createTestDatabase } from './helpers/testDatabase.js'

/**
 * Restoring a snapshot upgrades it to the current schema and only replaces the
 * working database once that succeeded (docs/reference/settings.md, Database
 * Snapshots). A snapshot taken before a migration must be usable without a
 * restart.
 */

let db
afterEach(() => db?.close())

const columns = handle => handle.exec('PRAGMA table_info(nodes)')[0].values.map(r => r[1])

describe('restoreBackup', () => {
  it('runs migrations on a snapshot that predates them', async () => {
    db = await createTestDatabase()
    db.createNode({ type: 'note', title: 'kept', workspace_id: 'work' })
    const snapshotPath = db.backup('-old-schema')

    // Rewrite the snapshot without a migration-added column.
    const old = new db.SQL.Database(db._deserialize(fs.readFileSync(snapshotPath)))
    old.run('ALTER TABLE nodes DROP COLUMN collapsed')
    fs.writeFileSync(snapshotPath, db._serialize(Buffer.from(old.export())))
    old.close()

    db.restoreBackup(snapshotPath)

    expect(columns(db.db)).toContain('collapsed')
    expect(db.getNode(1).title).toBe('kept')
    fs.rmSync(snapshotPath)
  })

  it('closes the previous connection after switching', async () => {
    db = await createTestDatabase()
    const snapshotPath = db.backup('-close')
    const previous = db.db
    const close = vi.spyOn(previous, 'close')

    db.restoreBackup(snapshotPath)

    expect(close).toHaveBeenCalledOnce()
    expect(db.db).not.toBe(previous)
    fs.rmSync(snapshotPath)
  })

  it('keeps the working database when the snapshot cannot be read', async () => {
    db = await createTestDatabase()
    db.createNode({ type: 'note', title: 'working', workspace_id: 'work' })
    const previous = db.db
    const badPath = db.dbPath.replace('.db', '-backup-garbage.db')
    fs.writeFileSync(badPath, 'not a database')

    expect(() => db.restoreBackup(badPath)).toThrow()

    expect(db.db).toBe(previous)
    expect(db.getNode(1).title).toBe('working')
    fs.rmSync(badPath)
  })
})
