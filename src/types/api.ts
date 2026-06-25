/**
 * API interface definitions for graph-core.
 */

import type { Node, CreateNodeData, UpdateNodeData, TreeNode, NodeLink } from './node'
import type { Workspace, CreateWorkspaceData, UpdateWorkspaceData } from './workspace'

/**
 * Parameters for fetching nodes.
 */
export interface GetNodesParams {
  workspace_id?: number | null
  type?: string
  parent_id?: number | null
}

/**
 * Parameters for fetching tasks.
 */
export interface GetTasksParams {
  workspaceId?: number | null
  completed?: boolean
  dueDateFrom?: string
  dueDateTo?: string
  importance?: number
  parentId?: number
}

/**
 * Search options.
 */
export interface SearchOptions {
  hideCompleted?: boolean
  limit?: number
  offset?: number
}

/**
 * Options for getting nodes by tag.
 */
export interface GetNodesByTagOptions {
  hideCompleted?: boolean
}

/**
 * Connection test result.
 */
export interface ConnectionTestResult {
  success: boolean
  error?: string
}

/**
 * Ollama generate options.
 */
export interface OllamaGenerateOptions {
  prompt: string
  content: string
  model: string
  endpoint: string
  contextSize?: number
}

/**
 * OpenAI generate options.
 */
export interface OpenAIGenerateOptions {
  prompt: string
  content: string
  model: string
  endpoint: string
  apiKey: string
}

/**
 * Agent research options.
 */
export interface AgentResearchOptions {
  prompt: string
  provider: 'ollama' | 'openai'
  model: string
  endpoint: string
  apiKey?: string
  contextSize?: number
  enabledTools?: string[]
}

/**
 * Node table (spreadsheet) data.
 */
export interface NodeTable {
  node_id: number
  rows: number
  cols: number
  created_at: string
  updated_at: string
}

/**
 * Table cell data.
 */
export interface TableCell {
  row: number
  col: number
  value: string
}

/**
 * Export JSON options.
 */
export interface ExportJSONOptions {
  includeDescendants?: boolean
}

/**
 * Backup info.
 */
export interface BackupInfo {
  path: string
  name: string
  timestamp: string
  size: number
}

/**
 * API service interface.
 * Defines all available API operations for the application.
 */
export interface Api {
  // Node CRUD
  getNodes(params?: GetNodesParams): Promise<Node[]>
  getNode(id: number): Promise<Node | null>
  createNode(data: CreateNodeData): Promise<Node>
  updateNode(id: number, data: UpdateNodeData): Promise<Node>
  deleteNode(id: number, hard?: boolean): Promise<void>

  // Tree operations
  getRoots(workspaceId?: number | null): Promise<Node[]>
  getProjects(): Promise<Node[]>
  getInbox(): Promise<Node[]>
  getRecent(limit?: number, workspaceId?: number | null): Promise<Node[]>
  getFavorites(workspaceId?: number | null): Promise<Node[]>
  getTasks(params?: GetTasksParams): Promise<Node[]>
  getChildren(id: number, type?: string | null): Promise<Node[]>
  getDescendants(id: number, maxDepth?: number | null): Promise<Node[]>
  getDescendantsBatch(rootIds: number[]): Promise<Map<number, Node[]>>
  getAncestors(id: number): Promise<Node[]>
  moveNode(id: number, newParentId: number | null): Promise<void>

  // Links
  linkNodes(sourceId: number, targetId: number): Promise<void>
  unlinkNodes(sourceId: number, targetId: number): Promise<void>
  getAllLinks(nodeIds?: number[] | null): Promise<NodeLink[]>
  getLinkedNodes(id: number): Promise<Node[]>

  // Tree view
  getTree(rootId?: number | null): Promise<TreeNode[]>

  // Search
  search(query: string, type?: string | null, workspaceId?: number | null, options?: SearchOptions): Promise<Node[]>
  searchCount(
    query: string,
    type?: string | null,
    workspaceId?: number | null,
    options?: SearchOptions
  ): Promise<{ count: number }>

  // Reorder
  reorderNode(nodeId: number, targetId: number, position: 'before' | 'after' | 'inside'): Promise<void>

  // Export
  exportMarkdown(nodeId: number): Promise<{ markdown: string }>
  exportJSON?(
    nodeId: number,
    options?: ExportJSONOptions
  ): Promise<{
    version: number
    exportedAt: string
    root: object | null
    links?: Array<{ source_id: number; target_id: number }>
  }>
  exportCSV?(nodeId: number, workspaceId?: number | null): Promise<{ csv: string; headers: string[]; rowCount: number }>

  // Import
  importJSON?(
    data: object,
    targetParentId?: number | null,
    workspaceId?: number | null
  ): Promise<{ rootId: number; nodesImported: number; linksCreated: number }>
  importCSV?(
    csvData: string,
    targetParentId?: number | null,
    workspaceId?: number | null
  ): Promise<{ nodesImported: number }>

  // Trash
  getTrash(limit?: number): Promise<Node[]>
  restoreNode(id: number): Promise<void>
  emptyTrash(): Promise<void>

  // Lost & Found
  getOrphanedNodes(): Promise<Node[]>
  reparentToRoot(id: number): Promise<void>

  // Tags (string-based, legacy)
  getAllTags(workspaceId?: number | null): Promise<string[]>
  getNodesByTag(tag: string, workspaceId?: number | null, options?: GetNodesByTagOptions): Promise<Node[]>

  // Tags (first-class nodes)
  getTagNodes?(workspaceId?: number | null): Promise<Node[]>
  getOrCreateTagNode?(name: string, workspaceId?: number | null): Promise<Node>
  getNodesLinkedToTag?(tagNodeId: number, options?: GetNodesByTagOptions): Promise<Node[]>
  searchTagNodes?(query: string, workspaceId?: number | null, limit?: number): Promise<Node[]>

  // Workspaces
  getWorkspaces(): Promise<Workspace[]>
  getWorkspace(id: number): Promise<Workspace | null>
  createWorkspace(data: CreateWorkspaceData): Promise<Workspace>
  updateWorkspace(id: number, data: UpdateWorkspaceData): Promise<Workspace>
  deleteWorkspace(id: number): Promise<void>

  // Database (Electron only)
  backup?(suffix?: string): Promise<{ path: string } | { error: string }>
  listBackups?(): Promise<BackupInfo[]>
  restoreBackup?(backupPath: string): Promise<{ success: boolean } | { error: string }>
  reload?(): Promise<void | { error: string }>
  getDataPath?(): Promise<string | null>

  // Node Tables (Spreadsheet)
  getNodeTable(nodeId: number): Promise<NodeTable | null>
  createNodeTable(nodeId: number, data?: { rows?: number; cols?: number }): Promise<NodeTable>
  updateNodeTable(nodeId: number, data: { rows?: number; cols?: number }): Promise<NodeTable>
  deleteNodeTable(nodeId: number): Promise<void>
  getTableCells(nodeId: number): Promise<TableCell[]>
  setCells(nodeId: number, cells: TableCell[]): Promise<void>
  clearCells(nodeId: number): Promise<void>

  // Ollama LLM
  ollamaGenerate(options: OllamaGenerateOptions): Promise<string>
  ollamaTestConnection(endpoint: string): Promise<ConnectionTestResult>
  ollamaListModels(endpoint: string): Promise<string[]>

  // OpenAI-compatible API
  openaiGenerate(options: OpenAIGenerateOptions): Promise<string>
  openaiTestConnection(endpoint: string, apiKey: string, skipSslVerification?: boolean): Promise<ConnectionTestResult>
  openaiListModels(endpoint: string, apiKey: string, skipSslVerification?: boolean): Promise<string[]>

  // Agent (research with tools)
  agentResearch?(options: AgentResearchOptions): Promise<string>
}
