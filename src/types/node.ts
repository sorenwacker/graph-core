/**
 * Node type definitions for graph-core.
 */

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

/**
 * Graph layout options for container nodes.
 */
export type GraphLayout = 'cose-bilkent' | 'cola' | 'dagre' | 'd3-force' | 'concentric' | 'breadthfirst' | 'grid'

/**
 * Graph type filter options.
 */
export type GraphTypeFilter = 'all' | 'tasks' | 'notes' | 'persons'

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
  /** Workspace ID this node belongs to */
  workspace_id: number | null
  /** Whether the node is completed (tasks/projects) */
  completed: boolean
  /** Whether the node is marked as favorite */
  favorite: boolean
  /** Rich text notes content */
  notes: string | null
  /** Sensitive notes (encrypted storage) */
  notes_sensitive: string | null
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
  /** Soft delete flag */
  deleted: boolean
  /** Deleted timestamp */
  deleted_at: string | null

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
  /** Type filter for graph nodes */
  graph_type_filter: GraphTypeFilter | null
  /** Whether graph relaxation is locked */
  graph_relax_locked: boolean
  /** Whether graph fit is locked */
  graph_fit_locked: boolean
  /** Whether physics simulation is enabled */
  graph_physics: boolean
}

/**
 * Partial node data for creating a new node.
 */
export interface CreateNodeData {
  title: string
  type?: NodeType
  parent_id?: number | null
  workspace_id?: number | null
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
  notes_sensitive?: string | null
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
  graph_type_filter?: GraphTypeFilter | null
  graph_relax_locked?: boolean
  graph_fit_locked?: boolean
  graph_physics?: boolean
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
