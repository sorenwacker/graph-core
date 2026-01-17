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
  getChildren: (id, type) => ipcRenderer.invoke('db:getChildren', id, type),
  getDescendants: (id, maxDepth) => ipcRenderer.invoke('db:getDescendants', id, maxDepth),
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
  search: (query, type, workspaceId) => ipcRenderer.invoke('db:search', query, type, workspaceId),

  // Reorder
  reorderNode: (nodeId, targetId, position) => ipcRenderer.invoke('db:reorderNode', nodeId, targetId, position),

  // Export
  exportMarkdown: (nodeId) => ipcRenderer.invoke('db:exportMarkdown', nodeId),

  // Trash
  getTrash: (limit) => ipcRenderer.invoke('db:getTrash', limit),
  restoreNode: (id) => ipcRenderer.invoke('db:restoreNode', id),
  emptyTrash: () => ipcRenderer.invoke('db:emptyTrash'),

  // Lost & Found
  getOrphanedNodes: () => ipcRenderer.invoke('db:getOrphanedNodes'),
  reparentToRoot: (id) => ipcRenderer.invoke('db:reparentToRoot', id),

  // Tags
  getAllTags: () => ipcRenderer.invoke('db:getAllTags'),
  getNodesByTag: (tag) => ipcRenderer.invoke('db:getNodesByTag', tag),

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
  reload: () => ipcRenderer.invoke('db:reload')
})
