/**
 * Database module - composes all database operations.
 * @module database
 */

const initSqlJs = require('sql.js')
const fs = require('fs')

const { createTables, createIndexes } = require('./schema')
const { runMigrations } = require('./migrations')
const { createWorkspaceOperations } = require('./workspaces')
const { createNodeOperations } = require('./nodes')
const { createLinkOperations } = require('./links')
const { createSearchOperations } = require('./search')
const { createTagOperations } = require('./tags')
const { createTreeOperations } = require('./tree')
const { createExportOperations } = require('./export')
const { createBackupOperations } = require('./backup')
const { createTableOperations } = require('./tables')
const { createSettingsOperations } = require('./settings')
const { isEncrypted, encryptDatabase, decryptDatabase } = require('./encryption')

let SQL = null

class Database {
  constructor(dbPath, options = {}) {
    this.dbPath = dbPath
    this.db = null
    this.SQL = null
    // At-rest encryption (docs/architecture/encryption.md). When a key is set,
    // every byte written through _serialize is ciphertext - the main file,
    // backups, and snapshots alike. Slots are the wrapped copies of the key
    // that travel in the file header.
    this.encryptionKey = options.encryptionKey || null
    this.encryptionSlots = options.encryptionSlots || []
    // Batch state: defer per-statement disk writes while inside _batch().
    this._batchDepth = 0
    this._pendingSave = false
    this.ready = this._init()
  }

  async _init() {
    if (!SQL) {
      SQL = await initSqlJs()
    }
    this.SQL = SQL

    if (fs.existsSync(this.dbPath)) {
      const rawBuffer = fs.readFileSync(this.dbPath)
      // An encrypted file without the right key is locked, not corrupt: fail
      // loudly here so the corrupt-file fallback can never preserve the file
      // and boot an empty database over it.
      if (isEncrypted(rawBuffer) && !this.encryptionKey) {
        throw new Error('Database is encrypted; an unlock key is required')
      }
      try {
        const buffer = this._deserialize(rawBuffer)
        console.log(`Loading database from ${this.dbPath} (${rawBuffer.length} bytes)`)
        this.db = new SQL.Database(buffer)
        const count = this._query('SELECT COUNT(*) as cnt FROM nodes')[0]?.cnt || 0
        console.log(`Database loaded with ${count} nodes`)
      } catch (e) {
        console.error('Error loading database:', e)
        this._preserveCorruptFile()
        this.db = new SQL.Database()
      }
    } else {
      console.log(`Creating new database at ${this.dbPath}`)
      this.db = new SQL.Database()
    }

    // sql.js defaults foreign-key enforcement OFF; enable it so the declared
    // ON DELETE CASCADE / SET NULL clauses in the schema actually fire.
    this.db.run('PRAGMA foreign_keys = ON')

    // Operations are lazy closures, so binding them first is safe and makes
    // ctx.backup available to migrations (pre-migration backups).
    this._initOperations()
    this._initSchema()
    return true
  }

  /**
   * Copies an unreadable database file to a timestamped ".corrupt-*" sibling
   * before it is replaced by a fresh empty database. Without this, the next
   * _save() would overwrite the original file and destroy recoverable data.
   * @private
   */
  _preserveCorruptFile() {
    try {
      const backupPath = `${this.dbPath}.corrupt-${Date.now()}`
      fs.copyFileSync(this.dbPath, backupPath)
      console.error(`Preserved unreadable database file at ${backupPath}`)
    } catch (err) {
      console.error('Failed to preserve unreadable database file:', err)
    }
  }

  _initSchema() {
    createTables(this.db)
    runMigrations(this)
    createIndexes(this.db)
  }

  _initOperations() {
    // Create operation modules with database context
    const workspaceOps = createWorkspaceOperations(this)
    const nodeOps = createNodeOperations(this)
    const linkOps = createLinkOperations(this)
    const searchOps = createSearchOperations(this)
    const treeOps = createTreeOperations(this)
    const exportOps = createExportOperations(this)
    const backupOps = createBackupOperations(this)
    const tableOps = createTableOperations(this)
    const settingsOps = createSettingsOperations(this)

    // Bind all operations to this instance
    // Workspaces
    this.getWorkspaces = workspaceOps.getWorkspaces.bind(workspaceOps)
    this.getWorkspace = workspaceOps.getWorkspace.bind(workspaceOps)
    this.createWorkspace = workspaceOps.createWorkspace.bind(workspaceOps)
    this.updateWorkspace = workspaceOps.updateWorkspace.bind(workspaceOps)
    this.deleteWorkspace = workspaceOps.deleteWorkspace.bind(workspaceOps)

    // Nodes
    this.getNodes = nodeOps.getNodes.bind(nodeOps)
    this.getNode = nodeOps.getNode.bind(nodeOps)
    this.createNode = nodeOps.createNode.bind(nodeOps)
    this.updateNode = nodeOps.updateNode.bind(nodeOps)
    this.deleteNode = nodeOps.deleteNode.bind(nodeOps)
    this.moveNode = nodeOps.moveNode.bind(nodeOps)
    this.reorderNode = nodeOps.reorderNode.bind(nodeOps)
    this.getChildren = nodeOps.getChildren.bind(nodeOps)
    this.getDescendants = nodeOps.getDescendants.bind(nodeOps)
    this.getDescendantsBatch = nodeOps.getDescendantsBatch.bind(nodeOps)
    this.getAncestors = nodeOps.getAncestors.bind(nodeOps)
    this._updateDescendantPaths = nodeOps._updateDescendantPaths.bind(nodeOps)
    this._updateSubtreePath = nodeOps._updateSubtreePath.bind(nodeOps)

    // Links
    this.linkNodes = linkOps.linkNodes.bind(linkOps)
    this.unlinkNodes = linkOps.unlinkNodes.bind(linkOps)
    this.getAllLinks = linkOps.getAllLinks.bind(linkOps)
    this.getLinkedNodes = linkOps.getLinkedNodes.bind(linkOps)

    // Search
    this.search = searchOps.search.bind(searchOps)
    this.searchCount = searchOps.searchCount.bind(searchOps)
    this.getAllTags = searchOps.getAllTags.bind(searchOps)
    this.getNodesByTag = searchOps.getNodesByTag.bind(searchOps)
    this.getRecent = searchOps.getRecent.bind(searchOps)
    this.getFavorites = searchOps.getFavorites.bind(searchOps)
    this.getTasks = searchOps.getTasks.bind(searchOps)

    // Tags (first-class tag nodes)
    const tagOps = createTagOperations(this)
    this.getTagNodes = tagOps.getTagNodes
    this.getOrCreateTagNode = tagOps.getOrCreateTagNode
    this.getNodesLinkedToTag = tagOps.getNodesLinkedToTag
    this.searchTagNodes = tagOps.searchTagNodes

    // Tree
    this.getRoots = treeOps.getRoots.bind(treeOps)
    this.getProjects = treeOps.getProjects.bind(treeOps)
    this.getInbox = treeOps.getInbox.bind(treeOps)
    this.getTree = treeOps.getTree.bind(treeOps)
    this.getTrash = treeOps.getTrash.bind(treeOps)
    this.restoreNode = treeOps.restoreNode.bind(treeOps)
    this.emptyTrash = treeOps.emptyTrash.bind(treeOps)
    this.getOrphanedNodes = treeOps.getOrphanedNodes.bind(treeOps)
    this.reparentToRoot = treeOps.reparentToRoot.bind(treeOps)

    // Export/Import
    this.exportMarkdown = exportOps.exportMarkdown.bind(exportOps)
    this.exportJSON = exportOps.exportJSON.bind(exportOps)
    this.exportCSV = exportOps.exportCSV.bind(exportOps)
    this.importJSON = exportOps.importJSON.bind(exportOps)
    this.importCSV = exportOps.importCSV.bind(exportOps)

    // Backup
    this.backup = backupOps.backup.bind(backupOps)
    this.listBackups = backupOps.listBackups.bind(backupOps)
    this.restoreBackup = backupOps.restoreBackup.bind(backupOps)
    this.reload = backupOps.reload.bind(backupOps)

    // Tables
    this.getNodeTable = tableOps.getNodeTable.bind(tableOps)
    this.createNodeTable = tableOps.createNodeTable.bind(tableOps)
    this.updateNodeTable = tableOps.updateNodeTable.bind(tableOps)
    this.deleteNodeTable = tableOps.deleteNodeTable.bind(tableOps)
    this.getTableCells = tableOps.getTableCells.bind(tableOps)
    this.setCells = tableOps.setCells.bind(tableOps)
    this.clearCells = tableOps.clearCells.bind(tableOps)

    // Settings
    this.getSetting = settingsOps.getSetting.bind(settingsOps)
    this.getAllSettings = settingsOps.getAllSettings.bind(settingsOps)
    this.setSetting = settingsOps.setSetting.bind(settingsOps)
    this.setSettings = settingsOps.setSettings.bind(settingsOps)
    this.deleteSetting = settingsOps.deleteSetting.bind(settingsOps)
    this.clearSettings = settingsOps.clearSettings.bind(settingsOps)
  }

  _save() {
    // While batching, defer the (expensive) full-file write until the batch ends.
    if (this._batchDepth > 0) {
      this._pendingSave = true
      return
    }
    const data = this.db.export()
    // sql.js export() closes and reopens the underlying connection, which
    // resets per-connection pragmas; re-enable foreign-key enforcement.
    this.db.run('PRAGMA foreign_keys = ON')
    fs.writeFileSync(this.dbPath, this._serialize(Buffer.from(data)))
  }

  /** Turn export bytes into file bytes: ciphertext when a key is set. */
  _serialize(plainBuffer) {
    if (!this.encryptionKey) return plainBuffer
    return encryptDatabase(plainBuffer, this.encryptionKey, this.encryptionSlots)
  }

  /** Turn file bytes into export bytes: decrypts when the file is encrypted. */
  _deserialize(fileBuffer) {
    if (!isEncrypted(fileBuffer)) return fileBuffer
    if (!this.encryptionKey) {
      throw new Error('Database is encrypted; an unlock key is required')
    }
    return decryptDatabase(fileBuffer, this.encryptionKey)
  }

  /**
   * Run fn inside a single SQL transaction and persist to disk once at the end,
   * instead of after every statement. Nestable; rolls back on error. Use for
   * bulk operations (imports, large subtree moves) to avoid O(rows) full-file
   * writes and to make the operation crash-atomic.
   * @param {Function} fn - Synchronous function performing the writes
   * @returns {*} Whatever fn returns
   */
  _batch(fn) {
    this._batchDepth += 1
    const outermost = this._batchDepth === 1
    if (outermost) this.db.run('BEGIN')
    try {
      const result = fn()
      if (outermost) this.db.run('COMMIT')
      return result
    } catch (e) {
      if (outermost) {
        try {
          this.db.run('ROLLBACK')
        } catch {
          // ignore rollback failure
        }
        this._pendingSave = false
      }
      throw e
    } finally {
      this._batchDepth -= 1
      if (this._batchDepth === 0 && this._pendingSave) {
        this._pendingSave = false
        this._save()
      }
    }
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
    let tags = []
    if (row.tags) {
      try {
        tags = JSON.parse(row.tags)
      } catch {
        tags = []
      }
    }
    let graph_type_filter = null
    if (row.graph_type_filter) {
      try {
        graph_type_filter = JSON.parse(row.graph_type_filter)
      } catch {
        graph_type_filter = null
      }
    }
    let graph_physics = null
    if (row.graph_physics) {
      try {
        graph_physics = JSON.parse(row.graph_physics)
      } catch {
        graph_physics = null
      }
    }
    return {
      ...row,
      completed: Boolean(row.completed),
      favorite: Boolean(row.favorite),
      // Only some queries compute has_table (via an EXISTS subquery); preserve
      // "not computed" as undefined instead of coercing it to a false negative.
      has_table: 'has_table' in row ? Boolean(row.has_table) : undefined,
      notes_sensitive: Boolean(row.notes_sensitive),
      collapsed: Boolean(row.collapsed),
      tags,
      graph_type_filter,
      graph_physics,
    }
  }

  /**
   * Apply workspace filter to SQL query.
   * @param {string} sql - Current SQL string
   * @param {Array} values - Values array to append filter value to
   * @param {string|null|undefined} workspaceId - Workspace filter
   * @returns {string} Updated SQL string
   */
  _applyWorkspaceFilter(sql, values, workspaceId) {
    if (workspaceId === null || workspaceId === 'null') {
      return sql + ' AND workspace_id IS NULL'
    } else if (workspaceId !== undefined) {
      values.push(workspaceId)
      return sql + ' AND workspace_id = ?'
    }
    return sql
  }
}

module.exports = Database
