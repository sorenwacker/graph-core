import { ref, watch, computed } from 'vue'

/**
 * Controller composable for view and navigation state.
 * Manages view mode, sorting, and navigation-related state.
 *
 * @param {Object} options
 * @param {Ref<string>} options.viewMode - View mode ref from settings (or creates internal)
 * @param {Object} options.navigation - Navigation composable instance
 * @param {Function} options.loadTrashedItems - Function to load trashed items
 * @returns {Object} View state and handlers
 */
export function useViewStateController(options = {}) {
  const { navigation, loadTrashedItems } = options

  // View mode (persisted via settings, but can be overridden)
  const viewMode = options.viewMode || ref('graph')

  // Sorting preference
  const sortAlphabetically = ref(false)

  // Transition state
  const transitioning = ref(false)
  const transitionDirection = ref('forward')

  // Navigation state refs (synced from navigation composable)
  const currentContainerId = ref(null)
  const currentContainer = ref(null)
  const breadcrumbs = ref([])
  const children = ref([])

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
   * @param {string} mode - The view mode to set
   */
  function setViewMode(mode) {
    viewMode.value = mode
  }

  /**
   * Toggle alphabetical sorting.
   */
  function toggleSortAlphabetically() {
    sortAlphabetically.value = !sortAlphabetically.value
  }

  /**
   * Start a navigation transition.
   * @param {string} direction - 'forward' or 'back'
   */
  function startTransition(direction) {
    transitionDirection.value = direction
    transitioning.value = true
  }

  /**
   * End the current navigation transition.
   */
  function endTransition() {
    transitioning.value = false
  }

  /**
   * Reset navigation state (e.g., when workspace changes).
   */
  function resetNavigationState() {
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
