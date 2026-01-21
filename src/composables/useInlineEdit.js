import { ref, watch, nextTick } from 'vue'

/**
 * Composable for inline editing of node titles and notes.
 * Handles editing state, keyboard events, and auto-save for notes.
 *
 * @param {Object} options
 * @param {Function} options.onSaveTitle - Called to save title: onSaveTitle(nodeId, newTitle) => Promise
 * @param {Function} options.onSaveNotes - Called to save notes: onSaveNotes(nodeId, newNotes) => Promise
 * @param {Function} options.findNode - Called to find node by ID: findNode(nodeId) => node | null
 */
export function useInlineEdit({ onSaveTitle, onSaveNotes, findNode } = {}) {
  // Title editing state
  const editingCardId = ref(null)
  const editingTitle = ref('')

  // Notes editing state
  const inlineNotesId = ref(null)
  const inlineNotesText = ref('')
  const inlineNotesRef = ref(null)

  // Auto-save timeout
  let autoSaveTimeout = null

  // ==========================================
  // TITLE EDITING
  // ==========================================

  function startEditing(node, e) {
    e?.stopPropagation()
    editingCardId.value = node.id
    editingTitle.value = node.title || ''
  }

  async function saveEditing() {
    if (!editingCardId.value) return

    const nodeId = editingCardId.value
    const originalNode = findNode?.(nodeId)

    if (!originalNode) {
      editingCardId.value = null
      return
    }

    // Only update if title changed
    if (editingTitle.value !== originalNode.title && onSaveTitle) {
      try {
        await onSaveTitle(nodeId, editingTitle.value)
      } catch (e) {
        console.error('Failed to save title:', e)
      }
    }

    editingCardId.value = null
  }

  function cancelEditing() {
    editingCardId.value = null
    editingTitle.value = ''
  }

  function handleEditKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditing()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      saveEditing()
    }
  }

  function isEditing(nodeId) {
    return editingCardId.value === nodeId
  }

  // ==========================================
  // NOTES EDITING
  // ==========================================

  async function startInlineNotes(node, e) {
    e?.stopPropagation()
    inlineNotesId.value = node.id
    inlineNotesText.value = node.notes || ''
    await nextTick()
    // Handle both single ref and array of refs (when multiple textareas exist)
    const ref = inlineNotesRef.value
    if (Array.isArray(ref)) {
      ref[0]?.focus()
    } else {
      ref?.focus()
    }
  }

  async function autoSaveInlineNotes() {
    if (!inlineNotesId.value) return

    const nodeId = inlineNotesId.value
    if (onSaveNotes) {
      try {
        await onSaveNotes(nodeId, inlineNotesText.value, { autoSave: true })
      } catch (e) {
        console.error('Auto-save failed:', e)
      }
    }
  }

  function debouncedAutoSave() {
    if (autoSaveTimeout) clearTimeout(autoSaveTimeout)
    autoSaveTimeout = setTimeout(autoSaveInlineNotes, 500)
  }

  // Watch for notes changes and auto-save
  watch(inlineNotesText, (newValue, oldValue) => {
    if (inlineNotesId.value && newValue !== oldValue) {
      debouncedAutoSave()
    }
  })

  async function saveInlineNotes() {
    if (!inlineNotesId.value) return

    // Clear any pending auto-save
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout)
      autoSaveTimeout = null
    }

    const nodeId = inlineNotesId.value
    const originalNode = findNode?.(nodeId)

    if (!originalNode) {
      inlineNotesId.value = null
      return
    }

    if (inlineNotesText.value !== (originalNode.notes || '') && onSaveNotes) {
      try {
        await onSaveNotes(nodeId, inlineNotesText.value, { autoSave: false })
      } catch (e) {
        console.error('Failed to save notes:', e)
      }
    }

    inlineNotesId.value = null
  }

  function cancelInlineNotes() {
    // Clear any pending auto-save
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout)
      autoSaveTimeout = null
    }
    inlineNotesId.value = null
    inlineNotesText.value = ''
  }

  function handleInlineNotesKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelInlineNotes()
    } else if (e.key === 'Enter' && e.metaKey) {
      e.preventDefault()
      saveInlineNotes()
    }
  }

  function isEditingNotes(nodeId) {
    return inlineNotesId.value === nodeId
  }

  // ==========================================
  // CLEANUP
  // ==========================================

  function cleanup() {
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout)
      autoSaveTimeout = null
    }
  }

  return {
    // Title editing state
    editingCardId,
    editingTitle,

    // Notes editing state
    inlineNotesId,
    inlineNotesText,
    inlineNotesRef,

    // Title editing methods
    startEditing,
    saveEditing,
    cancelEditing,
    handleEditKeydown,
    isEditing,

    // Notes editing methods
    startInlineNotes,
    saveInlineNotes,
    cancelInlineNotes,
    handleInlineNotesKeydown,
    isEditingNotes,

    // Cleanup
    cleanup
  }
}
