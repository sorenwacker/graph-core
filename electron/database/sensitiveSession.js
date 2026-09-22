/**
 * Sensitive-notes session (docs/architecture/sensitive-notes.md).
 *
 * Holds the public key in the open, so a note can be sealed in any state, and
 * the private key in memory only for the length of an unlocked session. The
 * renderer never receives either key; it receives note text through
 * getNodeNotes while the session is unlocked. An idle timer relocks it.
 *
 * A database from before the key pair carries the old symmetric key, wrapped
 * under the password. Unlocking with the password opens that key too, so the
 * old notes can be read and re-sealed once (see "Notes written before the key
 * pair" in the docs).
 */

const {
  generateKeyPair,
  sealNote,
  openNote,
  decryptLegacyNote,
  isEncryptedNote,
  isLegacyEncryptedNote,
  wrapPrivateKey,
  unwrapPrivateKey,
} = require('./sensitiveNotes')

const DEFAULT_IDLE_MS = 5 * 60 * 1000

/**
 * @typedef {Object} StoredKeys
 * @property {Buffer|null} [publicKey] - The X25519 public key, raw.
 * @property {Buffer|null} [passwordSlot] - The private key wrapped under the recovery password.
 * @property {Buffer|null} [keychainSlot] - The private key wrapped by the machine keychain.
 * @property {Buffer|null} [legacyWrappedKey] - The old symmetric key, wrapped under the password.
 */

/**
 * Create a sensitive-notes session.
 *
 * @param {Object} [options]
 * @param {StoredKeys} [options.keys] - The stored keys, if the feature is enabled.
 * @param {number} [options.idleMs] - Idle relock timeout.
 * @param {Function} [options.onLock] - Called when the session relocks.
 * @returns {Object} The session.
 */
function createSensitiveSession({ keys = {}, idleMs = DEFAULT_IDLE_MS, onLock } = {}) {
  let publicKey = keys.publicKey || null
  let passwordSlot = keys.passwordSlot || null
  let keychainSlot = keys.keychainSlot || null
  let legacyWrappedKey = keys.legacyWrappedKey || null
  let privateKey = null
  let legacyKey = null
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
    privateKey = null
    legacyKey = null
    clearTimer()
    if (onLock) onLock()
  }

  function isEnabled() {
    return publicKey !== null || legacyWrappedKey !== null
  }

  function isUnlocked() {
    return privateKey !== null || legacyKey !== null
  }

  /** Whether a note can be sealed: the key pair exists. */
  function canEncrypt() {
    return publicKey !== null
  }

  function hasKeychainSlot() {
    return keychainSlot !== null
  }

  /** Whether old notes still wait to be re-sealed under the key pair. */
  function needsMigration() {
    return legacyWrappedKey !== null
  }

  /** Reset the idle timer on activity. */
  function touch() {
    if (isUnlocked()) armTimer()
  }

  /**
   * Wrap the private key into the slots, for the caller to persist.
   * @param {string} password - The recovery password.
   * @param {Function|null} keychainWrap - Wraps a key by the keychain, or null.
   * @returns {{publicKey: Buffer, passwordSlot: Buffer, keychainSlot: Buffer|null}} The keys to store.
   */
  function slots(password, keychainWrap) {
    passwordSlot = wrapPrivateKey(privateKey, password)
    keychainSlot = keychainWrap ? keychainWrap(privateKey) : null
    return { publicKey, passwordSlot, keychainSlot }
  }

  /**
   * Enable sensitive notes: generate the key pair, wrap the private key, and
   * leave the session unlocked. Returns the keys for the caller to persist.
   * @param {string} password - The recovery password.
   * @param {Object} [options]
   * @param {Function|null} [options.keychainWrap] - Wraps a key by the keychain, when the Touch ID gate is on.
   */
  function enable(password, { keychainWrap = null } = {}) {
    const pair = generateKeyPair()
    publicKey = pair.publicKey
    privateKey = pair.privateKey
    armTimer()
    return slots(password, keychainWrap)
  }

  /**
   * Generate the key pair for a database that has only the old symmetric key.
   * Requires the session to be unlocked with the password, since the private
   * key is wrapped under it. The old key stays until finishMigration.
   * @param {string} password - The recovery password that just unlocked the session.
   * @param {Object} [options]
   * @param {Function|null} [options.keychainWrap] - Wraps a key by the keychain.
   */
  function createKeyPair(password, { keychainWrap = null } = {}) {
    if (legacyKey === null) throw new Error('Sensitive notes are locked')
    const pair = generateKeyPair()
    publicKey = pair.publicKey
    privateKey = pair.privateKey
    return slots(password, keychainWrap)
  }

  /** Forget the old symmetric key once every old note is re-sealed. */
  function finishMigration() {
    legacyWrappedKey = null
    legacyKey = null
  }

  /** Unlock the session with the recovery password. */
  function unlock(password) {
    if (!isEnabled()) return false
    try {
      if (passwordSlot) privateKey = unwrapPrivateKey(passwordSlot, password)
      if (legacyWrappedKey) legacyKey = unwrapPrivateKey(legacyWrappedKey, password)
      armTimer()
      return true
    } catch {
      privateKey = null
      legacyKey = null
      return false
    }
  }

  /**
   * Unlock the session through the keychain slot. The caller gates this with
   * the Touch ID prompt; this only unwraps.
   * @param {Function} keychainUnwrap - Unwraps a keychain blob to the key.
   */
  function unlockWithKeychain(keychainUnwrap) {
    if (!keychainSlot || !keychainUnwrap) return false
    try {
      privateKey = keychainUnwrap(keychainSlot)
      armTimer()
      return true
    } catch {
      privateKey = null
      return false
    }
  }

  /**
   * Rewrite the keychain slot from the private key in memory, so a slot lost
   * with the keychain comes back after a password unlock. Requires an unlocked
   * session. Returns the new blob, or null with no keychain.
   * @param {Function|null} keychainWrap - Wraps a key by the keychain, or null.
   */
  function refreshKeychainSlot(keychainWrap) {
    if (!keychainWrap) {
      keychainSlot = null
      return null
    }
    if (privateKey === null) throw new Error('Sensitive notes are locked')
    keychainSlot = keychainWrap(privateKey)
    return keychainSlot
  }

  /** Forget the keychain slot, when the Touch ID gate is turned off. */
  function dropKeychainSlot() {
    keychainSlot = null
  }

  /** Seal note text for storage. Needs the key pair, not an unlocked session. */
  function encrypt(plaintext) {
    if (!canEncrypt()) throw new Error('Unlock sensitive notes first')
    return sealNote(plaintext, publicKey)
  }

  /**
   * Decrypt a stored notes value for reading. Plaintext values pass through.
   * A sealed value opens when unlocked, and is returned unchanged (as the
   * ciphertext marker) when locked, so the read path withholds it.
   *
   * A value that cannot be decrypted - written under a key that has since been
   * replaced, or corrupted - is also returned unchanged rather than thrown.
   * This runs on every node read, so throwing would take down every list query
   * that happens to include the note instead of degrading that one note to a
   * locked placeholder. Callers that must distinguish a real decryption from a
   * pass-through check the result with `isEncryptedNote`.
   */
  function decryptForRead(value) {
    if (!isEncryptedNote(value)) return value
    try {
      if (isLegacyEncryptedNote(value)) {
        if (legacyKey === null) return value
        touch()
        return decryptLegacyNote(value, legacyKey)
      }
      if (privateKey === null) return value
      touch()
      return openNote(value, privateKey)
    } catch {
      return value
    }
  }

  return {
    isEnabled,
    isUnlocked,
    canEncrypt,
    hasKeychainSlot,
    needsMigration,
    enable,
    createKeyPair,
    finishMigration,
    unlock,
    unlockWithKeychain,
    refreshKeychainSlot,
    dropKeychainSlot,
    lock,
    touch,
    encrypt,
    decryptForRead,
  }
}

module.exports = { createSensitiveSession }
