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
const { createTreeOperations } = require('./tree')
const { createExportOperations } = require('./export')
const { createBackupOperations } = require('./backup')
const { createTableOperations } = require('./tables')
const { createSettingsOperations } = require('./settings')

let SQL = null

class Database {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.db = null
    this.SQL = null
    this.ready = this._init()
  }

  async _init() {
    if (!SQL) {
      SQL = await initSqlJs()
    }
    this.SQL = SQL

    if (fs.existsSync(this.dbPath)) {
      try {
        const buffer = fs.readFileSync(this.dbPath)
        console.log(`Loading database from ${this.dbPath} (${buffer.length} bytes)`)
        this.db = new SQL.Database(buffer)
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
    this._initOperations()
    return true
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
    this.repairWorkspaces = treeOps.repairWorkspaces.bind(treeOps)

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
    const data = this.db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(this.dbPath, buffer)
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
      has_table: Boolean(row.has_table),
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
