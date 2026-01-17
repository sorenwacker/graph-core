// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI

// HTTP API for web mode
const API_BASE = '/api'

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`
  const config = {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  }

  const response = await fetch(url, config)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json()
}

// Web API implementation
const webApi = {
  // Node CRUD
  async getNodes(params = {}) {
    const query = new URLSearchParams(params).toString()
    return request(`/nodes${query ? '?' + query : ''}`)
  },

  async getNode(id) {
    return request(`/nodes/${id}`)
  },

  async createNode(data) {
    return request('/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateNode(id, data) {
    return request(`/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteNode(id, hard = false) {
    return request(`/nodes/${id}?hard=${hard}`, {
      method: 'DELETE',
    })
  },

  // Tree operations
  async getRoots(workspaceId) {
    const params = workspaceId !== undefined ? `?workspace_id=${workspaceId}` : ''
    return request(`/roots${params}`)
  },

  async getProjects() {
    return request('/projects')
  },

  async getInbox() {
    return request('/inbox')
  },

  async getRecent(limit = 10, workspaceId = undefined) {
    let url = `/recent?limit=${limit}`
    if (workspaceId !== undefined) {
      url += `&workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request(url)
  },

  async getFavorites(workspaceId = undefined) {
    let url = '/favorites'
    if (workspaceId !== undefined) {
      url += `?workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request(url)
  },

  async getChildren(id, type = null) {
    const query = type ? `?type=${type}` : ''
    return request(`/nodes/${id}/children${query}`)
  },

  async getDescendants(id, maxDepth = null) {
    const query = maxDepth ? `?max_depth=${maxDepth}` : ''
    return request(`/nodes/${id}/descendants${query}`)
  },

  async getAncestors(id) {
    return request(`/nodes/${id}/ancestors`)
  },

  async moveNode(id, newParentId) {
    return request(`/nodes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ new_parent_id: newParentId }),
    })
  },

  // Links
  async linkNodes(sourceId, targetId) {
    return request(`/nodes/${sourceId}/link/${targetId}`, {
      method: 'POST',
    })
  },

  async unlinkNodes(sourceId, targetId) {
    return request(`/nodes/${sourceId}/link/${targetId}`, {
      method: 'DELETE',
    })
  },

  async getAllLinks(nodeIds = null) {
    const params = nodeIds ? `?node_ids=${nodeIds.join(',')}` : ''
    return request(`/links${params}`)
  },

  async getLinkedNodes(id) {
    return request(`/nodes/${id}/links`)
  },

  // Tree view
  async getTree(rootId = null) {
    const query = rootId ? `?root_id=${rootId}` : ''
    return request(`/tree${query}`)
  },

  // Search
  async search(query, type = null, workspaceId = undefined) {
    const params = new URLSearchParams({ q: query })
    if (type) params.append('type', type)
    if (workspaceId !== undefined) params.append('workspace_id', workspaceId)
    return request(`/search?${params}`)
  },

  // Reorder
  async reorderNode(nodeId, targetId, position) {
    return request(`/nodes/${nodeId}/reorder?target_id=${targetId}&position=${position}`, {
      method: 'POST',
    })
  },

  // Export
  async exportMarkdown(nodeId) {
    return request(`/nodes/${nodeId}/export`)
  },

  // Trash
  async getTrash(limit = 100) {
    return request(`/trash?limit=${limit}`)
  },

  async restoreNode(id) {
    return request(`/nodes/${id}/restore`, {
      method: 'POST',
    })
  },

  async emptyTrash() {
    return request('/trash', {
      method: 'DELETE',
    })
  },

  // Lost & Found
  async getOrphanedNodes() {
    return request('/orphaned')
  },

  async reparentToRoot(id) {
    return request(`/nodes/${id}/reparent`, {
      method: 'POST',
    })
  },

  // Tags
  async getAllTags() {
    return request('/tags')
  },

  async getNodesByTag(tag) {
    return request(`/tags/${encodeURIComponent(tag)}/nodes`)
  },

  // Workspaces
  async getWorkspaces() {
    return request('/workspaces')
  },

  async getWorkspace(id) {
    return request(`/workspaces/${id}`)
  },

  async createWorkspace(data) {
    return request('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateWorkspace(id, data) {
    return request(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteWorkspace(id) {
    return request(`/workspaces/${id}`, {
      method: 'DELETE',
    })
  },

  // Database Backups (Electron only in web mode, these are stubs)
  async backup() { return { error: 'Backups only available in desktop app' } },
  async listBackups() { return [] },
  async restoreBackup() { return { error: 'Restore only available in desktop app' } },
}

// Electron API implementation (uses IPC)
const electronApi = {
  // Node CRUD
  getNodes: (params) => window.electronAPI.getNodes(params),
  getNode: (id) => window.electronAPI.getNode(id),
  createNode: (data) => window.electronAPI.createNode(data),
  updateNode: (id, data) => window.electronAPI.updateNode(id, data),
  deleteNode: (id, hard) => window.electronAPI.deleteNode(id, hard),

  // Tree operations
  getRoots: (workspaceId) => window.electronAPI.getRoots(workspaceId),
  getProjects: () => window.electronAPI.getProjects(),
  getInbox: () => window.electronAPI.getInbox(),
  getRecent: (limit, workspaceId) => window.electronAPI.getRecent(limit, workspaceId),
  getFavorites: (workspaceId) => window.electronAPI.getFavorites(workspaceId),
  getChildren: (id, type) => window.electronAPI.getChildren(id, type),
  getDescendants: (id, maxDepth) => window.electronAPI.getDescendants(id, maxDepth),
  getAncestors: (id) => window.electronAPI.getAncestors(id),
  moveNode: (id, newParentId) => window.electronAPI.moveNode(id, newParentId),

  // Links
  linkNodes: (sourceId, targetId) => window.electronAPI.linkNodes(sourceId, targetId),
  unlinkNodes: (sourceId, targetId) => window.electronAPI.unlinkNodes(sourceId, targetId),
  getAllLinks: (nodeIds) => window.electronAPI.getAllLinks(nodeIds),
  getLinkedNodes: (id) => window.electronAPI.getLinkedNodes(id),

  // Tree view
  getTree: (rootId) => window.electronAPI.getTree(rootId),

  // Search
  search: (query, type, workspaceId) => window.electronAPI.search(query, type, workspaceId),

  // Reorder
  reorderNode: (nodeId, targetId, position) => window.electronAPI.reorderNode(nodeId, targetId, position),

  // Export
  exportMarkdown: (nodeId) => window.electronAPI.exportMarkdown(nodeId),

  // Trash
  getTrash: (limit) => window.electronAPI.getTrash(limit),
  restoreNode: (id) => window.electronAPI.restoreNode(id),
  emptyTrash: () => window.electronAPI.emptyTrash(),

  // Lost & Found
  getOrphanedNodes: () => window.electronAPI.getOrphanedNodes(),
  reparentToRoot: (id) => window.electronAPI.reparentToRoot(id),

  // Tags
  getAllTags: () => window.electronAPI.getAllTags(),
  getNodesByTag: (tag) => window.electronAPI.getNodesByTag(tag),

  // Workspaces
  getWorkspaces: () => window.electronAPI.getWorkspaces(),
  getWorkspace: (id) => window.electronAPI.getWorkspace(id),
  createWorkspace: (data) => window.electronAPI.createWorkspace(data),
  updateWorkspace: (id, data) => window.electronAPI.updateWorkspace(id, data),
  deleteWorkspace: (id) => window.electronAPI.deleteWorkspace(id),

  // Database Backups
  backup: (suffix) => window.electronAPI.backup(suffix),
  listBackups: () => window.electronAPI.listBackups(),
  restoreBackup: (backupPath) => window.electronAPI.restoreBackup(backupPath),
}

// Export the appropriate API based on environment
export const api = isElectron ? electronApi : webApi
