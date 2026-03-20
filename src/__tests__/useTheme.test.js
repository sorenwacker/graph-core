import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Mock localStorage before importing useTheme
const localStorageMock = {
  store: {},
  getItem: vi.fn((key) => localStorageMock.store[key] || null),
  setItem: vi.fn((key, value) => { localStorageMock.store[key] = value }),
  removeItem: vi.fn((key) => { delete localStorageMock.store[key] }),
  clear: vi.fn(() => { localStorageMock.store = {} })
}

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true
})

// Mock matchMedia
const mockMatchMediaListeners = []
const mockMatchMedia = vi.fn().mockImplementation(query => ({
  matches: query === '(prefers-color-scheme: dark)',
  media: query,
  addEventListener: vi.fn((event, listener) => mockMatchMediaListeners.push(listener)),
  removeEventListener: vi.fn()
}))

Object.defineProperty(window, 'matchMedia', {
  value: mockMatchMedia,
  writable: true
})

// Now import the module
import { useTheme } from '../composables/useTheme.js'

describe('useTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
    document.documentElement.removeAttribute('data-theme')
    mockMatchMediaListeners.length = 0
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  describe('setTheme', () => {
    it('should set theme to dark', () => {
      const { setTheme, currentTheme, resolvedTheme } = useTheme()

      setTheme('dark')

      expect(currentTheme.value).toBe('dark')
      expect(resolvedTheme.value).toBe('dark')
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    })

    it('should set theme to light', () => {
      const { setTheme, currentTheme, resolvedTheme } = useTheme()

      setTheme('light')

      expect(currentTheme.value).toBe('light')
      expect(resolvedTheme.value).toBe('light')
      expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    })

    it('should persist theme to localStorage', () => {
      const { setTheme } = useTheme()

      setTheme('light')

      expect(localStorageMock.setItem).toHaveBeenCalledWith('graphcore-theme', 'light')
    })

    it('should fall back to system for invalid theme', () => {
      const { setTheme, currentTheme } = useTheme()

      setTheme('invalid')

      expect(currentTheme.value).toBe('system')
    })
  })

  describe('toggleTheme', () => {
    it('should toggle from dark to light', () => {
      const { setTheme, toggleTheme, resolvedTheme } = useTheme()

      setTheme('dark')
      toggleTheme()

      expect(resolvedTheme.value).toBe('light')
    })

    it('should toggle from light to dark', () => {
      const { setTheme, toggleTheme, resolvedTheme } = useTheme()

      setTheme('light')
      toggleTheme()

      expect(resolvedTheme.value).toBe('dark')
    })
  })

  describe('cycleTheme', () => {
    it('should cycle through themes', () => {
      const { setTheme, cycleTheme, currentTheme } = useTheme()

      // Start at light
      setTheme('light')
      expect(currentTheme.value).toBe('light')

      // Cycle to dark
      cycleTheme()
      expect(currentTheme.value).toBe('dark')

      // Cycle to system
      cycleTheme()
      expect(currentTheme.value).toBe('system')

      // Cycle back to light
      cycleTheme()
      expect(currentTheme.value).toBe('light')
    })
  })

  describe('utility functions', () => {
    it('isDark should return true when theme is dark', () => {
      const { setTheme, isDark } = useTheme()

      setTheme('dark')

      expect(isDark()).toBe(true)
    })

    it('isLight should return true when theme is light', () => {
      const { setTheme, isLight } = useTheme()

      setTheme('light')

      expect(isLight()).toBe(true)
    })

    it('isSystemPreference should return true when using system', () => {
      const { setTheme, isSystemPreference } = useTheme()

      setTheme('system')

      expect(isSystemPreference()).toBe(true)
    })
  })

  describe('themes constant', () => {
    it('should expose available themes', () => {
      const { themes } = useTheme()
      expect(themes).toEqual(['light', 'dark', 'system'])
    })
  })
})
