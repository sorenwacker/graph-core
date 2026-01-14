const API_BASE = 'http://127.0.0.1:8000'

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

export const api = {
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
  async getRoots() {
    return request('/roots')
  },

  async getProjects() {
    return request('/projects')
  },

  async getInbox() {
    return request('/inbox')
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

  async getLinkedNodes(id) {
    return request(`/nodes/${id}/links`)
  },

  // Tree view
  async getTree(rootId = null) {
    const query = rootId ? `?root_id=${rootId}` : ''
    return request(`/tree${query}`)
  },

  // Search
  async search(query, type = null) {
    const params = new URLSearchParams({ q: query })
    if (type) params.append('type', type)
    return request(`/search?${params}`)
  },

  // Reorder
  async reorderNode(nodeId, targetId, position) {
    return request(`/nodes/${nodeId}/reorder?target_id=${targetId}&position=${position}`, {
      method: 'POST',
    })
  },
}
