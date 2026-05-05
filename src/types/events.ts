/**
 * Event payload type definitions for graph-core.
 */

import type { Node, TreeNode } from './node'

/**
 * Position coordinates.
 */
export interface Position {
  x: number
  y: number
}

/**
 * Payload for node-related events (click, select, etc.).
 */
export interface NodeEventPayload {
  /** The node being acted upon */
  node: Node | TreeNode
  /** Original DOM event, if applicable */
  event?: MouseEvent | KeyboardEvent
  /** Position where the event occurred */
  position?: Position
}

/**
 * Payload for single node selection events.
 */
export interface SelectionEventPayload {
  /** Selected node, or null for deselection */
  node: Node | TreeNode | null
  /** Previous selection, if any */
  previousNode?: Node | TreeNode | null
  /** Whether selection was made via keyboard */
  keyboard?: boolean
  /** Whether to open in fullscreen */
  fullscreen?: boolean
  /** Whether to open detail immediately */
  immediate?: boolean
}

/**
 * Payload for multi-selection events.
 */
export interface MultiSelectionEventPayload {
  /** Selected node IDs */
  nodeIds: number[]
  /** Selected nodes array */
  nodes?: (Node | TreeNode)[]
  /** The anchor node for range selection */
  anchorNode?: Node | TreeNode | null
  /** Selection mode that was used */
  mode: 'add' | 'range' | 'box' | 'replace'
}

/**
 * Payload for drag start events.
 */
export interface DragStartEventPayload {
  /** Node being dragged */
  node: Node | TreeNode
  /** Starting position */
  startPosition: Position
  /** Original drag event */
  event: DragEvent | MouseEvent
}

/**
 * Payload for drag move events.
 */
export interface DragMoveEventPayload {
  /** Node being dragged */
  node: Node | TreeNode
  /** Current position */
  currentPosition: Position
  /** Starting position */
  startPosition: Position
  /** Potential drop target node */
  dropTarget?: Node | TreeNode | null
  /** Drop position relative to target */
  dropPosition?: 'before' | 'after' | 'inside'
}

/**
 * Payload for drag end events.
 */
export interface DragEndEventPayload {
  /** Node being dragged */
  node: Node | TreeNode
  /** Final position */
  endPosition: Position
  /** Drop target node, if any */
  dropTarget?: Node | TreeNode | null
  /** Drop position relative to target */
  dropPosition?: 'before' | 'after' | 'inside'
  /** Whether drop was successful */
  success: boolean
}

/**
 * Combined drag event payload type.
 */
export type DragEventPayload = DragStartEventPayload | DragMoveEventPayload | DragEndEventPayload

/**
 * Payload for context menu events.
 */
export interface ContextMenuEventPayload {
  /** Node for which context menu is shown */
  node: Node | TreeNode
  /** Mouse event that triggered the menu */
  event: MouseEvent
  /** Menu position */
  position: Position
  /** Linked nodes for the context node */
  linkedNodes?: Node[]
}

/**
 * Payload for node update events.
 */
export interface NodeUpdateEventPayload {
  /** Node ID being updated */
  nodeId: number
  /** Updated fields */
  updates: Partial<Node>
  /** Previous node state */
  previousState?: Node
}

/**
 * Payload for node creation events.
 */
export interface NodeCreateEventPayload {
  /** Parent node ID, or null for root */
  parentId: number | null
  /** Node type to create */
  type?: string
  /** Initial title */
  title?: string
  /** Creation position in graph */
  position?: Position
  /** Whether to insert between existing nodes */
  insertBetween?: boolean
  /** Source node for insert between */
  sourceId?: number
  /** Target node for insert between */
  targetId?: number
}

/**
 * Payload for node deletion events.
 */
export interface NodeDeleteEventPayload {
  /** Node ID being deleted */
  nodeId: number
  /** Whether to perform hard delete */
  hard?: boolean
}

/**
 * Payload for multi-node deletion events.
 */
export interface MultiDeleteEventPayload {
  /** Node IDs being deleted */
  nodeIds: number[]
  /** Whether to perform hard delete */
  hard?: boolean
}

/**
 * Payload for node move events.
 */
export interface NodeMoveEventPayload {
  /** Node ID being moved */
  nodeId: number
  /** New parent ID, or null for root */
  newParentId: number | null
  /** Previous parent ID */
  previousParentId?: number | null
}

/**
 * Payload for node reorder events.
 */
export interface NodeReorderEventPayload {
  /** Node ID being reordered */
  nodeId: number
  /** Target node to position relative to */
  targetId: number
  /** Position relative to target */
  position: 'before' | 'after' | 'inside'
}

/**
 * Payload for link events.
 */
export interface LinkEventPayload {
  /** Source node ID */
  sourceId: number
  /** Target node ID */
  targetId: number
}

/**
 * Payload for toggle events (complete, favorite, etc.).
 */
export interface ToggleEventPayload {
  /** Node being toggled */
  node: Node | TreeNode
  /** Field being toggled */
  field: 'completed' | 'favorite'
  /** New value */
  value: boolean
}

/**
 * Payload for graph view events.
 */
export interface GraphViewEventPayload {
  /** Event type */
  type: 'zoom' | 'pan' | 'fit' | 'center'
  /** Zoom level, if applicable */
  zoom?: number
  /** Pan position, if applicable */
  pan?: Position
  /** Node to center on, if applicable */
  nodeId?: number
}

/**
 * Payload for resize events.
 */
export interface ResizeEventPayload {
  /** Current width */
  width: number
  /** Current height */
  height: number
  /** Previous width */
  previousWidth?: number
  /** Previous height */
  previousHeight?: number
}

/**
 * Payload for panel resize events.
 */
export interface PanelResizeEventPayload {
  /** Panel identifier */
  panel: 'detail' | 'sidebar'
  /** New width */
  width: number
  /** Mouse event that triggered resize */
  event?: MouseEvent
}

/**
 * Payload for keyboard shortcut events.
 */
export interface KeyboardEventPayload {
  /** Key that was pressed */
  key: string
  /** Modifier keys */
  modifiers: {
    ctrl: boolean
    alt: boolean
    shift: boolean
    meta: boolean
  }
  /** Original keyboard event */
  event: KeyboardEvent
  /** Action that was triggered */
  action?: string
}

/**
 * Payload for navigation events.
 */
export interface NavigationEventPayload {
  /** Navigation direction */
  direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  /** Current node */
  fromNode?: Node | TreeNode | null
  /** Target node */
  toNode?: Node | TreeNode | null
}

/**
 * Payload for search events.
 */
export interface SearchEventPayload {
  /** Search query */
  query: string
  /** Search results */
  results?: Node[]
  /** Total result count */
  totalCount?: number
  /** Selected result index */
  selectedIndex?: number
}

/**
 * Payload for modal events.
 */
export interface ModalEventPayload {
  /** Modal identifier */
  modal: string
  /** Whether modal is visible */
  visible: boolean
  /** Modal data */
  data?: Record<string, unknown>
}

/**
 * Payload for toast/notification events.
 */
export interface ToastEventPayload {
  /** Toast message */
  message: string
  /** Toast type */
  type: 'info' | 'success' | 'warning' | 'error'
  /** Duration in milliseconds */
  duration?: number
  /** Toast ID for programmatic dismissal */
  id?: string
}

/**
 * Payload for AI-related events.
 */
export interface AIEventPayload {
  /** AI action type */
  action: 'improve' | 'generate' | 'summarize'
  /** Node being processed */
  nodeId: number
  /** Input content */
  content?: string
  /** Selected text range */
  selection?: {
    text: string
    from: number
    to: number
  }
  /** AI result */
  result?: string
  /** Error if any */
  error?: Error
}
