import { ref, watch, type Ref } from 'vue'
import type { Node, TreeNode } from '../types/node'

/**
 * Navigation composable interface for syncing state.
 */
export interface NavigationComposable {
  children: Ref<TreeNode[]>
  breadcrumbs: Ref<Node[]>
  currentContainer: Ref<Node | null>
  currentContainerId: Ref<number | null>
}

/**
 * Return type for useNavigationState composable.
 */
export interface UseNavigationStateReturn {
  /** Current container ID (null for root) */
  currentContainerId: Ref<number | null>
  /** Current container node */
  currentContainer: Ref<Node | null>
  /** Breadcrumb path from root to current container */
  breadcrumbs: Ref<Node[]>
  /** Children of current container */
  children: Ref<TreeNode[]>
  /** Sync navigation state from an external navigation composable */
  syncFromNavigation: (navigation: NavigationComposable) => void
  /** Reset all navigation state */
  resetNavigationState: () => void
}

/**
 * Composable for managing navigation state refs.
 * Provides centralized state for current container, breadcrumbs, and children.
 *
 * @returns Navigation state refs and utilities
 */
export function useNavigationState(): UseNavigationStateReturn {
  const currentContainerId = ref<number | null>(null)
  const currentContainer = ref<Node | null>(null)
  const breadcrumbs = ref<Node[]>([])
  const children = ref<TreeNode[]>([])

  /**
   * Sync navigation state from an external navigation composable.
   * Sets up watchers to keep local state in sync.
   */
  function syncFromNavigation(navigation: NavigationComposable): void {
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

  /**
   * Reset all navigation state to initial values.
   */
  function resetNavigationState(): void {
    currentContainerId.value = null
    currentContainer.value = null
    breadcrumbs.value = []
    children.value = []
  }

  return {
    currentContainerId,
    currentContainer,
    breadcrumbs,
    children,
    syncFromNavigation,
    resetNavigationState,
  }
}
