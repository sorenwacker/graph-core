import { ref, computed, watch } from 'vue'
import { useDetailController } from './useDetailController.js'
import { useModalController } from './useModalController.js'
import { useViewStateController } from './useViewStateController.js'

/**
 * Main orchestration composable for App.vue.
 * Coordinates the detail, modal, and view state controllers.
 * Exposes a unified API for the App component.
 *
 * @param {Object} options
 * @param {Object} options.settings - Settings from useSettings composable
 * @param {Object} options.navigation - Navigation composable instance
 * @param {Object} options.dataLoading - Data loading composable instance
 * @param {Object} options.snapshots - Snapshots composable instance
 * @param {Ref<boolean>} options.hasSeenOnboarding - Onboarding seen state
 * @returns {Object} Unified app controller API
 */
export function useAppController(options = {}) {
  const { settings = {}, navigation, dataLoading = {}, snapshots = {}, hasSeenOnboarding } = options

  // Top-level app state
  const error = ref(null)

  // Detail controller
  const detailController = useDetailController()

  // Modal controller (with data loading callbacks)
  const modalController = useModalController({
    loadSnapshots: snapshots.loadSnapshots,
    loadOrphanedNodes: dataLoading.loadOrphanedNodes,
  })

  // View state controller
  const viewStateController = useViewStateController({
    viewMode: settings.viewMode,
    navigation,
    loadTrashedItems: dataLoading.loadTrashedItems,
  })

  // Show onboarding on first run
  if (hasSeenOnboarding && !hasSeenOnboarding.value) {
    modalController.showOnboarding.value = true
  }

  // Close detail panel when node is deselected (if not pinned)
  function handleNodeDeselection(selectedNode) {
    if (!selectedNode && !detailController.detailPinned.value) {
      detailController.showDetail.value = false
    }
  }

  // Close tooltips when detail panel opens
  function handleDetailOpen(forceHideTooltip) {
    if (detailController.showDetail.value && forceHideTooltip) {
      forceHideTooltip()
    }
  }

  /**
   * Handle add child from detail panel.
   * @param {Function} addChildNode - The add child node function
   * @param {Object} payload - The child node payload
   */
  async function addChildFromDetail(addChildNode, payload) {
    await addChildNode(payload)
    detailController.loadChildren()
  }

  /**
   * Wrap showAddNodeModal to close detail panel first.
   * @param {string|null} parentId - Parent ID for the new node
   */
  function showAddNodeModal(parentId = null) {
    modalController.showAddNodeModal(parentId, {
      onBeforeShow: () => {
        detailController.showDetail.value = false
      },
    })
  }

  /**
   * Settings panel event handlers.
   */
  function handleShowOnboarding() {
    modalController.closeSettings()
    modalController.openOnboarding()
  }

  function handleCreateDemo(createDemo) {
    modalController.closeSettings()
    createDemo()
  }

  function handleResetDemo(resetDemo) {
    modalController.closeSettings()
    resetDemo()
  }

  /**
   * Clear error state.
   */
  function clearError() {
    error.value = null
  }

  /**
   * Set error state.
   * @param {string|Error} err - The error to set
   */
  function setError(err) {
    error.value = err instanceof Error ? err.message : err
  }

  return {
    // Top-level state
    error,
    clearError,
    setError,

    // Detail controller (spread for convenience)
    ...detailController,

    // Modal controller
    addNodeModal: modalController.addNodeModal,
    showAddNodeModal,
    closeAddNodeModal: modalController.closeAddNodeModal,
    showShortcutsModal: modalController.showShortcutsModal,
    openShortcutsModal: modalController.openShortcutsModal,
    closeShortcutsModal: modalController.closeShortcutsModal,
    showOnboarding: modalController.showOnboarding,
    openOnboarding: modalController.openOnboarding,
    closeOnboarding: modalController.closeOnboarding,
    showSettings: modalController.showSettings,
    openSettings: modalController.openSettings,
    closeSettings: modalController.closeSettings,
    showSnapshotList: modalController.showSnapshotList,
    toggleSnapshots: modalController.toggleSnapshots,
    showLostFound: modalController.showLostFound,
    toggleLostFound: modalController.toggleLostFound,

    // View state controller
    viewMode: viewStateController.viewMode,
    setViewMode: viewStateController.setViewMode,
    sortAlphabetically: viewStateController.sortAlphabetically,
    toggleSortAlphabetically: viewStateController.toggleSortAlphabetically,
    transitioning: viewStateController.transitioning,
    transitionDirection: viewStateController.transitionDirection,
    startTransition: viewStateController.startTransition,
    endTransition: viewStateController.endTransition,
    currentContainerId: viewStateController.currentContainerId,
    currentContainer: viewStateController.currentContainer,
    breadcrumbs: viewStateController.breadcrumbs,
    children: viewStateController.children,
    resetNavigationState: viewStateController.resetNavigationState,

    // Helper functions
    handleNodeDeselection,
    handleDetailOpen,
    addChildFromDetail,
    handleShowOnboarding,
    handleCreateDemo,
    handleResetDemo,
  }
}
