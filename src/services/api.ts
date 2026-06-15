/**
 * API service for graph-core.
 *
 * Provides a unified interface for both Electron (IPC) and web (HTTP) environments.
 */

import type {
  Node,
  CreateNodeData,
  UpdateNodeData,
  TreeNode,
  NodeLink,
  Workspace,
  CreateWorkspaceData,
  UpdateWorkspaceData,
  GetNodesParams,
  GetTasksParams,
  SearchOptions,
  GetNodesByTagOptions,
  ConnectionTestResult,
  OllamaGenerateOptions,
  OpenAIGenerateOptions,
  AgentResearchOptions,
  NodeTable,
  TableCell,
  ExportJSONOptions,
  BackupInfo,
  Api,
} from '../types'

// Extend Window interface for Electron API
declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

interface ElectronAPI {
  getNodes(params?: GetNodesParams): Promise<(Node | null)[]>
  getNode(id: number): Promise<Node | null>
  createNode(data: CreateNodeData): Promise<Node>
  updateNode(id: number, data: UpdateNodeData): Promise<Node>
  deleteNode(id: number, hard?: boolean): Promise<void>
  getRoots(workspaceId?: number | null): Promise<(Node | null)[]>
  getProjects(): Promise<(Node | null)[]>
  getInbox(): Promise<(Node | null)[]>
  getRecent(limit?: number, workspaceId?: number | null): Promise<(Node | null)[]>
  getFavorites(workspaceId?: number | null): Promise<(Node | null)[]>
  getTasks(params?: GetTasksParams): Promise<(Node | null)[]>
  getChildren(id: number, type?: string | null): Promise<(Node | null)[]>
  getDescendants(id: number, maxDepth?: number | null): Promise<(Node | null)[]>
  getDescendantsBatch(rootIds: number[]): Promise<Record<string, (Node | null)[]>>
  getAncestors(id: number): Promise<(Node | null)[]>
  moveNode(id: number, newParentId: number | null): Promise<void>
  linkNodes(sourceId: number, targetId: number): Promise<void>
  unlinkNodes(sourceId: number, targetId: number): Promise<void>
  getAllLinks(nodeIds?: number[] | null): Promise<(NodeLink | null)[]>
  getLinkedNodes(id: number): Promise<(Node | null)[]>
  getTree(rootId?: number | null): Promise<TreeNode[]>
  search(
    query: string,
    type?: string | null,
    workspaceId?: number | null,
    options?: SearchOptions
  ): Promise<(Node | null)[]>
  searchCount(
    query: string,
    type?: string | null,
    workspaceId?: number | null,
    options?: SearchOptions
  ): Promise<{ count: number }>
  reorderNode(nodeId: number, targetId: number, position: 'before' | 'after' | 'inside'): Promise<void>
  exportMarkdown(nodeId: number): Promise<string>
  exportJSON(nodeId: number, options?: ExportJSONOptions): Promise<object>
  exportCSV(nodeId: number, workspaceId?: number | null): Promise<string>
  importJSON(data: object, targetParentId?: number | null, workspaceId?: number | null): Promise<{ imported: number }>
  importCSV(csvData: string, targetParentId?: number | null, workspaceId?: number | null): Promise<{ imported: number }>
  getTrash(limit?: number): Promise<(Node | null)[]>
  restoreNode(id: number): Promise<void>
  emptyTrash(): Promise<void>
  getOrphanedNodes(): Promise<(Node | null)[]>
  reparentToRoot(id: number): Promise<void>
  getAllTags(workspaceId?: number | null): Promise<(string | null)[]>
  getNodesByTag(tag: string, workspaceId?: number | null, options?: GetNodesByTagOptions): Promise<(Node | null)[]>
  getTagNodes(workspaceId?: number | null): Promise<(Node | null)[]>
  getOrCreateTagNode(name: string, workspaceId?: number | null): Promise<Node>
  getNodesLinkedToTag(tagNodeId: number, options?: GetNodesByTagOptions): Promise<(Node | null)[]>
  searchTagNodes(query: string, workspaceId?: number | null, limit?: number): Promise<(Node | null)[]>
  getWorkspaces(): Promise<(Workspace | null)[]>
  getWorkspace(id: number): Promise<Workspace | null>
  createWorkspace(data: CreateWorkspaceData): Promise<Workspace>
  updateWorkspace(id: number, data: UpdateWorkspaceData): Promise<Workspace>
  deleteWorkspace(id: number): Promise<void>
  backup(suffix?: string): Promise<{ path: string } | { error: string }>
  listBackups(): Promise<BackupInfo[]>
  restoreBackup(backupPath: string): Promise<{ success: boolean } | { error: string }>
  reload(): Promise<void | { error: string }>
  getDataPath(): Promise<string | null>
  getNodeTable(nodeId: number): Promise<NodeTable | null>
  createNodeTable(nodeId: number, data?: { rows?: number; cols?: number }): Promise<NodeTable>
  updateNodeTable(nodeId: number, data: { rows?: number; cols?: number }): Promise<NodeTable>
  deleteNodeTable(nodeId: number): Promise<void>
  getTableCells(nodeId: number): Promise<TableCell[]>
  setCells(nodeId: number, cells: TableCell[]): Promise<void>
  clearCells(nodeId: number): Promise<void>
  ollamaGenerate(options: OllamaGenerateOptions): Promise<string>
  ollamaTestConnection(endpoint: string): Promise<ConnectionTestResult>
  ollamaListModels(endpoint: string): Promise<string[]>
  openaiGenerate(options: OpenAIGenerateOptions): Promise<string>
  openaiTestConnection(endpoint: string, apiKey: string, skipSslVerification?: boolean): Promise<ConnectionTestResult>
  openaiListModels(endpoint: string, apiKey: string, skipSslVerification?: boolean): Promise<string[]>
  agentResearch(options: AgentResearchOptions): Promise<string>
}

// Detect if running in Electron
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined

/**
 * Filter out null/undefined entries from arrays.
 */
function filterNulls<T>(arr: (T | null | undefined)[] | null | undefined): T[] {
  if (!Array.isArray(arr)) return []
  return arr.filter((item): item is T => item != null)
}

// HTTP API for web mode
const API_BASE = '/api'

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`
  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  }

  const response = await fetch(url, config)
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}

// Web API implementation
const webApi: Api = {
  // Node CRUD
  async getNodes(params: GetNodesParams = {}): Promise<Node[]> {
    const query = new URLSearchParams(params as Record<string, string>).toString()
    return request<Node[]>(`/nodes${query ? '?' + query : ''}`)
  },

  async getNode(id: number): Promise<Node | null> {
    return request<Node | null>(`/nodes/${id}`)
  },

  async createNode(data: CreateNodeData): Promise<Node> {
    return request<Node>('/nodes', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateNode(id: number, data: UpdateNodeData): Promise<Node> {
    return request<Node>(`/nodes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteNode(id: number, hard = false): Promise<void> {
    return request<void>(`/nodes/${id}?hard=${hard}`, {
      method: 'DELETE',
    })
  },

  // Tree operations
  async getRoots(workspaceId?: number | null): Promise<Node[]> {
    const params = workspaceId !== undefined ? `?workspace_id=${workspaceId}` : ''
    return request<Node[]>(`/roots${params}`)
  },

  async getProjects(): Promise<Node[]> {
    return request<Node[]>('/projects')
  },

  async getInbox(): Promise<Node[]> {
    return request<Node[]>('/inbox')
  },

  async getRecent(limit = 10, workspaceId?: number | null): Promise<Node[]> {
    let url = `/recent?limit=${limit}`
    if (workspaceId !== undefined) {
      url += `&workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request<Node[]>(url)
  },

  async getFavorites(workspaceId?: number | null): Promise<Node[]> {
    let url = '/favorites'
    if (workspaceId !== undefined) {
      url += `?workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request<Node[]>(url)
  },

  async getTasks(params: GetTasksParams = {}): Promise<Node[]> {
    const queryParams = new URLSearchParams()
    if (params.workspaceId !== undefined) {
      queryParams.append('workspaceId', params.workspaceId === null ? 'null' : String(params.workspaceId))
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
    return request<Node[]>(`/tasks${queryString ? '?' + queryString : ''}`)
  },

  async getChildren(id: number, type: string | null = null): Promise<Node[]> {
    const query = type ? `?type=${type}` : ''
    return request<Node[]>(`/nodes/${id}/children${query}`)
  },

  async getDescendants(id: number, maxDepth: number | null = null): Promise<Node[]> {
    const query = maxDepth ? `?max_depth=${maxDepth}` : ''
    return request<Node[]>(`/nodes/${id}/descendants${query}`)
  },

  async getDescendantsBatch(rootIds: number[]): Promise<Map<number, Node[]>> {
    // No batch HTTP endpoint exists; fetch each root's descendants in parallel
    // and assemble the same Map shape the Electron path returns.
    const map = new Map<number, Node[]>()
    await Promise.all(
      rootIds.map(async rootId => {
        const descendants = await request<Node[]>(`/nodes/${rootId}/descendants`)
        map.set(rootId, descendants || [])
      })
    )
    return map
  },

  async getAncestors(id: number): Promise<Node[]> {
    return request<Node[]>(`/nodes/${id}/ancestors`)
  },

  async moveNode(id: number, newParentId: number | null): Promise<void> {
    return request<void>(`/nodes/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ new_parent_id: newParentId }),
    })
  },

  // Links
  async linkNodes(sourceId: number, targetId: number): Promise<void> {
    return request<void>(`/nodes/${sourceId}/link/${targetId}`, {
      method: 'POST',
    })
  },

  async unlinkNodes(sourceId: number, targetId: number): Promise<void> {
    return request<void>(`/nodes/${sourceId}/link/${targetId}`, {
      method: 'DELETE',
    })
  },

  async getAllLinks(nodeIds: number[] | null = null): Promise<NodeLink[]> {
    const params = nodeIds ? `?node_ids=${nodeIds.join(',')}` : ''
    return request<NodeLink[]>(`/links${params}`)
  },

  async getLinkedNodes(id: number): Promise<Node[]> {
    return request<Node[]>(`/nodes/${id}/links`)
  },

  // Tree view
  async getTree(rootId: number | null = null): Promise<TreeNode[]> {
    const query = rootId ? `?root_id=${rootId}` : ''
    return request<TreeNode[]>(`/tree${query}`)
  },

  // Search with pagination
  async search(
    query: string,
    type: string | null = null,
    workspaceId?: number | null,
    options: SearchOptions = {}
  ): Promise<Node[]> {
    const params = new URLSearchParams({ q: query })
    if (type) params.append('type', type)
    if (workspaceId !== undefined) params.append('workspace_id', String(workspaceId))
    if (options.hideCompleted) params.append('hide_completed', 'true')
    if (options.limit !== undefined) params.append('limit', String(options.limit))
    if (options.offset !== undefined) params.append('offset', String(options.offset))
    return request<Node[]>(`/search?${params}`)
  },

  // Get total count for pagination
  async searchCount(
    query: string,
    type: string | null = null,
    workspaceId?: number | null,
    options: SearchOptions = {}
  ): Promise<{ count: number }> {
    const params = new URLSearchParams({ q: query, count_only: 'true' })
    if (type) params.append('type', type)
    if (workspaceId !== undefined) params.append('workspace_id', String(workspaceId))
    if (options.hideCompleted) params.append('hide_completed', 'true')
    return request<{ count: number }>(`/search?${params}`)
  },

  // Reorder
  async reorderNode(nodeId: number, targetId: number, position: 'before' | 'after' | 'inside'): Promise<void> {
    return request<void>(`/nodes/${nodeId}/reorder?target_id=${targetId}&position=${position}`, {
      method: 'POST',
    })
  },

  // Export
  async exportMarkdown(nodeId: number): Promise<string> {
    return request<string>(`/nodes/${nodeId}/export`)
  },

  // JSON/CSV export and import are file-system operations available only in the
  // desktop app. Stub them like the other desktop-only methods so callers fail
  // with a clear message instead of "api.exportJSON is not a function".
  async exportJSON(): Promise<object> {
    throw new Error('JSON export only available in desktop app')
  },

  async exportCSV(): Promise<string> {
    throw new Error('CSV export only available in desktop app')
  },

  async importJSON(): Promise<{ imported: number }> {
    throw new Error('JSON import only available in desktop app')
  },

  async importCSV(): Promise<{ imported: number }> {
    throw new Error('CSV import only available in desktop app')
  },

  // Trash
  async getTrash(limit = 100): Promise<Node[]> {
    return request<Node[]>(`/trash?limit=${limit}`)
  },

  async restoreNode(id: number): Promise<void> {
    return request<void>(`/nodes/${id}/restore`, {
      method: 'POST',
    })
  },

  async emptyTrash(): Promise<void> {
    return request<void>('/trash', {
      method: 'DELETE',
    })
  },

  // Lost & Found
  async getOrphanedNodes(): Promise<Node[]> {
    return request<Node[]>('/orphaned')
  },

  async reparentToRoot(id: number): Promise<void> {
    return request<void>(`/nodes/${id}/reparent`, {
      method: 'POST',
    })
  },

  // Tags
  async getAllTags(workspaceId?: number | null): Promise<string[]> {
    let url = '/tags'
    if (workspaceId !== undefined) {
      url += `?workspace_id=${workspaceId === null ? 'null' : workspaceId}`
    }
    return request<string[]>(url)
  },

  async getNodesByTag(tag: string, workspaceId?: number | null, options: GetNodesByTagOptions = {}): Promise<Node[]> {
    let url = `/tags/${encodeURIComponent(tag)}/nodes`
    const params = new URLSearchParams()
    if (workspaceId !== undefined) {
      params.append('workspace_id', workspaceId === null ? 'null' : String(workspaceId))
    }
    if (options.hideCompleted) {
      params.append('hide_completed', 'true')
    }
    const queryString = params.toString()
    if (queryString) {
      url += `?${queryString}`
    }
    return request<Node[]>(url)
  },

  // Tags (first-class nodes) - stubs for web mode
  async getTagNodes(): Promise<Node[]> {
    return []
  },

  async getOrCreateTagNode(): Promise<Node> {
    throw new Error('Tag nodes only available in desktop app')
  },

  async getNodesLinkedToTag(): Promise<Node[]> {
    return []
  },

  async searchTagNodes(): Promise<Node[]> {
    return []
  },

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    return request<Workspace[]>('/workspaces')
  },

  async getWorkspace(id: number): Promise<Workspace | null> {
    return request<Workspace | null>(`/workspaces/${id}`)
  },

  async createWorkspace(data: CreateWorkspaceData): Promise<Workspace> {
    return request<Workspace>('/workspaces', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateWorkspace(id: number, data: UpdateWorkspaceData): Promise<Workspace> {
    return request<Workspace>(`/workspaces/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteWorkspace(id: number): Promise<void> {
    return request<void>(`/workspaces/${id}`, {
      method: 'DELETE',
    })
  },

  // Database Backups & Reload (Electron only in web mode, these are stubs)
  async backup(): Promise<{ path: string } | { error: string }> {
    return { error: 'Backups only available in desktop app' }
  },

  async listBackups(): Promise<BackupInfo[]> {
    return []
  },

  async restoreBackup(): Promise<{ success: boolean } | { error: string }> {
    return { error: 'Restore only available in desktop app' }
  },

  async reload(): Promise<void | { error: string }> {
    return { error: 'Reload only available in desktop app' }
  },

  async getDataPath(): Promise<string | null> {
    return null
  },

  // Node Tables (Spreadsheet)
  async getNodeTable(nodeId: number): Promise<NodeTable | null> {
    return request<NodeTable | null>(`/nodes/${nodeId}/table`)
  },

  async createNodeTable(nodeId: number, data: { rows?: number; cols?: number } = {}): Promise<NodeTable> {
    return request<NodeTable>(`/nodes/${nodeId}/table`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateNodeTable(nodeId: number, data: { rows?: number; cols?: number }): Promise<NodeTable> {
    return request<NodeTable>(`/nodes/${nodeId}/table`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  async deleteNodeTable(nodeId: number): Promise<void> {
    return request<void>(`/nodes/${nodeId}/table`, {
      method: 'DELETE',
    })
  },

  async getTableCells(nodeId: number): Promise<TableCell[]> {
    return request<TableCell[]>(`/nodes/${nodeId}/table/cells`)
  },

  async setCells(nodeId: number, cells: TableCell[]): Promise<void> {
    return request<void>(`/nodes/${nodeId}/table/cells`, {
      method: 'POST',
      body: JSON.stringify({ cells }),
    })
  },

  async clearCells(nodeId: number): Promise<void> {
    return request<void>(`/nodes/${nodeId}/table/cells`, {
      method: 'DELETE',
    })
  },

  // Ollama LLM - uses direct fetch in web mode
  async ollamaGenerate({ prompt, content, model, endpoint, contextSize }: OllamaGenerateOptions): Promise<string> {
    const fullPrompt = `${prompt}\n\n---\n\n${content}`
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: {
          num_ctx: contextSize || 32768,
        },
      }),
    })

    if (!response.ok) {
      if (response.status === 404) {
        const data = (await response.json().catch(() => ({}))) as { error?: string }
        if (data.error?.includes('not found')) {
          throw new Error(`Model not available. Run: ollama pull ${model}`)
        }
      }
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { response: string }
    return data.response
  },

  async ollamaTestConnection(endpoint: string): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(`${endpoint}/api/tags`)
      if (!response.ok) {
        return {
          success: false,
          error: `Ollama API error: ${response.status} ${response.statusText}`,
        }
      }
      return { success: true }
    } catch {
      return {
        success: false,
        error: 'Ollama is not running. Start with: ollama serve',
      }
    }
  },

  async ollamaListModels(endpoint: string): Promise<string[]> {
    const response = await fetch(`${endpoint}/api/tags`)
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { models?: { name: string }[] }
    return (data.models || []).map(m => m.name)
  },

  // OpenAI-compatible API
  async openaiGenerate({ prompt, content, model, endpoint, apiKey }: OpenAIGenerateOptions): Promise<string> {
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: content },
        ],
        stream: false,
      }),
    })

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key')
      }
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } }
      throw new Error(data.error?.message || `API error: ${response.status} ${response.statusText}`)
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
    return data.choices?.[0]?.message?.content || ''
  },

  async openaiTestConnection(endpoint: string, apiKey: string): Promise<ConnectionTestResult> {
    if (!apiKey) {
      return { success: false, error: 'API key is required' }
    }
    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' }
        }
        return { success: false, error: `API error: ${response.status}` }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Cannot connect to API endpoint' }
    }
  },

  async openaiListModels(endpoint: string, apiKey: string): Promise<string[]> {
    if (!apiKey) {
      throw new Error('API key is required')
    }
    const response = await fetch(`${endpoint}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`)
    }
    const data = (await response.json()) as { data?: { id: string }[] }
    return (data.data || []).map(m => m.id).sort()
  },

  // Agent research - runs agent loop with tool calling
  async agentResearch(options: AgentResearchOptions): Promise<string> {
    // Import dynamically to avoid bundling issues
    const { research } = await import('./agentService.js')
    return research(options)
  },
}

// Electron API implementation (uses IPC)
// Wrap array-returning methods with filterNulls to prevent null entries
const electronApi: Api = {
  // Node CRUD
  async getNodes(params?: GetNodesParams): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getNodes(params))
  },

  getNode: (id: number): Promise<Node | null> => window.electronAPI!.getNode(id),

  createNode: async (data: CreateNodeData): Promise<Node> => {
    const plainData = JSON.parse(JSON.stringify(data))
    return window.electronAPI!.createNode(plainData)
  },

  updateNode: async (id: number, data: UpdateNodeData): Promise<Node> => {
    // Ensure data is serializable for IPC (no Vue proxies, functions, etc.)
    const plainData = JSON.parse(JSON.stringify(data))
    return window.electronAPI!.updateNode(id, plainData)
  },

  deleteNode: (id: number, hard?: boolean): Promise<void> => window.electronAPI!.deleteNode(id, hard),

  // Tree operations - all return arrays, so wrap with filterNulls
  async getRoots(workspaceId?: number | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getRoots(workspaceId))
  },

  async getProjects(): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getProjects())
  },

  async getInbox(): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getInbox())
  },

  async getRecent(limit?: number, workspaceId?: number | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getRecent(limit, workspaceId))
  },

  async getFavorites(workspaceId?: number | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getFavorites(workspaceId))
  },

  async getTasks(params?: GetTasksParams): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getTasks(params))
  },

  async getChildren(id: number, type?: string | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getChildren(id, type))
  },

  async getDescendants(id: number, maxDepth?: number | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getDescendants(id, maxDepth))
  },

  async getDescendantsBatch(rootIds: number[]): Promise<Map<number, Node[]>> {
    const result = await window.electronAPI!.getDescendantsBatch(rootIds)
    // Convert plain object back to Map and filter nulls from each array
    const map = new Map<number, Node[]>()
    for (const [key, descendants] of Object.entries(result)) {
      map.set(Number(key), filterNulls(descendants))
    }
    return map
  },

  async getAncestors(id: number): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getAncestors(id))
  },

  moveNode: (id: number, newParentId: number | null): Promise<void> => window.electronAPI!.moveNode(id, newParentId),

  // Links
  linkNodes: (sourceId: number, targetId: number): Promise<void> => window.electronAPI!.linkNodes(sourceId, targetId),

  unlinkNodes: (sourceId: number, targetId: number): Promise<void> =>
    window.electronAPI!.unlinkNodes(sourceId, targetId),

  async getAllLinks(nodeIds?: number[] | null): Promise<NodeLink[]> {
    return filterNulls(await window.electronAPI!.getAllLinks(nodeIds))
  },

  async getLinkedNodes(id: number): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getLinkedNodes(id))
  },

  // Tree view
  getTree: (rootId?: number | null): Promise<TreeNode[]> => window.electronAPI!.getTree(rootId),

  // Search with pagination
  async search(
    query: string,
    type?: string | null,
    workspaceId?: number | null,
    options?: SearchOptions
  ): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.search(query, type, workspaceId, options))
  },

  searchCount: (
    query: string,
    type?: string | null,
    workspaceId?: number | null,
    options?: SearchOptions
  ): Promise<{ count: number }> => window.electronAPI!.searchCount(query, type, workspaceId, options),

  // Reorder
  reorderNode: (nodeId: number, targetId: number, position: 'before' | 'after' | 'inside'): Promise<void> =>
    window.electronAPI!.reorderNode(nodeId, targetId, position),

  // Export
  exportMarkdown: (nodeId: number): Promise<string> => window.electronAPI!.exportMarkdown(nodeId),

  exportJSON: (nodeId: number, options?: ExportJSONOptions): Promise<object> =>
    window.electronAPI!.exportJSON(nodeId, options),

  exportCSV: (nodeId: number, workspaceId?: number | null): Promise<string> =>
    window.electronAPI!.exportCSV(nodeId, workspaceId),

  // Import
  importJSON: (
    data: object,
    targetParentId?: number | null,
    workspaceId?: number | null
  ): Promise<{ imported: number }> => window.electronAPI!.importJSON(data, targetParentId, workspaceId),

  importCSV: (
    csvData: string,
    targetParentId?: number | null,
    workspaceId?: number | null
  ): Promise<{ imported: number }> => window.electronAPI!.importCSV(csvData, targetParentId, workspaceId),

  // Trash
  async getTrash(limit?: number): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getTrash(limit))
  },

  restoreNode: (id: number): Promise<void> => window.electronAPI!.restoreNode(id),

  emptyTrash: (): Promise<void> => window.electronAPI!.emptyTrash(),

  // Lost & Found
  async getOrphanedNodes(): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getOrphanedNodes())
  },

  reparentToRoot: (id: number): Promise<void> => window.electronAPI!.reparentToRoot(id),

  // Tags
  async getAllTags(workspaceId?: number | null): Promise<string[]> {
    return filterNulls(await window.electronAPI!.getAllTags(workspaceId))
  },

  async getNodesByTag(tag: string, workspaceId?: number | null, options?: GetNodesByTagOptions): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getNodesByTag(tag, workspaceId, options))
  },

  // Tags (first-class nodes)
  async getTagNodes(workspaceId?: number | null): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getTagNodes(workspaceId))
  },

  getOrCreateTagNode: (name: string, workspaceId?: number | null): Promise<Node> =>
    window.electronAPI!.getOrCreateTagNode(name, workspaceId),

  async getNodesLinkedToTag(tagNodeId: number, options?: GetNodesByTagOptions): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.getNodesLinkedToTag(tagNodeId, options))
  },

  async searchTagNodes(query: string, workspaceId?: number | null, limit?: number): Promise<Node[]> {
    return filterNulls(await window.electronAPI!.searchTagNodes(query, workspaceId, limit))
  },

  // Workspaces
  async getWorkspaces(): Promise<Workspace[]> {
    return filterNulls(await window.electronAPI!.getWorkspaces())
  },

  getWorkspace: (id: number): Promise<Workspace | null> => window.electronAPI!.getWorkspace(id),

  createWorkspace: (data: CreateWorkspaceData): Promise<Workspace> => window.electronAPI!.createWorkspace(data),

  updateWorkspace: (id: number, data: UpdateWorkspaceData): Promise<Workspace> =>
    window.electronAPI!.updateWorkspace(id, data),

  deleteWorkspace: (id: number): Promise<void> => window.electronAPI!.deleteWorkspace(id),

  // Database Backups & Reload
  backup: (suffix?: string): Promise<{ path: string } | { error: string }> => window.electronAPI!.backup(suffix),

  listBackups: (): Promise<BackupInfo[]> => window.electronAPI!.listBackups(),

  restoreBackup: (backupPath: string): Promise<{ success: boolean } | { error: string }> =>
    window.electronAPI!.restoreBackup(backupPath),

  reload: (): Promise<void | { error: string }> => window.electronAPI!.reload(),

  getDataPath: (): Promise<string | null> => window.electronAPI!.getDataPath(),

  // Node Tables (Spreadsheet)
  getNodeTable: (nodeId: number): Promise<NodeTable | null> => window.electronAPI!.getNodeTable(nodeId),

  createNodeTable: (nodeId: number, data?: { rows?: number; cols?: number }): Promise<NodeTable> =>
    window.electronAPI!.createNodeTable(nodeId, data),

  updateNodeTable: (nodeId: number, data: { rows?: number; cols?: number }): Promise<NodeTable> =>
    window.electronAPI!.updateNodeTable(nodeId, data),

  deleteNodeTable: (nodeId: number): Promise<void> => window.electronAPI!.deleteNodeTable(nodeId),

  getTableCells: (nodeId: number): Promise<TableCell[]> => window.electronAPI!.getTableCells(nodeId),

  setCells: (nodeId: number, cells: TableCell[]): Promise<void> => window.electronAPI!.setCells(nodeId, cells),

  clearCells: (nodeId: number): Promise<void> => window.electronAPI!.clearCells(nodeId),

  // Ollama LLM
  ollamaGenerate: (options: OllamaGenerateOptions): Promise<string> => window.electronAPI!.ollamaGenerate(options),

  ollamaTestConnection: (endpoint: string): Promise<ConnectionTestResult> =>
    window.electronAPI!.ollamaTestConnection(endpoint),

  ollamaListModels: (endpoint: string): Promise<string[]> => window.electronAPI!.ollamaListModels(endpoint),

  // OpenAI-compatible API
  openaiGenerate: (options: OpenAIGenerateOptions): Promise<string> => window.electronAPI!.openaiGenerate(options),

  openaiTestConnection: (
    endpoint: string,
    apiKey: string,
    skipSslVerification?: boolean
  ): Promise<ConnectionTestResult> => window.electronAPI!.openaiTestConnection(endpoint, apiKey, skipSslVerification),

  openaiListModels: (endpoint: string, apiKey: string, skipSslVerification?: boolean): Promise<string[]> =>
    window.electronAPI!.openaiListModels(endpoint, apiKey, skipSslVerification),

  // Agent research
  agentResearch: (options: AgentResearchOptions): Promise<string> => window.electronAPI!.agentResearch(options),
}

// Export the appropriate API based on environment
export const api: Api = isElectron ? electronApi : webApi
