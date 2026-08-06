/**
 * Workspace type definitions for graph-core.
 */

/**
 * Workspace identifier.
 *
 * In the database, workspace ids are TEXT slug primary keys (e.g. 'work',
 * 'private') generated from the workspace name.
 */
export type WorkspaceId = string

/**
 * Workspace represents a logical grouping of nodes.
 * Mirrors the `workspaces` table (electron/database/schema.js).
 */
export interface Workspace {
  /** Workspace slug id (TEXT primary key, e.g. 'work') */
  id: string
  /** Workspace name */
  name: string
  /** Display color */
  color: string | null
  /** Icon identifier */
  icon: string | null
  /** Sort order for workspace list */
  sort_order: number
  /** Whether this is the default workspace (SQLite 0/1 flag) */
  is_default: number
  /** Creation timestamp */
  created_at: string
}

/**
 * Data for creating a new workspace.
 */
export interface CreateWorkspaceData {
  /** Optional explicit slug id; derived from name when omitted */
  id?: string
  name: string
  color?: string | null
  icon?: string | null
  sort_order?: number
}

/**
 * Data for updating an existing workspace.
 */
export interface UpdateWorkspaceData {
  name?: string
  color?: string | null
  icon?: string | null
  sort_order?: number
  /** Whether this is the default workspace (SQLite 0/1 flag) */
  is_default?: number
}
