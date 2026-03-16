import initSqlJs from 'sql.js'

/**
 * Test Database Utility
 *
 * Provides a real in-memory SQLite database for integration testing.
 * Mirrors the schema and logic from electron/database.js.
 */
export class TestDatabase {
  constructor(db) {
    this.db = db
    this._initSchema()
  }

  static async create() {
    const SQL = await initSqlJs()
    const db = new SQL.Database()
    return new TestDatabase(db)
  }

  close() {
    this.db.close()
  }

  _initSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS nodes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL DEFAULT 'task',
        title TEXT NOT NULL,
        parent_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
        depth INTEGER DEFAULT 0,
        path TEXT DEFAULT '',
        notes TEXT DEFAULT '',
        completed INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        importance INTEGER,
        start_date TEXT,
        end_date TEXT,
        due_date TEXT,
        favorite INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        workspace_id TEXT DEFAULT NULL,
        show_links INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS node_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
        link_type TEXT DEFAULT 'related',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_id, target_id)
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3498db',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run("INSERT OR IGNORE INTO workspaces (id, name, sort_order) VALUES ('work', 'Work', 1)")
    this.db.run("INSERT OR IGNORE INTO workspaces (id, name, sort_order) VALUES ('private', 'Private', 2)")
  }

  _query(sql, params = []) {
    const stmt = this.db.prepare(sql)
    stmt.bind(params)
    const results = []
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    stmt.free()
    return results
  }

  _run(sql, params = []) {
    this.db.run(sql, params)
    const result = this._query('SELECT last_insert_rowid() as id')
    return { lastInsertRowid: result[0]?.id }
  }

  _get(sql, params = []) {
    const results = this._query(sql, params)
    return results[0] || null
  }

  _rowToNode(row) {
    if (!row) return null
    let tags = []
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags)
      } catch {
        tags = []
      }
    }
    return {
      ...row,
      completed: Boolean(row.completed),
      favorite: Boolean(row.favorite),
      tags
    }
  }

  // CRUD Operations
  createNode(data) {
    const fields = [
      'type',
      'title',
      'parent_id',
      'notes',
      'completed',
      'sort_order',
      'importance',
      'start_date',
      'end_date',
      'due_date',
      'favorite',
      'tags',
      'workspace_id',
      'show_links'
    ]

    let depth = 0
    let path = ''
    if (data.parent_id) {
      const parent = this.getNode(data.parent_id)
      if (parent) {
        depth = (parent.depth || 0) + 1
        path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
      }
    }

    const presentFields = fields.filter((f) => data[f] !== undefined)
    const values = presentFields.map((f) => {
      if (f === 'tags' && Array.isArray(data[f])) {
        return JSON.stringify(data[f])
      }
      return data[f]
    })

    presentFields.push('depth', 'path')
    values.push(depth, path)

    const placeholders = presentFields.map(() => '?').join(', ')
    const sql = `INSERT INTO nodes (${presentFields.join(', ')}) VALUES (${placeholders})`
    const result = this._run(sql, values)
    return this.getNode(result.lastInsertRowid)
  }

  getNode(id) {
    const row = this._get('SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL', [id])
    return this._rowToNode(row)
  }

  updateNode(id, data) {
    const fields = [
      'type',
      'title',
      'parent_id',
      'notes',
      'completed',
      'sort_order',
      'importance',
      'start_date',
      'end_date',
      'due_date',
      'favorite',
      'tags',
      'workspace_id',
      'show_links'
    ]

    const updates = []
    const values = []

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`)
        if (field === 'tags' && Array.isArray(data[field])) {
          values.push(JSON.stringify(data[field]))
        } else {
          values.push(data[field])
        }
      }
    }

    if (updates.length === 0) return this.getNode(id)

    updates.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    const sql = `UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`
    this._run(sql, values)
    return this.getNode(id)
  }

  deleteNode(id, hard = false) {
    const node = this.getNode(id)
    const newParentId = node?.parent_id || null

    this._run('UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [
      newParentId,
      id
    ])

    if (hard) {
      this._run('DELETE FROM nodes WHERE id = ?', [id])
    } else {
      this._run('UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
    }

    return { success: true }
  }

  restoreNode(id) {
    this._run('UPDATE nodes SET deleted_at = NULL WHERE id = ?', [id])
    return this.getNode(id)
  }

  // Tree Operations
  getRoots(workspaceId = undefined) {
    let sql = 'SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL'
    const values = []

    if (workspaceId !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(workspaceId)
    }

    sql += ' ORDER BY sort_order, created_at'
    return this._query(sql, values).map((r) => this._rowToNode(r))
  }

  getChildren(parentId) {
    return this._query(
      'SELECT * FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at',
      [parentId]
    ).map((r) => this._rowToNode(r))
  }

  getDescendants(id) {
    const node = this.getNode(id)
    if (!node) return []

    const pathPrefix = node.path ? `${node.path}/${id}` : `${id}`
    return this._query(
      "SELECT * FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL ORDER BY depth",
      [pathPrefix, `${pathPrefix}/%`]
    ).map((r) => this._rowToNode(r))
  }

  getAncestors(id) {
    const node = this.getNode(id)
    if (!node || !node.path) return []

    const ancestorIds = node.path.split('/').filter(Boolean).map(Number)
    if (ancestorIds.length === 0) return []

    const placeholders = ancestorIds.map(() => '?').join(', ')
    return this._query(
      `SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL ORDER BY depth`,
      ancestorIds
    ).map((r) => this._rowToNode(r))
  }

  moveNode(id, newParentId) {
    const node = this.getNode(id)
    if (!node) return null

    let depth = 0
    let path = ''
    if (newParentId) {
      const parent = this.getNode(newParentId)
      if (parent) {
        depth = (parent.depth || 0) + 1
        path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
      }
    }

    this._run(
      'UPDATE nodes SET parent_id = ?, depth = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newParentId, depth, path, id]
    )

    return this.getNode(id)
  }

  // Links
  linkNodes(sourceId, targetId) {
    try {
      this._run('INSERT INTO node_links (source_id, target_id) VALUES (?, ?)', [sourceId, targetId])
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  unlinkNodes(sourceId, targetId) {
    this._run('DELETE FROM node_links WHERE source_id = ? AND target_id = ?', [sourceId, targetId])
    return { success: true }
  }

  getLinkedNodes(id) {
    const numId = Number(id)
    const links = this._query('SELECT * FROM node_links WHERE source_id = ? OR target_id = ?', [
      numId,
      numId
    ])

    const linkedIds = new Set()
    for (const link of links) {
      if (link.source_id !== numId) linkedIds.add(link.source_id)
      if (link.target_id !== numId) linkedIds.add(link.target_id)
    }

    if (linkedIds.size === 0) return []

    const placeholders = [...linkedIds].map(() => '?').join(', ')
    return this._query(
      `SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      [...linkedIds]
    ).map((r) => this._rowToNode(r))
  }

  // Search
  search(query, type = null) {
    let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)'
    const values = [`%${query}%`, `%${query}%`]

    if (type) {
      sql += ' AND type = ?'
      values.push(type)
    }

    sql += ' ORDER BY updated_at DESC LIMIT 50'
    return this._query(sql, values).map((r) => this._rowToNode(r))
  }

  // Tags
  getAllTags() {
    const nodes = this._query(
      'SELECT tags FROM nodes WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != "[]"'
    )
    const tagSet = new Set()
    for (const node of nodes) {
      try {
        const tags = JSON.parse(node.tags || '[]')
        tags.forEach((tag) => tagSet.add(tag))
      } catch {
        // Skip invalid JSON
      }
    }
    return Array.from(tagSet).sort()
  }

  getNodesByTag(tag) {
    return this._query(
      'SELECT * FROM nodes WHERE deleted_at IS NULL AND tags LIKE ? ORDER BY updated_at DESC',
      [`%"${tag}"%`]
    ).map((r) => this._rowToNode(r))
  }

  // Workspaces
  getWorkspaces() {
    return this._query('SELECT * FROM workspaces ORDER BY sort_order, name')
  }

  // Trash
  getTrash() {
    return this._query('SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').map(
      (r) => this._rowToNode(r)
    )
  }
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
    workspace_id: 'work'
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
          parent_id: root.id
        })
        children.push(child)

        if (depth > 1) {
          for (let j = 0; j < childrenPerLevel; j++) {
            const grandchild = db.createNode({
              ...defaults,
              title: `Grandchild ${i + 1}-${j + 1}`,
              parent_id: child.id
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
    }
  }
}
