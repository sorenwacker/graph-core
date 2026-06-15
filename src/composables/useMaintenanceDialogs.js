import { useSnapshots } from './useSnapshots.js'
import { useDemoWorkspace } from './useDemoWorkspace.js'

/**
 * App maintenance and first-run dialog orchestration extracted from App.vue:
 * database snapshots, the lost-and-found panel, the demo workspace, and the
 * onboarding modal. Shared state and data-loading functions are injected.
 *
 * @param {Object} deps
 * @param {Object} deps.api - API service
 * @param {Function} deps.loadChildren - Reload children
 * @param {Function} deps.loadSidebarTree - Reload sidebar tree
 * @param {Function} deps.loadRecentItems - Reload recent items
 * @param {Function} deps.loadWorkspaces - Reload workspaces
 * @param {Function} deps.loadOrphanedNodes - Reload orphaned (lost & found) nodes
 * @param {import('vue').Ref} deps.selectedNode - Selected node
 * @param {import('vue').Ref} deps.currentContainerId - Current container id
 * @param {import('vue').Ref} deps.breadcrumbs - Breadcrumb path
 * @param {import('vue').Ref} deps.currentWorkspace - Current workspace id
 * @param {import('vue').Ref<boolean>} deps.showSnapshotList - Snapshot list visibility
 * @param {import('vue').Ref<boolean>} deps.showLostFound - Lost & found visibility
 * @param {import('vue').Ref<boolean>} deps.showSettings - Settings panel visibility
 * @param {import('vue').Ref<boolean>} deps.showOnboarding - Onboarding modal visibility
 * @returns {Object} Snapshot/demo/onboarding state and handlers
 */
export function useMaintenanceDialogs({
  api,
  loadChildren,
  loadSidebarTree,
  loadRecentItems,
  loadWorkspaces,
  loadOrphanedNodes,
  selectedNode,
  currentContainerId,
  breadcrumbs,
  currentWorkspace,
  showSnapshotList,
  showLostFound,
  showSettings,
  showOnboarding,
}) {
  const { availableSnapshots, snapshotMessage, loadSnapshots, createSnapshot, restoreSnapshot, reloadDatabase } =
    useSnapshots({
      onListBackups: api.listBackups,
      onCreateBackup: api.backup,
      onRestoreBackup: api.restoreBackup,
      onReload: api.reload,
      onAfterRestore: async () => {
        await loadChildren(null)
        await loadSidebarTree()
        selectedNode.value = null
        currentContainerId.value = null
        breadcrumbs.value = []
      },
      onAfterReload: async () => {
        await loadChildren(currentContainerId.value)
        await loadSidebarTree()
        loadRecentItems()
        if (selectedNode.value?.id) selectedNode.value = await api.getNode(selectedNode.value.id)
      },
    })

  function toggleSnapshots() {
    showSnapshotList.value = !showSnapshotList.value
    loadSnapshots()
  }

  function toggleLostFound() {
    loadOrphanedNodes()
    showLostFound.value = !showLostFound.value
  }

  const { createDemo, resetDemo } = useDemoWorkspace({ api, currentWorkspace, loadWorkspaces })

  function handleShowOnboarding() {
    showSettings.value = false
    showOnboarding.value = true
  }
  function handleCreateDemo() {
    showSettings.value = false
    createDemo()
  }
  function handleResetDemo() {
    showSettings.value = false
    resetDemo()
  }

  return {
    availableSnapshots,
    snapshotMessage,
    loadSnapshots,
    createSnapshot,
    restoreSnapshot,
    reloadDatabase,
    toggleSnapshots,
    toggleLostFound,
    createDemo,
    resetDemo,
    handleShowOnboarding,
    handleCreateDemo,
    handleResetDemo,
  }
}
