import { ref, computed, watch } from 'vue'
import { serializeStack, deserializeStack } from '../commands/commandFactory.js'
import { useErrorHandler } from './useErrorHandler'

const UNDO_STORAGE_KEY = 'graphcore-undoStack'
const REDO_STORAGE_KEY = 'graphcore-redoStack'

/**
 * Save a command stack to sessionStorage.
 * @param {string} key - Storage key
 * @param {Command[]} stack - Array of commands
 */
function saveStack(key, stack) {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    const serialized = JSON.stringify(serializeStack(stack))
    window.sessionStorage.setItem(key, serialized)
  } catch (e) {
    console.warn('Failed to save undo stack:', e)
  }
}

/**
 * Restore a command stack from sessionStorage.
 * @param {string} key - Storage key
 * @returns {Command[]} - Array of deserialized commands
 */
function restoreStack(key) {
  if (typeof window === 'undefined' || !window.sessionStorage) return []
  try {
    const stored = window.sessionStorage.getItem(key)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return deserializeStack(parsed)
  } catch (e) {
    console.warn('Failed to restore undo stack:', e)
    return []
  }
}

/**
 * Composable for managing undo/redo operations using the Command pattern.
 *
 * @param {Object} options
 * @param {Object} options.api - API service for making backend calls
 * @param {Function} options.onSuccess - Callback after successful undo/redo (receives { command, action })
 * @param {Function} options.onError - Callback on error (receives error and command)
 * @param {number} options.maxStackSize - Maximum stack size (default: 50)
 * @param {boolean} options.persist - Whether to persist stacks to sessionStorage (default: true)
 * @returns {Object} Undo/redo state and functions
 */
export function useUndoRedo({
  api,
  onSuccess,
  onError,
  maxStackSize = 50,
  persist = true
} = {}) {
  const { handleError } = useErrorHandler()

  // Restore from sessionStorage if persistence enabled
  const restoredUndo = persist ? restoreStack(UNDO_STORAGE_KEY) : []
  const restoredRedo = persist ? restoreStack(REDO_STORAGE_KEY) : []

  const undoStack = ref(restoredUndo)
  const redoStack = ref(restoredRedo)
  const isProcessing = ref(false)

  // Persist stacks to sessionStorage when they change
  if (persist) {
    watch(undoStack, (stack) => saveStack(UNDO_STORAGE_KEY, stack), { deep: true })
    watch(redoStack, (stack) => saveStack(REDO_STORAGE_KEY, stack), { deep: true })
  }

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
   * @returns {Object|null} { command, description } or null if nothing to undo
   */
  async function undo() {
    if (undoStack.value.length === 0 || isProcessing.value) return null

    isProcessing.value = true
    const command = undoStack.value.pop()

    try {
      await command.undo(api)
      redoStack.value.push(command)
      if (onSuccess) await onSuccess({ command, action: 'undo' })
      return { command, description: command.getDescription?.() || command.type }
    } catch (error) {
      handleError(error, { context: 'Undo' })
      undoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error, command)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Redo the most recently undone command
   * @returns {Object|null} { command, description } or null if nothing to redo
   */
  async function redo() {
    if (redoStack.value.length === 0 || isProcessing.value) return null

    isProcessing.value = true
    const command = redoStack.value.pop()

    try {
      await command.execute(api)
      undoStack.value.push(command)
      if (onSuccess) await onSuccess({ command, action: 'redo' })
      return { command, description: command.getDescription?.() || command.type }
    } catch (error) {
      handleError(error, { context: 'Redo' })
      redoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error, command)
      return null
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
