import { nextTick } from 'vue'

/**
 * Composable for consolidated refresh logic after data changes.
 * Provides unified API for refreshing children, sidebar, recent items,
 * graph view, and detail panel.
 */
export function useRefresh({
  api,
  loadChildren,
  loadSidebarTree,
  loadRecentItems,
  loadTags,
  currentContainerId,
  selectedNode,
  graphViewRef,
  detailPanelRef,
}) {
  /**
   * Consolidated refresh after data changes
   * @param {Object} options - Refresh options
   * @param {boolean} options.silent - Use silent mode for loadChildren
   * @param {boolean} options.sidebar - Whether to refresh sidebar tree
   * @param {boolean} options.recent - Whether to refresh recent items
   */
  async function refreshAfterChange({ silent = true, sidebar = true, recent = true } = {}) {
    await loadChildren(currentContainerId.value, { silent })
    if (sidebar) await loadSidebarTree()
    if (recent) loadRecentItems()
  }

  /**
   * Refresh after delete operations
   */
  async function refreshAfterDelete() {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()
    if (loadTags) loadTags()
  }

  /**
   * Refresh graph after structure changes (links or parent-child)
   * @param {boolean} reloadData - Whether to reload children data
   */
  async function refreshGraphAfterStructureChange(reloadData = false) {
    if (reloadData) {
      await loadChildren(currentContainerId.value, { silent: true })
      await nextTick()
    } else if (graphViewRef.value?.updateGraph) {
      await graphViewRef.value.updateGraph()
    }
  }

  /**
   * Refresh detail panel if it's showing one of the linked nodes
   * @param {string|number} sourceId - Source node ID
   * @param {string|number} targetId - Target node ID
   */
  async function refreshDetailPanelLinks(sourceId, targetId) {
    if (selectedNode.value?.id === sourceId || selectedNode.value?.id === targetId) {
      selectedNode.value = await api.getNode(selectedNode.value.id)
      detailPanelRef.value?.loadLinkedNodes()
      detailPanelRef.value?.loadLinkedOrganizations()
      detailPanelRef.value?.loadLinkedMembers()
    }
  }

  /**
   * Refresh after a child node was updated (e.g., completed)
   * Updates graph view and sidebar tree
   */
  function refreshAfterChildUpdate() {
    graphViewRef.value?.updateGraph()
    loadSidebarTree()
  }

  return {
    refreshAfterChange,
    refreshAfterDelete,
    refreshGraphAfterStructureChange,
    refreshDetailPanelLinks,
    refreshAfterChildUpdate,
  }
}
