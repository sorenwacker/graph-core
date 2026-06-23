import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue'
import { SIDEBAR_WIDTH, SIDEBAR_HIDE_DELAY_MS } from '../utils/uiConstants.js'

/**
 * Options for useSidebar composable.
 */
export interface UseSidebarOptions {
  /** Ref controlling pinned state (from settings) */
  pinned?: Ref<boolean>
}

/**
 * Return type for useSidebar composable.
 */
export interface UseSidebarReturn {
  /** Whether sidebar is currently hovered */
  hovered: Ref<boolean>
  /** Set of expanded node IDs in the tree */
  expandedIds: Ref<Set<number>>
  /** Whether tree section is collapsed */
  treeCollapsed: Ref<boolean>
  /** Whether favorites section is collapsed */
  favoritesCollapsed: Ref<boolean>
  /** Whether recent section is collapsed */
  recentCollapsed: Ref<boolean>
  /** Whether tags section is collapsed */
  tagsCollapsed: Ref<boolean>
  /** Computed visibility - visible if pinned OR hovered */
  visible: ComputedRef<boolean>
  /** Handle mouse enter on sidebar */
  onEnter: () => void
  /** Handle mouse leave on sidebar */
  onLeave: (event?: MouseEvent) => void
  /** Toggle expansion of a tree node */
  toggleExpand: (nodeId: number) => void
  /** Expand all nodes in a path (for navigation) */
  expandToPath: (path: Array<{ id?: number }>) => void
  /** Toggle tree section collapse */
  toggleTreeCollapse: () => void
  /** Toggle favorites section collapse */
  toggleFavoritesCollapse: () => void
  /** Toggle recent section collapse */
  toggleRecentCollapse: () => void
  /** Toggle tags section collapse */
  toggleTagsCollapse: () => void
}

// Storage keys for collapse states
const STORAGE_KEYS = {
  TREE: 'sidebar-tree-collapsed',
  FAVORITES: 'sidebar-favorites-collapsed',
  RECENT: 'sidebar-recent-collapsed',
  TAGS: 'sidebar-tags-collapsed',
} as const

/**
 * Composable for managing sidebar UI state.
 * Handles hover visibility, section collapse states, and tree expansion.
 */
export function useSidebar(options: UseSidebarOptions = {}): UseSidebarReturn {
  const { pinned } = options

  // Hover state
  const hovered = ref(false)
  let hideTimeout: ReturnType<typeof setTimeout> | null = null
  let isUnmounted = false

  function clearHideTimeout(): void {
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
  }

  function scheduleHide(): void {
    clearHideTimeout()
    hideTimeout = setTimeout(() => {
      if (!isUnmounted) {
        hovered.value = false
      }
    }, SIDEBAR_HIDE_DELAY_MS)
  }

  /**
   * Global pointer tracking while the sidebar is open.
   *
   * Relying only on the sidebar's own `mouseleave` is unreliable: if the pointer
   * is already outside the sidebar when it opens, or leaves through a path/speed
   * that never delivers a clean `mouseleave`, the sidebar would stay open forever.
   * Watching pointer position document-wide guarantees the sidebar closes once the
   * pointer is outside the sidebar zone.
   */
  function onGlobalPointerMove(event: MouseEvent): void {
    if (pinned?.value) return
    if (event.clientX <= SIDEBAR_WIDTH) {
      clearHideTimeout()
    } else {
      scheduleHide()
    }
  }

  // Pointer left the document/window entirely - nothing is being hovered.
  function onDocumentPointerLeave(): void {
    if (pinned?.value) return
    scheduleHide()
  }

  function addGlobalListeners(): void {
    if (typeof document === 'undefined') return
    document.addEventListener('mousemove', onGlobalPointerMove)
    document.addEventListener('mouseleave', onDocumentPointerLeave)
  }

  function removeGlobalListeners(): void {
    if (typeof document === 'undefined') return
    document.removeEventListener('mousemove', onGlobalPointerMove)
    document.removeEventListener('mouseleave', onDocumentPointerLeave)
  }

  // Attach global pointer tracking only while the sidebar is open and unpinned.
  watch([hovered, () => pinned?.value], ([isHovered, isPinned]) => {
    if (isHovered && !isPinned) {
      addGlobalListeners()
    } else {
      removeGlobalListeners()
      if (!isHovered) clearHideTimeout()
    }
  })

  // Cleanup on unmount
  onUnmounted(() => {
    isUnmounted = true
    clearHideTimeout()
    removeGlobalListeners()
  })

  // Helper to get boolean from localStorage
  function getStoredBoolean(key: string, defaultValue = false): boolean {
    if (typeof localStorage === 'undefined') return defaultValue
    const stored = localStorage.getItem(key)
    if (stored === null) return defaultValue
    return stored === 'true'
  }

  // Section collapse states - persisted to localStorage
  const treeCollapsed = ref(getStoredBoolean(STORAGE_KEYS.TREE))
  const favoritesCollapsed = ref(getStoredBoolean(STORAGE_KEYS.FAVORITES))
  const recentCollapsed = ref(getStoredBoolean(STORAGE_KEYS.RECENT))
  const tagsCollapsed = ref(getStoredBoolean(STORAGE_KEYS.TAGS))

  // Persist collapse state changes
  watch(treeCollapsed, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.TREE, String(val))
    }
  })
  watch(favoritesCollapsed, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, String(val))
    }
  })
  watch(recentCollapsed, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.RECENT, String(val))
    }
  })
  watch(tagsCollapsed, val => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.TAGS, String(val))
    }
  })

  // Tree expansion state
  const expandedIds = ref<Set<number>>(new Set())

  // Computed visibility - visible if pinned OR hovered
  const visible = computed(() => pinned?.value || hovered.value)

  /**
   * Handle mouse enter on sidebar
   */
  function onEnter(): void {
    clearHideTimeout()
    hovered.value = true
  }

  /**
   * Handle mouse leave on sidebar
   */
  function onLeave(event?: MouseEvent): void {
    // Don't hide if pinned
    if (pinned?.value) return

    // Don't hide if mouse is still within sidebar bounds
    if (event && event.clientX <= SIDEBAR_WIDTH) {
      return
    }

    scheduleHide()
  }

  /**
   * Toggle expansion of a tree node
   */
  function toggleExpand(nodeId: number): void {
    if (expandedIds.value.has(nodeId)) {
      expandedIds.value.delete(nodeId)
    } else {
      expandedIds.value.add(nodeId)
    }
    // Trigger reactivity
    expandedIds.value = new Set(expandedIds.value)
  }

  /**
   * Expand all nodes in a path (for navigation)
   */
  function expandToPath(path: Array<{ id?: number }>): void {
    for (const node of path) {
      if (node?.id) {
        expandedIds.value.add(node.id)
      }
    }
    expandedIds.value = new Set(expandedIds.value)
  }

  /**
   * Toggle tree section collapse
   */
  function toggleTreeCollapse(): void {
    treeCollapsed.value = !treeCollapsed.value
  }

  /**
   * Toggle favorites section collapse
   */
  function toggleFavoritesCollapse(): void {
    favoritesCollapsed.value = !favoritesCollapsed.value
  }

  /**
   * Toggle recent section collapse
   */
  function toggleRecentCollapse(): void {
    recentCollapsed.value = !recentCollapsed.value
  }

  /**
   * Toggle tags section collapse
   */
  function toggleTagsCollapse(): void {
    tagsCollapsed.value = !tagsCollapsed.value
  }

  return {
    // State
    hovered,
    expandedIds,
    treeCollapsed,
    favoritesCollapsed,
    recentCollapsed,
    tagsCollapsed,

    // Computed
    visible,

    // Methods
    onEnter,
    onLeave,
    toggleExpand,
    expandToPath,
    toggleTreeCollapse,
    toggleFavoritesCollapse,
    toggleRecentCollapse,
    toggleTagsCollapse,
  }
}
