import { ref } from 'vue'

/**
 * Controller composable for modal state management.
 * Centralizes all modal visibility states and toggle handlers.
 *
 * @param {Object} options
 * @param {Function} options.loadSnapshots - Function to load snapshots when toggling
 * @param {Function} options.loadOrphanedNodes - Function to load orphaned nodes when toggling
 * @returns {Object} Modal states and handlers
 */
export function useModalController(options = {}) {
  const { loadSnapshots, loadOrphanedNodes } = options

  // Add node modal state
  const addNodeModal = ref({
    visible: false,
    parentId: null,
  })

  // UI modal states
  const showShortcutsModal = ref(false)
  const showOnboarding = ref(false)
  const showSettings = ref(false)

  // Panel/list states
  const showSnapshotList = ref(false)
  const showLostFound = ref(false)

  /**
   * Show the add node modal.
   * @param {string|null} parentId - Parent ID for the new node
   * @param {Object} callbacks - Optional callbacks
   * @param {Function} callbacks.onBeforeShow - Called before showing modal
   */
  function showAddNodeModal(parentId = null, { onBeforeShow } = {}) {
    onBeforeShow?.()
    addNodeModal.value = { visible: true, parentId }
  }

  /**
   * Close the add node modal.
   */
  function closeAddNodeModal() {
    addNodeModal.value = { visible: false, parentId: null }
  }

  /**
   * Toggle the snapshots list visibility.
   */
  function toggleSnapshots() {
    showSnapshotList.value = !showSnapshotList.value
    if (showSnapshotList.value && loadSnapshots) {
      loadSnapshots()
    }
  }

  /**
   * Toggle the lost & found panel visibility.
   */
  function toggleLostFound() {
    if (loadOrphanedNodes) {
      loadOrphanedNodes()
    }
    showLostFound.value = !showLostFound.value
  }

  /**
   * Show the keyboard shortcuts modal.
   */
  function openShortcutsModal() {
    showShortcutsModal.value = true
  }

  /**
   * Close the keyboard shortcuts modal.
   */
  function closeShortcutsModal() {
    showShortcutsModal.value = false
  }

  /**
   * Show the onboarding modal.
   */
  function openOnboarding() {
    showOnboarding.value = true
  }

  /**
   * Close the onboarding modal.
   */
  function closeOnboarding() {
    showOnboarding.value = false
  }

  /**
   * Show the settings panel.
   */
  function openSettings() {
    showSettings.value = true
  }

  /**
   * Close the settings panel.
   */
  function closeSettings() {
    showSettings.value = false
  }

  return {
    // Add node modal
    addNodeModal,
    showAddNodeModal,
    closeAddNodeModal,

    // Shortcuts modal
    showShortcutsModal,
    openShortcutsModal,
    closeShortcutsModal,

    // Onboarding modal
    showOnboarding,
    openOnboarding,
    closeOnboarding,

    // Settings panel
    showSettings,
    openSettings,
    closeSettings,

    // Snapshot list
    showSnapshotList,
    toggleSnapshots,

    // Lost & found
    showLostFound,
    toggleLostFound,
  }
}
