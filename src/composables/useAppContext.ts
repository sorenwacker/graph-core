import { provide, inject, type InjectionKey, type Ref } from 'vue'
import type { Api, Node, Command } from '../types'

/**
 * Application context interface.
 * Contains shared state and functions used across the application.
 */
export interface AppContext {
  /** API service for backend calls */
  api: Api
  /** Node operations composable (from useNodeOperations) */
  nodeOps: NodeOperations
  /** Push undo/redo command (from useUndoRedo) */
  pushCommand: (command: Command) => void
  /** Get workspace ID for node type */
  getWorkspaceIdForNode: (type: string) => number | null | undefined
  /** Current workspace ID */
  currentWorkspace: Ref<number | null>
  /** Current container ID */
  currentContainerId: Ref<number | null>
  /** Currently selected node */
  selectedNode: Ref<Node | null>
  /** Set of selected node IDs */
  selectedIds: Ref<Set<number>>
  /** Whether detail panel is open */
  showDetail: Ref<boolean>
  /** Set of expanded node IDs */
  expandedIds: Ref<Set<number>>
  /** Current breadcrumb path */
  breadcrumbs: Ref<Node[]>
  /** Current children nodes */
  children: Ref<Node[]>
  /** Flattened children nodes */
  flatChildren: Ref<Node[]>
  /** Reference to ViewRenderer component */
  viewRendererRef: Ref<ViewRendererRef | null>
  /** Reference to DetailPanel component */
  detailPanelRef: Ref<DetailPanelRef | null>
  /** Current error message */
  error: Ref<string | null>
  /** Navigate into a container */
  enterContainer: (nodeId: number) => void | Promise<void>
  /** Navigate back */
  navigateBack: () => void | Promise<void>
  /** Refresh after data change */
  refreshAfterChange: (node?: Node) => void | Promise<void>
  /** Refresh after delete operation */
  refreshAfterDelete: (nodeId: number, descendants?: Node[]) => void | Promise<void>
  /** Refresh graph view */
  refreshGraphAfterStructureChange: () => void | Promise<void>
  /** Refresh detail panel links */
  refreshDetailPanelLinks: () => void | Promise<void>
  /** Load sidebar tree */
  loadSidebarTree: () => void | Promise<void>
  /** Load favorite items */
  loadFavorites: () => void | Promise<void>
  /** Load children nodes */
  loadChildren: () => void | Promise<void>
  /** Invalidate sidebar cache */
  invalidateSidebarCache: () => void
  /** Load recent items */
  loadRecentItems: () => void | Promise<void>
  /** Load tags */
  loadTags: () => void | Promise<void>
}

/**
 * Node operations interface (subset exposed via context).
 */
export interface NodeOperations {
  isProcessing: Ref<boolean>
  createNode: (data: CreateNodeParams) => Promise<Node | null>
  updateNode: (node: Partial<Node> & { id: number }, options?: UpdateNodeOptions) => Promise<boolean>
  deleteNode: (nodeId: number) => Promise<DeleteResult>
  deleteMultipleNodes: (nodeIds: number[]) => Promise<DeleteMultipleResult>
  moveNode: (params: MoveNodeParams) => Promise<boolean>
  moveMultipleNodes: (params: MoveMultipleParams) => Promise<boolean>
  moveNodeToRoot: (nodeId: number) => Promise<boolean>
  toggleComplete: (node: Node) => Promise<boolean>
  toggleFavorite: (node: Node) => Promise<boolean>
  linkNodes: (sourceId: number, targetId: number) => Promise<boolean>
  unlinkNodes: (sourceId: number, targetId: number) => Promise<boolean>
}

/**
 * Parameters for creating a node.
 */
export interface CreateNodeParams {
  title: string
  type?: string
  parentId?: number | null
  x?: number
  y?: number
}

/**
 * Options for updating a node.
 */
export interface UpdateNodeOptions {
  trackUndo?: boolean
}

/**
 * Result of a delete operation.
 */
export interface DeleteResult {
  success: boolean
  node?: Node
  descendants?: Node[]
}

/**
 * Result of a delete multiple operation.
 */
export interface DeleteMultipleResult {
  success: boolean
  nodes?: Node[]
}

/**
 * Parameters for moving a node.
 */
export interface MoveNodeParams {
  nodeId: number
  oldParentId?: number | null
  newParentId: number | null
}

/**
 * Parameters for moving multiple nodes.
 */
export interface MoveMultipleParams {
  nodeIds: number[]
  newParentId: number | null
}

/**
 * ViewRenderer component ref interface.
 */
export interface ViewRendererRef {
  refresh?: () => void | Promise<void>
  [key: string]: unknown
}

/**
 * DetailPanel component ref interface.
 */
export interface DetailPanelRef {
  refreshLinks?: () => void | Promise<void>
  [key: string]: unknown
}

/**
 * Symbol key for the application context.
 * Uses Symbol to ensure uniqueness and prevent accidental collisions.
 */
export const APP_CONTEXT_KEY: InjectionKey<AppContext> = Symbol('AppContext')

/**
 * Module-level context storage for same-component access.
 * This allows composables called in the same setup function to access the context.
 */
let currentContext: AppContext | null = null

/**
 * Provide the application context for child components and same-component composables.
 * Should be called once in App.vue during setup.
 *
 * @param context - The context object to provide
 */
export function provideAppContext(context: AppContext): void {
  // Store in module-level variable for same-component access
  currentContext = context
  // Also provide via Vue's provide/inject for child components
  provide(APP_CONTEXT_KEY, context)
}

/**
 * Get the application context.
 * Works both within the same component (via module storage) and in child components (via inject).
 *
 * @returns The application context
 * @throws Error if called before provideAppContext
 */
export function useAppContext(): AppContext {
  // First try module-level storage (for same-component access)
  if (currentContext) {
    return currentContext
  }
  // Fall back to inject (for child components)
  const context = inject(APP_CONTEXT_KEY)
  if (!context) {
    throw new Error('useAppContext must be used after provideAppContext is called')
  }
  return context
}
