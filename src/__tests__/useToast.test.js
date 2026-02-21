import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToast, showToast, dismissToast } from '../composables/useToast.js'

describe('useToast composable', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear any existing toasts
    const { toasts } = useToast()
    toasts.value = []
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('showToast', () => {
    it('should add a toast to the list', () => {
      const { toasts } = useToast()

      showToast('Test message')

      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].message).toBe('Test message')
    })

    it('should return a toast ID', () => {
      const id = showToast('Test')
      expect(typeof id).toBe('number')
    })

    it('should auto-dismiss after duration', () => {
      const { toasts } = useToast()

      showToast('Test', { duration: 3000 })
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(3000)
      expect(toasts.value).toHaveLength(0)
    })

    it('should respect custom duration', () => {
      const { toasts } = useToast()

      showToast('Test', { duration: 1000 })
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(500)
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(500)
      expect(toasts.value).toHaveLength(0)
    })

    it('should not auto-dismiss when duration is 0', () => {
      const { toasts } = useToast()

      showToast('Persistent', { duration: 0 })
      expect(toasts.value).toHaveLength(1)

      vi.advanceTimersByTime(10000)
      expect(toasts.value).toHaveLength(1)
    })

    it('should set toast type', () => {
      const { toasts } = useToast()

      showToast('Success!', { type: 'success' })
      showToast('Error!', { type: 'error' })

      expect(toasts.value[0].type).toBe('success')
      expect(toasts.value[1].type).toBe('error')
    })

    it('should default to info type', () => {
      const { toasts } = useToast()

      showToast('Info')

      expect(toasts.value[0].type).toBe('info')
    })
  })

  describe('dismissToast', () => {
    it('should remove toast by ID', () => {
      const { toasts } = useToast()

      const id = showToast('Test', { duration: 0 })
      expect(toasts.value).toHaveLength(1)

      dismissToast(id)
      expect(toasts.value).toHaveLength(0)
    })

    it('should not error on invalid ID', () => {
      dismissToast(99999)
      // Should not throw
    })

    it('should only remove the specified toast', () => {
      const { toasts } = useToast()

      showToast('First', { duration: 0 })
      const id2 = showToast('Second', { duration: 0 })
      showToast('Third', { duration: 0 })

      dismissToast(id2)

      expect(toasts.value).toHaveLength(2)
      expect(toasts.value[0].message).toBe('First')
      expect(toasts.value[1].message).toBe('Third')
    })
  })

  describe('multiple toasts', () => {
    it('should support multiple simultaneous toasts', () => {
      const { toasts } = useToast()

      showToast('First', { duration: 0 })
      showToast('Second', { duration: 0 })
      showToast('Third', { duration: 0 })

      expect(toasts.value).toHaveLength(3)
    })

    it('should dismiss toasts independently', () => {
      const { toasts } = useToast()

      showToast('Fast', { duration: 1000 })
      showToast('Slow', { duration: 3000 })

      vi.advanceTimersByTime(1000)
      expect(toasts.value).toHaveLength(1)
      expect(toasts.value[0].message).toBe('Slow')

      vi.advanceTimersByTime(2000)
      expect(toasts.value).toHaveLength(0)
    })
  })
})
