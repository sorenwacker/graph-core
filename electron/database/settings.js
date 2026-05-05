/**
 * Settings persistence operations.
 * @module database/settings
 */

/**
 * Create settings operations bound to database context.
 * @param {Object} ctx - Database context with db, _query, _run, _get, _save methods
 * @returns {Object} Settings operations
 */
function createSettingsOperations(ctx) {
  return {
    /**
     * Get a single setting value.
     * @param {string} key - Setting key
     * @returns {string|null} Setting value or null if not found
     */
    getSetting(key) {
      const row = ctx._get('SELECT value FROM settings WHERE key = ?', [key])
      return row ? row.value : null
    },

    /**
     * Get all settings as key-value object.
     * @returns {Object} All settings
     */
    getAllSettings() {
      const rows = ctx._query('SELECT key, value FROM settings')
      const settings = {}
      for (const row of rows) {
        settings[row.key] = row.value
      }
      return settings
    },

    /**
     * Set a setting value (upsert).
     * @param {string} key - Setting key
     * @param {string} value - Setting value (will be stringified if not string)
     * @returns {Object} Success status
     */
    setSetting(key, value) {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
      ctx._run(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, stringValue]
      )
      return { success: true, key, value: stringValue }
    },

    /**
     * Set multiple settings at once.
     * @param {Object} settings - Object with key-value pairs
     * @returns {Object} Success status with count
     */
    setSettings(settings) {
      let count = 0
      for (const [key, value] of Object.entries(settings)) {
        this.setSetting(key, value)
        count++
      }
      return { success: true, count }
    },

    /**
     * Delete a setting.
     * @param {string} key - Setting key
     * @returns {Object} Success status
     */
    deleteSetting(key) {
      ctx._run('DELETE FROM settings WHERE key = ?', [key])
      return { success: true }
    },

    /**
     * Clear all settings.
     * @returns {Object} Success status
     */
    clearSettings() {
      ctx._run('DELETE FROM settings')
      return { success: true }
    },
  }
}

module.exports = {
  createSettingsOperations,
}
