import { ref, computed } from 'vue'

/**
 * Composable for managing undo/redo operations using the Command pattern.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for making backend calls
 * @param {Function} options.onSuccess - Callback after successful undo/redo
 * @param {Function} options.onError - Callback on error (receives error and command)
 * @param {number} options.maxStackSize - Maximum stack size (default: 50)
 * @returns {Object} Undo/redo state and functions
 */
export function useUndoRedo({
  api,
  onSuccess,
  onError,
  maxStackSize = 50
} = {}) {
  const undoStack = ref([])
  const redoStack = ref([])
  const isProcessing = ref(false)

  /**
   * Push a command onto the undo stack
   * @param {Command} command - Command instance
   */
  function pushCommand(command) {
    undoStack.value.push(command)
    redoStack.value = [] // Clear redo stack on new action
    if (undoStack.value.length > maxStackSize) {
      undoStack.value.shift()
    }
  }

  /**
   * Undo the most recent command
   */
  async function undo() {
    if (undoStack.value.length === 0 || isProcessing.value) return

    isProcessing.value = true
    const command = undoStack.value.pop()

    try {
      await command.undo(api)
      redoStack.value.push(command)
      if (onSuccess) await onSuccess()
    } catch (error) {
      console.error('Undo failed:', error, command)
      undoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error, command)
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Redo the most recently undone command
   */
  async function redo() {
    if (redoStack.value.length === 0 || isProcessing.value) return

    isProcessing.value = true
    const command = redoStack.value.pop()

    try {
      await command.execute(api)
      undoStack.value.push(command)
      if (onSuccess) await onSuccess()
    } catch (error) {
      console.error('Redo failed:', error, command)
      redoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error, command)
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Clear both undo and redo stacks
   */
  function clear() {
    undoStack.value = []
    redoStack.value = []
  }

  return {
    // State
    undoStack,
    redoStack,
    isProcessing,

    // Computed
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    undoCount: computed(() => undoStack.value.length),
    redoCount: computed(() => redoStack.value.length),

    // Methods
    pushCommand,
    undo,
    redo,
    clear
  }
}
