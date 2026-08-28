import { ref, nextTick } from 'vue'

/**
 * A single in-app replacement for `window.prompt()`.
 *
 * Electron does not implement `window.prompt`: it returns undefined without
 * showing anything, so a feature built on it silently does nothing. The state
 * is module-level so any component can ask for a value while one dialog,
 * rendered once at the app root, does the asking.
 */

const promptState = ref({
  visible: false,
  title: '',
  placeholder: '',
  value: '',
})

let pendingResolve = null
const inputRef = ref(null)

/**
 * Ask the user for a value.
 *
 * @param {string} title - What is being asked for.
 * @param {string} [placeholder] - Placeholder for the input.
 * @returns {Promise<string|null>} The trimmed value, or null if cancelled or
 *   left empty.
 */
function showPrompt(title, placeholder = '') {
  // A second request would strand the first caller's promise for ever, so
  // resolve it as cancelled before taking over.
  if (pendingResolve) {
    pendingResolve(null)
    pendingResolve = null
  }

  return new Promise(resolve => {
    pendingResolve = resolve
    promptState.value = { visible: true, title, placeholder, value: '' }
    nextTick(() => inputRef.value?.focus())
  })
}

/** Accept the current value. Empty input resolves as null, like a cancel. */
function submitPrompt() {
  const value = promptState.value.value.trim()
  promptState.value.visible = false
  const resolve = pendingResolve
  pendingResolve = null
  resolve?.(value || null)
}

/** Dismiss without a value. */
function cancelPrompt() {
  promptState.value.visible = false
  const resolve = pendingResolve
  pendingResolve = null
  resolve?.(null)
}

/** Enter accepts, Escape dismisses. */
function handlePromptKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    submitPrompt()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelPrompt()
  }
}

export function usePrompt() {
  return {
    promptState,
    inputRef,
    showPrompt,
    submitPrompt,
    cancelPrompt,
    handlePromptKeydown,
  }
}
