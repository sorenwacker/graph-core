const { contextBridge, ipcRenderer } = require('electron')
const C = require('./ipcChannels')

// Expose a secure API to the renderer process. Channel names come from
// ipcChannels.js so the renderer and main process share a single source of
// truth; using raw string literals here would silently drift on a rename.
contextBridge.exposeInMainWorld('electronAPI', {
  // Node CRUD
  getNodes: params => ipcRenderer.invoke(C.DB_GET_NODES, params),
  getNode: id => ipcRenderer.invoke(C.DB_GET_NODE, id),
  createNode: data => ipcRenderer.invoke(C.DB_CREATE_NODE, data),
  updateNode: (id, data) => ipcRenderer.invoke(C.DB_UPDATE_NODE, id, data),
  deleteNode: (id, hard) => ipcRenderer.invoke(C.DB_DELETE_NODE, id, hard),

  // Tree operations
  getRoots: workspaceId => ipcRenderer.invoke(C.DB_GET_ROOTS, workspaceId),
  getProjects: () => ipcRenderer.invoke(C.DB_GET_PROJECTS),
  getInbox: () => ipcRenderer.invoke(C.DB_GET_INBOX),
  getRecent: (limit, workspaceId) => ipcRenderer.invoke(C.DB_GET_RECENT, limit, workspaceId),
  getFavorites: workspaceId => ipcRenderer.invoke(C.DB_GET_FAVORITES, workspaceId),
  getTasks: params => ipcRenderer.invoke(C.DB_GET_TASKS, params),
  getChildren: (id, type) => ipcRenderer.invoke(C.DB_GET_CHILDREN, id, type),
  getDescendants: (id, maxDepth) => ipcRenderer.invoke(C.DB_GET_DESCENDANTS, id, maxDepth),
  getDescendantsBatch: rootIds => ipcRenderer.invoke(C.DB_GET_DESCENDANTS_BATCH, rootIds),
  getAncestors: id => ipcRenderer.invoke(C.DB_GET_ANCESTORS, id),
  moveNode: (id, newParentId) => ipcRenderer.invoke(C.DB_MOVE_NODE, id, newParentId),

  // Links
  linkNodes: (sourceId, targetId) => ipcRenderer.invoke(C.DB_LINK_NODES, sourceId, targetId),
  unlinkNodes: (sourceId, targetId) => ipcRenderer.invoke(C.DB_UNLINK_NODES, sourceId, targetId),
  getAllLinks: nodeIds => ipcRenderer.invoke(C.DB_GET_ALL_LINKS, nodeIds),
  getLinkedNodes: id => ipcRenderer.invoke(C.DB_GET_LINKED_NODES, id),

  // Tree view
  getTree: rootId => ipcRenderer.invoke(C.DB_GET_TREE, rootId),

  // Search
  search: (query, type, workspaceId, options) => ipcRenderer.invoke(C.DB_SEARCH, query, type, workspaceId, options),
  searchCount: (query, type, workspaceId, options) =>
    ipcRenderer.invoke(C.DB_SEARCH_COUNT, query, type, workspaceId, options),

  // Reorder
  reorderNode: (nodeId, targetId, position) => ipcRenderer.invoke(C.DB_REORDER_NODE, nodeId, targetId, position),

  // Export
  exportMarkdown: nodeId => ipcRenderer.invoke(C.DB_EXPORT_MARKDOWN, nodeId),
  exportJSON: (nodeId, options) => ipcRenderer.invoke(C.DB_EXPORT_JSON, nodeId, options),
  exportCSV: (nodeId, workspaceId) => ipcRenderer.invoke(C.DB_EXPORT_CSV, nodeId, workspaceId),

  // Import
  importJSON: (data, targetParentId, workspaceId) =>
    ipcRenderer.invoke(C.DB_IMPORT_JSON, data, targetParentId, workspaceId),
  importCSV: (csvData, targetParentId, workspaceId) =>
    ipcRenderer.invoke(C.DB_IMPORT_CSV, csvData, targetParentId, workspaceId),

  // Trash
  getTrash: limit => ipcRenderer.invoke(C.DB_GET_TRASH, limit),
  restoreNode: id => ipcRenderer.invoke(C.DB_RESTORE_NODE, id),
  emptyTrash: () => ipcRenderer.invoke(C.DB_EMPTY_TRASH),

  // Lost & Found
  getOrphanedNodes: () => ipcRenderer.invoke(C.DB_GET_ORPHANED_NODES),
  reparentToRoot: id => ipcRenderer.invoke(C.DB_REPARENT_TO_ROOT, id),

  // Tags (string-based, legacy)
  getAllTags: workspaceId => ipcRenderer.invoke(C.DB_GET_ALL_TAGS, workspaceId),
  getNodesByTag: (tag, workspaceId, options) => ipcRenderer.invoke(C.DB_GET_NODES_BY_TAG, tag, workspaceId, options),

  // Tags (first-class nodes)
  getTagNodes: workspaceId => ipcRenderer.invoke(C.DB_GET_TAG_NODES, workspaceId),
  getOrCreateTagNode: (name, workspaceId) => ipcRenderer.invoke(C.DB_GET_OR_CREATE_TAG_NODE, name, workspaceId),
  getNodesLinkedToTag: (tagNodeId, options) => ipcRenderer.invoke(C.DB_GET_NODES_LINKED_TO_TAG, tagNodeId, options),
  searchTagNodes: (query, workspaceId, limit) => ipcRenderer.invoke(C.DB_SEARCH_TAG_NODES, query, workspaceId, limit),

  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke(C.DB_GET_WORKSPACES),
  getWorkspace: id => ipcRenderer.invoke(C.DB_GET_WORKSPACE, id),
  createWorkspace: data => ipcRenderer.invoke(C.DB_CREATE_WORKSPACE, data),
  updateWorkspace: (id, data) => ipcRenderer.invoke(C.DB_UPDATE_WORKSPACE, id, data),
  deleteWorkspace: id => ipcRenderer.invoke(C.DB_DELETE_WORKSPACE, id),

  // Database Backups & Reload
  backup: suffix => ipcRenderer.invoke(C.DB_BACKUP, suffix),
  listBackups: () => ipcRenderer.invoke(C.DB_LIST_BACKUPS),

  // Security - at-rest encryption
  securityStatus: () => ipcRenderer.invoke(C.SECURITY_STATUS),
  securityUnlock: password => ipcRenderer.invoke(C.SECURITY_UNLOCK, password),
  securityEnable: password => ipcRenderer.invoke(C.SECURITY_ENABLE, password),
  securityDisable: password => ipcRenderer.invoke(C.SECURITY_DISABLE, password),
  securitySetTouchId: enabled => ipcRenderer.invoke(C.SECURITY_SET_TOUCH_ID, enabled),

  // Sensitive notes (second encryption layer)
  sensitiveStatus: () => ipcRenderer.invoke(C.SENSITIVE_STATUS),
  sensitiveEnable: password => ipcRenderer.invoke(C.SENSITIVE_ENABLE, password),
  sensitiveUnlock: password => ipcRenderer.invoke(C.SENSITIVE_UNLOCK, password),
  sensitiveLock: () => ipcRenderer.invoke(C.SENSITIVE_LOCK),
  sensitiveDisable: password => ipcRenderer.invoke(C.SENSITIVE_DISABLE, password),
  onSensitiveLocked: callback => {
    ipcRenderer.on(C.SENSITIVE_LOCKED_EVENT, callback)
    return () => ipcRenderer.removeListener(C.SENSITIVE_LOCKED_EVENT, callback)
  },

  // Quick capture
  hideCapture: () => ipcRenderer.invoke(C.CAPTURE_HIDE),
  captureGetConfig: () => ipcRenderer.invoke(C.CAPTURE_GET_CONFIG),
  captureSetConfig: config => ipcRenderer.invoke(C.CAPTURE_SET_CONFIG, config),
  onCaptureSaved: callback => {
    ipcRenderer.on(C.CAPTURE_SAVED_EVENT, callback)
    return () => ipcRenderer.removeListener(C.CAPTURE_SAVED_EVENT, callback)
  },
  restoreBackup: backupPath => ipcRenderer.invoke(C.DB_RESTORE_BACKUP, backupPath),
  reload: () => ipcRenderer.invoke(C.DB_RELOAD),
  getDataPath: () => ipcRenderer.invoke(C.DB_GET_DATA_PATH),

  // Node Tables (Spreadsheet)
  getNodeTable: nodeId => ipcRenderer.invoke(C.DB_GET_NODE_TABLE, nodeId),
  createNodeTable: (nodeId, data) => ipcRenderer.invoke(C.DB_CREATE_NODE_TABLE, nodeId, data),
  updateNodeTable: (nodeId, data) => ipcRenderer.invoke(C.DB_UPDATE_NODE_TABLE, nodeId, data),
  deleteNodeTable: nodeId => ipcRenderer.invoke(C.DB_DELETE_NODE_TABLE, nodeId),
  getTableCells: nodeId => ipcRenderer.invoke(C.DB_GET_TABLE_CELLS, nodeId),
  setCells: (nodeId, cells) => ipcRenderer.invoke(C.DB_SET_CELLS, nodeId, cells),
  clearCells: nodeId => ipcRenderer.invoke(C.DB_CLEAR_CELLS, nodeId),

  // Settings
  getSetting: key => ipcRenderer.invoke(C.DB_GET_SETTING, key),
  getAllSettings: () => ipcRenderer.invoke(C.DB_GET_ALL_SETTINGS),
  setSetting: (key, value) => ipcRenderer.invoke(C.DB_SET_SETTING, key, value),
  setSettings: settings => ipcRenderer.invoke(C.DB_SET_SETTINGS, settings),
  deleteSetting: key => ipcRenderer.invoke(C.DB_DELETE_SETTING, key),

  // Shell
  openExternal: url => ipcRenderer.invoke(C.SHELL_OPEN_EXTERNAL, url),

  // Detached Windows
  openDetachedWindow: (nodeId, nodeTitle) => ipcRenderer.invoke(C.WINDOW_OPEN_DETACHED, nodeId, nodeTitle),

  // Ollama LLM
  ollamaGenerate: options => ipcRenderer.invoke(C.OLLAMA_GENERATE, options),
  ollamaTestConnection: endpoint => ipcRenderer.invoke(C.OLLAMA_TEST_CONNECTION, endpoint),
  ollamaListModels: endpoint => ipcRenderer.invoke(C.OLLAMA_LIST_MODELS, endpoint),

  // OpenAI-compatible API
  openaiGenerate: options => ipcRenderer.invoke(C.OPENAI_GENERATE, options),
  openaiTestConnection: (endpoint, apiKey, skipSslVerification) =>
    ipcRenderer.invoke(C.OPENAI_TEST_CONNECTION, endpoint, apiKey, skipSslVerification),
  openaiListModels: (endpoint, apiKey, skipSslVerification) =>
    ipcRenderer.invoke(C.OPENAI_LIST_MODELS, endpoint, apiKey, skipSslVerification),

  // Agent (research with tools)
  agentResearch: options => ipcRenderer.invoke(C.AGENT_RESEARCH, options),

  // Menu events
  onMenuUndo: callback => ipcRenderer.on(C.MENU_UNDO, callback),
  onMenuRedo: callback => ipcRenderer.on(C.MENU_REDO, callback),
  onOpenSettings: callback => ipcRenderer.on(C.OPEN_SETTINGS, callback),
  onShowShortcuts: callback => ipcRenderer.on(C.SHOW_SHORTCUTS, callback),

  // App lifecycle
  onBeforeQuit: callback => ipcRenderer.on(C.APP_BEFORE_QUIT, callback),
  quitSaveDone: () => ipcRenderer.invoke(C.APP_QUIT_SAVE_DONE),
})
