/**
 * Backup and restore operations.
 * @module database/backup
 */

const fs = require('fs')
const path = require('path')

/**
 * Create backup operations bound to database context.
 * @param {Object} ctx - Database context with db, dbPath, _query, _save methods
 * @returns {Object} Backup operations
 */
function createBackupOperations(ctx) {
  return {
    /**
     * Backup database to timestamped file.
     * @param {string} suffix - Optional suffix for backup filename
     * @returns {string} Path to backup file
     */
    backup(suffix = '') {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const backupPath = ctx.dbPath.replace('.db', `-backup-${timestamp}${suffix}.db`)
      const data = ctx.db.export()
      // sql.js export() resets per-connection pragmas; re-enable FK enforcement.
      ctx.db.run('PRAGMA foreign_keys = ON')
      // Through the same serialize choke point as _save: an encrypted database
      // with plaintext backups would defeat the encryption.
      fs.writeFileSync(backupPath, ctx._serialize(Buffer.from(data)))
      console.log(`Database backed up to: ${backupPath}`)
      return backupPath
    },

    /**
     * List available backups.
     * @returns {Array} Backup objects with path, name, created date
     */
    listBackups() {
      const dir = path.dirname(ctx.dbPath)
      const base = path.basename(ctx.dbPath, '.db')
      try {
        return fs
          .readdirSync(dir)
          .filter(f => f.startsWith(base + '-backup-') && f.endsWith('.db'))
          .map(f => ({
            path: path.join(dir, f),
            name: f,
            created: fs.statSync(path.join(dir, f)).mtime,
          }))
          .sort((a, b) => b.created - a.created)
      } catch {
        return []
      }
    },

    /**
     * Restore from backup.
     * @param {string} backupPath - Path to backup file
     * @returns {Object} Success status
     */
    restoreBackup(backupPath) {
      if (!fs.existsSync(backupPath)) {
        throw new Error(`Backup file not found: ${backupPath}`)
      }
      this.backup('-pre-restore')
      const buffer = ctx._deserialize(fs.readFileSync(backupPath))
      ctx.db = new ctx.SQL.Database(buffer)
      ctx.db.run('PRAGMA foreign_keys = ON')
      ctx._save()
      console.log(`Database restored from: ${backupPath}`)
      return { success: true, restoredFrom: backupPath }
    },

    /**
     * Reload database from disk.
     * @returns {Object} Success status with node count
     */
    reload() {
      if (!fs.existsSync(ctx.dbPath)) {
        throw new Error('Database file not found')
      }
      const buffer = fs.readFileSync(ctx.dbPath)
      ctx.db = new ctx.SQL.Database(buffer)
      ctx.db.run('PRAGMA foreign_keys = ON')
      const count = ctx._query('SELECT COUNT(*) as cnt FROM nodes')[0]?.cnt || 0
      console.log(`Database reloaded with ${count} nodes`)
      return { success: true, nodeCount: count }
    },
  }
}

module.exports = {
  createBackupOperations,
}
