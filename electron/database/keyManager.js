/**
 * Key manager: enablement and unlock for at-rest encryption
 * (docs/architecture/encryption.md, "Unlock flow").
 *
 * safeStorage is injected so every path is testable without Electron. The
 * keychain slot stores the database key base64-encoded through
 * safeStorage.encryptString; the blob is machine-bound and treated as opaque.
 */

const {
  generateDatabaseKey,
  wrapKeyWithPassword,
  unwrapKeyWithPassword,
  readSlots,
  SLOT_TYPE_KEYCHAIN,
  SLOT_TYPE_PASSWORD,
} = require('./encryption')

// safeStorage backends that "encrypt" with a public, hardcoded key. On Linux
// with no keyring service, Chromium falls back to one of these, yet
// isEncryptionAvailable() still returns true - so a keychain slot written here
// would be a plaintext-equivalent copy of the database key inside the portable
// file. Treat these backends as no keychain.
const INSECURE_BACKENDS = new Set(['basic_text'])

/**
 * Create a key manager bound to a safeStorage implementation.
 *
 * @param {Object} deps
 * @param {Object} deps.safeStorage - Electron safeStorage or a test double.
 * @returns {Object} { enable, unlockWithKeychain, unlockWithPassword, keychainAvailable }
 */
function createKeyManager({ safeStorage }) {
  function keychainAvailable() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return false
      const backend = safeStorage.getSelectedStorageBackend?.()
      return !INSECURE_BACKENDS.has(backend)
    } catch {
      return false
    }
  }

  /** Wrap a key into a keychain slot blob, or null when unavailable. */
  function wrapKeyWithKeychain(key) {
    if (!keychainAvailable()) return null
    return Buffer.from(safeStorage.encryptString(key.toString('base64')))
  }

  /**
   * Enable encryption: a fresh key wrapped into the password slot and, when
   * the keychain is available, a keychain slot for silent daily unlocks.
   *
   * @param {string} password - The recovery password.
   * @returns {{key: Buffer, slots: Array<{type: number, blob: Buffer}>}}
   */
  function enable(password) {
    if (!password || !password.trim()) {
      throw new Error('A recovery password is required to enable encryption')
    }
    const key = generateDatabaseKey()
    const slots = []
    const keychainBlob = wrapKeyWithKeychain(key)
    if (keychainBlob) slots.push({ type: SLOT_TYPE_KEYCHAIN, blob: keychainBlob })
    slots.push({ type: SLOT_TYPE_PASSWORD, blob: wrapKeyWithPassword(key, password) })
    return { key, slots }
  }

  /**
   * Try the silent unlock: unwrap the keychain slot embedded in the file.
   *
   * @param {Buffer} fileBuffer - The encrypted database file.
   * @returns {Buffer|null} The key, or null when this machine cannot unwrap.
   */
  function unlockWithKeychain(fileBuffer) {
    const slot = readSlots(fileBuffer).find(s => s.type === SLOT_TYPE_KEYCHAIN)
    if (!slot || !keychainAvailable()) return null
    try {
      return Buffer.from(safeStorage.decryptString(Buffer.from(slot.blob)), 'base64')
    } catch {
      // A blob from another machine or a reset keychain: fall back to the
      // password path rather than failing the boot.
      return null
    }
  }

  /**
   * Unlock with the recovery password and re-wrap the key into this machine's
   * keychain, so the next boot is silent again.
   *
   * @param {Buffer} fileBuffer - The encrypted database file.
   * @param {string} password - The recovery password.
   * @returns {{key: Buffer, slots: Array<{type: number, blob: Buffer}>}}
   * @throws {Error} When the password is wrong.
   */
  function unlockWithPassword(fileBuffer, password) {
    const passwordSlot = readSlots(fileBuffer).find(s => s.type === SLOT_TYPE_PASSWORD)
    if (!passwordSlot) {
      throw new Error('This file has no password slot')
    }
    const key = unwrapKeyWithPassword(Buffer.from(passwordSlot.blob), password)
    const slots = []
    const keychainBlob = wrapKeyWithKeychain(key)
    if (keychainBlob) slots.push({ type: SLOT_TYPE_KEYCHAIN, blob: keychainBlob })
    slots.push({ type: SLOT_TYPE_PASSWORD, blob: Buffer.from(passwordSlot.blob) })
    return { key, slots }
  }

  return { enable, unlockWithKeychain, unlockWithPassword, keychainAvailable }
}

module.exports = { createKeyManager }
