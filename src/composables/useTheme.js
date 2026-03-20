import { ref, watch, onMounted } from 'vue'

/**
 * Theme management composable
 *
 * Manages theme switching between light, dark, and system preference.
 * Persists user preference in localStorage.
 */

const STORAGE_KEY = 'graphcore-theme'
const THEMES = ['light', 'dark', 'system']

// Shared state across all component instances
const currentTheme = ref('system')
const resolvedTheme = ref('dark')

// Track if theme has been initialized
let initialized = false

/**
 * Get system color scheme preference
 */
function getSystemTheme() {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Apply theme to document
 */
function applyTheme(theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme
  resolvedTheme.value = resolved
  document.documentElement.setAttribute('data-theme', resolved)
}

/**
 * Initialize theme from localStorage or system preference
 */
function initTheme() {
  if (initialized) return

  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && THEMES.includes(stored)) {
    currentTheme.value = stored
  } else {
    currentTheme.value = 'system'
  }

  applyTheme(currentTheme.value)

  // Listen for system preference changes
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  mediaQuery.addEventListener('change', () => {
    if (currentTheme.value === 'system') {
      applyTheme('system')
    }
  })

  initialized = true
}

/**
 * Theme composable
 */
export function useTheme() {
  onMounted(() => {
    initTheme()
  })

  /**
   * Set the theme
   * @param {string} theme - 'light', 'dark', or 'system'
   */
  function setTheme(theme) {
    if (!THEMES.includes(theme)) {
      console.warn(`Invalid theme: ${theme}. Using 'system'.`)
      theme = 'system'
    }

    currentTheme.value = theme
    localStorage.setItem(STORAGE_KEY, theme)
    applyTheme(theme)
  }

  /**
   * Toggle between light and dark (skips system)
   */
  function toggleTheme() {
    const newTheme = resolvedTheme.value === 'dark' ? 'light' : 'dark'
    setTheme(newTheme)
  }

  /**
   * Cycle through all themes: light -> dark -> system -> light
   */
  function cycleTheme() {
    const currentIndex = THEMES.indexOf(currentTheme.value)
    const nextIndex = (currentIndex + 1) % THEMES.length
    setTheme(THEMES[nextIndex])
  }

  return {
    // Current user preference ('light', 'dark', or 'system')
    currentTheme,
    // Resolved theme after applying system preference ('light' or 'dark')
    resolvedTheme,
    // Available themes
    themes: THEMES,
    // Methods
    setTheme,
    toggleTheme,
    cycleTheme,
    // Utility
    isDark: () => resolvedTheme.value === 'dark',
    isLight: () => resolvedTheme.value === 'light',
    isSystemPreference: () => currentTheme.value === 'system'
  }
}

// Export for testing
export { initTheme as _initTheme }
