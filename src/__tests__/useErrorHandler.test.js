import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useErrorHandler, handleError, clearLastError } from '../composables/useErrorHandler.js'

// Mock useToast
vi.mock('../composables/useToast.js', () => ({
  showToast: vi.fn()
}))

import { showToast } from '../composables/useToast.js'

describe('useErrorHandler composable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearLastError()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('handleError', () => {
    it('should show error toast with message string', () => {
      handleError('Something went wrong')

      expect(showToast).toHaveBeenCalledWith(
        'Something went wrong',
        { type: 'error', duration: 5000 }
      )
    })

    it('should show error toast with Error object', () => {
      const error = new Error('Database connection failed')
      handleError(error)

      expect(showToast).toHaveBeenCalledWith(
        'Database connection failed',
        { type: 'error', duration: 5000 }
      )
    })

    it('should show error toast with context prefix', () => {
      handleError('Node not found', { context: 'Loading sidebar' })

      expect(showToast).toHaveBeenCalledWith(
        'Loading sidebar: Node not found',
        { type: 'error', duration: 5000 }
      )
    })

    it('should respect custom duration', () => {
      handleError('Quick error', { duration: 2000 })

      expect(showToast).toHaveBeenCalledWith(
        'Quick error',
        { type: 'error', duration: 2000 }
      )
    })

    it('should call onError callback if provided', () => {
      const onError = vi.fn()
      const error = new Error('Test error')

      handleError(error, { onError })

      expect(onError).toHaveBeenCalledWith(error)
    })

    it('should not show toast when silent option is true', () => {
      handleError('Silent error', { silent: true })

      expect(showToast).not.toHaveBeenCalled()
    })

    it('should store last error for retrieval', () => {
      const error = new Error('Stored error')
      handleError(error)

      const { lastError } = useErrorHandler()
      expect(lastError.value).toBe(error)
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

      expect(showToast).toHaveBeenCalledWith(
        'API Error',
        { type: 'error', duration: 5000 }
      )
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
      expect(lastError.value).toBe('Test')
    })

    it('should clear last error', () => {
      handleError('Test error')
      const { lastError, clearError } = useErrorHandler()

      expect(lastError.value).not.toBeNull()
      clearError()
      expect(lastError.value).toBeNull()
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
      expect(showToast).toHaveBeenCalledWith(
        'Test operation: Async failure',
        { type: 'error', duration: 5000 }
      )
    })

    it('should return result when async operation succeeds', async () => {
      const { wrapAsync } = useErrorHandler()

      const succeedingFn = async () => 'success'
      const result = await wrapAsync(succeedingFn)

      expect(result).toBe('success')
      expect(showToast).not.toHaveBeenCalled()
    })
  })
})
