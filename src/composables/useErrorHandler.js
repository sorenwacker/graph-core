import { ref } from 'vue'
import { showToast } from './useToast.js'

/**
 * Centralized error handling with toast notifications.
 * Replaces scattered console.error calls with user-visible feedback.
 */

const lastError = ref(null)

/**
 * Extract error message from various error types
 * @param {Error|string|Object|null} error - Error to extract message from
 * @returns {string} Human-readable error message
 */
function extractMessage(error) {
  if (!error) return 'An unknown error occurred'
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (error.message) return error.message
  return String(error)
}

/**
 * Handle an error with optional toast notification
 * @param {Error|string|Object} error - Error to handle
 * @param {Object} options - Options
 * @param {string} options.context - Context prefix (e.g., "Loading sidebar")
 * @param {number} options.duration - Toast duration in ms (default: 5000)
 * @param {boolean} options.silent - If true, don't show toast
 * @param {function} options.onError - Callback to run after handling
 */
export function handleError(error, options = {}) {
  const { context, duration = 5000, silent = false, onError } = options

  const message = extractMessage(error)
  const fullMessage = context ? `${context}: ${message}` : message

  // Store for retrieval
  lastError.value = error

  // Show toast unless silenced
  if (!silent) {
    showToast(fullMessage, { type: 'error', duration })
  }

  // Call error callback
  if (onError) {
    onError(error)
  }
}

/**
 * Clear the last stored error
 */
export function clearLastError() {
  lastError.value = null
}

/**
 * Composable for error handling with toast notifications
 * @returns {Object} Error handling utilities
 */
export function useErrorHandler() {
  /**
   * Wrap an async function with error handling
   * @param {function} fn - Async function to wrap
   * @param {Object} options - Error handling options
   * @returns {*} Function result or undefined on error
   */
  async function wrapAsync(fn, options = {}) {
    try {
      return await fn()
    } catch (error) {
      handleError(error, options)
      return undefined
    }
  }

  return {
    handleError,
    lastError,
    clearError: clearLastError,
    wrapAsync,
  }
}
