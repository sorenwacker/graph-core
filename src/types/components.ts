/**
 * Component prop and emit type definitions for graph-core.
 */

import type { Node, TreeNode, GraphLayout, GraphTypeFilter } from './node'
import type { Workspace } from './workspace'
import type { Position } from './events'

/**
 * Props for DetailPanel component.
 */
export interface DetailPanelProps {
  /** Node to display */
  node: Node | TreeNode | null
  /** Panel width in pixels */
  width?: number
  /** Whether panel is in fullscreen mode */
  fullscreen?: boolean
  /** Hide completed child items */
  hideCompleted?: boolean
  /** Whether panel is pinned open */
  pinned?: boolean
  /** Available workspaces */
  workspaces?: Workspace[]
  /** Current workspace identifier */
  currentWorkspace?: string
}

/**
 * Emits for DetailPanel component.
 */
export interface DetailPanelEmits {
  (e: 'update', node: Node | TreeNode): void
  (e: 'delete', nodeId: number): void
  (e: 'close'): void
  (e: 'wrap-with-parent', data: { nodeId: number; parentTitle: string }): void
  (e: 'move-to-root', nodeId: number): void
  (e: 'select-child', nodeId: number): void
  (e: 'resize-start', event: MouseEvent): void
  (e: 'resize', width: number): void
  (e: 'toggle-fullscreen'): void
  (e: 'open-link-search'): void
  (e: 'toggle-pin'): void
  (e: 'add-child', data: { parentId: number; title?: string; type?: string; prompt?: boolean }): void
  (e: 'child-updated', nodeId: number): void
  (e: 'detach', node: Node | TreeNode): void
  (
    e: 'ai-improve-notes',
    payload: { notes: string; nodeId: number; selection?: { text: string; from: number; to: number } }
  ): void
}

/**
 * Radial layout settings for physics simulation.
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
 * Props for GraphView component.
 */
export interface GraphViewProps {
  /** Nodes to display */
  nodes: (Node | TreeNode)[]
  /** Parent/container node */
  parent?: Node | TreeNode | null
  /** Selected node ID */
  selectedId?: number
  /** Multi-selected node IDs */
  selectedIds?: number[]
  /** Node count threshold for showing details */
  detailThreshold?: number
  /** Maximum depth to render */
  maxDepth?: number
  /** Hide completed nodes */
  hideCompleted?: boolean
  /** Hide sensitive content */
  hideSensitive?: boolean
  /** Current workspace identifier */
  workspace?: string
  /** Available workspaces */
  workspaces?: Workspace[]
  /** Whether detail panel is showing */
  showDetail?: boolean
  /** Whether fullscreen detail is open */
  fullscreenDetailOpen?: boolean
  /** Enable hover preview tooltips */
  hoverPreviewEnabled?: boolean
  /** Sort nodes alphabetically */
  sortAlphabetically?: boolean
  /** Maximum length for notes preview */
  notesPreviewLength?: number
  /** Inherited color from ancestors */
  ancestorColor?: string | null
  /** Whether to inherit colors from parents */
  inheritColors?: boolean
}

/**
 * Emits for GraphView component.
 */
export interface GraphViewEmits {
  (e: 'select', node: Node | TreeNode): void
  (e: 'select-multiple', params: { nodeIds: number[]; nodes?: (Node | TreeNode)[] }): void
  (e: 'enter', node: Node | TreeNode): void
  (e: 'move', nodeId: number, newParentId: number | null): void
  (e: 'move-multiple', nodeIds: number[], newParentId: number | null): void
  (e: 'add-child', params: { parentId: number; position?: Position }): void
  (e: 'insert-between', params: { sourceId: number; targetId: number; title: string }): void
  (e: 'update', node: Node | TreeNode): void
  (e: 'create', data: { title: string; type?: string; parentId?: number | null; position?: Position }): void
  (e: 'delete', nodeId: number): void
  (e: 'delete-multiple', nodeIds: number[]): void
  (e: 'wrap-with-parent', nodeId: number, parentTitle: string): void
  (e: 'open-fullscreen', nodeId: number): void
  (e: 'link', sourceId: number, targetId: number): void
  (e: 'unlink', sourceId: number, targetId: number): void
  (e: 'context-menu', params: { event: MouseEvent; node: Node | TreeNode }): void
  (e: 'toggle-complete', node: Node | TreeNode): void
  (e: 'toggle-favorite', node: Node | TreeNode): void
  (e: 'open-link-search', node: Node | TreeNode): void
  (e: 'go-parent'): void
  (e: 'go-first-child'): void
  (e: 'go-prev-sibling'): void
  (e: 'go-next-sibling'): void
  (e: 'update:root-max-depth', depth: number): void
}

/**
 * Props for GraphControls component.
 */
export interface GraphControlsProps {
  /** Current layout mode */
  layoutMode: GraphLayout
  /** Whether relax is continuously running */
  relaxLocked: boolean
  /** Whether fit is continuously running */
  fitLocked: boolean
  /** Show external link edges */
  showExternalLinks: boolean
  /** Show root node in graph */
  showRootNode: boolean
  /** Maximum depth to render */
  maxDepth: number
  /** Visible node types */
  visibleTypes: string[]
  /** Radial/physics settings */
  radialSettings: RadialSettings
  /** Whether a parent container is set */
  hasParent: boolean
}

/**
 * Emits for GraphControls component.
 */
export interface GraphControlsEmits {
  (e: 'set-layout', layout: GraphLayout): void
  (e: 'relax-click'): void
  (e: 'fit-click'): void
  (e: 'reset-layout'): void
  (e: 'update:show-external-links', value: boolean): void
  (e: 'update:show-root-node', value: boolean): void
  (e: 'update:max-depth', value: number): void
  (e: 'toggle-type', type: string): void
  (e: 'select-all-types'): void
  (e: 'select-no-types'): void
  (e: 'apply-radial-settings'): void
  (e: 'update:radial-settings', settings: RadialSettings): void
  (e: 'show-hotkey-help'): void
}

/**
 * Props for CardsView component.
 */
export interface CardsViewProps {
  /** Nodes to display */
  nodes: (Node | TreeNode)[]
  /** Selected node ID */
  selectedId?: number
  /** Multi-selected node IDs */
  selectedIds?: number[]
  /** Hide completed nodes */
  hideCompleted?: boolean
  /** Current workspace identifier */
  workspace?: string
}

/**
 * Props for TableView component.
 */
export interface TableViewProps {
  /** Nodes to display */
  nodes: (Node | TreeNode)[]
  /** Selected node ID */
  selectedId?: number
  /** Hide completed nodes */
  hideCompleted?: boolean
  /** Current workspace identifier */
  workspace?: string
  /** Visible columns */
  columns?: string[]
}

/**
 * Props for TimelineView component.
 */
export interface TimelineViewProps {
  /** Nodes to display */
  nodes: (Node | TreeNode)[]
  /** Selected node ID */
  selectedId?: number
  /** Hide completed nodes */
  hideCompleted?: boolean
  /** Current workspace identifier */
  workspace?: string
  /** Timeline date range */
  dateRange?: {
    start: string
    end: string
  }
}

/**
 * Props for TreeView/SidebarTreeItem component.
 */
export interface TreeItemProps {
  /** Node to display */
  node: TreeNode
  /** Current depth level */
  depth?: number
  /** Selected node ID */
  selectedId?: number
  /** Expanded node IDs */
  expandedIds?: Set<number>
  /** Hide completed nodes */
  hideCompleted?: boolean
}

/**
 * Props for Breadcrumbs component.
 */
export interface BreadcrumbsProps {
  /** Ancestor path */
  path: Node[]
  /** Current node */
  currentNode?: Node | null
  /** Maximum items to show */
  maxItems?: number
}

/**
 * Props for ViewSwitcher component.
 */
export interface ViewSwitcherProps {
  /** Current view mode */
  modelValue: string
  /** Available view options */
  options?: string[]
}

/**
 * Props for WorkspaceSelector component.
 */
export interface WorkspaceSelectorProps {
  /** Current workspace ID or slug */
  modelValue: string | number
  /** Available workspaces */
  workspaces: Workspace[]
  /** Compact mode */
  compact?: boolean
}

/**
 * Props for NodeContextMenu component.
 */
export interface NodeContextMenuProps {
  /** Whether menu is visible */
  visible: boolean
  /** Menu X position */
  x: number
  /** Menu Y position */
  y: number
  /** Node for context */
  node: Node | TreeNode | null
  /** Linked nodes for submenu */
  linkedNodes?: Node[]
  /** Available workspaces */
  workspaces?: Workspace[]
}

/**
 * Props for SpotlightSearch component.
 */
export interface SpotlightSearchProps {
  /** Whether search is visible */
  visible: boolean
  /** Initial search query */
  initialQuery?: string
  /** Search mode */
  mode?: 'search' | 'link' | 'move'
  /** Filter by node type */
  filterType?: string
  /** Current workspace ID */
  workspaceId?: number | null
}

/**
 * Props for TagInput component.
 */
export interface TagInputProps {
  /** Current tags */
  modelValue: string[]
  /** Placeholder text */
  placeholder?: string
  /** Available tags for autocomplete */
  suggestions?: string[]
  /** Maximum tags allowed */
  maxTags?: number
}

/**
 * Props for NotesEditor component.
 */
export interface NotesEditorProps {
  /** Editor content */
  modelValue: string
  /** Placeholder text */
  placeholder?: string
  /** Read-only mode */
  readonly?: boolean
  /** Editor height */
  height?: string | number
}

/**
 * Props for AddNodeModal component.
 */
export interface AddNodeModalProps {
  /** Whether modal is visible */
  visible: boolean
  /** Modal title */
  title?: string
  /** Parent node ID */
  parentId?: number | null
  /** Position for new node */
  position?: Position
  /** Insert between existing nodes */
  insertBetween?: boolean
}

/**
 * Props for SettingsPanel component.
 */
export interface SettingsPanelProps {
  /** Whether panel is visible */
  visible: boolean
  /** Active settings tab */
  activeTab?: string
}

/**
 * Common emits for node list components (CardsView, TableView, etc.).
 */
export interface NodeListEmits {
  (e: 'select', node: Node | TreeNode): void
  (e: 'select-multiple', params: { nodeIds: number[]; nodes?: (Node | TreeNode)[] }): void
  (e: 'enter', node: Node | TreeNode): void
  (e: 'update', node: Node | TreeNode): void
  (e: 'delete', nodeId: number): void
  (e: 'context-menu', params: { event: MouseEvent; node: Node | TreeNode }): void
  (e: 'toggle-complete', node: Node | TreeNode): void
  (e: 'toggle-favorite', node: Node | TreeNode): void
  (e: 'reorder', params: { draggedId: number; targetId: number; position: 'before' | 'after' }): void
}

/**
 * Common emits for modal components.
 */
export interface ModalEmits {
  (e: 'close'): void
  (e: 'update:visible', visible: boolean): void
}

/**
 * Exposed methods from GraphView component.
 */
export interface GraphViewExposed {
  /** Relax the layout */
  relaxLayout: () => void
  /** Local relax around a specific node */
  localRelax: (nodeId: number) => void
  /** Fit view to content */
  fitView: () => void
  /** Save current node positions */
  saveNodePositions: () => void
  /** Update graph with current data */
  updateGraph: () => Promise<void>
  /** Check if a node is visible */
  isNodeVisible: (nodeId: number) => boolean
  /** Current max depth setting */
  maxDepth: { value: number }
  /** Current visible types */
  visibleTypes: { value: string[] }
}

/**
 * Exposed methods from DetailPanel component.
 */
export interface DetailPanelExposed {
  /** Reload children nodes */
  loadChildren: () => Promise<void>
  /** Reload linked nodes */
  loadLinkedNodes: () => Promise<void>
  /** Reload linked organizations (for person nodes) */
  loadLinkedOrganizations?: () => Promise<void>
  /** Reload linked members (for organization nodes) */
  loadLinkedMembers?: () => Promise<void>
  /** Save pending changes */
  saveChanges: () => void
  /** Get current notes selection */
  getNotesSelection: () => { text: string; from: number; to: number }
}
