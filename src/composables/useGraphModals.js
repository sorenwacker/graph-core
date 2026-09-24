import { ref, nextTick } from 'vue'
import { usePrompt } from './usePrompt.js'

/**
 * Composable for managing graph modal dialogs.
 * Handles edit modal, prompt modal, and add node modal state.
 */
export function useGraphModals(options = {}) {
  const { emit, forceHideTooltip } = options

  // Edit modal state

  // The prompt dialog is app-wide (composables/usePrompt.js) and rendered once
  // at the root; these are re-exported so the graph's existing bindings keep
  // working against that one implementation rather than a second copy.
  const {
    promptState: promptModal,
    inputRef: promptInputRef,
    showPrompt,
    submitPrompt,
    cancelPrompt,
    handlePromptKeydown,
  } = usePrompt()

  // Add node modal state
  const addNodeModal = ref({
    visible: false,
    parentId: null,
    position: null,
    insertBetween: null,
  })

  /**
   * Show the add node modal.
   * @param {number|null} parentId - Parent node ID (null for container)
   * @param {Object|null} position - Graph position {x, y}
   * @param {Object|null} insertBetween - Insert between config
   */
  function showAddNodeModal(parentId = null, position = null, insertBetween = null) {
    addNodeModal.value = {
      visible: true,
      parentId,
      position,
      insertBetween,
    }
  }

  /**
   * Hide the add node modal.
   */
  function hideAddNodeModal() {
    addNodeModal.value.visible = false
    addNodeModal.value.insertBetween = null
  }

  /**
   * Handle node creation from the add node modal.
   * @param {Object} params - Creation parameters
   */
  function handleAddNodeCreate({ title, type, parentId, position, insertBetween }) {
    if (!emit) return

    if (insertBetween) {
      emit('insert-between', {
        parentId: insertBetween.parentId,
        childId: insertBetween.childId,
        title,
        type,
        isLink: insertBetween.isLink,
      })
    } else if (parentId) {
      emit('add-child', { parentId, title, type, x: position?.x, y: position?.y })
    } else {
      emit('create', { title, type, x: position?.x, y: position?.y })
    }
  }

  /**
   * Check if any modal is currently visible.
   * @returns {boolean}
   */
  function isAnyModalVisible() {
    return promptModal.value.visible || addNodeModal.value.visible
  }

  return {
    // Prompt modal
    promptModal,
    promptInputRef,
    showPrompt,
    submitPrompt,
    cancelPrompt,
    handlePromptKeydown,

    // Add node modal
    addNodeModal,
    showAddNodeModal,
    hideAddNodeModal,
    handleAddNodeCreate,

    // Utility
    isAnyModalVisible,
  }
}
