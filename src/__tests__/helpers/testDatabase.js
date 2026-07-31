import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from '../../../electron/database/index.js'

/**
 * Test Database Utility
 *
 * Builds a REAL production Database (electron/database/index.js) on a throwaway
 * temp file. Integration tests therefore exercise the production schema,
 * migrations and operations directly — a regression in electron/database/*
 * fails these tests, which a mirrored reimplementation could never catch.
 */

let counter = 0

/**
 * Create a production Database instance on a temporary file.
 * The returned object is the real Database, plus a close() that drops the file.
 * @returns {Promise<Object>} Ready-to-use Database instance
 */
export async function createTestDatabase() {
  const dbPath = path.join(os.tmpdir(), `graphcore-test-${process.pid}-${counter++}.db`)
  const db = new Database(dbPath)
  await db.ready

  // The production Database owns its file for the whole app run and has no
  // teardown; tests need one so temp files do not accumulate.
  db.close = () => {
    db.db.close()
    if (fs.existsSync(dbPath)) fs.rmSync(dbPath)
  }

  return db
}

/**
 * Test Node Factory
 *
 * Creates nodes with sensible defaults for testing.
 */
export function createNodeFactory(db) {
  const defaults = {
    type: 'task',
    title: 'Test Node',
    workspace_id: 'work',
  }

  return {
    task: (overrides = {}) => db.createNode({ ...defaults, type: 'task', ...overrides }),
    project: (overrides = {}) => db.createNode({ ...defaults, type: 'project', ...overrides }),
    note: (overrides = {}) => db.createNode({ ...defaults, type: 'note', ...overrides }),
    person: (overrides = {}) => db.createNode({ ...defaults, type: 'person', ...overrides }),

    // Create a tree structure: returns { root, children, grandchildren }
    tree: (depth = 2, childrenPerLevel = 2) => {
      const root = db.createNode({ ...defaults, type: 'project', title: 'Root' })
      const children = []
      const grandchildren = []

      for (let i = 0; i < childrenPerLevel; i++) {
        const child = db.createNode({
          ...defaults,
          title: `Child ${i + 1}`,
          parent_id: root.id,
        })
        children.push(child)

        if (depth > 1) {
          for (let j = 0; j < childrenPerLevel; j++) {
            const grandchild = db.createNode({
              ...defaults,
              title: `Grandchild ${i + 1}-${j + 1}`,
              parent_id: child.id,
            })
            grandchildren.push(grandchild)
          }
        }
      }

      return { root, children, grandchildren }
    },

    // Create linked nodes: returns { center, linked }
    linked: (count = 3) => {
      const center = db.createNode({ ...defaults, title: 'Center Node' })
      const linked = []

      for (let i = 0; i < count; i++) {
        const node = db.createNode({ ...defaults, title: `Linked ${i + 1}` })
        db.linkNodes(center.id, node.id)
        linked.push(node)
      }

      return { center, linked }
    },
  }
}
