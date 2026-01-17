const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
    this.ready = this._init()
  }

  async _init() {
    const SQL = await initSqlJs()

    // Load existing database or create new one
    if (fs.existsSync(this.dbPath)) {
      try {
        const buffer = fs.readFileSync(this.dbPath)
        console.log(`Loading database from ${this.dbPath} (${buffer.length} bytes)`)
        this.db = new SQL.Database(buffer)
        // Verify it loaded correctly
        const count = this._query('SELECT COUNT(*) as cnt FROM nodes')[0]?.cnt || 0
        console.log(`Database loaded with ${count} nodes`)
      } catch (e) {
        console.error('Error loading database:', e)
        this.db = new SQL.Database()
      }
    } else {
      console.log(`Creating new database at ${this.dbPath}`)
      this.db = new SQL.Database()
    }

    this._initSchema()
    return true
  }

  _save() {
    const data = this.db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(this.dbPath, buffer)
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
        color TEXT,
        sort_order INTEGER DEFAULT 0,
        importance INTEGER,
        start_date TEXT,
        end_date TEXT,
        due_date TEXT,
        location TEXT,
        email TEXT,
        phone TEXT,
        organization TEXT,
        role TEXT,
        address TEXT,
        website TEXT,
        favorite INTEGER DEFAULT 0,
        notes_sensitive INTEGER DEFAULT 0,
        category_id INTEGER,
        status_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        deleted_at TEXT
      )
    `)

    // Migration: add notes_sensitive column if missing
    try {
      this.db.run(`ALTER TABLE nodes ADD COLUMN notes_sensitive INTEGER DEFAULT 0`)
    } catch (e) {
      // Column already exists, ignore
    }

    // Migration: fix root node paths (should be empty, not their own ID)
    this._fixRootNodePaths()

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path)`)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at)`)

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
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3498db',
        symbol TEXT DEFAULT '*',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS statuses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3498db',
        sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    // Don't save here - only save when data actually changes
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
    const result = this._query("SELECT last_insert_rowid() as id")
    const lastId = result[0]?.id
    this._save()
    return { lastInsertRowid: lastId }
  }

  _get(sql, params = []) {
    const results = this._query(sql, params)
    return results[0] || null
  }

  _rowToNode(row) {
    if (!row) return null
    return {
      ...row,
      completed: Boolean(row.completed),
      favorite: Boolean(row.favorite)
    }
  }

  _fixRootNodePaths() {
    // Find root nodes with non-empty paths (corrupted data)
    const corruptRoots = this._query(
      "SELECT id, path FROM nodes WHERE parent_id IS NULL AND path != '' AND path IS NOT NULL"
    )

    if (corruptRoots.length === 0) return

    console.log(`Fixing ${corruptRoots.length} root nodes with corrupted paths`)

    for (const root of corruptRoots) {
      const oldPrefix = root.path
      console.log(`Fixing root node ${root.id}: path '${oldPrefix}' -> ''`)

      // Fix the root node's path
      this.db.run('UPDATE nodes SET path = ? WHERE id = ?', ['', root.id])

      // Fix all descendants - remove the old prefix from their paths
      // e.g., '614/606' -> '606', '614/606/123' -> '606/123'
      const descendants = this._query(
        "SELECT id, path FROM nodes WHERE path LIKE ? OR path = ?",
        [`${oldPrefix}/%`, oldPrefix]
      )

      for (const desc of descendants) {
        let newPath = desc.path
        if (newPath === oldPrefix) {
          // Direct child of root - path should just be root.id
          newPath = `${root.id}`
        } else if (newPath.startsWith(`${oldPrefix}/`)) {
          // Remove the corrupt prefix, keep the rest starting from root.id
          newPath = newPath.slice(oldPrefix.length + 1) // Remove '614/'
        }

        if (newPath !== desc.path) {
          console.log(`Fixing descendant ${desc.id}: path '${desc.path}' -> '${newPath}'`)
          this.db.run('UPDATE nodes SET path = ? WHERE id = ?', [newPath, desc.id])
        }
      }
    }

    // Save after all fixes
    this._save()
    console.log('Path corruption fix complete')
  }

  // Node CRUD
  getNodes(params = {}) {
    let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL'
    const values = []

    if (params.type) {
      sql += ' AND type = ?'
      values.push(params.type)
    }
    if (params.parent_id !== undefined) {
      if (params.parent_id === null) {
        sql += ' AND parent_id IS NULL'
      } else {
        sql += ' AND parent_id = ?'
        values.push(params.parent_id)
      }
    }

    sql += ' ORDER BY sort_order, created_at'
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  getNode(id) {
    const row = this._get('SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL', [id])
    return this._rowToNode(row)
  }

  createNode(data) {
    const fields = ['type', 'title', 'parent_id', 'notes', 'completed', 'color', 'sort_order',
      'importance', 'start_date', 'end_date', 'due_date', 'location', 'email', 'phone',
      'organization', 'role', 'address', 'website', 'favorite', 'notes_sensitive', 'category_id', 'status_id']

    const presentFields = fields.filter(f => data[f] !== undefined)
    const values = presentFields.map(f => data[f])

    // Calculate depth and path
    let depth = 0
    let path = ''
    if (data.parent_id) {
      const parent = this.getNode(data.parent_id)
      if (parent) {
        depth = (parent.depth || 0) + 1
        path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
      }
    }

    presentFields.push('depth', 'path')
    values.push(depth, path)

    const placeholders = presentFields.map(() => '?').join(', ')
    const sql = `INSERT INTO nodes (${presentFields.join(', ')}) VALUES (${placeholders})`

    const result = this._run(sql, values)
    return this.getNode(result.lastInsertRowid)
  }

  updateNode(id, data) {
    const fields = ['type', 'title', 'parent_id', 'notes', 'completed', 'color', 'sort_order',
      'importance', 'start_date', 'end_date', 'due_date', 'location', 'email', 'phone',
      'organization', 'role', 'address', 'website', 'favorite', 'notes_sensitive', 'category_id', 'status_id']

    const updates = []
    const values = []

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = ?`)
        values.push(data[field])
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
    if (hard) {
      this._run('DELETE FROM nodes WHERE id = ?', [id])
    } else {
      this._run('UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
    }
    return { success: true }
  }

  // Tree operations
  getRoots() {
    const results = this._query(
      'SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, created_at'
    )
    console.log(`getRoots: found ${results.length} root nodes`)
    return results.map(r => this._rowToNode(r))
  }

  getProjects() {
    return this._query(
      "SELECT * FROM nodes WHERE type = 'project' AND deleted_at IS NULL ORDER BY sort_order, created_at"
    ).map(r => this._rowToNode(r))
  }

  getInbox() {
    return this._query(
      'SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, created_at'
    ).map(r => this._rowToNode(r))
  }

  getRecent(limit = 10) {
    return this._query(
      'SELECT * FROM nodes WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?',
      [limit]
    ).map(r => this._rowToNode(r))
  }

  getFavorites() {
    return this._query(
      'SELECT * FROM nodes WHERE favorite = 1 AND deleted_at IS NULL ORDER BY updated_at DESC'
    ).map(r => this._rowToNode(r))
  }

  getChildren(id, type = null) {
    let sql = 'SELECT * FROM nodes WHERE parent_id = ? AND deleted_at IS NULL'
    const values = [id]

    if (type) {
      sql += ' AND type = ?'
      values.push(type)
    }

    sql += ' ORDER BY sort_order, created_at'
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  getDescendants(id, maxDepth = null) {
    const node = this.getNode(id)
    if (!node) return []

    const pathPrefix = node.path ? `${node.path}/${id}` : `${id}`

    let sql = "SELECT * FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL"
    const values = [pathPrefix, `${pathPrefix}/%`]

    if (maxDepth !== null) {
      sql += ' AND depth <= ?'
      values.push(node.depth + maxDepth)
    }

    sql += ' ORDER BY depth, sort_order, created_at'
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  getAncestors(id) {
    const node = this.getNode(id)
    if (!node || !node.path) return []

    const ancestorIds = node.path.split('/').filter(Boolean).map(Number)
    if (ancestorIds.length === 0) return []

    const placeholders = ancestorIds.map(() => '?').join(', ')
    return this._query(
      `SELECT * FROM nodes WHERE id IN (${placeholders}) ORDER BY depth`,
      ancestorIds
    ).map(r => this._rowToNode(r))
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

    // Update descendants' paths
    this._updateDescendantPaths(id)

    return this.getNode(id)
  }

  _updateDescendantPaths(nodeId) {
    const node = this.getNode(nodeId)
    if (!node) return

    const children = this.getChildren(nodeId)
    for (const child of children) {
      const newPath = node.path ? `${node.path}/${node.id}` : `${node.id}`
      const newDepth = node.depth + 1
      this._run('UPDATE nodes SET path = ?, depth = ? WHERE id = ?', [newPath, newDepth, child.id])
      this._updateDescendantPaths(child.id)
    }
  }

  // Links
  linkNodes(sourceId, targetId) {
    try {
      this._run(
        'INSERT INTO node_links (source_id, target_id) VALUES (?, ?)',
        [sourceId, targetId]
      )
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }

  unlinkNodes(sourceId, targetId) {
    this._run(
      'DELETE FROM node_links WHERE source_id = ? AND target_id = ?',
      [sourceId, targetId]
    )
    return { success: true }
  }

  getAllLinks(nodeIds = null) {
    if (nodeIds && nodeIds.length > 0) {
      const placeholders = nodeIds.map(() => '?').join(', ')
      return this._query(
        `SELECT * FROM node_links WHERE source_id IN (${placeholders}) OR target_id IN (${placeholders})`,
        [...nodeIds, ...nodeIds]
      )
    }
    return this._query('SELECT * FROM node_links')
  }

  getLinkedNodes(id) {
    const links = this._query(
      'SELECT * FROM node_links WHERE source_id = ? OR target_id = ?',
      [id, id]
    )

    const linkedIds = new Set()
    for (const link of links) {
      if (link.source_id !== id) linkedIds.add(link.source_id)
      if (link.target_id !== id) linkedIds.add(link.target_id)
    }

    if (linkedIds.size === 0) return []

    const placeholders = [...linkedIds].map(() => '?').join(', ')
    return this._query(
      `SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      [...linkedIds]
    ).map(r => this._rowToNode(r))
  }

  // Tree view with nested children
  getTree(rootId = null) {
    const nodes = rootId
      ? [this.getNode(rootId), ...this.getDescendants(rootId)]
      : this.getRoots().flatMap(root => [root, ...this.getDescendants(root.id)])

    const nodeMap = new Map()
    for (const node of nodes) {
      if (node) nodeMap.set(node.id, { ...node, children: [] })
    }

    const roots = []
    for (const node of nodeMap.values()) {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id).children.push(node)
      } else if (!node.parent_id || node.id === rootId) {
        roots.push(node)
      }
    }

    return roots
  }

  // Search
  search(query, type = null) {
    let sql = "SELECT * FROM nodes WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)"
    const values = [`%${query}%`, `%${query}%`]

    if (type) {
      sql += ' AND type = ?'
      values.push(type)
    }

    sql += ' ORDER BY updated_at DESC LIMIT 50'
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  // Reorder
  reorderNode(nodeId, targetId, position) {
    const node = this.getNode(nodeId)
    const target = this.getNode(targetId)
    if (!node || !target) return null

    // Get siblings
    const siblings = this.getChildren(target.parent_id)
    const targetIndex = siblings.findIndex(s => s.id === targetId)

    let newOrder
    if (position === 'before') {
      newOrder = targetIndex > 0 ? siblings[targetIndex - 1].sort_order + 1 : target.sort_order - 1
    } else {
      newOrder = targetIndex < siblings.length - 1 ? target.sort_order + 1 : target.sort_order + 1
    }

    this._run('UPDATE nodes SET sort_order = ?, parent_id = ? WHERE id = ?',
      [newOrder, target.parent_id, nodeId])

    return this.getNode(nodeId)
  }

  // Export
  exportMarkdown(nodeId) {
    const node = this.getNode(nodeId)
    if (!node) return { markdown: '' }

    let md = `# ${node.title}\n\n`
    if (node.notes) md += `${node.notes}\n\n`

    const children = this.getChildren(nodeId)
    for (const child of children) {
      md += `## ${child.title}\n\n`
      if (child.notes) md += `${child.notes}\n\n`
    }

    return { markdown: md }
  }

  // Trash
  getTrash(limit = 100) {
    return this._query(
      'SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?',
      [limit]
    ).map(r => this._rowToNode(r))
  }

  restoreNode(id) {
    this._run('UPDATE nodes SET deleted_at = NULL WHERE id = ?', [id])
    return this.getNode(id)
  }

  emptyTrash() {
    const result = this._query('SELECT COUNT(*) as count FROM nodes WHERE deleted_at IS NOT NULL')
    const count = result[0]?.count || 0
    this._run('DELETE FROM nodes WHERE deleted_at IS NOT NULL')
    return { deleted: count }
  }
}

module.exports = Database
