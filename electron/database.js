const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

let SQL = null // Will be initialized once

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
    this.ready = this._init()
  }

  async _init() {
    if (!SQL) {
      SQL = await initSqlJs()
    }

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

  // Backup database to timestamped file
  backup(suffix = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = this.dbPath.replace('.db', `-backup-${timestamp}${suffix}.db`)
    const data = this.db.export()
    fs.writeFileSync(backupPath, Buffer.from(data))
    console.log(`Database backed up to: ${backupPath}`)
    return backupPath
  }

  // List available backups
  listBackups() {
    const dir = path.dirname(this.dbPath)
    const base = path.basename(this.dbPath, '.db')
    try {
      return fs.readdirSync(dir)
        .filter(f => f.startsWith(base + '-backup-') && f.endsWith('.db'))
        .map(f => ({
          path: path.join(dir, f),
          name: f,
          created: fs.statSync(path.join(dir, f)).mtime
        }))
        .sort((a, b) => b.created - a.created)
    } catch (e) {
      return []
    }
  }

  // Restore from backup
  restoreBackup(backupPath) {
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found: ${backupPath}`)
    }
    // Create a safety backup before restore
    this.backup('-pre-restore')
    const buffer = fs.readFileSync(backupPath)
    this.db = new SQL.Database(buffer)
    this._save()
    console.log(`Database restored from: ${backupPath}`)
    return { success: true, restoredFrom: backupPath }
  }

  // Reload database from disk (picks up external changes)
  reload() {
    if (!fs.existsSync(this.dbPath)) {
      throw new Error('Database file not found')
    }
    const buffer = fs.readFileSync(this.dbPath)
    this.db = new SQL.Database(buffer)
    const count = this._query('SELECT COUNT(*) as cnt FROM nodes')[0]?.cnt || 0
    console.log(`Database reloaded with ${count} nodes`)
    return { success: true, nodeCount: count }
  }

  // =========================================
  // WORKSPACE METHODS
  // =========================================

  /**
   * Seed default workspaces if they don't exist
   * Called during schema initialization
   */
  _seedDefaultWorkspaces() {
    const defaults = [
      { id: 'work', name: 'Work', color: '#3498db', icon: 'briefcase', sort_order: 1 },
      { id: 'private', name: 'Private', color: '#27ae60', icon: 'home', sort_order: 2 }
    ]
    for (const ws of defaults) {
      try {
        this.db.run(
          `INSERT OR IGNORE INTO workspaces (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`,
          [ws.id, ws.name, ws.color, ws.icon, ws.sort_order]
        )
      } catch (e) {
        // Ignore duplicates
      }
    }
  }

  /**
   * Get all workspaces sorted by sort_order
   * @returns {Array} List of workspace objects
   */
  getWorkspaces() {
    return this._query('SELECT * FROM workspaces ORDER BY sort_order, name')
  }

  /**
   * Get a single workspace by ID
   * @param {string} id - Workspace ID
   * @returns {Object|null} Workspace object or null
   */
  getWorkspace(id) {
    return this._get('SELECT * FROM workspaces WHERE id = ?', [id])
  }

  /**
   * Create a new workspace
   * @param {Object} data - Workspace data { name, color?, icon?, sort_order? }
   * @returns {Object} Created workspace
   */
  createWorkspace(data) {
    const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    this._run(
      `INSERT INTO workspaces (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`,
      [id, data.name, data.color || '#3498db', data.icon || 'folder', data.sort_order || 99]
    )
    return this.getWorkspace(id)
  }

  /**
   * Update an existing workspace
   * @param {string} id - Workspace ID
   * @param {Object} data - Fields to update { name?, color?, icon?, sort_order? }
   * @returns {Object} Updated workspace
   */
  updateWorkspace(id, data) {
    const allowedFields = ['name', 'color', 'icon', 'sort_order', 'is_default']
    const updates = []
    const values = []
    for (const [key, value] of Object.entries(data)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = ?`)
        values.push(value)
      }
    }
    if (updates.length > 0) {
      values.push(id)
      this._run(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`, values)
    }
    return this.getWorkspace(id)
  }

  /**
   * Delete a workspace and orphan its nodes (set workspace_id to NULL)
   * @param {string} id - Workspace ID to delete
   * @returns {Object} Success status
   */
  deleteWorkspace(id) {
    // Move nodes to unassigned (NULL workspace = People workspace rules apply)
    this._run('UPDATE nodes SET workspace_id = NULL WHERE workspace_id = ?', [id])
    this._run('DELETE FROM workspaces WHERE id = ?', [id])
    return { success: true }
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

    // Migration: add tags column (JSON array of tag strings)
    try {
      this.db.run(`ALTER TABLE nodes ADD COLUMN tags TEXT DEFAULT '[]'`)
    } catch (e) {
      // Column already exists, ignore
    }

    // =========================================
    // WORKSPACES FEATURE
    // =========================================
    // Workspaces provide complete data isolation. Each workspace (work, home, hobby)
    // has its own nodes, graphs, and views. The People workspace is special - it's
    // shared across all workspaces for @person mentions.
    //
    // Node.workspace_id:
    //   - NULL = People workspace (persons only, shared across all workspaces)
    //   - "work", "home", "hobby" = Independent workspaces
    // =========================================

    // Workspaces table
    this.db.run(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT DEFAULT '#3498db',
        icon TEXT DEFAULT 'folder',
        sort_order INTEGER DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `)
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_workspaces_sort ON workspaces(sort_order)`)

    // Migration: add workspace_id to nodes
    try {
      // BACKUP FIRST before any migration
      this.backup('-pre-workspace-migration')
      console.log('Created backup before workspace migration')

      this.db.run(`ALTER TABLE nodes ADD COLUMN workspace_id TEXT DEFAULT NULL`)
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes(workspace_id)`)
      console.log('Added workspace_id column to nodes table')
    } catch (e) {
      // Column already exists, ensure index exists
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes(workspace_id)`)
    }

    // Always ensure default workspaces exist
    this._seedDefaultWorkspaces()

    // Migration: assign existing nodes without workspace to 'work' (except persons, organizations, groups)
    // People workspace keeps: person, organization, group
    const unassigned = this._query(
      "SELECT COUNT(*) as cnt FROM nodes WHERE workspace_id IS NULL AND type NOT IN ('person', 'organization', 'group') AND deleted_at IS NULL"
    )
    if (unassigned[0]?.cnt > 0) {
      console.log(`Migrating ${unassigned[0].cnt} unassigned nodes to 'work' workspace`)
      this.db.run("UPDATE nodes SET workspace_id = 'work' WHERE workspace_id IS NULL AND type NOT IN ('person', 'organization', 'group')")
      this._save()
    }

    // Note: Organizations and groups can exist in any workspace.
    // They are NOT automatically moved to People workspace.

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

    // Person migrations (single responsibility)
    this._migratePersonsToRootNodes()      // Persons with parent_id -> root + link
    this._migratePersonChildrenToRoot()    // Children of persons -> root + link
    this._migrateOrganizationTextToLinks() // Org text field -> org node + link

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
    // Parse tags JSON
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

  /**
   * Migration: Convert persons with parent_id to root nodes with links.
   * Persons should be independent root nodes connected via links (not parent-child).
   */
  _migratePersonsToRootNodes() {
    const personsWithParents = this._query(
      "SELECT id, parent_id FROM nodes WHERE type = 'person' AND parent_id IS NOT NULL AND deleted_at IS NULL"
    )
    if (personsWithParents.length === 0) return

    for (const person of personsWithParents) {
      this.db.run('INSERT OR IGNORE INTO node_links (source_id, target_id) VALUES (?, ?)', [person.id, person.parent_id])
      this.db.run('UPDATE nodes SET parent_id = NULL, path = "", depth = 0 WHERE id = ?', [person.id])
    }

    console.log(`Migrated ${personsWithParents.length} person parent-child relationships to links`)
    this._save()
  }

  /**
   * Migration: Move children of persons to root level with links.
   * Nothing should be a child of a person node.
   */
  _migratePersonChildrenToRoot() {
    const children = this._query(`
      SELECT n.id, n.parent_id FROM nodes n
      JOIN nodes p ON n.parent_id = p.id
      WHERE p.type = 'person' AND n.deleted_at IS NULL
    `)
    if (children.length === 0) return

    for (const node of children) {
      this.db.run('INSERT OR IGNORE INTO node_links (source_id, target_id) VALUES (?, ?)', [node.id, node.parent_id])
      this.db.run('UPDATE nodes SET parent_id = NULL, path = "", depth = 0 WHERE id = ?', [node.id])
    }

    console.log(`Migrated ${children.length} person children to root with links`)
    this._save()
  }

  /**
   * Migration: Convert organization text field on persons to organization node links
   * For persons with organization text but no linked organization, create/find org and link
   */
  _migrateOrganizationTextToLinks() {
    // Find persons with organization text field that don't have linked organizations
    const personsWithOrgText = this._query(
      "SELECT id, organization FROM nodes WHERE type = 'person' AND organization IS NOT NULL AND organization != '' AND deleted_at IS NULL"
    )

    if (personsWithOrgText.length === 0) return

    let migrated = 0
    const orgCache = new Map() // Cache organization nodes by title

    for (const person of personsWithOrgText) {
      const orgName = person.organization.trim()
      if (!orgName) continue

      // Check if person already has a linked organization
      const existingLinks = this._query(
        `SELECT n.id FROM node_links nl
         JOIN nodes n ON (nl.target_id = n.id OR nl.source_id = n.id) AND n.id != ?
         WHERE (nl.source_id = ? OR nl.target_id = ?) AND n.type = 'organization' AND n.deleted_at IS NULL`,
        [person.id, person.id, person.id]
      )

      if (existingLinks.length > 0) {
        // Person already has linked organization, clear the text field
        this.db.run('UPDATE nodes SET organization = NULL WHERE id = ?', [person.id])
        continue
      }

      // Find or create organization node
      let orgId = orgCache.get(orgName.toLowerCase())
      if (!orgId) {
        const existingOrg = this._query(
          "SELECT id FROM nodes WHERE type = 'organization' AND LOWER(title) = LOWER(?) AND deleted_at IS NULL",
          [orgName]
        )[0]

        if (existingOrg) {
          orgId = existingOrg.id
        } else {
          // Create new organization node
          this.db.run(
            "INSERT INTO nodes (type, title, workspace_id, path, depth, created_at, updated_at) VALUES (?, ?, NULL, '', 0, datetime('now'), datetime('now'))",
            ['organization', orgName]
          )
          const result = this._query("SELECT last_insert_rowid() as id")
          orgId = result[0]?.id
        }
        orgCache.set(orgName.toLowerCase(), orgId)
      }

      if (orgId) {
        // Create link between person and organization
        try {
          this.db.run(
            'INSERT OR IGNORE INTO node_links (source_id, target_id) VALUES (?, ?)',
            [person.id, orgId]
          )
          migrated++
        } catch (e) {
          // Link might already exist
        }

        // Clear the organization text field
        this.db.run('UPDATE nodes SET organization = NULL WHERE id = ?', [person.id])
      }
    }

    if (migrated > 0) {
      console.log(`Migrated ${migrated} person organization text fields to links`)
      this._save()
    }
  }

  // Node CRUD
  /**
   * Get nodes with optional filtering by type, parent, and workspace
   * @param {Object} params - Filter parameters
   * @param {string} params.type - Filter by node type
   * @param {number|null} params.parent_id - Filter by parent ID (null = root nodes)
   * @param {string|null} params.workspace_id - Filter by workspace:
   *   - undefined: return all (backward compatible)
   *   - null: People workspace (persons only)
   *   - string: specific workspace
   */
  getNodes(params = {}) {
    let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL'
    const values = []

    // Workspace filtering
    // Handle null (which might come as null, 'null', or undefined from IPC)
    if (params.workspace_id === null || params.workspace_id === 'null') {
      // People workspace: all nodes with NULL workspace_id
      sql += " AND workspace_id IS NULL"
    } else if (params.workspace_id !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(params.workspace_id)
    }

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
      'organization', 'role', 'address', 'website', 'favorite', 'notes_sensitive', 'category_id', 'status_id', 'tags', 'workspace_id']

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
      'organization', 'role', 'address', 'website', 'favorite', 'notes_sensitive', 'category_id', 'status_id', 'tags', 'workspace_id']

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
    // Get the node's parent before deleting
    const node = this.getNode(id)
    const newParentId = node?.parent_id || null

    // Reassign children to the node's parent (or root if no parent)
    this._run('UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [newParentId, id])

    if (hard) {
      this._run('DELETE FROM nodes WHERE id = ?', [id])
    } else {
      this._run('UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
    }

    // Update paths for reassigned children
    const reassignedChildren = this._query('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [newParentId])
    for (const child of reassignedChildren) {
      this._updateDescendantPaths(child.id)
    }

    return { success: true }
  }

  // Tree operations
  /**
   * Get root nodes (no parent) filtered by workspace
   * @param {string|null|undefined} workspaceId - Workspace filter:
   *   - undefined: return all roots (backward compatible)
   *   - null: People workspace (persons only)
   *   - string: specific workspace
   */
  getRoots(workspaceId = undefined) {
    let sql = 'SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL'
    const values = []

    if (workspaceId === null || workspaceId === 'null') {
      // People workspace: all nodes with NULL workspace_id (persons + their containers)
      sql += " AND workspace_id IS NULL"
    } else if (workspaceId !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(workspaceId)
    }

    sql += ' ORDER BY sort_order, created_at'
    const results = this._query(sql, values)
    console.log(`getRoots(${workspaceId}): found ${results.length} root nodes`)
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

  getRecent(limit = 10, workspaceId = undefined) {
    let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL'
    const values = []

    if (workspaceId === null || workspaceId === 'null') {
      // People workspace: nodes with NULL workspace_id
      sql += ' AND workspace_id IS NULL'
    } else if (workspaceId !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(workspaceId)
    }

    sql += ' ORDER BY updated_at DESC LIMIT ?'
    values.push(limit)
    return this._query(sql, values).map(r => this._rowToNode(r))
  }

  getFavorites(workspaceId = undefined) {
    let sql = 'SELECT * FROM nodes WHERE favorite = 1 AND deleted_at IS NULL'
    const values = []

    if (workspaceId === null || workspaceId === 'null') {
      // People workspace: nodes with NULL workspace_id
      sql += ' AND workspace_id IS NULL'
    } else if (workspaceId !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(workspaceId)
    }

    sql += ' ORDER BY updated_at DESC'
    return this._query(sql, values).map(r => this._rowToNode(r))
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
  /**
   * Search nodes by title/notes with optional type and workspace filtering
   * @param {string} query - Search query
   * @param {string|null} type - Filter by node type
   * @param {string|null|undefined} workspaceId - Workspace filter:
   *   - undefined: search all (backward compatible)
   *   - null: People workspace (persons only)
   *   - string: specific workspace
   */
  search(query, type = null, workspaceId = undefined) {
    let sql = "SELECT * FROM nodes WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)"
    const values = [`%${query}%`, `%${query}%`]

    // Workspace filtering
    // When searching for persons, always search people workspace (null) unless specified otherwise
    const effectiveWorkspaceId = (type === 'person' && workspaceId === undefined) ? null : workspaceId

    if (effectiveWorkspaceId === null || effectiveWorkspaceId === 'null') {
      // People workspace: all nodes with NULL workspace_id
      sql += " AND workspace_id IS NULL"
    } else if (effectiveWorkspaceId !== undefined) {
      sql += ' AND workspace_id = ?'
      values.push(effectiveWorkspaceId)
    }

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

  // Export node and all descendants as structured markdown
  exportMarkdown(nodeId) {
    const db = this
    const root = db.getNode(nodeId)
    if (!root) return { markdown: '' }

    // Adjust heading levels in notes to be relative to node depth
    function adjustNoteHeadings(notes, nodeDepth) {
      if (!notes) return ''
      // Match markdown headings at start of line
      return notes.replace(/^(#{1,6})\s/gm, (match, hashes) => {
        const originalLevel = hashes.length
        const newLevel = Math.min(originalLevel + nodeDepth, 6)
        return '#'.repeat(newLevel) + ' '
      })
    }

    // Direct recursive export using getChildren
    function exportNode(id, depth) {
      const node = db.getNode(id)
      if (!node) return ''

      let md = ''
      // Use heading levels 1-6, then bold for deeper levels
      if (depth <= 6) {
        md += '#'.repeat(depth) + ' ' + node.title + '\n\n'
      } else {
        md += '**' + node.title + '**\n\n'
      }

      if (node.notes) {
        const adjustedNotes = adjustNoteHeadings(node.notes, depth)
        md += adjustedNotes + '\n\n'
      }

      // Get and export children directly from database
      const childRows = db._query(
        'SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at',
        [id]
      )
      for (const row of childRows) {
        md += exportNode(row.id, depth + 1)
      }

      return md
    }

    const markdown = exportNode(nodeId, 1)
    return { markdown }
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

  // Lost & Found - orphaned nodes whose parent doesn't exist or was deleted
  getOrphanedNodes() {
    return this._query(`
      SELECT n.* FROM nodes n
      WHERE n.deleted_at IS NULL
        AND n.parent_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM nodes p
          WHERE p.id = n.parent_id
            AND p.deleted_at IS NULL
        )
      ORDER BY n.updated_at DESC
    `).map(r => this._rowToNode(r))
  }

  // Re-parent orphaned node to root
  reparentToRoot(nodeId) {
    this._run('UPDATE nodes SET parent_id = NULL WHERE id = ?', [nodeId])
    this._updateDescendantPaths(nodeId)
    return this.getNode(nodeId)
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
    // Search for nodes containing the tag in the JSON array
    return this._query(
      'SELECT * FROM nodes WHERE deleted_at IS NULL AND tags LIKE ?',
      [`%"${tag}"%`]
    ).map(r => this._rowToNode(r))
  }
}

module.exports = Database
