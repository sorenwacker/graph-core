import { ref, readonly } from 'vue'
import { api } from '../services/api'

/**
 * Renderer-side sensitive-notes session state
 * (docs/architecture/sensitive-notes.md). The key never reaches the renderer;
 * this tracks the main-process session state and drives the unlock and lock
 * actions. A single shared instance keeps every view in step.
 */

/** What the status is before it is known, and whenever it cannot be read. */
const UNKNOWN_STATUS = { available: false, enabled: false, unlocked: false }

const status = ref({ ...UNKNOWN_STATUS })
let unsubscribe = null
let loaded = false

async function refresh() {
  // Consumers read `status.value.enabled` directly, so a null or partial
  // response must not reach them: it would throw in every one of them and take
  // down renders that have nothing to do with sensitive notes.
  const fetched = await api.sensitiveStatus()
  status.value = fetched ? { ...UNKNOWN_STATUS, ...fetched } : { ...UNKNOWN_STATUS }
}

async function unlock(password) {
  const result = await api.sensitiveUnlock(password)
  if (result.success) await refresh()
  return result
}

async function lock() {
  await api.sensitiveLock()
  await refresh()
}

async function enable(password) {
  const result = await api.sensitiveEnable(password)
  if (result.success) await refresh()
  return result
}

async function disable(password) {
  const result = await api.sensitiveDisable(password)
  if (result.success) await refresh()
  return result
}

/** Whether a stored notes value is locked sensitive ciphertext. */
function isLockedNote(notes) {
  return typeof notes === 'string' && notes.startsWith('SNENC1:')
}

export function useSensitiveNotes() {
  // The main process relocks on idle and tells the renderer; reflect it.
  if (!unsubscribe) {
    unsubscribe = api.onSensitiveLocked(() => refresh())
  }
  // Load the real status the first time anyone asks. Without this the settings
  // panel was the only thing that ever fetched it, so every other consumer -
  // and every guard written against it - saw the default until that panel had
  // been opened. A failure here leaves the safe default in place.
  if (!loaded) {
    loaded = true
    refresh().catch(() => {})
  }
  return {
    status: readonly(status),
    refresh,
    enable,
    unlock,
    lock,
    disable,
    isLockedNote,
  }
}
