import { ref } from 'vue'
import { showToast } from './useToast.js'
import { ErrorCategory, wrapError, isRetryable, getUserMessage, AppError } from '../utils/errorTypes.js'

/**
 * Centralized error handling with toast notifications and retry logic.
 */

const lastError = ref(null)
const errorHistory = ref([])
const MAX_HISTORY = 10

/**
 * Extract error message from various error types
 * @param {Error|string|Object|null} error - Error to extract message from
 * @returns {string} Human-readable error message
 */
function extractMessage(error) {
  if (error === null || error === undefined) return 'An unknown error occurred'
  if (typeof error === 'string') return error || 'An unknown error occurred'
  // For AppError, use getUserMessage only if it provides a better message
  if (error instanceof AppError) {
    const userMsg = getUserMessage(error)
    // If getUserMessage returns a generic message but we have a specific message, use that
    if (userMsg === 'An unexpected error occurred.' && error.message) {
      return error.message
    }
    return userMsg
  }
  if (error instanceof Error) return error.message || 'An unknown error occurred'
  if (error.message) return error.message
  return String(error) || 'An unknown error occurred'
}

/**
 * Handle an error with optional toast notification
 * @param {Error|string|Object} error - Error to handle
 * @param {Object} options - Options
 * @param {string} options.context - Context prefix (e.g., "Loading sidebar")
 * @param {number} options.duration - Toast duration in ms (default: 5000)
 * @param {boolean} options.silent - If true, don't show toast
 * @param {function} options.onError - Callback to run after handling
 * @param {string} options.category - Override error category
 */
export function handleError(error, options = {}) {
  const { context, duration = 5000, silent = false, onError, category } = options

  // Handle null/undefined explicitly
  if (error === null || error === undefined) {
    error = new AppError('An unknown error occurred', { category: category || 'unknown' })
  }

  // Wrap error if not already an AppError
  const wrappedError = error instanceof AppError ? error : wrapError(error, { context, category })

  const message = extractMessage(wrappedError)
  const fullMessage = context ? `${context}: ${message}` : message

  // Store for retrieval
  lastError.value = wrappedError

  // Add to history
  errorHistory.value.unshift({
    error: wrappedError,
    message: fullMessage,
    timestamp: Date.now(),
    context,
  })
  if (errorHistory.value.length > MAX_HISTORY) {
    errorHistory.value.pop()
  }

  // Show toast unless silenced
  if (!silent) {
    showToast(fullMessage, { type: 'error', duration })
  }

  // Call error callback
  if (onError) {
    onError(wrappedError)
  }

  return wrappedError
}

/**
 * Clear the last stored error
 */
export function clearLastError() {
  lastError.value = null
}

/**
 * Clear error history
 */
export function clearErrorHistory() {
  errorHistory.value = []
}

/**
 * Retry an async operation with exponential backoff.
 * @param {function} fn - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxAttempts - Maximum retry attempts (default: 3)
 * @param {number} options.baseDelay - Base delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {function} options.shouldRetry - Function to determine if should retry (default: checks retryable)
 * @param {function} options.onRetry - Callback called before each retry
 * @returns {Promise<*>} Function result
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = error => isRetryable(error),
    onRetry,
  } = options

  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (attempt === maxAttempts || !shouldRetry(error)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay)

      if (onRetry) {
        onRetry({ attempt, maxAttempts, delay, error })
      }

      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  throw lastError
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

  /**
   * Wrap an async function with retry and error handling
   * @param {function} fn - Async function to wrap
   * @param {Object} options - Options (error handling + retry options)
   * @returns {*} Function result or undefined on error
   */
  async function wrapAsyncWithRetry(fn, options = {}) {
    const { maxAttempts, baseDelay, maxDelay, shouldRetry, onRetry, ...errorOptions } = options

    try {
      return await withRetry(fn, { maxAttempts, baseDelay, maxDelay, shouldRetry, onRetry })
    } catch (error) {
      handleError(error, errorOptions)
      return undefined
    }
  }

  /**
   * Check if the last error is of a specific category
   * @param {string} category - Category to check
   * @returns {boolean}
   */
  function isErrorCategory(category) {
    return lastError.value instanceof AppError && lastError.value.category === category
  }

  /**
   * Check if the last error is retryable
   * @returns {boolean}
   */
  function canRetry() {
    return isRetryable(lastError.value)
  }

  return {
    handleError,
    lastError,
    errorHistory,
    clearError: clearLastError,
    clearHistory: clearErrorHistory,
    wrapAsync,
    wrapAsyncWithRetry,
    withRetry,
    isErrorCategory,
    canRetry,
    ErrorCategory,
  }
}
