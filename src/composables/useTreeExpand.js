import { ref } from 'vue'

/**
 * Composable for managing tree node expanded/collapsed state.
 * Persists state to localStorage per workspace.
 *
 * @param {Object} options
 * @param {Ref<string|null>} options.workspace - Current workspace ref
 * @param {Ref<Array>} options.flatChildren - Flat list of all children for expandAll/expandAncestors
 * @returns {Object} Expand state and functions
 */
export function useTreeExpand({ workspace, flatChildren } = {}) {
  const expandedIds = ref(new Set())

  function getExpandedKey() {
    return `graphcore-expanded-${workspace?.value}`
  }

  function saveExpandedState() {
    const ids = Array.from(expandedIds.value)
    localStorage.setItem(getExpandedKey(), JSON.stringify(ids))
  }

  function loadExpandedState() {
    const stored = localStorage.getItem(getExpandedKey())
    if (stored) {
      try {
        const ids = JSON.parse(stored)
        expandedIds.value = new Set(ids)
      } catch {
        expandedIds.value = new Set()
      }
    }
  }

  function toggleExpand(nodeId) {
    if (expandedIds.value.has(nodeId)) {
      expandedIds.value.delete(nodeId)
    } else {
      expandedIds.value.add(nodeId)
    }
    expandedIds.value = new Set(expandedIds.value)
    saveExpandedState()
  }

  function expandAll() {
    if (!flatChildren?.value) return
    expandedIds.value = new Set(flatChildren.value.map(n => n.id))
    saveExpandedState()
  }

  function collapseAll() {
    expandedIds.value = new Set()
    saveExpandedState()
  }

  function expandAncestors(nodeId) {
    if (!flatChildren?.value) return
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (!node || !node.path) return

    // Parse path to get ancestor IDs
    const pathParts = node.path.split('/').filter(p => p)
    pathParts.forEach(id => {
      expandedIds.value.add(parseInt(id))
    })
    expandedIds.value = new Set(expandedIds.value)
  }

  function isExpanded(nodeId) {
    return expandedIds.value.has(nodeId)
  }

  function setExpandedIds(ids) {
    expandedIds.value = new Set(ids)
  }

  return {
    expandedIds,
    toggleExpand,
    expandAll,
    collapseAll,
    expandAncestors,
    isExpanded,
    setExpandedIds,
    loadExpandedState,
    saveExpandedState
  }
}
