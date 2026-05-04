const { contextBridge, ipcRenderer } = require('electron')
const {
  // Database - Node CRUD
  DB_GET_NODES,
  DB_GET_NODE,
  DB_CREATE_NODE,
  DB_UPDATE_NODE,
  DB_DELETE_NODE,
  // Database - Tree Operations
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
  // Database - Links
  DB_LINK_NODES,
  DB_UNLINK_NODES,
  DB_GET_ALL_LINKS,
  DB_GET_LINKED_NODES,
  // Database - Tree View
  DB_GET_TREE,
  // Database - Search
  DB_SEARCH,
  DB_SEARCH_COUNT,
  // Database - Reorder
  DB_REORDER_NODE,
  // Database - Export
  DB_EXPORT_MARKDOWN,
  DB_EXPORT_JSON,
  DB_EXPORT_CSV,
  // Database - Import
  DB_IMPORT_JSON,
  DB_IMPORT_CSV,
  // Database - Trash
  DB_GET_TRASH,
  DB_RESTORE_NODE,
  DB_EMPTY_TRASH,
  // Database - Lost & Found
  DB_GET_ORPHANED_NODES,
  DB_REPARENT_TO_ROOT,
  // Database - Tags
  DB_GET_ALL_TAGS,
  DB_GET_NODES_BY_TAG,
  // Database - Workspaces
  DB_GET_WORKSPACES,
  DB_GET_WORKSPACE,
  DB_CREATE_WORKSPACE,
  DB_UPDATE_WORKSPACE,
  DB_DELETE_WORKSPACE,
  // Database - Backups & Reload
  DB_BACKUP,
  DB_LIST_BACKUPS,
  DB_RESTORE_BACKUP,
  DB_RELOAD,
  DB_REPAIR_WORKSPACES,
  DB_GET_DATA_PATH,
  // Database - Node Tables
  DB_GET_NODE_TABLE,
  DB_CREATE_NODE_TABLE,
  DB_UPDATE_NODE_TABLE,
  DB_DELETE_NODE_TABLE,
  DB_GET_TABLE_CELLS,
  DB_SET_CELLS,
  DB_CLEAR_CELLS,
  // Shell
  SHELL_OPEN_EXTERNAL,
  // Window
  WINDOW_OPEN_DETACHED,
  WINDOW_CLOSE_DETACHED,
  // Ollama
  OLLAMA_GENERATE,
  OLLAMA_TEST_CONNECTION,
  OLLAMA_LIST_MODELS,
  // OpenAI
  OPENAI_GENERATE,
  OPENAI_TEST_CONNECTION,
  OPENAI_LIST_MODELS,
  // App
  APP_GET_VERSION,
  // Menu Events
  MENU_UNDO,
  MENU_REDO,
  OPEN_SETTINGS,
  SHOW_SHORTCUTS,
  // App Lifecycle
  APP_BEFORE_QUIT,
} = require('./ipcChannels')

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Node CRUD
  getNodes: params => ipcRenderer.invoke(DB_GET_NODES, params),
  getNode: id => ipcRenderer.invoke(DB_GET_NODE, id),
  createNode: data => ipcRenderer.invoke(DB_CREATE_NODE, data),
  updateNode: (id, data) => ipcRenderer.invoke(DB_UPDATE_NODE, id, data),
  deleteNode: (id, hard) => ipcRenderer.invoke(DB_DELETE_NODE, id, hard),

  // Tree operations
  getRoots: workspaceId => ipcRenderer.invoke(DB_GET_ROOTS, workspaceId),
  getProjects: () => ipcRenderer.invoke(DB_GET_PROJECTS),
  getInbox: () => ipcRenderer.invoke(DB_GET_INBOX),
  getRecent: (limit, workspaceId) => ipcRenderer.invoke(DB_GET_RECENT, limit, workspaceId),
  getFavorites: workspaceId => ipcRenderer.invoke(DB_GET_FAVORITES, workspaceId),
  getTasks: params => ipcRenderer.invoke(DB_GET_TASKS, params),
  getChildren: (id, type) => ipcRenderer.invoke(DB_GET_CHILDREN, id, type),
  getDescendants: (id, maxDepth) => ipcRenderer.invoke(DB_GET_DESCENDANTS, id, maxDepth),
  getDescendantsBatch: rootIds => ipcRenderer.invoke(DB_GET_DESCENDANTS_BATCH, rootIds),
  getAncestors: id => ipcRenderer.invoke(DB_GET_ANCESTORS, id),
  moveNode: (id, newParentId) => ipcRenderer.invoke(DB_MOVE_NODE, id, newParentId),

  // Links
  linkNodes: (sourceId, targetId) => ipcRenderer.invoke(DB_LINK_NODES, sourceId, targetId),
  unlinkNodes: (sourceId, targetId) => ipcRenderer.invoke(DB_UNLINK_NODES, sourceId, targetId),
  getAllLinks: nodeIds => ipcRenderer.invoke(DB_GET_ALL_LINKS, nodeIds),
  getLinkedNodes: id => ipcRenderer.invoke(DB_GET_LINKED_NODES, id),

  // Tree view
  getTree: rootId => ipcRenderer.invoke(DB_GET_TREE, rootId),

  // Search
  search: (query, type, workspaceId, options) => ipcRenderer.invoke(DB_SEARCH, query, type, workspaceId, options),
  searchCount: (query, type, workspaceId, options) =>
    ipcRenderer.invoke(DB_SEARCH_COUNT, query, type, workspaceId, options),

  // Reorder
  reorderNode: (nodeId, targetId, position) => ipcRenderer.invoke(DB_REORDER_NODE, nodeId, targetId, position),

  // Export
  exportMarkdown: nodeId => ipcRenderer.invoke(DB_EXPORT_MARKDOWN, nodeId),
  exportJSON: (nodeId, options) => ipcRenderer.invoke(DB_EXPORT_JSON, nodeId, options),
  exportCSV: (nodeId, workspaceId) => ipcRenderer.invoke(DB_EXPORT_CSV, nodeId, workspaceId),

  // Import
  importJSON: (data, targetParentId, workspaceId) =>
    ipcRenderer.invoke(DB_IMPORT_JSON, data, targetParentId, workspaceId),
  importCSV: (csvData, targetParentId, workspaceId) =>
    ipcRenderer.invoke(DB_IMPORT_CSV, csvData, targetParentId, workspaceId),

  // Trash
  getTrash: limit => ipcRenderer.invoke(DB_GET_TRASH, limit),
  restoreNode: id => ipcRenderer.invoke(DB_RESTORE_NODE, id),
  emptyTrash: () => ipcRenderer.invoke(DB_EMPTY_TRASH),

  // Lost & Found
  getOrphanedNodes: () => ipcRenderer.invoke(DB_GET_ORPHANED_NODES),
  reparentToRoot: id => ipcRenderer.invoke(DB_REPARENT_TO_ROOT, id),

  // Tags
  getAllTags: workspaceId => ipcRenderer.invoke(DB_GET_ALL_TAGS, workspaceId),
  getNodesByTag: (tag, workspaceId, options) => ipcRenderer.invoke(DB_GET_NODES_BY_TAG, tag, workspaceId, options),

  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke(DB_GET_WORKSPACES),
  getWorkspace: id => ipcRenderer.invoke(DB_GET_WORKSPACE, id),
  createWorkspace: data => ipcRenderer.invoke(DB_CREATE_WORKSPACE, data),
  updateWorkspace: (id, data) => ipcRenderer.invoke(DB_UPDATE_WORKSPACE, id, data),
  deleteWorkspace: id => ipcRenderer.invoke(DB_DELETE_WORKSPACE, id),

  // Database Backups & Reload
  backup: suffix => ipcRenderer.invoke(DB_BACKUP, suffix),
  listBackups: () => ipcRenderer.invoke(DB_LIST_BACKUPS),
  restoreBackup: backupPath => ipcRenderer.invoke(DB_RESTORE_BACKUP, backupPath),
  reload: () => ipcRenderer.invoke(DB_RELOAD),
  repairWorkspaces: () => ipcRenderer.invoke(DB_REPAIR_WORKSPACES),
  getDataPath: () => ipcRenderer.invoke(DB_GET_DATA_PATH),

  // Node Tables (Spreadsheet)
  getNodeTable: nodeId => ipcRenderer.invoke(DB_GET_NODE_TABLE, nodeId),
  createNodeTable: (nodeId, data) => ipcRenderer.invoke(DB_CREATE_NODE_TABLE, nodeId, data),
  updateNodeTable: (nodeId, data) => ipcRenderer.invoke(DB_UPDATE_NODE_TABLE, nodeId, data),
  deleteNodeTable: nodeId => ipcRenderer.invoke(DB_DELETE_NODE_TABLE, nodeId),
  getTableCells: nodeId => ipcRenderer.invoke(DB_GET_TABLE_CELLS, nodeId),
  setCells: (nodeId, cells) => ipcRenderer.invoke(DB_SET_CELLS, nodeId, cells),
  clearCells: nodeId => ipcRenderer.invoke(DB_CLEAR_CELLS, nodeId),

  // Shell
  openExternal: url => ipcRenderer.invoke(SHELL_OPEN_EXTERNAL, url),

  // Detached Windows
  openDetachedWindow: (nodeId, nodeTitle) => ipcRenderer.invoke(WINDOW_OPEN_DETACHED, nodeId, nodeTitle),
  closeDetachedWindow: nodeId => ipcRenderer.invoke(WINDOW_CLOSE_DETACHED, nodeId),

  // Ollama LLM
  ollamaGenerate: options => ipcRenderer.invoke(OLLAMA_GENERATE, options),
  ollamaTestConnection: endpoint => ipcRenderer.invoke(OLLAMA_TEST_CONNECTION, endpoint),
  ollamaListModels: endpoint => ipcRenderer.invoke(OLLAMA_LIST_MODELS, endpoint),

  // OpenAI-compatible API
  openaiGenerate: options => ipcRenderer.invoke(OPENAI_GENERATE, options),
  openaiTestConnection: (endpoint, apiKey, skipSslVerification) =>
    ipcRenderer.invoke(OPENAI_TEST_CONNECTION, endpoint, apiKey, skipSslVerification),
  openaiListModels: (endpoint, apiKey, skipSslVerification) =>
    ipcRenderer.invoke(OPENAI_LIST_MODELS, endpoint, apiKey, skipSslVerification),

  // Menu events
  onMenuUndo: callback => ipcRenderer.on(MENU_UNDO, callback),
  onMenuRedo: callback => ipcRenderer.on(MENU_REDO, callback),
  onOpenSettings: callback => ipcRenderer.on(OPEN_SETTINGS, callback),
  onShowShortcuts: callback => ipcRenderer.on(SHOW_SHORTCUTS, callback),

  // App lifecycle
  onBeforeQuit: callback => ipcRenderer.on(APP_BEFORE_QUIT, callback),

  // App info
  getVersion: () => ipcRenderer.invoke(APP_GET_VERSION),
})
