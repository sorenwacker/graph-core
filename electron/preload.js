const { contextBridge, ipcRenderer } = require('electron')

// Expose a secure API to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Node CRUD
  getNodes: (params) => ipcRenderer.invoke('db:getNodes', params),
  getNode: (id) => ipcRenderer.invoke('db:getNode', id),
  createNode: (data) => ipcRenderer.invoke('db:createNode', data),
  updateNode: (id, data) => ipcRenderer.invoke('db:updateNode', id, data),
  deleteNode: (id, hard) => ipcRenderer.invoke('db:deleteNode', id, hard),

  // Tree operations
  getRoots: (workspaceId) => ipcRenderer.invoke('db:getRoots', workspaceId),
  getProjects: () => ipcRenderer.invoke('db:getProjects'),
  getInbox: () => ipcRenderer.invoke('db:getInbox'),
  getRecent: (limit, workspaceId) => ipcRenderer.invoke('db:getRecent', limit, workspaceId),
  getFavorites: (workspaceId) => ipcRenderer.invoke('db:getFavorites', workspaceId),
  getTasks: (params) => ipcRenderer.invoke('db:getTasks', params),
  getChildren: (id, type) => ipcRenderer.invoke('db:getChildren', id, type),
  getDescendants: (id, maxDepth) => ipcRenderer.invoke('db:getDescendants', id, maxDepth),
  getDescendantsBatch: (rootIds) => ipcRenderer.invoke('db:getDescendantsBatch', rootIds),
  getAncestors: (id) => ipcRenderer.invoke('db:getAncestors', id),
  moveNode: (id, newParentId) => ipcRenderer.invoke('db:moveNode', id, newParentId),

  // Links
  linkNodes: (sourceId, targetId) => ipcRenderer.invoke('db:linkNodes', sourceId, targetId),
  unlinkNodes: (sourceId, targetId) => ipcRenderer.invoke('db:unlinkNodes', sourceId, targetId),
  getAllLinks: (nodeIds) => ipcRenderer.invoke('db:getAllLinks', nodeIds),
  getLinkedNodes: (id) => ipcRenderer.invoke('db:getLinkedNodes', id),

  // Tree view
  getTree: (rootId) => ipcRenderer.invoke('db:getTree', rootId),

  // Search
  search: (query, type, workspaceId, options) => ipcRenderer.invoke('db:search', query, type, workspaceId, options),
  searchCount: (query, type, workspaceId, options) => ipcRenderer.invoke('db:searchCount', query, type, workspaceId, options),

  // Reorder
  reorderNode: (nodeId, targetId, position) => ipcRenderer.invoke('db:reorderNode', nodeId, targetId, position),

  // Export
  exportMarkdown: (nodeId) => ipcRenderer.invoke('db:exportMarkdown', nodeId),
  exportJSON: (nodeId, options) => ipcRenderer.invoke('db:exportJSON', nodeId, options),
  exportCSV: (nodeId, workspaceId) => ipcRenderer.invoke('db:exportCSV', nodeId, workspaceId),

  // Import
  importJSON: (data, targetParentId, workspaceId) => ipcRenderer.invoke('db:importJSON', data, targetParentId, workspaceId),
  importCSV: (csvData, targetParentId, workspaceId) => ipcRenderer.invoke('db:importCSV', csvData, targetParentId, workspaceId),

  // Trash
  getTrash: (limit) => ipcRenderer.invoke('db:getTrash', limit),
  restoreNode: (id) => ipcRenderer.invoke('db:restoreNode', id),
  emptyTrash: () => ipcRenderer.invoke('db:emptyTrash'),

  // Lost & Found
  getOrphanedNodes: () => ipcRenderer.invoke('db:getOrphanedNodes'),
  reparentToRoot: (id) => ipcRenderer.invoke('db:reparentToRoot', id),

  // Tags
  getAllTags: (workspaceId) => ipcRenderer.invoke('db:getAllTags', workspaceId),
  getNodesByTag: (tag, workspaceId, options) => ipcRenderer.invoke('db:getNodesByTag', tag, workspaceId, options),

  // Workspaces
  getWorkspaces: () => ipcRenderer.invoke('db:getWorkspaces'),
  getWorkspace: (id) => ipcRenderer.invoke('db:getWorkspace', id),
  createWorkspace: (data) => ipcRenderer.invoke('db:createWorkspace', data),
  updateWorkspace: (id, data) => ipcRenderer.invoke('db:updateWorkspace', id, data),
  deleteWorkspace: (id) => ipcRenderer.invoke('db:deleteWorkspace', id),

  // Database Backups & Reload
  backup: (suffix) => ipcRenderer.invoke('db:backup', suffix),
  listBackups: () => ipcRenderer.invoke('db:listBackups'),
  restoreBackup: (backupPath) => ipcRenderer.invoke('db:restoreBackup', backupPath),
  reload: () => ipcRenderer.invoke('db:reload'),
  repairWorkspaces: () => ipcRenderer.invoke('db:repairWorkspaces'),

  // Node Tables (Spreadsheet)
  getNodeTable: (nodeId) => ipcRenderer.invoke('db:getNodeTable', nodeId),
  createNodeTable: (nodeId, data) => ipcRenderer.invoke('db:createNodeTable', nodeId, data),
  updateNodeTable: (nodeId, data) => ipcRenderer.invoke('db:updateNodeTable', nodeId, data),
  deleteNodeTable: (nodeId) => ipcRenderer.invoke('db:deleteNodeTable', nodeId),
  getTableCells: (nodeId) => ipcRenderer.invoke('db:getTableCells', nodeId),
  setCells: (nodeId, cells) => ipcRenderer.invoke('db:setCells', nodeId, cells),
  clearCells: (nodeId) => ipcRenderer.invoke('db:clearCells', nodeId),

  // Shell
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Detached Windows
  openDetachedWindow: (nodeId, nodeTitle) => ipcRenderer.invoke('window:openDetached', nodeId, nodeTitle),
  closeDetachedWindow: (nodeId) => ipcRenderer.invoke('window:closeDetached', nodeId),

  // Ollama LLM
  ollamaGenerate: (options) => ipcRenderer.invoke('ollama:generate', options),
  ollamaTestConnection: (endpoint) => ipcRenderer.invoke('ollama:testConnection', endpoint),
  ollamaListModels: (endpoint) => ipcRenderer.invoke('ollama:listModels', endpoint),

  // OpenAI-compatible API
  openaiGenerate: (options) => ipcRenderer.invoke('openai:generate', options),
  openaiTestConnection: (endpoint, apiKey, skipSslVerification) => ipcRenderer.invoke('openai:testConnection', endpoint, apiKey, skipSslVerification),
  openaiListModels: (endpoint, apiKey, skipSslVerification) => ipcRenderer.invoke('openai:listModels', endpoint, apiKey, skipSslVerification),

  // Menu events
  onMenuUndo: (callback) => ipcRenderer.on('menu-undo', callback),
  onMenuRedo: (callback) => ipcRenderer.on('menu-redo', callback),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', callback),

  // App lifecycle
  onBeforeQuit: (callback) => ipcRenderer.on('app-before-quit', callback),

  // App info
  getVersion: () => ipcRenderer.invoke('app:getVersion')
})
