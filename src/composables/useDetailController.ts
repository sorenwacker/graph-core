import { ref, type Ref, type ComponentPublicInstance } from 'vue'
import { useDetailResize } from './useDetailResize.js'

/**
 * Detail panel component ref interface.
 */
export interface DetailPanelRef {
  /** Load linked nodes for display */
  loadLinkedNodes?: () => void | Promise<void>
  /** Load children nodes for display */
  loadChildren?: () => void | Promise<void>
}

/**
 * Options for useDetailController composable.
 */
export interface UseDetailControllerOptions {
  /** External pinned state (optional, creates internal if not provided) */
  detailPinned?: Ref<boolean>
}

/**
 * Options for opening the detail panel.
 */
export interface OpenDetailOptions {
  /** Open in fullscreen mode */
  fullscreen?: boolean
}

/**
 * Return type for useDetailController composable.
 */
export interface UseDetailControllerReturn {
  /** Whether the detail panel is visible */
  showDetail: Ref<boolean>
  /** Whether the detail panel is in fullscreen mode */
  fullscreenDetail: Ref<boolean>
  /** Whether the detail panel is pinned */
  detailPinned: Ref<boolean>
  /** Width of the detail panel in pixels */
  detailWidth: Ref<number>
  /** Whether the panel is being resized */
  isResizingDetail: Ref<boolean>
  /** Reference to the detail panel component */
  detailPanelRef: Ref<DetailPanelRef | null>
  /** Close the detail panel */
  closeDetail: () => void
  /** Open the detail panel */
  openDetail: (options?: OpenDetailOptions) => void
  /** Toggle fullscreen mode */
  toggleFullscreen: () => void
  /** Toggle pinned state */
  togglePin: () => void
  /** Start resize drag operation */
  onDetailResizeStart: (e: MouseEvent) => void
  /** Load linked nodes (delegates to panel ref) */
  loadLinkedNodes: () => void
  /** Load children (delegates to panel ref) */
  loadChildren: () => void
}

/**
 * Controller composable for detail panel management.
 * Centralizes detail panel state and operations.
 *
 * @param options - Configuration options
 * @returns Detail panel state and handlers
 */
export function useDetailController(options: UseDetailControllerOptions = {}): UseDetailControllerReturn {
  // Panel visibility state
  const showDetail = ref(false)
  const fullscreenDetail = ref(false)
  const detailPinned = options.detailPinned || ref(false)

  // Component ref for detail panel
  const detailPanelRef = ref<DetailPanelRef | null>(null)

  // Detail panel resize functionality
  const { detailWidth, isResizing: isResizingDetail, onResizeStart: onDetailResizeStart } = useDetailResize()

  /**
   * Close the detail panel and reset all states.
   */
  function closeDetail(): void {
    showDetail.value = false
    fullscreenDetail.value = false
    detailPinned.value = false
  }

  /**
   * Open the detail panel.
   */
  function openDetail({ fullscreen = false }: OpenDetailOptions = {}): void {
    showDetail.value = true
    if (fullscreen) {
      fullscreenDetail.value = true
    }
  }

  /**
   * Toggle fullscreen mode.
   */
  function toggleFullscreen(): void {
    fullscreenDetail.value = !fullscreenDetail.value
  }

  /**
   * Toggle pinned state.
   */
  function togglePin(): void {
    detailPinned.value = !detailPinned.value
  }

  /**
   * Load linked nodes in the detail panel.
   * Delegates to the detail panel component ref.
   */
  function loadLinkedNodes(): void {
    detailPanelRef.value?.loadLinkedNodes?.()
  }

  /**
   * Load children in the detail panel.
   * Delegates to the detail panel component ref.
   */
  function loadChildren(): void {
    detailPanelRef.value?.loadChildren?.()
  }

  return {
    // State
    showDetail,
    fullscreenDetail,
    detailPinned,
    detailWidth,
    isResizingDetail,

    // Refs
    detailPanelRef,

    // Handlers
    closeDetail,
    openDetail,
    toggleFullscreen,
    togglePin,
    onDetailResizeStart,

    // Delegation methods
    loadLinkedNodes,
    loadChildren,
  }
}
