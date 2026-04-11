import { ref, nextTick } from 'vue'

/**
 * Composable for managing graph modal dialogs.
 * Handles edit modal, prompt modal, and add node modal state.
 */
export function useGraphModals(options = {}) {
  const { emit, forceHideTooltip } = options

  // Edit modal state
  const editModal = ref({
    visible: false,
    node: null,
    editedNode: {},
  })
  const showNotesPreview = ref(false)
  const editTitleInput = ref(null)
  const editModalEl = ref(null)

  // Prompt modal state (replacement for native prompt())
  const promptModal = ref({
    visible: false,
    title: '',
    placeholder: '',
    value: '',
    resolve: null,
  })
  const promptInputRef = ref(null)

  // Add node modal state
  const addNodeModal = ref({
    visible: false,
    parentId: null,
    position: null,
    insertBetween: null,
  })

  /**
   * Show the edit modal for a node.
   * @param {Object} node - Node to edit
   */
  function showEditModal(node) {
    if (forceHideTooltip) forceHideTooltip()
    editModal.value = {
      visible: true,
      node,
      editedNode: { ...node },
    }
    showNotesPreview.value = false
    nextTick(() => {
      if (editTitleInput.value) {
        editTitleInput.value.focus()
        editTitleInput.value.select()
      }
    })
  }

  /**
   * Hide the edit modal.
   */
  function hideEditModal() {
    editModal.value.visible = false
  }

  /**
   * Save changes from the edit modal.
   */
  function saveEditModal() {
    if (!editModal.value.node) return
    if (emit) emit('update', editModal.value.editedNode)
    hideEditModal()
  }

  /**
   * Handle keydown events in the edit modal.
   * @param {KeyboardEvent} e - Keyboard event
   */
  function handleEditModalKeydown(e) {
    if (e.key === 'Escape') {
      hideEditModal()
    } else if (e.key === 'Enter' && e.metaKey) {
      saveEditModal()
    }
  }

  /**
   * Navigate to parent from modal and close.
   */
  function goToParentFromModal() {
    hideEditModal()
    if (emit) emit('go-parent')
  }

  /**
   * Show a styled prompt dialog.
   * @param {string} title - Prompt title
   * @param {string} placeholder - Input placeholder
   * @returns {Promise<string|null>} User input or null if cancelled
   */
  function showPrompt(title, placeholder = '') {
    return new Promise(resolve => {
      promptModal.value = {
        visible: true,
        title,
        placeholder,
        value: '',
        resolve,
      }
      nextTick(() => {
        promptInputRef.value?.focus()
      })
    })
  }

  /**
   * Submit the prompt dialog.
   */
  function submitPrompt() {
    const value = promptModal.value.value.trim()
    promptModal.value.resolve(value || null)
    promptModal.value.visible = false
  }

  /**
   * Cancel the prompt dialog.
   */
  function cancelPrompt() {
    promptModal.value.resolve(null)
    promptModal.value.visible = false
  }

  /**
   * Handle keydown events in the prompt dialog.
   * @param {KeyboardEvent} e - Keyboard event
   */
  function handlePromptKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitPrompt()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelPrompt()
    }
  }

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
   * Wrap selected node with a new parent.
   */
  async function wrapWithParentFromModal() {
    if (!editModal.value.node) return
    const title = await showPrompt('New parent title', 'Enter title...')
    if (title && emit) {
      emit('wrap-with-parent', { nodeId: editModal.value.node.id, parentTitle: title })
      hideEditModal()
    }
  }

  /**
   * Check if any modal is currently visible.
   * @returns {boolean}
   */
  function isAnyModalVisible() {
    return editModal.value.visible || promptModal.value.visible || addNodeModal.value.visible
  }

  return {
    // Edit modal
    editModal,
    showNotesPreview,
    editTitleInput,
    editModalEl,
    showEditModal,
    hideEditModal,
    saveEditModal,
    handleEditModalKeydown,
    goToParentFromModal,
    wrapWithParentFromModal,

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
