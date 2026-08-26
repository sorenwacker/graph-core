/**
 * Database IPC Handlers
 *
 * Registers all DB_* IPC handlers for database operations.
 */

const { app } = require('electron')
const {
  // Node CRUD
  DB_GET_NODES,
  DB_GET_NODE,
  DB_CREATE_NODE,
  DB_UPDATE_NODE,
  DB_DELETE_NODE,
  // Tree Operations
  DB_GET_ROOTS,
  DB_GET_PROJECTS,
  DB_GET_INBOX,
  DB_GET_RECENT,
  DB_GET_FAVORITES,
  DB_GET_TASKS,
  DB_GET_CHILDREN,
  DB_GET_DESCENDANTS,
  DB_GET_DESCENDANTS_BATCH,
  DB_GET_ANCESTORS,
  DB_MOVE_NODE,
  // Links
  DB_LINK_NODES,
  DB_UNLINK_NODES,
  DB_GET_ALL_LINKS,
  DB_GET_LINKED_NODES,
  // Tree View
  DB_GET_TREE,
  // Search
  DB_SEARCH,
  DB_SEARCH_COUNT,
  // Reorder
  DB_REORDER_NODE,
  // Export
  DB_EXPORT_MARKDOWN,
  DB_EXPORT_JSON,
  DB_EXPORT_CSV,
  // Import
  DB_IMPORT_JSON,
  DB_IMPORT_CSV,
  // Trash
  DB_GET_TRASH,
  DB_RESTORE_NODE,
  DB_EMPTY_TRASH,
  // Lost & Found
  DB_GET_ORPHANED_NODES,
  DB_REPARENT_TO_ROOT,
  // Tags (string-based, legacy)
  DB_GET_ALL_TAGS,
  DB_GET_NODES_BY_TAG,
  // Tags (first-class nodes)
  DB_GET_TAG_NODES,
  DB_GET_OR_CREATE_TAG_NODE,
  DB_GET_NODES_LINKED_TO_TAG,
  DB_SEARCH_TAG_NODES,
  // Workspaces
  DB_GET_WORKSPACES,
  DB_GET_WORKSPACE,
  DB_CREATE_WORKSPACE,
  DB_UPDATE_WORKSPACE,
  DB_DELETE_WORKSPACE,
  // Backups & Reload
  DB_BACKUP,
  DB_LIST_BACKUPS,
  DB_RESTORE_BACKUP,
  DB_RELOAD,
  DB_GET_DATA_PATH,
  // Node Tables
  DB_GET_NODE_TABLE,
  DB_CREATE_NODE_TABLE,
  DB_UPDATE_NODE_TABLE,
  DB_DELETE_NODE_TABLE,
  DB_GET_TABLE_CELLS,
  DB_SET_CELLS,
  DB_DELETE_TABLE_COLUMN,
  DB_CLEAR_CELLS,
  // Settings
  DB_GET_SETTING,
  DB_GET_ALL_SETTINGS,
  DB_SET_SETTING,
  DB_SET_SETTINGS,
  DB_DELETE_SETTING,
} = require('../ipcChannels')

/**
 * Register all database IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Database} db - Database instance
 */
function registerDatabaseHandlers(ipcMain, db) {
  // Node CRUD
  ipcMain.handle(DB_GET_NODES, (_event, params) => db.getNodes(params))
  ipcMain.handle(DB_GET_NODE, (_event, id) => db.getNode(id))
  ipcMain.handle(DB_CREATE_NODE, (_event, data) => db.createNode(data))
  ipcMain.handle(DB_UPDATE_NODE, (_event, id, data) => db.updateNode(id, data))
  ipcMain.handle(DB_DELETE_NODE, (_event, id, hard) => db.deleteNode(id, hard))

  // Tree operations
  ipcMain.handle(DB_GET_ROOTS, (_event, workspaceId) => db.getRoots(workspaceId))
  ipcMain.handle(DB_GET_PROJECTS, () => db.getProjects())
  ipcMain.handle(DB_GET_INBOX, () => db.getInbox())
  ipcMain.handle(DB_GET_RECENT, (_event, limit, workspaceId) => db.getRecent(limit, workspaceId))
  ipcMain.handle(DB_GET_FAVORITES, (_event, workspaceId) => db.getFavorites(workspaceId))
  ipcMain.handle(DB_GET_TASKS, (_event, params) => db.getTasks(params))
  ipcMain.handle(DB_GET_CHILDREN, (_event, id, type) => db.getChildren(id, type))
  ipcMain.handle(DB_GET_DESCENDANTS, (_event, id, maxDepth) => db.getDescendants(id, maxDepth))
  ipcMain.handle(DB_GET_DESCENDANTS_BATCH, (_event, rootIds) => {
    const result = db.getDescendantsBatch(rootIds)
    // Convert Map to plain object for IPC serialization
    return Object.fromEntries(result)
  })
  ipcMain.handle(DB_GET_ANCESTORS, (_event, id) => db.getAncestors(id))
  ipcMain.handle(DB_MOVE_NODE, (_event, id, newParentId) => db.moveNode(id, newParentId))

  // Links
  ipcMain.handle(DB_LINK_NODES, (_event, sourceId, targetId) => db.linkNodes(sourceId, targetId))
  ipcMain.handle(DB_UNLINK_NODES, (_event, sourceId, targetId) => db.unlinkNodes(sourceId, targetId))
  ipcMain.handle(DB_GET_ALL_LINKS, (_event, nodeIds) => db.getAllLinks(nodeIds))
  ipcMain.handle(DB_GET_LINKED_NODES, (_event, id) => db.getLinkedNodes(id))

  // Tree view
  ipcMain.handle(DB_GET_TREE, (_event, rootId) => db.getTree(rootId))

  // Search
  ipcMain.handle(DB_SEARCH, (_event, query, type, workspaceId, options) => db.search(query, type, workspaceId, options))
  ipcMain.handle(DB_SEARCH_COUNT, (_event, query, type, workspaceId, options) =>
    db.searchCount(query, type, workspaceId, options)
  )

  // Reorder
  ipcMain.handle(DB_REORDER_NODE, (_event, nodeId, targetId, position) => db.reorderNode(nodeId, targetId, position))

  // Export
  ipcMain.handle(DB_EXPORT_MARKDOWN, (_event, nodeId) => db.exportMarkdown(nodeId))
  ipcMain.handle(DB_EXPORT_JSON, (_event, nodeId, options) => db.exportJSON(nodeId, options))
  ipcMain.handle(DB_EXPORT_CSV, (_event, nodeId, workspaceId) => db.exportCSV(nodeId, workspaceId))

  // Import
  ipcMain.handle(DB_IMPORT_JSON, (_event, data, targetParentId, workspaceId) =>
    db.importJSON(data, targetParentId, workspaceId)
  )
  ipcMain.handle(DB_IMPORT_CSV, (_event, csvData, targetParentId, workspaceId) =>
    db.importCSV(csvData, targetParentId, workspaceId)
  )

  // Trash
  ipcMain.handle(DB_GET_TRASH, (_event, limit) => db.getTrash(limit))
  ipcMain.handle(DB_RESTORE_NODE, (_event, id) => db.restoreNode(id))
  ipcMain.handle(DB_EMPTY_TRASH, () => db.emptyTrash())

  // Lost & Found
  ipcMain.handle(DB_GET_ORPHANED_NODES, () => db.getOrphanedNodes())
  ipcMain.handle(DB_REPARENT_TO_ROOT, (_event, id) => db.reparentToRoot(id))

  // Tags (string-based, legacy)
  ipcMain.handle(DB_GET_ALL_TAGS, (_event, workspaceId) => db.getAllTags(workspaceId))
  ipcMain.handle(DB_GET_NODES_BY_TAG, (_event, tag, workspaceId, options) =>
    db.getNodesByTag(tag, workspaceId, options)
  )

  // Tags (first-class nodes)
  ipcMain.handle(DB_GET_TAG_NODES, (_event, workspaceId) => db.getTagNodes(workspaceId))
  ipcMain.handle(DB_GET_OR_CREATE_TAG_NODE, (_event, name, workspaceId) => db.getOrCreateTagNode(name, workspaceId))
  ipcMain.handle(DB_GET_NODES_LINKED_TO_TAG, (_event, tagNodeId, options) => db.getNodesLinkedToTag(tagNodeId, options))
  ipcMain.handle(DB_SEARCH_TAG_NODES, (_event, query, workspaceId, limit) =>
    db.searchTagNodes(query, workspaceId, limit)
  )

  // Workspaces
  ipcMain.handle(DB_GET_WORKSPACES, () => db.getWorkspaces())
  ipcMain.handle(DB_GET_WORKSPACE, (_event, id) => db.getWorkspace(id))
  ipcMain.handle(DB_CREATE_WORKSPACE, (_event, data) => db.createWorkspace(data))
  ipcMain.handle(DB_UPDATE_WORKSPACE, (_event, id, data) => db.updateWorkspace(id, data))
  ipcMain.handle(DB_DELETE_WORKSPACE, (_event, id) => db.deleteWorkspace(id))

  // Backups & Reload
  ipcMain.handle(DB_BACKUP, (_event, suffix) => db.backup(suffix))
  ipcMain.handle(DB_LIST_BACKUPS, () => db.listBackups())
  ipcMain.handle(DB_RESTORE_BACKUP, (_event, backupPath) => db.restoreBackup(backupPath))
  ipcMain.handle(DB_RELOAD, () => db.reload())
  ipcMain.handle(DB_GET_DATA_PATH, () => app.getPath('userData'))

  // Node Tables
  ipcMain.handle(DB_GET_NODE_TABLE, (_event, nodeId) => db.getNodeTable(nodeId))
  ipcMain.handle(DB_CREATE_NODE_TABLE, (_event, nodeId, data) => db.createNodeTable(nodeId, data))
  ipcMain.handle(DB_UPDATE_NODE_TABLE, (_event, nodeId, data) => db.updateNodeTable(nodeId, data))
  ipcMain.handle(DB_DELETE_NODE_TABLE, (_event, nodeId) => db.deleteNodeTable(nodeId))
  ipcMain.handle(DB_GET_TABLE_CELLS, (_event, nodeId) => db.getTableCells(nodeId))
  ipcMain.handle(DB_SET_CELLS, (_event, nodeId, cells) => db.setCells(nodeId, cells))
  ipcMain.handle(DB_DELETE_TABLE_COLUMN, (_event, nodeId, colIndex) => db.deleteTableColumn(nodeId, colIndex))
  ipcMain.handle(DB_CLEAR_CELLS, (_event, nodeId) => db.clearCells(nodeId))

  // Settings
  ipcMain.handle(DB_GET_SETTING, (_event, key) => db.getSetting(key))
  ipcMain.handle(DB_GET_ALL_SETTINGS, () => db.getAllSettings())
  ipcMain.handle(DB_SET_SETTING, (_event, key, value) => db.setSetting(key, value))
  ipcMain.handle(DB_SET_SETTINGS, (_event, settings) => db.setSettings(settings))
  ipcMain.handle(DB_DELETE_SETTING, (_event, key) => db.deleteSetting(key))
}

module.exports = { registerDatabaseHandlers }
