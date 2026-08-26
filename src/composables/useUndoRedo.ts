import { ref, computed, watch, type Ref, type ComputedRef } from 'vue'
import { serializeStack, deserializeStack } from '../commands/commandFactory.js'
import { useErrorHandler } from './useErrorHandler'
import { MAX_UNDO_STACK_SIZE } from '../utils/settingsConstants'
import type { Api, Command } from '../types'

const UNDO_STORAGE_KEY = 'graphcore-undoStack'
const REDO_STORAGE_KEY = 'graphcore-redoStack'

/**
 * Save a command stack to sessionStorage.
 * @param key - Storage key
 * @param stack - Array of commands
 */
function saveStack(key: string, stack: Command[]): void {
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
 * @param key - Storage key
 * @returns Array of deserialized commands
 */
function restoreStack(key: string): Command[] {
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
 * Options for useUndoRedo composable.
 */
export interface UseUndoRedoOptions {
  /** API service for making backend calls */
  api: Api
  /** Callback after successful undo/redo (receives { command, action }) */
  onSuccess?: (result: { command: Command; action: 'undo' | 'redo' }) => void | Promise<void>
  /** Callback on error (receives error and command) */
  onError?: (error: Error, command: Command) => void
  /** Callback to show notification (receives message string) */
  showNotification?: (message: string) => void
  /** Maximum stack size (default: MAX_UNDO_STACK_SIZE) */
  maxStackSize?: number
  /** Whether to persist stacks to sessionStorage (default: true) */
  persist?: boolean
}

/**
 * Result of an undo/redo operation.
 */
export interface UndoRedoResult {
  command: Command
  description: string
}

/**
 * Return type for useUndoRedo composable.
 */
export interface UseUndoRedoReturn {
  /** Undo command stack */
  undoStack: Ref<Command[]>
  /** Redo command stack */
  redoStack: Ref<Command[]>
  /** Whether an undo/redo operation is in progress */
  isProcessing: Ref<boolean>
  /** Whether undo is available */
  canUndo: ComputedRef<boolean>
  /** Whether redo is available */
  canRedo: ComputedRef<boolean>
  /** Number of commands in undo stack */
  undoCount: ComputedRef<number>
  /** Number of commands in redo stack */
  redoCount: ComputedRef<number>
  /** Push a command onto the undo stack */
  pushCommand: (command: Command) => void
  /** Undo the most recent command */
  undo: () => Promise<UndoRedoResult | null>
  /** Redo the most recently undone command */
  redo: () => Promise<UndoRedoResult | null>
  /** Clear both undo and redo stacks */
  clear: () => void
}

/**
 * Composable for managing undo/redo operations using the Command pattern.
 *
 * @param options - Configuration options
 * @returns Undo/redo state and functions
 */
export function useUndoRedo({
  api,
  onSuccess,
  onError,
  showNotification,
  maxStackSize = MAX_UNDO_STACK_SIZE,
  persist = true,
}: UseUndoRedoOptions): UseUndoRedoReturn {
  const { handleError } = useErrorHandler()

  // Restore from sessionStorage if persistence enabled
  const restoredUndo = persist ? restoreStack(UNDO_STORAGE_KEY) : []
  const restoredRedo = persist ? restoreStack(REDO_STORAGE_KEY) : []

  const undoStack = ref<Command[]>(restoredUndo)
  const redoStack = ref<Command[]>(restoredRedo)
  const isProcessing = ref(false)

  // Persist stacks to sessionStorage when they change
  if (persist) {
    watch(undoStack, stack => saveStack(UNDO_STORAGE_KEY, stack), { deep: true })
    watch(redoStack, stack => saveStack(REDO_STORAGE_KEY, stack), { deep: true })
  }

  /**
   * Push a command onto the undo stack.
   * @param command - Command instance
   */
  function pushCommand(command: Command): void {
    undoStack.value.push(command)
    redoStack.value = [] // Clear redo stack on new action
    if (undoStack.value.length > maxStackSize) {
      undoStack.value.shift()
    }
  }

  /**
   * Undo the most recent command.
   * @returns { command, description } or null if nothing to undo
   */
  async function undo(): Promise<UndoRedoResult | null> {
    if (undoStack.value.length === 0 || isProcessing.value) return null

    isProcessing.value = true
    const command = undoStack.value.pop()!

    try {
      await command.undo(api)
      redoStack.value.push(command)
      if (onSuccess) await onSuccess({ command, action: 'undo' })
      const description = command.getDescription?.() || command.type
      if (showNotification) showNotification(`Undo: ${description}`)
      return { command, description }
    } catch (error) {
      handleError(error as Error, { context: 'Undo' })
      undoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error as Error, command)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Redo the most recently undone command.
   * @returns { command, description } or null if nothing to redo
   */
  async function redo(): Promise<UndoRedoResult | null> {
    if (redoStack.value.length === 0 || isProcessing.value) return null

    isProcessing.value = true
    const command = redoStack.value.pop()!
    const idBeforeExecute = (command as { nodeId?: number }).nodeId

    try {
      await command.execute(api)

      // Redoing a creation cannot reuse the original row id, because undo hard
      // deleted it. Everything still queued for redo was recorded after this
      // command, so those are exactly the commands that may name the old id.
      const idAfterExecute = (command as { nodeId?: number }).nodeId
      if (idBeforeExecute !== undefined && idAfterExecute !== undefined && idBeforeExecute !== idAfterExecute) {
        for (const queued of redoStack.value) {
          queued.remapNodeId?.(idBeforeExecute, idAfterExecute)
        }
      }

      undoStack.value.push(command)
      if (onSuccess) await onSuccess({ command, action: 'redo' })
      const description = command.getDescription?.() || command.type
      if (showNotification) showNotification(`Redo: ${description}`)
      return { command, description }
    } catch (error) {
      handleError(error as Error, { context: 'Redo' })
      redoStack.value.push(command) // Restore to stack on failure
      if (onError) onError(error as Error, command)
      return null
    } finally {
      isProcessing.value = false
    }
  }

  /**
   * Clear both undo and redo stacks.
   */
  function clear(): void {
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
    clear,
  }
}
