/**
 * IPC handlers for sensitive-notes encryption (docs/architecture/sensitive-notes.md).
 *
 * The wrapped sensitive-notes key lives in a settings row inside the (already
 * unlocked) database. The key itself is held only in the session in the main
 * process. Enabling requires database encryption to be on, since it reuses the
 * recovery password.
 */

const {
  SENSITIVE_STATUS,
  SENSITIVE_ENABLE,
  SENSITIVE_UNLOCK,
  SENSITIVE_LOCK,
  SENSITIVE_DISABLE,
} = require('../ipcChannels')

const SETTINGS_KEY = 'sensitiveNotesWrappedKey'

/**
 * Register the sensitive-notes handlers.
 *
 * @param {Object} ipcMain - Electron ipcMain.
 * @param {Object} ctx
 * @param {Function} ctx.getDb - Current database instance.
 * @param {Function} ctx.getSession - Current sensitive session, or null.
 * @param {Function} ctx.setSession - Install a session on the db and ctx.
 * @param {Function} ctx.createSession - (wrappedKey) => session, wired to onLock.
 * @param {Function} ctx.isDatabaseEncrypted - Whether db encryption is on.
 * @param {Function} ctx.verifyRecoveryPassword - Throws unless the password
 *   unwraps the current database file. Enabling wraps the sensitive-notes key
 *   under this password, so a typo would produce a key nobody can unwrap.
 */
function registerSensitiveNotesHandlers(ipcMain, ctx) {
  const { getDb, getSession, setSession, createSession, isDatabaseEncrypted, verifyRecoveryPassword } = ctx

  ipcMain.handle(SENSITIVE_STATUS, () => {
    const session = getSession()
    return {
      available: isDatabaseEncrypted(),
      enabled: Boolean(session && session.isEnabled()),
      unlocked: Boolean(session && session.isUnlocked()),
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
      // The sensitive-notes key is wrapped under the recovery password and can
      // only ever be unwrapped with it. Check it against the database file
      // first: an unverified typo here is unrecoverable, because the wrong
      // password is then the only one that opens the notes.
      verifyRecoveryPassword(password)
      const session = createSession(null)
      const wrapped = session.enable(password)
      db.setSetting(SETTINGS_KEY, wrapped.toString('base64'))
      setSession(session)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SENSITIVE_UNLOCK, (_event, password) => {
    const session = getSession()
    if (!session?.isEnabled()) return { success: false, error: 'Sensitive notes are not enabled' }
    return session.unlock(password) ? { success: true } : { success: false, error: 'Wrong password' }
  })

  ipcMain.handle(SENSITIVE_LOCK, () => {
    getSession()?.lock()
    return { success: true }
  })

  ipcMain.handle(SENSITIVE_DISABLE, () => {
    const db = getDb()
    const session = getSession()
    if (!session?.isEnabled()) return { success: false, error: 'Sensitive notes are not enabled' }
    // The session must already be unlocked, so its key can decrypt every note
    // back to plaintext. The unlock is the authentication; no separate password.
    if (!session.isUnlocked()) return { success: false, error: 'Unlock sensitive notes first' }
    try {
      // Decrypt every note - including trashed ones - and drop the key in one
      // batch, so the key can never be destroyed while ciphertext remains.
      // Both the notes and the display-masking flag revert to plain.
      db._batch(() => {
        db.disableSensitiveNotes()
        db.deleteSetting(SETTINGS_KEY)
      })
      session.lock()
      setSession(null)
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })
}

module.exports = { registerSensitiveNotesHandlers, SENSITIVE_SETTINGS_KEY: SETTINGS_KEY }
