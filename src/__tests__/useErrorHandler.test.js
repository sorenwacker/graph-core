import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  useErrorHandler,
  handleError,
  clearLastError,
  clearErrorHistory,
  withRetry,
} from '../composables/useErrorHandler.js'
import { ErrorCategory, AppError, NetworkError } from '../utils/errorTypes.js'

// Mock useToast
vi.mock('../composables/useToast.js', () => ({
  showToast: vi.fn(),
}))

import { showToast } from '../composables/useToast.js'

describe('useErrorHandler composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLastError()
    clearErrorHistory()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handleError', () => {
    it('should show error toast with message string', () => {
      handleError('Something went wrong')

      expect(showToast).toHaveBeenCalledWith('Something went wrong', { type: 'error', duration: 5000 })
    })

    it('should show error toast with Error object', () => {
      const error = new Error('Database connection failed')
      handleError(error)

      expect(showToast).toHaveBeenCalledWith('Database connection failed', { type: 'error', duration: 5000 })
    })

    it('should show error toast with context prefix', () => {
      handleError('Node not found', { context: 'Loading sidebar' })

      expect(showToast).toHaveBeenCalledWith('Loading sidebar: Node not found', {
        type: 'error',
        duration: 5000,
      })
    })

    it('should respect custom duration', () => {
      handleError('Quick error', { duration: 2000 })

      expect(showToast).toHaveBeenCalledWith('Quick error', { type: 'error', duration: 2000 })
    })

    it('should call onError callback if provided', () => {
      const onError = vi.fn()
      const error = new Error('Test error')

      handleError(error, { onError })

      expect(onError).toHaveBeenCalled()
    })

    it('should not show toast when silent option is true', () => {
      handleError('Silent error', { silent: true })

      expect(showToast).not.toHaveBeenCalled()
    })

    it('should store last error for retrieval', () => {
      const error = new Error('Stored error')
      handleError(error)

      const { lastError } = useErrorHandler()
      expect(lastError.value).not.toBeNull()
      expect(lastError.value.message).toBe('Stored error')
    })

    it('should handle null/undefined errors gracefully', () => {
      handleError(null)
      handleError(undefined)

      expect(showToast).toHaveBeenCalledTimes(2)
      expect(showToast).toHaveBeenNthCalledWith(1, 'An unknown error occurred', expect.any(Object))
      expect(showToast).toHaveBeenNthCalledWith(2, 'An unknown error occurred', expect.any(Object))
    })

    it('should handle objects with message property', () => {
      handleError({ message: 'API Error', code: 500 })

      expect(showToast).toHaveBeenCalledWith('API Error', { type: 'error', duration: 5000 })
    })

    it('should add errors to history', () => {
      handleError('Error 1')
      handleError('Error 2')

      const { errorHistory } = useErrorHandler()
      expect(errorHistory.value).toHaveLength(2)
      expect(errorHistory.value[0].message).toBe('Error 2')
      expect(errorHistory.value[1].message).toBe('Error 1')
    })

    it('should preserve AppError instances', () => {
      const error = new NetworkError('Connection failed')
      handleError(error)

      const { lastError } = useErrorHandler()
      expect(lastError.value).toBe(error)
      expect(lastError.value.category).toBe(ErrorCategory.NETWORK)
    })

    it('should wrap regular errors as AppError', () => {
      const error = new Error('Regular error')
      handleError(error)

      const { lastError } = useErrorHandler()
      expect(lastError.value).toBeInstanceOf(AppError)
    })
  })

  describe('useErrorHandler', () => {
    it('should return handleError function', () => {
      const { handleError: fn } = useErrorHandler()
      expect(typeof fn).toBe('function')
    })

    it('should return lastError ref', () => {
      const { lastError } = useErrorHandler()
      expect(lastError.value).toBeNull()

      handleError('Test')
      expect(lastError.value).not.toBeNull()
    })

    it('should clear last error', () => {
      handleError('Test error')
      const { lastError, clearError } = useErrorHandler()

      expect(lastError.value).not.toBeNull()
      clearError()
      expect(lastError.value).toBeNull()
    })

    it('should return errorHistory ref', () => {
      const { errorHistory } = useErrorHandler()
      expect(errorHistory.value).toEqual([])
    })

    it('should clear error history', () => {
      handleError('Error 1')
      handleError('Error 2')

      const { errorHistory, clearHistory } = useErrorHandler()
      expect(errorHistory.value).toHaveLength(2)

      clearHistory()
      expect(errorHistory.value).toEqual([])
    })

    it('should provide isErrorCategory helper', () => {
      const networkError = new NetworkError('Connection failed')
      handleError(networkError)

      const { isErrorCategory } = useErrorHandler()
      expect(isErrorCategory(ErrorCategory.NETWORK)).toBe(true)
      expect(isErrorCategory(ErrorCategory.API)).toBe(false)
    })

    it('should provide canRetry helper', () => {
      const networkError = new NetworkError('Connection failed')
      handleError(networkError)

      const { canRetry } = useErrorHandler()
      expect(canRetry()).toBe(true)
    })

    it('should export ErrorCategory', () => {
      const { ErrorCategory: EC } = useErrorHandler()
      expect(EC).toBeDefined()
      expect(EC.NETWORK).toBe('network')
    })
  })

  describe('error wrapping', () => {
    it('should provide wrapAsync helper for async operations', async () => {
      const { wrapAsync } = useErrorHandler()

      const failingFn = async () => {
        throw new Error('Async failure')
      }

      const result = await wrapAsync(failingFn, { context: 'Test operation' })

      expect(result).toBeUndefined()
      expect(showToast).toHaveBeenCalledWith('Test operation: Async failure', { type: 'error', duration: 5000 })
    })

    it('should return result when async operation succeeds', async () => {
      const { wrapAsync } = useErrorHandler()

      const succeedingFn = async () => 'success'
      const result = await wrapAsync(succeedingFn)

      expect(result).toBe('success')
      expect(showToast).not.toHaveBeenCalled()
    })
  })

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success')

      const result = await withRetry(fn)

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new NetworkError('Failed')).mockResolvedValue('success')

      const result = await withRetry(fn, { maxAttempts: 3, baseDelay: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should throw after max attempts', async () => {
      const fn = vi.fn().mockRejectedValue(new NetworkError('Always fails'))

      await expect(withRetry(fn, { maxAttempts: 3, baseDelay: 10 })).rejects.toThrow('Always fails')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Not retryable'))

      await expect(withRetry(fn, { maxAttempts: 3, baseDelay: 10 })).rejects.toThrow('Not retryable')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should respect custom shouldRetry function', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Custom retry'))
      const shouldRetry = vi.fn().mockReturnValue(true)

      await expect(withRetry(fn, { maxAttempts: 2, baseDelay: 10, shouldRetry })).rejects.toThrow()
      expect(fn).toHaveBeenCalledTimes(2)
      expect(shouldRetry).toHaveBeenCalled()
    })

    it('should call onRetry callback', async () => {
      const fn = vi.fn().mockRejectedValueOnce(new NetworkError('Failed')).mockResolvedValue('success')

      const onRetry = vi.fn()

      await withRetry(fn, { maxAttempts: 3, baseDelay: 10, onRetry })

      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        maxAttempts: 3,
        delay: 10,
        error: expect.any(NetworkError),
      })
    })

    it('should use exponential backoff', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockResolvedValue('success')

      const onRetry = vi.fn()

      await withRetry(fn, { maxAttempts: 3, baseDelay: 100, onRetry })

      // First retry: 100ms, second retry: 200ms
      expect(onRetry).toHaveBeenCalledTimes(2)
      expect(onRetry.mock.calls[0][0].delay).toBe(100)
      expect(onRetry.mock.calls[1][0].delay).toBe(200)
    })

    it('should respect maxDelay', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockRejectedValueOnce(new NetworkError('Failed'))
        .mockResolvedValue('success')

      const onRetry = vi.fn()

      await withRetry(fn, { maxAttempts: 3, baseDelay: 1000, maxDelay: 500, onRetry })

      // Both delays should be capped at 500
      expect(onRetry.mock.calls[0][0].delay).toBe(500)
      expect(onRetry.mock.calls[1][0].delay).toBe(500)
    })
  })

  describe('wrapAsyncWithRetry', () => {
    it('should retry and handle errors', async () => {
      const { wrapAsyncWithRetry } = useErrorHandler()

      const fn = vi.fn().mockRejectedValue(new NetworkError('Always fails'))

      const result = await wrapAsyncWithRetry(fn, {
        maxAttempts: 2,
        baseDelay: 10,
        context: 'Test operation',
      })

      expect(result).toBeUndefined()
      expect(fn).toHaveBeenCalledTimes(2)
      expect(showToast).toHaveBeenCalled()
    })

    it('should succeed after retry', async () => {
      const { wrapAsyncWithRetry } = useErrorHandler()

      const fn = vi.fn().mockRejectedValueOnce(new NetworkError('Failed')).mockResolvedValue('success')

      const result = await wrapAsyncWithRetry(fn, { maxAttempts: 3, baseDelay: 10 })

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(2)
      expect(showToast).not.toHaveBeenCalled()
    })
  })
})
