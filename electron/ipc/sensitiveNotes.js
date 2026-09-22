/**
 * IPC handlers for sensitive-notes encryption (docs/architecture/sensitive-notes.md).
 *
 * The keys live in settings rows inside the (already unlocked) database: the
 * public key in the open, the private key wrapped under the recovery password
 * and, while the Touch ID gate is on, by the machine keychain. The private key
 * itself is held only in the session in the main process. Enabling requires
 * database encryption to be on, since it reuses the recovery password.
 */

const {
  SENSITIVE_STATUS,
  SENSITIVE_ENABLE,
  SENSITIVE_UNLOCK,
  SENSITIVE_UNLOCK_TOUCH_ID,
  SENSITIVE_LOCK,
  SENSITIVE_DISABLE,
} = require('../ipcChannels')

/** Settings rows, by the session key they hold. */
const SENSITIVE_KEYS = {
  publicKey: 'sensitiveNotesPublicKey',
  passwordSlot: 'sensitiveNotesPrivateKeyPassword',
  keychainSlot: 'sensitiveNotesPrivateKeyKeychain',
  // The old symmetric key, from before the key pair; present only until migrated.
  legacyWrappedKey: 'sensitiveNotesWrappedKey',
}
const SENSITIVE_SETTINGS_KEYS = Object.values(SENSITIVE_KEYS)

function readKeys(db) {
  const keys = {}
  for (const [name, key] of Object.entries(SENSITIVE_KEYS)) {
    const stored = db.getSetting(key)
    keys[name] = stored ? Buffer.from(stored, 'base64') : null
  }
  return keys
}

function writeSlots(db, { publicKey, passwordSlot, keychainSlot }) {
  db.setSetting(SENSITIVE_KEYS.publicKey, publicKey.toString('base64'))
  db.setSetting(SENSITIVE_KEYS.passwordSlot, passwordSlot.toString('base64'))
  writeKeychainSlot(db, keychainSlot)
}

function writeKeychainSlot(db, keychainSlot) {
  if (keychainSlot) db.setSetting(SENSITIVE_KEYS.keychainSlot, keychainSlot.toString('base64'))
  else db.deleteSetting(SENSITIVE_KEYS.keychainSlot)
}

/**
 * Forget the keychain slot, when the Touch ID gate is turned off. Needs no key:
 * the slot is only deleted.
 * @param {Object} db - The database.
 * @param {Object|null} session - The current session, if any.
 */
function dropSensitiveKeychainSlot(db, session) {
  db.deleteSetting(SENSITIVE_KEYS.keychainSlot)
  session?.dropKeychainSlot()
}

/**
 * Register the sensitive-notes handlers.
 *
 * @param {Object} ipcMain - Electron ipcMain.
 * @param {Object} ctx
 * @param {Function} ctx.getDb - Current database instance.
 * @param {Function} ctx.getSession - Current sensitive session, or null.
 * @param {Function} ctx.setSession - Install a session on the db and ctx.
 * @param {Function} ctx.createSession - (keys) => session, wired to onLock.
 * @param {Function} ctx.isDatabaseEncrypted - Whether db encryption is on.
 * @param {Function} ctx.verifyRecoveryPassword - Throws unless the password
 *   unwraps the current database file. Enabling wraps the private key under
 *   this password, so a typo would produce a key nobody can unwrap.
 * @param {Function|null} ctx.keychainWrap - Wraps a key by the keychain, or null without one.
 * @param {Function} ctx.keychainUnwrap - Unwraps a keychain blob; throws on a foreign one.
 * @param {Function} ctx.isTouchIdGateOn - Whether Require Touch ID at startup is on.
 * @param {Function} ctx.touchIdAvailable - Whether this machine can prompt Touch ID.
 * @param {Function} ctx.promptTouchId - Async; resolves when the prompt succeeds, throws otherwise.
 */
function registerSensitiveNotesHandlers(ipcMain, ctx) {
  const {
    getDb,
    getSession,
    setSession,
    createSession,
    isDatabaseEncrypted,
    verifyRecoveryPassword,
    keychainWrap,
    keychainUnwrap,
    isTouchIdGateOn,
    touchIdAvailable,
    promptTouchId,
  } = ctx

  /** The keychain wrap to use now: only while the gate is on and a keychain exists. */
  function gatedKeychainWrap() {
    return isTouchIdGateOn() && keychainWrap ? keychainWrap : null
  }

  ipcMain.handle(SENSITIVE_STATUS, () => {
    const session = getSession()
    return {
      available: isDatabaseEncrypted(),
      enabled: Boolean(session && session.isEnabled()),
      unlocked: Boolean(session && session.isUnlocked()),
      lockable: Boolean(session && session.canEncrypt()),
      touchId: Boolean(session && session.hasKeychainSlot() && touchIdAvailable()),
    }
  })

  ipcMain.handle(SENSITIVE_ENABLE, (_event, password) => {
    const db = getDb()
    if (!db) return { success: false, error: 'Database is locked' }
    if (!isDatabaseEncrypted()) {
      return { success: false, error: 'Enable database encryption first' }
    }
    if (getSession()?.isEnabled()) {
      return { success: false, error: 'Sensitive notes are already enabled' }
    }
    try {
      // The private key's password slot can only ever be unwrapped with this
      // password. Check it against the database file first: an unverified typo
      // here is unrecoverable once the keychain is gone.
      verifyRecoveryPassword(password)
      const session = createSession({})
      const slots = session.enable(password, { keychainWrap: gatedKeychainWrap() })
      writeSlots(db, slots)
      setSession(session)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SENSITIVE_UNLOCK, (_event, password) => {
    const db = getDb()
    const session = getSession()
    if (!session?.isEnabled()) return { success: false, error: 'Sensitive notes are not enabled' }
    if (!session.unlock(password)) return { success: false, error: 'Wrong password' }
    try {
      if (session.needsMigration()) {
        // Old notes are re-sealed under the new key pair in one batch with the
        // keys that make them readable, so a failure leaves the old key and
        // the old notes exactly as they were.
        db._batch(() => {
          const slots = session.createKeyPair(password, { keychainWrap: gatedKeychainWrap() })
          db.migrateLegacySensitiveNotes()
          writeSlots(db, slots)
          db.deleteSetting(SENSITIVE_KEYS.legacyWrappedKey)
        })
        session.finishMigration()
      } else {
        // A password unlock is the recovery path after a lost keychain: bring
        // the slot back, or drop it while the gate is off.
        writeKeychainSlot(db, session.refreshKeychainSlot(gatedKeychainWrap()))
      }
      return { success: true }
    } catch (e) {
      session.lock()
      setSession(createSession(readKeys(db)))
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SENSITIVE_UNLOCK_TOUCH_ID, async () => {
    const session = getSession()
    if (!session?.isEnabled()) return { success: false, error: 'Sensitive notes are not enabled' }
    if (!session.hasKeychainSlot() || !touchIdAvailable()) {
      return { success: false, error: 'Touch ID is not set up for sensitive notes' }
    }
    try {
      await promptTouchId()
    } catch {
      return { success: false, error: 'Touch ID was not confirmed' }
    }
    return session.unlockWithKeychain(keychainUnwrap)
      ? { success: true }
      : { success: false, error: 'The keychain slot could not be opened; use the recovery password' }
  })

  ipcMain.handle(SENSITIVE_LOCK, () => {
    getSession()?.lock()
    return { success: true }
  })

  ipcMain.handle(SENSITIVE_DISABLE, () => {
    const db = getDb()
    const session = getSession()
    if (!session?.isEnabled()) return { success: false, error: 'Sensitive notes are not enabled' }
    // The session must already be unlocked, so its private key can decrypt
    // every note back to plaintext. The unlock is the authentication.
    if (!session.isUnlocked()) return { success: false, error: 'Unlock sensitive notes first' }
    try {
      // Decrypt every note - including trashed ones - and drop the keys in one
      // batch, so a key can never be destroyed while ciphertext remains.
      db._batch(() => {
        db.disableSensitiveNotes()
        for (const key of SENSITIVE_SETTINGS_KEYS) db.deleteSetting(key)
      })
      session.lock()
      setSession(null)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = {
  registerSensitiveNotesHandlers,
  readSensitiveKeys: readKeys,
  dropSensitiveKeychainSlot,
  SENSITIVE_KEYS,
  SENSITIVE_SETTINGS_KEYS,
}
