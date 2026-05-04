import { provide, inject } from 'vue'

/**
 * Symbol key for the application context.
 * Uses Symbol to ensure uniqueness and prevent accidental collisions.
 */
export const APP_CONTEXT_KEY = Symbol('AppContext')

/**
 * Provide the application context for child components.
 * Should be called once in App.vue during setup.
 *
 * @param {Object} context - The context object to provide
 * @param {Object} context.api - API service for backend calls
 * @param {Object} context.nodeOps - Node operations composable (from useNodeOperations)
 * @param {Function} context.pushCommand - Push undo/redo command (from useUndoRedo)
 * @param {Function} context.getWorkspaceIdForNode - Get workspace ID for node type
 * @param {Ref<number|null>} context.currentWorkspace - Current workspace ID
 * @param {Ref<number|null>} context.currentContainerId - Current container ID
 * @param {Ref<Object|null>} context.selectedNode - Currently selected node
 * @param {Ref<Set>} context.selectedIds - Set of selected node IDs
 * @param {Ref<boolean>} context.showDetail - Whether detail panel is open
 * @param {Ref<Set>} context.expandedIds - Set of expanded node IDs
 * @param {Ref<Array>} context.breadcrumbs - Current breadcrumb path
 * @param {Ref<Array>} context.children - Current children nodes
 * @param {Ref<Array>} context.flatChildren - Flattened children nodes
 * @param {Ref<Object>} context.viewRendererRef - Reference to ViewRenderer component
 * @param {Ref<Object>} context.detailPanelRef - Reference to DetailPanel component
 * @param {Ref<string|null>} context.error - Current error message
 * @param {Function} context.enterContainer - Navigate into a container
 * @param {Function} context.navigateBack - Navigate back
 * @param {Function} context.refreshAfterChange - Refresh after data change
 * @param {Function} context.refreshAfterDelete - Refresh after delete operation
 * @param {Function} context.refreshGraphAfterStructureChange - Refresh graph view
 * @param {Function} context.refreshDetailPanelLinks - Refresh detail panel links
 * @param {Function} context.loadSidebarTree - Load sidebar tree
 * @param {Function} context.loadFavorites - Load favorite items
 * @param {Function} context.loadChildren - Load children nodes
 * @param {Function} context.invalidateSidebarCache - Invalidate sidebar cache
 * @param {Function} context.loadRecentItems - Load recent items
 * @param {Function} context.loadTags - Load tags
 */
export function provideAppContext(context) {
  provide(APP_CONTEXT_KEY, context)
}

/**
 * Inject the application context.
 * Should be called in composables or components that need shared state.
 *
 * @returns {Object} The application context
 * @throws {Error} If called outside of a component that has AppContext provided
 */
export function useAppContext() {
  const context = inject(APP_CONTEXT_KEY)
  if (!context) {
    throw new Error('useAppContext must be used within a component that has AppContext provided')
  }
  return context
}
