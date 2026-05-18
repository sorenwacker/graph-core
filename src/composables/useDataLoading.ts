import { ref, type Ref } from 'vue'
import { api as apiService } from '../services/api.js'
import { handleError } from './useErrorHandler.js'
import { createNodeCache } from '../services/nodeCache.js'
import type { Node } from '../types'

// Cast api to any to allow flexible method calls until api.js is converted to TypeScript
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api = apiService as any

/** Cache interface for sidebar data */
interface NodeCache {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
  invalidatePrefix: (prefix: string) => void
}

/**
 * Tree node with children for sidebar display.
 */
export interface SidebarTreeNode extends Node {
  /** Whether completion is inherited from parent */
  inheritedCompleted?: boolean
  /** Child nodes */
  children: SidebarTreeNode[]
}

/**
 * Return type for useDataLoading composable.
 */
export interface UseDataLoadingReturn {
  /** Sidebar tree data */
  sidebarTree: Ref<SidebarTreeNode[]>
  /** Recent items list */
  recentItems: Ref<Node[]>
  /** Favorite items list */
  favoriteItems: Ref<Node[]>
  /** All tag nodes in workspace */
  allTags: Ref<Node[]>
  /** Trashed items list */
  trashedItems: Ref<Node[]>
  /** Orphaned nodes (lost & found) */
  orphanedNodes: Ref<Node[]>
  /** Whether lost & found panel is shown */
  showLostFound: Ref<boolean>
  /** Build child tree from flat nodes */
  buildChildTree: (flatNodes: Node[], parentId: number | null, parentCompleted?: boolean) => SidebarTreeNode[]
  /** Load sidebar tree data */
  loadSidebarTree: (skipCache?: boolean) => Promise<void>
  /** Load recent items */
  loadRecentItems: () => Promise<void>
  /** Load favorites */
  loadFavorites: () => Promise<void>
  /** Load all tags */
  loadTags: () => Promise<void>
  /** Load trashed items */
  loadTrashedItems: () => Promise<void>
  /** Load orphaned nodes */
  loadOrphanedNodes: () => Promise<void>
  /** Invalidate sidebar cache */
  invalidateSidebarCache: () => void
  /** Clear recent items list */
  clearRecent: () => void
  /** Undo clear recent */
  undoClearRecent: () => void
  /** Restore node from trash */
  restoreFromTrash: (node: Node) => Promise<void>
  /** Permanently delete node */
  permanentlyDelete: (node: Node) => Promise<void>
  /** Empty all trash */
  emptyAllTrash: () => Promise<void>
  /** Move orphaned node to root */
  moveToRoot: (node: Node) => Promise<void>
  /** Delete orphaned node */
  deleteOrphanedNode: (node: Node) => Promise<void>
}

// Shared cache instance for sidebar data
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sidebarCache: NodeCache = (createNodeCache as any)({
  maxSize: 100,
  ttlMs: 60000, // 1 minute TTL for sidebar data
}) as NodeCache

/**
 * Composable for loading sidebar, recent items, favorites, tags, trash, and orphaned nodes
 */
export function useDataLoading(currentWorkspace: Ref<number | null>): UseDataLoadingReturn {
  const sidebarTree = ref<SidebarTreeNode[]>([])
  const recentItems = ref<Node[]>([])
  const favoriteItems = ref<Node[]>([])
  const allTags = ref<Node[]>([])
  const trashedItems = ref<Node[]>([])
  const orphanedNodes = ref<Node[]>([])
  const showLostFound = ref(false)
  const previousRecentClearedAt = ref<string | null>(null)

  // Helper to check if a node belongs to the current workspace
  function matchesWorkspace(node: Node | null): boolean {
    if (!node) return false
    const ws = currentWorkspace.value
    if (ws === null) {
      return node.workspace_id === null
    }
    return node.workspace_id === ws
  }

  // Build child tree from flat nodes
  function buildChildTree(flatNodes: Node[], parentId: number | null, parentCompleted = false): SidebarTreeNode[] {
    if (!flatNodes) return []
    const children = flatNodes.filter(n => n && n.parent_id === parentId)
    return children
      .map(child => {
        if (!child || !child.id) return null
        const inheritedCompleted = parentCompleted || child.completed
        return {
          ...child,
          inheritedCompleted: parentCompleted,
          children: buildChildTree(flatNodes, child.id, inheritedCompleted),
        } as SidebarTreeNode
      })
      .filter((n): n is SidebarTreeNode => n !== null)
  }

  // Sidebar tree loading with batch fetching and caching
  async function loadSidebarTree(skipCache = false): Promise<void> {
    const cacheKey = `sidebar:${currentWorkspace.value}`

    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cached = sidebarCache.get(cacheKey)
      if (cached) {
        sidebarTree.value = cached as SidebarTreeNode[]
        return
      }
    }

    try {
      const wsId = currentWorkspace.value
      const roots = await api.getRoots(wsId as number)
      const filteredRoots = (roots || []).filter(matchesWorkspace)

      if (filteredRoots.length === 0) {
        sidebarTree.value = []
        sidebarCache.set(cacheKey, [])
        return
      }

      // Batch fetch all descendants in a single query
      const rootIds = filteredRoots.map((r: Node) => r.id).filter((id: number | null): id is number => id != null)
      const descendantsByRoot: Map<number, Node[]> = await api.getDescendantsBatch(rootIds)

      // Filter out tag nodes - they have their own section in the sidebar
      const isNotTag = (n: Node) => n.type !== 'tag'

      const rootsWithChildren = filteredRoots
        .filter(isNotTag)
        .map((root: Node) => {
          if (!root || !root.id) return null
          const descendants = descendantsByRoot.get(root.id) || []
          const filteredDescendants = descendants.filter(matchesWorkspace).filter(isNotTag)
          return {
            ...root,
            children: buildChildTree(filteredDescendants, root.id),
          } as SidebarTreeNode
        })
        .filter((n: SidebarTreeNode | null): n is SidebarTreeNode => n !== null)

      sidebarTree.value = rootsWithChildren
      sidebarCache.set(cacheKey, rootsWithChildren)
    } catch (e) {
      handleError(e as Error, { context: 'Loading sidebar' })
    }
  }

  // Invalidate sidebar cache for current workspace
  function invalidateSidebarCache(): void {
    sidebarCache.invalidatePrefix('sidebar:')
  }

  // Recent items
  function getRecentClearedKey(): string {
    const ws = currentWorkspace.value
    return `graphcore-recentClearedAt-${ws}`
  }

  async function loadRecentItems(): Promise<void> {
    try {
      const wsId = currentWorkspace.value
      const items = await api.getRecent(10, wsId as number)
      const clearedAt = typeof localStorage !== 'undefined' ? localStorage.getItem(getRecentClearedKey()) : null
      const validItems = (items || []).filter((item: Node | null): item is Node => item != null)
      if (clearedAt) {
        recentItems.value = validItems.filter((item: Node) => item && item.updated_at > clearedAt)
      } else {
        recentItems.value = validItems
      }
    } catch (e) {
      handleError(e as Error, { context: 'Loading recent items' })
    }
  }

  function clearRecent(): void {
    if (typeof localStorage === 'undefined') return
    const key = getRecentClearedKey()
    previousRecentClearedAt.value = localStorage.getItem(key)
    localStorage.setItem(key, new Date().toISOString())
    recentItems.value = []
  }

  function undoClearRecent(): void {
    if (typeof localStorage === 'undefined') return
    if (previousRecentClearedAt.value !== null) {
      const key = getRecentClearedKey()
      if (previousRecentClearedAt.value) {
        localStorage.setItem(key, previousRecentClearedAt.value)
      } else {
        localStorage.removeItem(key)
      }
      previousRecentClearedAt.value = null
      loadRecentItems()
    }
  }

  // Favorites
  async function loadFavorites(): Promise<void> {
    try {
      if (api.getFavorites) {
        const wsId = currentWorkspace.value
        const items = await api.getFavorites(wsId as number)
        favoriteItems.value = (items || []).filter((item: Node | null): item is Node => item != null)
      }
    } catch {
      favoriteItems.value = []
    }
  }

  // Tags (first-class tag nodes)
  async function loadTags(): Promise<void> {
    try {
      const wsId = currentWorkspace.value
      // Use getTagNodes if available, fall back to getAllTags for backwards compatibility
      if (api.getTagNodes) {
        const tagNodes = await api.getTagNodes(wsId as number)
        allTags.value = (tagNodes || []).filter((t: Node | null): t is Node => t != null)
      } else {
        // Legacy fallback: convert string tags to pseudo-nodes for display
        const tags = await api.getAllTags(wsId as number)
        allTags.value = (tags || []).map((tag: string, index: number) => ({
          id: null,
          title: tag,
          type: 'tag',
        })) as unknown as Node[]
      }
    } catch {
      allTags.value = []
    }
  }

  // Trash operations
  async function loadTrashedItems(): Promise<void> {
    try {
      const items = await api.getTrash(100)
      trashedItems.value = (items || []).filter((item: Node | null): item is Node => item != null)
    } catch (e) {
      handleError(e as Error, { context: 'Loading trash' })
    }
  }

  async function restoreFromTrash(node: Node): Promise<void> {
    try {
      await api.restoreNode(node.id)
      await loadTrashedItems()
      invalidateSidebarCache()
      await loadSidebarTree()
    } catch (e) {
      handleError(e as Error, { context: 'Restoring node' })
    }
  }

  async function permanentlyDelete(node: Node): Promise<void> {
    if (typeof confirm !== 'undefined' && !confirm(`Permanently delete "${node.title}"? This cannot be undone.`)) return
    try {
      await api.deleteNode(node.id, true)
      await loadTrashedItems()
    } catch (e) {
      handleError(e as Error, { context: 'Deleting node' })
    }
  }

  async function emptyAllTrash(): Promise<void> {
    const count = trashedItems.value.length
    if (
      typeof confirm !== 'undefined' &&
      !confirm(`Permanently delete all ${count} items in trash? This cannot be undone.`)
    )
      return
    try {
      await api.emptyTrash()
      trashedItems.value = []
    } catch (e) {
      handleError(e as Error, { context: 'Emptying trash' })
    }
  }

  // Orphaned nodes (Lost & Found)
  async function loadOrphanedNodes(): Promise<void> {
    try {
      const nodes = await api.getOrphanedNodes()
      orphanedNodes.value = (nodes || []).filter((node: Node | null): node is Node => node != null)
    } catch (e) {
      handleError(e as Error, { context: 'Loading orphaned nodes' })
      orphanedNodes.value = []
    }
  }

  async function moveToRoot(node: Node): Promise<void> {
    try {
      await api.reparentToRoot(node.id)
      await loadOrphanedNodes()
      invalidateSidebarCache()
      await loadSidebarTree()
    } catch (e) {
      handleError(e as Error, { context: 'Moving node to root' })
    }
  }

  async function deleteOrphanedNode(node: Node): Promise<void> {
    if (typeof confirm !== 'undefined' && !confirm(`Permanently delete "${node.title}"?`)) return
    try {
      await api.deleteNode(node.id, true)
      await loadOrphanedNodes()
    } catch (e) {
      handleError(e as Error, { context: 'Deleting orphaned node' })
    }
  }

  return {
    // Refs
    sidebarTree,
    recentItems,
    favoriteItems,
    allTags,
    trashedItems,
    orphanedNodes,
    showLostFound,

    // Tree helpers
    buildChildTree,

    // Loading functions
    loadSidebarTree,
    loadRecentItems,
    loadFavorites,
    loadTags,
    loadTrashedItems,
    loadOrphanedNodes,

    // Cache operations
    invalidateSidebarCache,

    // Recent operations
    clearRecent,
    undoClearRecent,

    // Trash operations
    restoreFromTrash,
    permanentlyDelete,
    emptyAllTrash,

    // Orphan operations
    moveToRoot,
    deleteOrphanedNode,
  }
}

// Export cache for testing and external invalidation
export { sidebarCache }
