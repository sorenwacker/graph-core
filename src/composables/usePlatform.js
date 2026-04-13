import { computed } from 'vue'

/**
 * Detect the current operating system platform.
 * Uses navigator.userAgentData.platform when available, falls back to navigator.platform.
 * @returns {string} Platform identifier (e.g., 'macOS', 'Windows', 'Linux')
 */
function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown'

  // Modern API (Chromium-based browsers)
  if (navigator.userAgentData?.platform) {
    return navigator.userAgentData.platform
  }

  // Fallback to legacy navigator.platform
  const platform = navigator.platform || ''
  if (platform.startsWith('Mac')) return 'macOS'
  if (platform.startsWith('Win')) return 'Windows'
  if (platform.includes('Linux')) return 'Linux'
  return platform || 'unknown'
}

const platform = detectPlatform()

/**
 * Composable for platform-specific keyboard shortcut formatting.
 * Provides OS detection and methods to format shortcuts appropriately.
 *
 * @returns {Object} Platform utilities
 */
export function usePlatform() {
  const isMac = computed(() => platform === 'macOS' || platform.startsWith('Mac'))
  const isWindows = computed(() => platform === 'Windows' || platform.startsWith('Win'))
  const isLinux = computed(() => platform === 'Linux' || platform.includes('Linux'))

  /**
   * Get the platform-appropriate modifier key symbol/text.
   * Returns ⌘ on Mac, Ctrl elsewhere.
   */
  const modifierKey = computed(() => (isMac.value ? '⌘' : 'Ctrl'))

  /**
   * Get the platform-appropriate option/alt key symbol/text.
   * Returns ⌥ on Mac, Alt elsewhere.
   */
  const optionKey = computed(() => (isMac.value ? '⌥' : 'Alt'))

  /**
   * Get the platform-appropriate shift key symbol/text.
   * Returns ⇧ on Mac, Shift elsewhere.
   */
  const shiftKey = computed(() => (isMac.value ? '⇧' : 'Shift'))

  /**
   * Get the platform-appropriate delete/backspace key symbol/text.
   * Returns ⌫ on Mac, Backspace elsewhere.
   */
  const deleteKey = computed(() => (isMac.value ? '⌫' : 'Backspace'))

  /**
   * Format a keyboard shortcut for the current platform.
   * Accepts an array of key names and returns a formatted string.
   *
   * Key name mappings:
   * - 'Cmd' or 'Meta' -> ⌘ on Mac, Ctrl elsewhere
   * - 'Opt' or 'Alt' -> ⌥ on Mac, Alt elsewhere
   * - 'Shift' -> ⇧ on Mac, Shift elsewhere
   * - 'Ctrl' -> ⌃ on Mac, Ctrl elsewhere (actual Control key)
   * - 'Delete' or 'Backspace' -> ⌫ on Mac, Backspace elsewhere
   * - 'Enter' or 'Return' -> ↵ on Mac, Enter elsewhere
   * - Arrow keys -> ↑↓←→
   * - Other keys -> passed through as-is
   *
   * @param {string[]} keys - Array of key names (e.g., ['Cmd', 'K'])
   * @param {Object} options - Formatting options
   * @param {string} options.separator - Separator between keys (default: '' on Mac, '+' elsewhere)
   * @returns {string} Formatted shortcut string (e.g., '⌘K' or 'Ctrl+K')
   */
  function formatShortcut(keys, options = {}) {
    const mac = isMac.value
    const separator = options.separator ?? (mac ? '' : '+')

    const mapped = keys.map(key => {
      const k = key.toLowerCase()
      switch (k) {
        case 'cmd':
        case 'meta':
        case 'command':
          return mac ? '⌘' : 'Ctrl'
        case 'opt':
        case 'alt':
        case 'option':
          return mac ? '⌥' : 'Alt'
        case 'shift':
          return mac ? '⇧' : 'Shift'
        case 'ctrl':
        case 'control':
          return mac ? '⌃' : 'Ctrl'
        case 'delete':
        case 'backspace':
          return mac ? '⌫' : 'Backspace'
        case 'enter':
        case 'return':
          return mac ? '↵' : 'Enter'
        case 'up':
        case 'arrowup':
          return '↑'
        case 'down':
        case 'arrowdown':
          return '↓'
        case 'left':
        case 'arrowleft':
          return '←'
        case 'right':
        case 'arrowright':
          return '→'
        case 'tab':
          return mac ? '⇥' : 'Tab'
        case 'escape':
        case 'esc':
          return mac ? '⎋' : 'Esc'
        case 'space':
          return mac ? '␣' : 'Space'
        default:
          // Capitalize single letters, pass through others
          return key.length === 1 ? key.toUpperCase() : key
      }
    })

    return mapped.join(separator)
  }

  return {
    // Platform detection
    isMac,
    isWindows,
    isLinux,
    platform,

    // Key symbols
    modifierKey,
    optionKey,
    shiftKey,
    deleteKey,

    // Formatting
    formatShortcut,
  }
}
