import { ref, watch, type Ref } from 'vue'
import type { Node } from '../types'

/**
 * View mode type.
 */
export type ViewMode = 'graph' | 'list' | 'cards' | 'trash' | 'timeline' | 'tasks'

/**
 * Transition direction type.
 */
export type TransitionDirection = 'forward' | 'back'

/**
 * Navigation composable interface (subset needed for syncing).
 */
export interface NavigationComposable {
  /** Current children nodes */
  children: Ref<Node[]>
  /** Current breadcrumb path */
  breadcrumbs: Ref<Node[]>
  /** Current container node */
  currentContainer: Ref<Node | null>
  /** Current container ID */
  currentContainerId: Ref<number | null>
}

/**
 * Options for useViewStateController composable.
 */
export interface UseViewStateControllerOptions {
  /** View mode ref from settings (or creates internal) */
  viewMode?: Ref<ViewMode | string>
  /** Navigation composable instance for syncing state */
  navigation?: NavigationComposable
  /** Function to load trashed items */
  loadTrashedItems?: () => void | Promise<void>
}

/**
 * Return type for useViewStateController composable.
 */
export interface UseViewStateControllerReturn {
  /** Current view mode */
  viewMode: Ref<ViewMode | string>
  /** Set the view mode */
  setViewMode: (mode: ViewMode | string) => void
  /** Whether to sort alphabetically */
  sortAlphabetically: Ref<boolean>
  /** Toggle alphabetical sorting */
  toggleSortAlphabetically: () => void
  /** Whether a navigation transition is in progress */
  transitioning: Ref<boolean>
  /** Direction of the current transition */
  transitionDirection: Ref<TransitionDirection>
  /** Start a navigation transition */
  startTransition: (direction: TransitionDirection) => void
  /** End the current navigation transition */
  endTransition: () => void
  /** Current container ID */
  currentContainerId: Ref<number | null>
  /** Current container node */
  currentContainer: Ref<Node | null>
  /** Current breadcrumb path */
  breadcrumbs: Ref<Node[]>
  /** Current children nodes */
  children: Ref<Node[]>
  /** Reset all navigation state */
  resetNavigationState: () => void
}

/**
 * Controller composable for view and navigation state.
 * Manages view mode, sorting, and navigation-related state.
 *
 * @param options - Configuration options
 * @returns View state and handlers
 */
export function useViewStateController(options: UseViewStateControllerOptions = {}): UseViewStateControllerReturn {
  const { navigation, loadTrashedItems } = options

  // View mode (persisted via settings, but can be overridden)
  const viewMode = options.viewMode || ref<ViewMode | string>('graph')

  // Sorting preference
  const sortAlphabetically = ref(false)

  // Transition state
  const transitioning = ref(false)
  const transitionDirection = ref<TransitionDirection>('forward')

  // Navigation state refs (synced from navigation composable)
  const currentContainerId = ref<number | null>(null)
  const currentContainer = ref<Node | null>(null)
  const breadcrumbs = ref<Node[]>([])
  const children = ref<Node[]>([])

  // Sync navigation state if navigation composable is provided
  if (navigation) {
    watch(
      [navigation.children, navigation.breadcrumbs, navigation.currentContainer, navigation.currentContainerId],
      ([c, b, cont, id]) => {
        children.value = c
        breadcrumbs.value = b
        currentContainer.value = cont
        currentContainerId.value = id
      },
      { immediate: true, deep: true }
    )
  }

  // Load trash items when switching to trash view
  if (loadTrashedItems) {
    watch(viewMode, mode => {
      if (mode === 'trash') {
        loadTrashedItems()
      }
    })
  }

  /**
   * Set the view mode.
   */
  function setViewMode(mode: ViewMode | string): void {
    viewMode.value = mode
  }

  /**
   * Toggle alphabetical sorting.
   */
  function toggleSortAlphabetically(): void {
    sortAlphabetically.value = !sortAlphabetically.value
  }

  /**
   * Start a navigation transition.
   */
  function startTransition(direction: TransitionDirection): void {
    transitionDirection.value = direction
    transitioning.value = true
  }

  /**
   * End the current navigation transition.
   */
  function endTransition(): void {
    transitioning.value = false
  }

  /**
   * Reset navigation state (e.g., when workspace changes).
   */
  function resetNavigationState(): void {
    currentContainerId.value = null
    currentContainer.value = null
    breadcrumbs.value = []
    children.value = []
  }

  return {
    // View mode
    viewMode,
    setViewMode,

    // Sorting
    sortAlphabetically,
    toggleSortAlphabetically,

    // Transition state
    transitioning,
    transitionDirection,
    startTransition,
    endTransition,

    // Navigation state
    currentContainerId,
    currentContainer,
    breadcrumbs,
    children,
    resetNavigationState,
  }
}
