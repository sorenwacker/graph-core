/**
 * Sensitive-notes session (docs/architecture/sensitive-notes.md).
 *
 * Holds the sensitive-notes key in the main process for the length of an
 * unlocked session and clears it on relock. The renderer never receives the
 * key; it receives decrypted note text only while the session is unlocked, and
 * the stored ciphertext marker while locked. An idle timer relocks the session.
 */

const {
  generateSensitiveKey,
  encryptNote,
  decryptNote,
  isEncryptedNote,
  wrapSensitiveKey,
  unwrapSensitiveKey,
} = require('./sensitiveNotes')

const DEFAULT_IDLE_MS = 5 * 60 * 1000

/**
 * Create a sensitive-notes session.
 *
 * @param {Object} [options]
 * @param {Buffer|null} [options.wrappedKey] - The stored wrapped key, if the
 *   feature is already enabled. Absent means not enabled.
 * @param {number} [options.idleMs] - Idle relock timeout.
 * @param {Function} [options.onLock] - Called when the session relocks.
 * @returns {Object} The session.
 */
function createSensitiveSession({ wrappedKey = null, idleMs = DEFAULT_IDLE_MS, onLock } = {}) {
  let wrapped = wrappedKey
  let key = null
  let idleTimer = null

  function clearTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer)
      idleTimer = null
    }
  }

  function armTimer() {
    clearTimer()
    idleTimer = setTimeout(() => lock(), idleMs)
    // Do not keep the process alive for the relock timer.
    if (typeof idleTimer.unref === 'function') idleTimer.unref()
  }

  function lock() {
    key = null
    clearTimer()
    if (onLock) onLock()
  }

  function isEnabled() {
    return wrapped !== null
  }

  function isUnlocked() {
    return key !== null
  }

  /** Reset the idle timer on activity. */
  function touch() {
    if (isUnlocked()) armTimer()
  }

  /**
   * Enable sensitive notes: generate a key, wrap it under the password, and
   * leave the session unlocked. Returns the wrapped blob for the caller to
   * persist in settings.
   */
  function enable(password) {
    key = generateSensitiveKey()
    wrapped = wrapSensitiveKey(key, password)
    armTimer()
    return wrapped
  }

  /** Unlock the session with the recovery password. */
  function unlock(password) {
    if (!isEnabled()) return false
    try {
      key = unwrapSensitiveKey(wrapped, password)
      armTimer()
      return true
    } catch {
      key = null
      return false
    }
  }

  /** Encrypt note text for storage. Requires an unlocked session. */
  function encrypt(plaintext) {
    if (!isUnlocked()) throw new Error('Sensitive notes are locked')
    touch()
    return encryptNote(plaintext, key)
  }

  /**
   * Decrypt a stored notes value for reading. Plaintext values pass through.
   * A sensitive value decrypts when unlocked, and is returned unchanged (as the
   * ciphertext marker) when locked, so the renderer shows a locked placeholder.
   *
   * A value that cannot be decrypted - written under a key that has since been
   * replaced, or corrupted - is also returned unchanged rather than thrown.
   * This runs inside `_rowToNode`, so throwing would take down every list query
   * that happens to include the note instead of degrading that one note to a
   * locked placeholder. Callers that must distinguish a real decryption from a
   * pass-through check the result with `isEncryptedNote`.
   */
  function decryptForRead(value) {
    if (!isEncryptedNote(value)) return value
    if (!isUnlocked()) return value
    touch()
    try {
      return decryptNote(value, key)
    } catch {
      return value
    }
  }

  return {
    isEnabled,
    isUnlocked,
    enable,
    unlock,
    lock,
    touch,
    encrypt,
    decryptForRead,
  }
}

module.exports = { createSensitiveSession }
