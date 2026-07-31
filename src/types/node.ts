/**
 * Node type definitions for graph-core.
 */

import type { WorkspaceId } from './workspace'

/**
 * Node type discriminator values.
 */
export type NodeType =
  | 'task'
  | 'project'
  | 'note'
  | 'person'
  | 'container'
  | 'link'
  | 'milestone'
  | 'topic'
  | 'component'
  | 'group'
  | 'event'
  | 'organization'
  | 'tag'

/**
 * Graph layout options for container nodes.
 */
export type GraphLayout = 'cose-bilkent' | 'cola' | 'dagre' | 'd3-force' | 'concentric' | 'breadthfirst' | 'grid'

/**
 * Radial layout settings for the graph physics simulation.
 * Stored as JSON in the nodes.graph_physics column.
 */
export interface RadialSettings {
  /** Attraction strength between connected nodes */
  attraction?: number
  /** Repulsion strength between all nodes */
  repulsion?: number
  /** Damping factor for simulation */
  damping?: number
  /** Gravity pulling nodes toward center */
  gravity?: number
}

/**
 * Importance level (1-5 scale).
 */
export type Importance = 1 | 2 | 3 | 4 | 5

/**
 * Core node structure representing a graph node.
 */
export interface Node {
  /** Unique node identifier */
  id: number
  /** Node title/name */
  title: string
  /** Node type discriminator */
  type: NodeType
  /** Parent node ID (null for root nodes) */
  parent_id: number | null
  /**
   * Workspace slug id this node belongs to (TEXT column, e.g. 'work').
   * Typed as WorkspaceId because legacy callers still compare/assign
   * number-typed values; at runtime this is always a string or null.
   */
  workspace_id: WorkspaceId | null
  /** Whether the node is completed (tasks/projects) */
  completed: boolean
  /** Whether the node is marked as favorite */
  favorite: boolean
  /** Rich text notes content */
  notes: string | null
  /** Whether notes are marked sensitive (hidden when hide-sensitive is on) */
  notes_sensitive: boolean
  /** Due date in ISO format (YYYY-MM-DD) */
  due_date: string | null
  /** Start date in ISO format */
  start_date: string | null
  /** End/completion date in ISO format */
  end_date: string | null
  /** Node color (hex or named color) */
  color: string | null
  /** Importance level (1-5) */
  importance: Importance | null
  /** Physical location */
  location: string | null
  /** Email address (persons) */
  email: string | null
  /** Phone number (persons) */
  phone: string | null
  /** Organization name (persons) */
  organization: string | null
  /** Role/title (persons) */
  role: string | null
  /** Website URL */
  website: string | null
  /** Tag array */
  tags: string[]
  /** Sort order within parent */
  sort_order: number
  /** Tree depth level */
  depth: number
  /** Creation timestamp */
  created_at: string
  /** Last update timestamp */
  updated_at: string
  /** Deleted timestamp (soft delete: non-null means trashed) */
  deleted_at: string | null
  /**
   * Whether the node has an attached spreadsheet table.
   * Only computed by some queries (EXISTS subquery); undefined when the
   * query did not compute it.
   */
  has_table?: boolean

  // Container-specific graph settings
  /** Show linked nodes in graph view */
  show_links: boolean
  /** Show root node in graph */
  show_root_node: boolean
  /** Show external links */
  show_external_links: boolean
  /** Graph layout algorithm */
  graph_layout: GraphLayout | null
  /** Maximum depth for graph rendering */
  graph_max_depth: number | null
  /** Visible node types in graph view (JSON array column); null = all types */
  graph_type_filter: NodeType[] | null
  /** Whether graph relaxation is locked */
  graph_relax_locked: boolean
  /** Whether graph fit is locked */
  graph_fit_locked: boolean
  /** Physics/radial layout settings (JSON column); null when unset */
  graph_physics: RadialSettings | null
  /** Whether the node's children are collapsed/hidden in graph view */
  collapsed: boolean
}

/**
 * Partial node data for creating a new node.
 */
export interface CreateNodeData {
  title: string
  type?: NodeType
  parent_id?: number | null
  workspace_id?: WorkspaceId | null
  notes?: string | null
  tags?: string[]
  due_date?: string | null
  start_date?: string | null
  importance?: Importance | null
  color?: string | null
}

/**
 * Partial node data for updating an existing node.
 * All fields from NODE_UPDATE_FIELDS are optional.
 */
export interface UpdateNodeData {
  title?: string
  type?: NodeType
  notes?: string | null
  notes_sensitive?: boolean
  completed?: boolean
  favorite?: boolean
  due_date?: string | null
  start_date?: string | null
  end_date?: string | null
  color?: string | null
  importance?: Importance | null
  location?: string | null
  email?: string | null
  phone?: string | null
  organization?: string | null
  role?: string | null
  website?: string | null
  tags?: string[]
  show_links?: boolean
  show_root_node?: boolean
  show_external_links?: boolean
  graph_layout?: GraphLayout | null
  graph_max_depth?: number | null
  graph_type_filter?: NodeType[] | null
  graph_relax_locked?: boolean
  graph_fit_locked?: boolean
  graph_physics?: RadialSettings | null
  collapsed?: boolean
}

/**
 * Node with additional computed properties for tree display.
 */
export interface TreeNode extends Node {
  /** Child nodes */
  children?: TreeNode[]
  /** Whether the node is expanded in tree view */
  expanded?: boolean
  /** Whether the node has children (may be lazy loaded) */
  hasChildren?: boolean
}

/**
 * Node link representing a non-hierarchical relationship.
 */
export interface NodeLink {
  source_id: number
  target_id: number
  created_at: string
}
