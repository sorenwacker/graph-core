/**
 * Workspace type definitions for graph-core.
 */

/**
 * Workspace represents a logical grouping of nodes.
 */
export interface Workspace {
  /** Unique workspace identifier */
  id: number
  /** Workspace name */
  name: string
  /** Workspace description */
  description: string | null
  /** Display color */
  color: string | null
  /** Icon identifier */
  icon: string | null
  /** Sort order for workspace list */
  sort_order: number
  /** Creation timestamp */
  created_at: string
  /** Last update timestamp */
  updated_at: string
}

/**
 * Data for creating a new workspace.
 */
export interface CreateWorkspaceData {
  name: string
  description?: string | null
  color?: string | null
  icon?: string | null
}

/**
 * Data for updating an existing workspace.
 */
export interface UpdateWorkspaceData {
  name?: string
  description?: string | null
  color?: string | null
  icon?: string | null
  sort_order?: number
}
