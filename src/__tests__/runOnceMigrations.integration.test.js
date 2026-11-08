import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'
import migrations from '../../electron/database/migrations.js'

const { runMigrations, getDataVersion, DATA_VERSION } = migrations

/**
 * Data migrations used to run on every launch, so a one-off fix kept being
 * re-applied: a start date the user cleared was filled in again at the next
 * start. They now run once per file, tracked in PRAGMA user_version.
 */
describe('run-once data migrations', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => {
    db.close()
  })

  it('stamps a new database with the current data version', () => {
    expect(getDataVersion(db)).toBe(DATA_VERSION)
  })

  it('keeps a cleared start date across a restart', () => {
    const task = factory.task({ start_date: '2026-01-05' })
    db.updateNode(task.id, { start_date: null })

    runMigrations(db) // what the next launch does

    expect(db.getNode(task.id).start_date).toBeNull()
  })

  it('keeps nodes in the workspace the user chose across a restart', () => {
    const task = factory.task()
    db._run('UPDATE nodes SET workspace_id = NULL WHERE id = ?', [task.id])

    runMigrations(db)

    expect(db.getNode(task.id).workspace_id).toBeNull()
  })

  it('still migrates a database from before versioning, once', () => {
    const task = factory.task()
    db._run('UPDATE nodes SET start_date = NULL WHERE id = ?', [task.id])
    db.db.run('PRAGMA user_version = 0')

    runMigrations(db)

    expect(db.getNode(task.id).start_date).not.toBeNull()
    expect(getDataVersion(db)).toBe(DATA_VERSION)
  })

  it('keeps running the path repair on every start', () => {
    const root = factory.project({ title: 'Root' })
    db._run("UPDATE nodes SET path = 'broken' WHERE id = ?", [root.id])

    runMigrations(db)

    expect(db.getNode(root.id).path).toBe('')
  })
})

describe('CSV tags', () => {
  let db
  let factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => {
    db.close()
  })

  const tagTitles = id =>
    db
      .getLinkedNodes(id)
      .filter(n => n.type === 'tag')
      .map(n => n.title)
      .sort()

  it('imports tags as linked tag nodes, reusing existing ones', () => {
    const existing = db.getOrCreateTagNode('urgent', 'work')
    const csv = 'title,type,tags\nWrite report,task,urgent;q4\nPlan trip,task,q4'

    db.importCSV(csv, null, 'work')

    const report = db.search('Write report', null, 'work')[0]
    const trip = db.search('Plan trip', null, 'work')[0]
    expect(tagTitles(report.id)).toEqual(['q4', 'urgent'])
    expect(tagTitles(trip.id)).toEqual(['q4'])
    expect(
      db
        .getTagNodes('work')
        .filter(t => t.title === 'urgent')
        .map(t => t.id)
    ).toEqual([existing.id])
    expect(db.getTagNodes('work').filter(t => t.title === 'q4')).toHaveLength(1)
  })

  it('round-trips linked tags through export and import', () => {
    const task = factory.task({ title: 'Tagged' })
    db.linkNodes(task.id, db.getOrCreateTagNode('alpha', 'work').id)

    const { csv } = db.exportCSV(null, 'work')
    expect(csv).toContain('alpha')

    db.importCSV(csv, null, 'private')
    const copy = db.search('Tagged', null, 'private')[0]
    expect(tagTitles(copy.id)).toEqual(['alpha'])
    expect(db.getTagNodes('private').filter(t => t.title === 'alpha')).toHaveLength(1)
  })
})
