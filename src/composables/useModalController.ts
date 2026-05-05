import { ref, type Ref } from 'vue'

/**
 * Add node modal state.
 */
export interface AddNodeModalState {
  /** Whether the modal is visible */
  visible: boolean
  /** Parent ID for the new node */
  parentId: number | null
}

/**
 * Options for useModalController composable.
 */
export interface UseModalControllerOptions {
  /** Function to load snapshots when toggling */
  loadSnapshots?: () => void | Promise<void>
  /** Function to load orphaned nodes when toggling */
  loadOrphanedNodes?: () => void | Promise<void>
}

/**
 * Callbacks for showing add node modal.
 */
export interface ShowAddNodeModalCallbacks {
  /** Called before showing modal */
  onBeforeShow?: () => void
}

/**
 * Return type for useModalController composable.
 */
export interface UseModalControllerReturn {
  /** Add node modal state */
  addNodeModal: Ref<AddNodeModalState>
  /** Show the add node modal */
  showAddNodeModal: (parentId?: number | null, callbacks?: ShowAddNodeModalCallbacks) => void
  /** Close the add node modal */
  closeAddNodeModal: () => void
  /** Whether keyboard shortcuts modal is visible */
  showShortcutsModal: Ref<boolean>
  /** Open the keyboard shortcuts modal */
  openShortcutsModal: () => void
  /** Close the keyboard shortcuts modal */
  closeShortcutsModal: () => void
  /** Whether onboarding modal is visible */
  showOnboarding: Ref<boolean>
  /** Open the onboarding modal */
  openOnboarding: () => void
  /** Close the onboarding modal */
  closeOnboarding: () => void
  /** Whether settings panel is visible */
  showSettings: Ref<boolean>
  /** Open the settings panel */
  openSettings: () => void
  /** Close the settings panel */
  closeSettings: () => void
  /** Whether snapshot list is visible */
  showSnapshotList: Ref<boolean>
  /** Toggle snapshot list visibility */
  toggleSnapshots: () => void
  /** Whether lost & found panel is visible */
  showLostFound: Ref<boolean>
  /** Toggle lost & found panel visibility */
  toggleLostFound: () => void
}

/**
 * Controller composable for modal state management.
 * Centralizes all modal visibility states and toggle handlers.
 *
 * @param options - Configuration options
 * @returns Modal states and handlers
 */
export function useModalController(options: UseModalControllerOptions = {}): UseModalControllerReturn {
  const { loadSnapshots, loadOrphanedNodes } = options

  // Add node modal state
  const addNodeModal = ref<AddNodeModalState>({
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
   */
  function showAddNodeModal(parentId: number | null = null, { onBeforeShow }: ShowAddNodeModalCallbacks = {}): void {
    onBeforeShow?.()
    addNodeModal.value = { visible: true, parentId }
  }

  /**
   * Close the add node modal.
   */
  function closeAddNodeModal(): void {
    addNodeModal.value = { visible: false, parentId: null }
  }

  /**
   * Toggle the snapshots list visibility.
   */
  function toggleSnapshots(): void {
    showSnapshotList.value = !showSnapshotList.value
    if (showSnapshotList.value && loadSnapshots) {
      loadSnapshots()
    }
  }

  /**
   * Toggle the lost & found panel visibility.
   */
  function toggleLostFound(): void {
    if (loadOrphanedNodes) {
      loadOrphanedNodes()
    }
    showLostFound.value = !showLostFound.value
  }

  /**
   * Show the keyboard shortcuts modal.
   */
  function openShortcutsModal(): void {
    showShortcutsModal.value = true
  }

  /**
   * Close the keyboard shortcuts modal.
   */
  function closeShortcutsModal(): void {
    showShortcutsModal.value = false
  }

  /**
   * Show the onboarding modal.
   */
  function openOnboarding(): void {
    showOnboarding.value = true
  }

  /**
   * Close the onboarding modal.
   */
  function closeOnboarding(): void {
    showOnboarding.value = false
  }

  /**
   * Show the settings panel.
   */
  function openSettings(): void {
    showSettings.value = true
  }

  /**
   * Close the settings panel.
   */
  function closeSettings(): void {
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
