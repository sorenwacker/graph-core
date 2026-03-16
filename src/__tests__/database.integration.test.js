import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import initSqlJs from 'sql.js'

/**
 * Database Integration Tests
 *
 * These tests run against a real in-memory SQLite database using sql.js.
 * No mocks - actual database operations are verified.
 */

// Simplified Database class for testing (same logic as electron/database.js)
class TestDatabase {
  constructor(db) {
    this.db = db
    this._initSchema()
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

    // Seed default workspaces
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
    const result = this._query("SELECT last_insert_rowid() as id")
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
      try { tags = JSON.parse(row.tags) } catch { tags = [] }
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
    const fields = ['type', 'title', 'parent_id', 'notes', 'completed', 'sort_order',
      'importance', 'start_date', 'end_date', 'due_date', 'favorite', 'tags', 'workspace_id', 'show_links']

    let depth = 0
    let path = ''
    if (data.parent_id) {
      const parent = this.getNode(data.parent_id)
      if (parent) {
        depth = (parent.depth || 0) + 1
        path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
      }
    }

    const presentFields = fields.filter(f => data[f] !== undefined)
    const values = presentFields.map(f => {
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
    const fields = ['type', 'title', 'parent_id', 'notes', 'completed', 'sort_order',
      'importance', 'start_date', 'end_date', 'due_date', 'favorite', 'tags', 'workspace_id', 'show_links']

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

    // Reassign children to parent
    this._run('UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [newParentId, id])

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
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  getChildren(parentId) {
    return this._query(
      'SELECT * FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at',
      [parentId]
    ).map(r => this._rowToNode(r))
  }

  getDescendants(id) {
    const node = this.getNode(id)
    if (!node) return []

    const pathPrefix = node.path ? `${node.path}/${id}` : `${id}`
    return this._query(
      "SELECT * FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL ORDER BY depth",
      [pathPrefix, `${pathPrefix}/%`]
    ).map(r => this._rowToNode(r))
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
    const links = this._query(
      'SELECT * FROM node_links WHERE source_id = ? OR target_id = ?',
      [numId, numId]
    )

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
    ).map(r => this._rowToNode(r))
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

  // Tags
  getAllTags() {
    const nodes = this._query('SELECT tags FROM nodes WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != "[]"')
    const tagSet = new Set()
    for (const node of nodes) {
      try {
        const tags = JSON.parse(node.tags || '[]')
        tags.forEach(tag => tagSet.add(tag))
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
    ).map(r => this._rowToNode(r))
  }

  // Workspaces
  getWorkspaces() {
    return this._query('SELECT * FROM workspaces ORDER BY sort_order, name')
  }

  // Trash
  getTrash() {
    return this._query('SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC')
      .map(r => this._rowToNode(r))
  }
}

describe('Database Integration Tests', () => {
  let SQL
  let db
  let testDb

  beforeEach(async () => {
    SQL = await initSqlJs()
    db = new SQL.Database()
    testDb = new TestDatabase(db)
  })

  afterEach(() => {
    db.close()
  })

  describe('Node CRUD', () => {
    it('should create a node and retrieve it', () => {
      const node = testDb.createNode({
        title: 'Test Task',
        type: 'task',
        workspace_id: 'work'
      })

      expect(node.id).toBeDefined()
      expect(node.title).toBe('Test Task')
      expect(node.type).toBe('task')
      expect(node.workspace_id).toBe('work')
      expect(node.completed).toBe(false)

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.title).toBe('Test Task')
    })

    it('should update a node', () => {
      const node = testDb.createNode({ title: 'Original', type: 'task' })

      const updated = testDb.updateNode(node.id, {
        title: 'Updated Title',
        notes: 'Some notes',
        completed: true
      })

      expect(updated.title).toBe('Updated Title')
      expect(updated.notes).toBe('Some notes')
      expect(updated.completed).toBe(true)
    })

    it('should soft delete a node', () => {
      const node = testDb.createNode({ title: 'To Delete', type: 'task' })

      testDb.deleteNode(node.id, false)

      const retrieved = testDb.getNode(node.id)
      expect(retrieved).toBeNull()

      const trash = testDb.getTrash()
      expect(trash.some(n => n.id === node.id)).toBe(true)
    })

    it('should hard delete a node', () => {
      const node = testDb.createNode({ title: 'To Delete', type: 'task' })

      testDb.deleteNode(node.id, true)

      const retrieved = testDb.getNode(node.id)
      expect(retrieved).toBeNull()

      const trash = testDb.getTrash()
      expect(trash.some(n => n.id === node.id)).toBe(false)
    })

    it('should restore a soft-deleted node', () => {
      const node = testDb.createNode({ title: 'Deleted', type: 'task' })
      testDb.deleteNode(node.id, false)

      const restored = testDb.restoreNode(node.id)

      expect(restored.title).toBe('Deleted')
      expect(testDb.getNode(node.id)).not.toBeNull()
    })

    it('should reassign children to grandparent when deleting parent', () => {
      const grandparent = testDb.createNode({ title: 'Grandparent', type: 'project' })
      const parent = testDb.createNode({ title: 'Parent', type: 'project', parent_id: grandparent.id })
      const child = testDb.createNode({ title: 'Child', type: 'task', parent_id: parent.id })

      testDb.deleteNode(parent.id, false)

      const updatedChild = testDb.getNode(child.id)
      expect(updatedChild.parent_id).toBe(grandparent.id)
    })
  })

  describe('Tree Operations', () => {
    it('should get root nodes', () => {
      testDb.createNode({ title: 'Root 1', type: 'project', workspace_id: 'work' })
      testDb.createNode({ title: 'Root 2', type: 'project', workspace_id: 'work' })

      const roots = testDb.getRoots('work')
      expect(roots.length).toBe(2)
    })

    it('should get children of a node', () => {
      const parent = testDb.createNode({ title: 'Parent', type: 'project' })
      testDb.createNode({ title: 'Child 1', type: 'task', parent_id: parent.id })
      testDb.createNode({ title: 'Child 2', type: 'task', parent_id: parent.id })

      const children = testDb.getChildren(parent.id)
      expect(children.length).toBe(2)
      expect(children.every(c => c.parent_id === parent.id)).toBe(true)
    })

    it('should calculate depth and path correctly', () => {
      const root = testDb.createNode({ title: 'Root', type: 'project' })
      const child = testDb.createNode({ title: 'Child', type: 'task', parent_id: root.id })
      const grandchild = testDb.createNode({ title: 'Grandchild', type: 'task', parent_id: child.id })

      expect(root.depth).toBe(0)
      expect(root.path).toBe('')

      expect(child.depth).toBe(1)
      expect(child.path).toBe(`${root.id}`)

      expect(grandchild.depth).toBe(2)
      expect(grandchild.path).toBe(`${root.id}/${child.id}`)
    })

    it('should get descendants', () => {
      const root = testDb.createNode({ title: 'Root', type: 'project' })
      const child1 = testDb.createNode({ title: 'Child 1', type: 'task', parent_id: root.id })
      const child2 = testDb.createNode({ title: 'Child 2', type: 'task', parent_id: root.id })
      testDb.createNode({ title: 'Grandchild', type: 'task', parent_id: child1.id })

      const descendants = testDb.getDescendants(root.id)
      expect(descendants.length).toBe(3)
    })

    it('should get ancestors', () => {
      const root = testDb.createNode({ title: 'Root', type: 'project' })
      const child = testDb.createNode({ title: 'Child', type: 'task', parent_id: root.id })
      const grandchild = testDb.createNode({ title: 'Grandchild', type: 'task', parent_id: child.id })

      const ancestors = testDb.getAncestors(grandchild.id)
      expect(ancestors.length).toBe(2)
      expect(ancestors[0].id).toBe(root.id)
      expect(ancestors[1].id).toBe(child.id)
    })

    it('should move a node to a new parent', () => {
      const parent1 = testDb.createNode({ title: 'Parent 1', type: 'project' })
      const parent2 = testDb.createNode({ title: 'Parent 2', type: 'project' })
      const child = testDb.createNode({ title: 'Child', type: 'task', parent_id: parent1.id })

      const moved = testDb.moveNode(child.id, parent2.id)

      expect(moved.parent_id).toBe(parent2.id)
      expect(moved.path).toBe(`${parent2.id}`)
      expect(testDb.getChildren(parent1.id).length).toBe(0)
      expect(testDb.getChildren(parent2.id).length).toBe(1)
    })

    it('should move a node to root', () => {
      const parent = testDb.createNode({ title: 'Parent', type: 'project' })
      const child = testDb.createNode({ title: 'Child', type: 'task', parent_id: parent.id })

      const moved = testDb.moveNode(child.id, null)

      expect(moved.parent_id).toBeNull()
      expect(moved.depth).toBe(0)
      expect(moved.path).toBe('')
    })
  })

  describe('Node Links', () => {
    it('should create a link between nodes', () => {
      const node1 = testDb.createNode({ title: 'Node 1', type: 'task' })
      const node2 = testDb.createNode({ title: 'Node 2', type: 'task' })

      const result = testDb.linkNodes(node1.id, node2.id)
      expect(result.success).toBe(true)

      const linked = testDb.getLinkedNodes(node1.id)
      expect(linked.length).toBe(1)
      expect(linked[0].id).toBe(node2.id)
    })

    it('should get linked nodes from both directions', () => {
      const node1 = testDb.createNode({ title: 'Node 1', type: 'task' })
      const node2 = testDb.createNode({ title: 'Node 2', type: 'task' })

      testDb.linkNodes(node1.id, node2.id)

      // node2 should see node1 as linked
      const linkedFromNode2 = testDb.getLinkedNodes(node2.id)
      expect(linkedFromNode2.length).toBe(1)
      expect(linkedFromNode2[0].id).toBe(node1.id)
    })

    it('should remove a link between nodes', () => {
      const node1 = testDb.createNode({ title: 'Node 1', type: 'task' })
      const node2 = testDb.createNode({ title: 'Node 2', type: 'task' })

      testDb.linkNodes(node1.id, node2.id)
      testDb.unlinkNodes(node1.id, node2.id)

      const linked = testDb.getLinkedNodes(node1.id)
      expect(linked.length).toBe(0)
    })

    it('should not create duplicate links', () => {
      const node1 = testDb.createNode({ title: 'Node 1', type: 'task' })
      const node2 = testDb.createNode({ title: 'Node 2', type: 'task' })

      testDb.linkNodes(node1.id, node2.id)
      const result = testDb.linkNodes(node1.id, node2.id)

      // Should fail due to UNIQUE constraint
      expect(result.success).toBe(false)
    })

    it('should handle multiple links per node', () => {
      const center = testDb.createNode({ title: 'Center', type: 'project' })
      const linked1 = testDb.createNode({ title: 'Linked 1', type: 'task' })
      const linked2 = testDb.createNode({ title: 'Linked 2', type: 'person' })
      const linked3 = testDb.createNode({ title: 'Linked 3', type: 'note' })

      testDb.linkNodes(center.id, linked1.id)
      testDb.linkNodes(center.id, linked2.id)
      testDb.linkNodes(center.id, linked3.id)

      const allLinked = testDb.getLinkedNodes(center.id)
      expect(allLinked.length).toBe(3)
    })
  })

  describe('Tags', () => {
    it('should store and retrieve tags', () => {
      const node = testDb.createNode({
        title: 'Tagged Node',
        type: 'task',
        tags: ['urgent', 'bug', 'backend']
      })

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.tags).toEqual(['urgent', 'bug', 'backend'])
    })

    it('should update tags', () => {
      const node = testDb.createNode({
        title: 'Node',
        type: 'task',
        tags: ['old-tag']
      })

      testDb.updateNode(node.id, { tags: ['new-tag-1', 'new-tag-2'] })

      const updated = testDb.getNode(node.id)
      expect(updated.tags).toEqual(['new-tag-1', 'new-tag-2'])
    })

    it('should get all unique tags', () => {
      testDb.createNode({ title: 'Node 1', type: 'task', tags: ['bug', 'urgent'] })
      testDb.createNode({ title: 'Node 2', type: 'task', tags: ['feature', 'urgent'] })
      testDb.createNode({ title: 'Node 3', type: 'task', tags: ['bug', 'backend'] })

      const allTags = testDb.getAllTags()
      expect(allTags).toContain('bug')
      expect(allTags).toContain('urgent')
      expect(allTags).toContain('feature')
      expect(allTags).toContain('backend')
      expect(allTags.length).toBe(4)
    })

    it('should get nodes by tag', () => {
      testDb.createNode({ title: 'Node 1', type: 'task', tags: ['bug'] })
      testDb.createNode({ title: 'Node 2', type: 'task', tags: ['feature'] })
      testDb.createNode({ title: 'Node 3', type: 'task', tags: ['bug', 'urgent'] })

      const bugNodes = testDb.getNodesByTag('bug')
      expect(bugNodes.length).toBe(2)
      expect(bugNodes.every(n => n.tags.includes('bug'))).toBe(true)
    })
  })

  describe('Search', () => {
    it('should search by title', () => {
      testDb.createNode({ title: 'Important Meeting', type: 'task' })
      testDb.createNode({ title: 'Unrelated Task', type: 'task' })
      testDb.createNode({ title: 'Meeting Notes', type: 'note' })

      const results = testDb.search('Meeting')
      expect(results.length).toBe(2)
      expect(results.every(r => r.title.includes('Meeting'))).toBe(true)
    })

    it('should search by notes', () => {
      testDb.createNode({ title: 'Task 1', type: 'task', notes: 'Contains keyword here' })
      testDb.createNode({ title: 'Task 2', type: 'task', notes: 'No match' })

      const results = testDb.search('keyword')
      expect(results.length).toBe(1)
      expect(results[0].title).toBe('Task 1')
    })

    it('should filter search by type', () => {
      testDb.createNode({ title: 'Meeting', type: 'task' })
      testDb.createNode({ title: 'Meeting', type: 'note' })

      const taskResults = testDb.search('Meeting', 'task')
      expect(taskResults.length).toBe(1)
      expect(taskResults[0].type).toBe('task')
    })

    it('should not return deleted nodes in search', () => {
      const node = testDb.createNode({ title: 'Searchable', type: 'task' })
      testDb.deleteNode(node.id, false)

      const results = testDb.search('Searchable')
      expect(results.length).toBe(0)
    })
  })

  describe('Workspaces', () => {
    it('should have default workspaces', () => {
      const workspaces = testDb.getWorkspaces()
      expect(workspaces.some(w => w.id === 'work')).toBe(true)
      expect(workspaces.some(w => w.id === 'private')).toBe(true)
    })

    it('should filter roots by workspace', () => {
      testDb.createNode({ title: 'Work Task', type: 'task', workspace_id: 'work' })
      testDb.createNode({ title: 'Private Task', type: 'task', workspace_id: 'private' })

      const workRoots = testDb.getRoots('work')
      const privateRoots = testDb.getRoots('private')

      expect(workRoots.every(r => r.workspace_id === 'work')).toBe(true)
      expect(privateRoots.every(r => r.workspace_id === 'private')).toBe(true)
    })
  })

  describe('show_links setting', () => {
    it('should default show_links to 1', () => {
      const node = testDb.createNode({ title: 'Test', type: 'task' })

      // show_links should default to 1 (true)
      expect(node.show_links).toBe(1)
    })

    it('should persist show_links = 0', () => {
      const node = testDb.createNode({ title: 'Test', type: 'task', show_links: 0 })

      expect(node.show_links).toBe(0)

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.show_links).toBe(0)
    })

    it('should update show_links', () => {
      const node = testDb.createNode({ title: 'Test', type: 'task' })

      testDb.updateNode(node.id, { show_links: 0 })

      const updated = testDb.getNode(node.id)
      expect(updated.show_links).toBe(0)

      testDb.updateNode(node.id, { show_links: 1 })

      const updatedAgain = testDb.getNode(node.id)
      expect(updatedAgain.show_links).toBe(1)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty database', () => {
      const roots = testDb.getRoots()
      expect(roots).toEqual([])

      const tags = testDb.getAllTags()
      expect(tags).toEqual([])
    })

    it('should handle special characters in title', () => {
      const node = testDb.createNode({
        title: "Test's \"Special\" <Characters> & More",
        type: 'task'
      })

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.title).toBe("Test's \"Special\" <Characters> & More")
    })

    it('should handle unicode in notes', () => {
      const node = testDb.createNode({
        title: 'Unicode Test',
        type: 'note',
        notes: 'Japanese: \u65e5\u672c\u8a9e, Emoji: \ud83d\ude00\ud83d\ude80\ud83c\udf33'
      })

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.notes).toContain('\u65e5\u672c\u8a9e')
    })

    it('should handle getting non-existent node', () => {
      const node = testDb.getNode(99999)
      expect(node).toBeNull()
    })

    it('should handle getting ancestors of root node', () => {
      const root = testDb.createNode({ title: 'Root', type: 'project' })
      const ancestors = testDb.getAncestors(root.id)
      expect(ancestors).toEqual([])
    })

    it('should handle empty tags array', () => {
      const node = testDb.createNode({
        title: 'No Tags',
        type: 'task',
        tags: []
      })

      const retrieved = testDb.getNode(node.id)
      expect(retrieved.tags).toEqual([])
    })
  })
})
