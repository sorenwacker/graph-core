import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'

/**
 * The in-progress mark the Tasks board sets (docs/guides/views.md, "Board")
 * is stored on the node, read back as a boolean, and kept through a CSV
 * export and import. Runs the real database module against a throwaway file.
 */

describe('the marks the Tasks board stores', () => {
  let db, factory

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
  })

  afterEach(() => db.close())

  it('starts unmarked and keeps the marks once set', () => {
    const task = factory.task({ title: 'Mark me' })
    expect(task.in_progress).toBe(false)
    expect(task.blocked).toBe(false)
    db.updateNode(task.id, { blocked: true })
    expect(db.getNode(task.id).blocked).toBe(true)
    db.updateNode(task.id, { in_progress: true })
    expect(db.getNode(task.id).in_progress).toBe(true)
    db.updateNode(task.id, { in_progress: false })
    expect(db.getNode(task.id).in_progress).toBe(false)
  })

  it('survives a CSV export and import', () => {
    const parent = factory.task({ title: 'Source' })
    const task = factory.task({ title: 'Carried over', parent_id: parent.id })
    db.updateNode(task.id, { in_progress: true })
    const stuck = factory.task({ title: 'Stuck too', parent_id: parent.id })
    db.updateNode(stuck.id, { blocked: true })
    const { csv, headers } = db.exportCSV(parent.id)
    expect(headers).toContain('in_progress')
    expect(headers).toContain('blocked')

    const target = factory.task({ title: 'Target' })
    db.importCSV(csv, target.id, 'work')
    const imported = db.getDescendants(target.id).find(n => n.title === 'Carried over')
    expect(imported.in_progress).toBe(true)
    expect(db.getDescendants(target.id).find(n => n.title === 'Stuck too').blocked).toBe(true)
  })
})
