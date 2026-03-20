// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI

// Helper to filter out null/undefined entries from arrays
function filterNulls(arr) {
  if (!Array.isArray(arr)) return arr
  return arr.filter(item => item != null)
}

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

  async getTasks(params = {}) {
    const queryParams = new URLSearchParams()
    if (params.workspaceId !== undefined) {
      queryParams.append('workspaceId', params.workspaceId === null ? 'null' : params.workspaceId)
    }
    if (params.completed !== undefined) {
      queryParams.append('completed', String(params.completed))
    }
    if (params.dueDateFrom) {
      queryParams.append('dueDateFrom', params.dueDateFrom)
    }
    if (params.dueDateTo) {
      queryParams.append('dueDateTo', params.dueDateTo)
    }
    if (params.importance !== undefined) {
      queryParams.append('importance', String(params.importance))
    }
    if (params.parentId !== undefined) {
      queryParams.append('parentId', String(params.parentId))
    }
    const queryString = queryParams.toString()
    return request(`/tasks${queryString ? '?' + queryString : ''}`)
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

  // Search with pagination
  async search(query, type = null, workspaceId = undefined, options = {}) {
    const params = new URLSearchParams({ q: query })
    if (type) params.append('type', type)
    if (workspaceId !== undefined) params.append('workspace_id', workspaceId)
    if (options.hideCompleted) params.append('hide_completed', 'true')
    if (options.limit !== undefined) params.append('limit', String(options.limit))
    if (options.offset !== undefined) params.append('offset', String(options.offset))
    return request(`/search?${params}`)
  },

  // Get total count for pagination
  async searchCount(query, type = null, workspaceId = undefined, options = {}) {
    const params = new URLSearchParams({ q: query, count_only: 'true' })
    if (type) params.append('type', type)
    if (workspaceId !== undefined) params.append('workspace_id', workspaceId)
    if (options.hideCompleted) params.append('hide_completed', 'true')
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
  async getAllTags(workspaceId = undefined) {
    let url = '/tags'
    if (workspaceId !== undefined) {
      url += `?workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request(url)
  },

  async getNodesByTag(tag, workspaceId = undefined, options = {}) {
    let url = `/tags/${encodeURIComponent(tag)}/nodes`
    const params = new URLSearchParams()
    if (workspaceId !== undefined) {
      params.append('workspace_id', workspaceId === null ? 'null' : workspaceId)
    }
    if (options.hideCompleted) {
      params.append('hide_completed', 'true')
    }
    const queryString = params.toString()
    if (queryString) {
      url += `?${queryString}`
    }
    return request(url)
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

  // Database Backups & Reload (Electron only in web mode, these are stubs)
  async backup() { return { error: 'Backups only available in desktop app' } },
  async listBackups() { return [] },
  async restoreBackup() { return { error: 'Restore only available in desktop app' } },
  async reload() { return { error: 'Reload only available in desktop app' } },

  // Node Tables (Spreadsheet)
  async getNodeTable(nodeId) {
    return request(`/nodes/${nodeId}/table`)
  },

  async createNodeTable(nodeId, data = {}) {
    return request(`/nodes/${nodeId}/table`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateNodeTable(nodeId, data) {
    return request(`/nodes/${nodeId}/table`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteNodeTable(nodeId) {
    return request(`/nodes/${nodeId}/table`, {
      method: 'DELETE',
    })
  },

  async getTableCells(nodeId) {
    return request(`/nodes/${nodeId}/table/cells`)
  },

  async setCells(nodeId, cells) {
    return request(`/nodes/${nodeId}/table/cells`, {
      method: 'POST',
      body: JSON.stringify({ cells }),
    })
  },

  async clearCells(nodeId) {
    return request(`/nodes/${nodeId}/table/cells`, {
      method: 'DELETE',
    })
  },

  // Ollama LLM - uses direct fetch in web mode
  async ollamaGenerate({ prompt, content, model, endpoint, contextSize }) {
    const fullPrompt = `${prompt}\n\n---\n\n${content}`
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          num_ctx: contextSize || 32768
        }
      })
    })

    if (!response.ok) {
      if (response.status === 404) {
        const data = await response.json().catch(() => ({}))
        if (data.error?.includes('not found')) {
          throw new Error(`Model not available. Run: ollama pull ${model}`)
        }
      }
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.response
  },

  async ollamaTestConnection(endpoint) {
    try {
      const response = await fetch(`${endpoint}/api/tags`)
      if (!response.ok) {
        return {
          success: false,
          error: `Ollama API error: ${response.status} ${response.statusText}`
        }
      }
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: 'Ollama is not running. Start with: ollama serve'
      }
    }
  },

  async ollamaListModels(endpoint) {
    const response = await fetch(`${endpoint}/api/tags`)
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return (data.models || []).map(m => m.name)
  },

  // OpenAI-compatible API
  async openaiGenerate({ prompt, content, model, endpoint, apiKey }) {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: content }
        ],
        stream: false
      })
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key')
      }
      const data = await response.json().catch(() => ({}))
      throw new Error(data.error?.message || `API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices?.[0]?.message?.content || ''
  },

  async openaiTestConnection(endpoint, apiKey) {
    if (!apiKey) {
      return { success: false, error: 'API key is required' }
    }
    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      })
      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' }
        }
        return { success: false, error: `API error: ${response.status}` }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: 'Cannot connect to API endpoint' }
    }
  },

  async openaiListModels(endpoint, apiKey) {
    if (!apiKey) {
      throw new Error('API key is required')
    }
    const response = await fetch(`${endpoint}/models`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }
    const data = await response.json()
    return (data.data || []).map(m => m.id).sort()
  },
}

// Electron API implementation (uses IPC)
// Wrap array-returning methods with filterNulls to prevent null entries
const electronApi = {
  // Node CRUD
  getNodes: async (params) => filterNulls(await window.electronAPI.getNodes(params)),
  getNode: (id) => window.electronAPI.getNode(id),
  createNode: (data) => window.electronAPI.createNode(data),
  updateNode: (id, data) => window.electronAPI.updateNode(id, data),
  deleteNode: (id, hard) => window.electronAPI.deleteNode(id, hard),

  // Tree operations - all return arrays, so wrap with filterNulls
  getRoots: async (workspaceId) => filterNulls(await window.electronAPI.getRoots(workspaceId)),
  getProjects: async () => filterNulls(await window.electronAPI.getProjects()),
  getInbox: async () => filterNulls(await window.electronAPI.getInbox()),
  getRecent: async (limit, workspaceId) => filterNulls(await window.electronAPI.getRecent(limit, workspaceId)),
  getFavorites: async (workspaceId) => filterNulls(await window.electronAPI.getFavorites(workspaceId)),
  getTasks: async (params) => filterNulls(await window.electronAPI.getTasks(params)),
  getChildren: async (id, type) => filterNulls(await window.electronAPI.getChildren(id, type)),
  getDescendants: async (id, maxDepth) => filterNulls(await window.electronAPI.getDescendants(id, maxDepth)),
  getAncestors: async (id) => filterNulls(await window.electronAPI.getAncestors(id)),
  moveNode: (id, newParentId) => window.electronAPI.moveNode(id, newParentId),

  // Links
  linkNodes: (sourceId, targetId) => window.electronAPI.linkNodes(sourceId, targetId),
  unlinkNodes: (sourceId, targetId) => window.electronAPI.unlinkNodes(sourceId, targetId),
  getAllLinks: async (nodeIds) => filterNulls(await window.electronAPI.getAllLinks(nodeIds)),
  getLinkedNodes: async (id) => filterNulls(await window.electronAPI.getLinkedNodes(id)),

  // Tree view
  getTree: (rootId) => window.electronAPI.getTree(rootId),

  // Search with pagination
  search: async (query, type, workspaceId, options) => filterNulls(await window.electronAPI.search(query, type, workspaceId, options)),
  searchCount: (query, type, workspaceId, options) => window.electronAPI.searchCount(query, type, workspaceId, options),

  // Reorder
  reorderNode: (nodeId, targetId, position) => window.electronAPI.reorderNode(nodeId, targetId, position),

  // Export
  exportMarkdown: (nodeId) => window.electronAPI.exportMarkdown(nodeId),

  // Trash
  getTrash: async (limit) => filterNulls(await window.electronAPI.getTrash(limit)),
  restoreNode: (id) => window.electronAPI.restoreNode(id),
  emptyTrash: () => window.electronAPI.emptyTrash(),

  // Lost & Found
  getOrphanedNodes: async () => filterNulls(await window.electronAPI.getOrphanedNodes()),
  reparentToRoot: (id) => window.electronAPI.reparentToRoot(id),

  // Tags
  getAllTags: async (workspaceId) => filterNulls(await window.electronAPI.getAllTags(workspaceId)),
  getNodesByTag: async (tag, workspaceId, options) => filterNulls(await window.electronAPI.getNodesByTag(tag, workspaceId, options)),

  // Workspaces
  getWorkspaces: async () => filterNulls(await window.electronAPI.getWorkspaces()),
  getWorkspace: (id) => window.electronAPI.getWorkspace(id),
  createWorkspace: (data) => window.electronAPI.createWorkspace(data),
  updateWorkspace: (id, data) => window.electronAPI.updateWorkspace(id, data),
  deleteWorkspace: (id) => window.electronAPI.deleteWorkspace(id),

  // Database Backups & Reload
  backup: (suffix) => window.electronAPI.backup(suffix),
  listBackups: () => window.electronAPI.listBackups(),
  restoreBackup: (backupPath) => window.electronAPI.restoreBackup(backupPath),
  reload: () => window.electronAPI.reload(),

  // Node Tables (Spreadsheet)
  getNodeTable: (nodeId) => window.electronAPI.getNodeTable(nodeId),
  createNodeTable: (nodeId, data) => window.electronAPI.createNodeTable(nodeId, data),
  updateNodeTable: (nodeId, data) => window.electronAPI.updateNodeTable(nodeId, data),
  deleteNodeTable: (nodeId) => window.electronAPI.deleteNodeTable(nodeId),
  getTableCells: (nodeId) => window.electronAPI.getTableCells(nodeId),
  setCells: (nodeId, cells) => window.electronAPI.setCells(nodeId, cells),
  clearCells: (nodeId) => window.electronAPI.clearCells(nodeId),

  // Ollama LLM
  ollamaGenerate: (options) => window.electronAPI.ollamaGenerate(options),
  ollamaTestConnection: (endpoint) => window.electronAPI.ollamaTestConnection(endpoint),
  ollamaListModels: (endpoint) => window.electronAPI.ollamaListModels(endpoint),

  // OpenAI-compatible API
  openaiGenerate: (options) => window.electronAPI.openaiGenerate(options),
  openaiTestConnection: (endpoint, apiKey) => window.electronAPI.openaiTestConnection(endpoint, apiKey),
  openaiListModels: (endpoint, apiKey) => window.electronAPI.openaiListModels(endpoint, apiKey),
}

// Export the appropriate API based on environment
export const api = isElectron ? electronApi : webApi
