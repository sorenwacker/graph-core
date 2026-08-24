/**
 * IPC handlers for at-rest encryption (docs/architecture/encryption.md).
 *
 * The database may not exist yet when these run: while the file is locked,
 * these are the only database-touching handlers registered. Unlock constructs
 * the database and hands it back to main through ctx.finishUnlock.
 */

const fs = require('fs')
const path = require('path')
const {
  SECURITY_STATUS,
  SECURITY_UNLOCK,
  SECURITY_ENABLE,
  SECURITY_DISABLE,
  SECURITY_SET_TOUCH_ID,
} = require('../ipcChannels')
const { isEncrypted } = require('../database/encryption')

/** Read the security config that lives outside the (possibly locked) database. */
function readSecurityConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  } catch {
    return { touchIdGate: false }
  }
}

function writeSecurityConfig(configPath, config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
}

/**
 * Register the security handlers.
 *
 * @param {Object} ipcMain - Electron ipcMain.
 * @param {Object} ctx
 * @param {Function} ctx.getDb - Current database instance or null while locked.
 * @param {Function} ctx.finishUnlock - Async (key, slots) => Database; constructs
 *   the database and registers the remaining handlers.
 * @param {string} ctx.dbPath - Path to the database file.
 * @param {string} ctx.configPath - Path to security.json.
 * @param {Object} ctx.keyManager - createKeyManager instance.
 * @param {Object} ctx.systemPreferences - Electron systemPreferences (or null).
 */
function registerSecurityHandlers(ipcMain, ctx) {
  const { getDb, finishUnlock, dbPath, configPath, keyManager, systemPreferences } = ctx

  function touchIdAvailable() {
    return process.platform === 'darwin' && typeof systemPreferences?.canPromptTouchID === 'function'
      ? systemPreferences.canPromptTouchID()
      : false
  }

  ipcMain.handle(SECURITY_STATUS, () => {
    const db = getDb()
    const config = readSecurityConfig(configPath)
    let state
    if (!db) state = 'locked'
    else if (db.encryptionKey) state = 'encrypted'
    else state = 'plaintext'
    return {
      state,
      keychainAvailable: keyManager.keychainAvailable(),
      touchIdAvailable: touchIdAvailable(),
      touchIdEnabled: Boolean(config.touchIdGate),
    }
  })

  ipcMain.handle(SECURITY_UNLOCK, async (_event, password) => {
    if (getDb()) return { success: true }
    const fileBuffer = fs.readFileSync(dbPath)
    try {
      const { key, slots } = keyManager.unlockWithPassword(fileBuffer, password)
      const db = await finishUnlock(key, slots)
      // Persist the re-wrapped keychain slot so the next boot is silent.
      db._save()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SECURITY_ENABLE, (_event, password) => {
    const db = getDb()
    if (!db) return { success: false, error: 'Database is locked' }
    if (db.encryptionKey) return { success: false, error: 'Encryption is already enabled' }
    try {
      const { key, slots } = keyManager.enable(password)
      db.encryptionKey = key
      db.encryptionSlots = slots
      db._save()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SECURITY_DISABLE, (_event, password) => {
    const db = getDb()
    if (!db?.encryptionKey) return { success: false, error: 'Encryption is not enabled' }
    try {
      // The password authorizes the change: it must unwrap the current file.
      const fileBuffer = fs.readFileSync(dbPath)
      if (isEncrypted(fileBuffer)) keyManager.unlockWithPassword(fileBuffer, password)
      db.encryptionKey = null
      db.encryptionSlots = []
      db._save()
      return { success: true }
    } catch (e) {
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle(SECURITY_SET_TOUCH_ID, (_event, enabled) => {
    const config = readSecurityConfig(configPath)
    config.touchIdGate = Boolean(enabled)
    writeSecurityConfig(configPath, config)
    return { success: true }
  })
}

module.exports = { registerSecurityHandlers, readSecurityConfig }
