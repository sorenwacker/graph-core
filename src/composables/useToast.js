import { ref } from 'vue'

/**
 * Simple toast notification system.
 * Shows temporary messages that auto-dismiss.
 */

const toasts = ref([])
let toastId = 0

/**
 * Show a toast notification.
 * @param {string} message - Message to display
 * @param {Object} options - Toast options
 * @param {number} options.duration - Duration in ms (default: 3000)
 * @param {string} options.type - Toast type: 'info' | 'success' | 'error' (default: 'info')
 */
export function showToast(message, { duration = 3000, type = 'info' } = {}) {
  const id = ++toastId
  const toast = { id, message, type }

  toasts.value.push(toast)

  if (duration > 0) {
    setTimeout(() => {
      dismissToast(id)
    }, duration)
  }

  return id
}

/**
 * Dismiss a toast by ID.
 * @param {number} id - Toast ID to dismiss
 */
export function dismissToast(id) {
  const index = toasts.value.findIndex(t => t.id === id)
  if (index !== -1) {
    toasts.value.splice(index, 1)
  }
}

/**
 * Composable for toast notifications.
 * @returns {Object} Toast state and methods
 */
export function useToast() {
  return {
    toasts,
    showToast,
    dismissToast
  }
}
