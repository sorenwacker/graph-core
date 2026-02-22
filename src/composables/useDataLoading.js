import { ref } from 'vue'
import { api } from '../services/api.js'

/**
 * Composable for loading sidebar, recent items, favorites, tags, trash, and orphaned nodes
 */
export function useDataLoading(currentWorkspace) {
  const sidebarTree = ref([])
  const recentItems = ref([])
  const favoriteItems = ref([])
  const allTags = ref([])
  const trashedItems = ref([])
  const orphanedNodes = ref([])
  const showLostFound = ref(false)
  const previousRecentClearedAt = ref(null)

  // Helper to check if a node belongs to the current workspace
  function matchesWorkspace(node) {
    if (!node) return false
    const ws = currentWorkspace.value
    if (ws === null || ws === 'null') {
      return node.workspace_id === null
    }
    return node.workspace_id === ws
  }

  // Build child tree from flat nodes
  function buildChildTree(flatNodes, parentId, parentCompleted = false) {
    if (!flatNodes) return []
    const children = flatNodes.filter(n => n && n.parent_id === parentId)
    return children.map(child => {
      if (!child || !child.id) return null
      const inheritedCompleted = parentCompleted || child.completed
      return {
        ...child,
        inheritedCompleted: parentCompleted,
        children: buildChildTree(flatNodes, child.id, inheritedCompleted)
      }
    }).filter(Boolean)
  }

  // Sidebar tree loading
  async function loadSidebarTree() {
    try {
      const roots = await api.getRoots(currentWorkspace.value)
      const filteredRoots = (roots || []).filter(matchesWorkspace)
      const rootsWithChildren = await Promise.all(
        filteredRoots.map(async (root) => {
          if (!root || !root.id) return null
          const descendants = await api.getDescendants(root.id)
          const filteredDescendants = (descendants || []).filter(matchesWorkspace)
          return {
            ...root,
            children: buildChildTree(filteredDescendants, root.id)
          }
        })
      )
      sidebarTree.value = rootsWithChildren.filter(Boolean)
    } catch (e) {
      console.error('Failed to load sidebar tree:', e)
    }
  }

  // Recent items
  function getRecentClearedKey() {
    const ws = currentWorkspace.value
    return `graphcore-recentClearedAt-${ws}`
  }

  async function loadRecentItems() {
    try {
      const items = await api.getRecent(10, currentWorkspace.value)
      const clearedAt = localStorage.getItem(getRecentClearedKey())
      const validItems = (items || []).filter(Boolean)
      if (clearedAt) {
        recentItems.value = validItems.filter(item => item && item.updated_at > clearedAt)
      } else {
        recentItems.value = validItems
      }
    } catch (e) {
      console.error('Failed to load recent items:', e)
    }
  }

  function clearRecent() {
    const key = getRecentClearedKey()
    previousRecentClearedAt.value = localStorage.getItem(key)
    localStorage.setItem(key, new Date().toISOString())
    recentItems.value = []
  }

  function undoClearRecent() {
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
  async function loadFavorites() {
    try {
      if (api.getFavorites) {
        const items = await api.getFavorites(currentWorkspace.value)
        favoriteItems.value = (items || []).filter(Boolean)
      }
    } catch {
      favoriteItems.value = []
    }
  }

  // Tags
  async function loadTags() {
    try {
      const tags = await api.getAllTags(currentWorkspace.value)
      allTags.value = tags || []
    } catch {
      allTags.value = []
    }
  }

  // Trash operations
  async function loadTrashedItems() {
    try {
      const items = await api.getTrash(100)
      trashedItems.value = (items || []).filter(Boolean)
    } catch (e) {
      console.error('Failed to load trashed items:', e)
    }
  }

  async function restoreFromTrash(node) {
    try {
      await api.restoreNode(node.id)
      await loadTrashedItems()
      await loadSidebarTree()
    } catch (e) {
      console.error('Failed to restore node:', e)
    }
  }

  async function permanentlyDelete(node) {
    if (!confirm(`Permanently delete "${node.title}"? This cannot be undone.`)) return
    try {
      await api.deleteNode(node.id, true)
      await loadTrashedItems()
    } catch (e) {
      console.error('Failed to delete node:', e)
    }
  }

  async function emptyAllTrash() {
    const count = trashedItems.value.length
    if (!confirm(`Permanently delete all ${count} items in trash? This cannot be undone.`)) return
    try {
      await api.emptyTrash()
      trashedItems.value = []
    } catch (e) {
      console.error('Failed to empty trash:', e)
    }
  }

  // Orphaned nodes (Lost & Found)
  async function loadOrphanedNodes() {
    try {
      const nodes = await api.getOrphanedNodes()
      orphanedNodes.value = (nodes || []).filter(Boolean)
    } catch (e) {
      console.error('Failed to load orphaned nodes:', e)
      orphanedNodes.value = []
    }
  }

  async function moveToRoot(node) {
    try {
      await api.reparentToRoot(node.id)
      await loadOrphanedNodes()
      await loadSidebarTree()
    } catch (e) {
      console.error('Failed to move node to root:', e)
    }
  }

  async function deleteOrphanedNode(node) {
    if (!confirm(`Permanently delete "${node.title}"?`)) return
    try {
      await api.deleteNode(node.id, true)
      await loadOrphanedNodes()
    } catch (e) {
      console.error('Failed to delete orphaned node:', e)
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

    // Recent operations
    clearRecent,
    undoClearRecent,

    // Trash operations
    restoreFromTrash,
    permanentlyDelete,
    emptyAllTrash,

    // Orphan operations
    moveToRoot,
    deleteOrphanedNode
  }
}
