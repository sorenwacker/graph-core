import { ref } from 'vue'
import { useErrorHandler } from './useErrorHandler'

/**
 * Composable for snapshot/backup management.
 * Handles listing, creating, and restoring database snapshots.
 *
 * @param {Object} options
 * @param {Function} options.onListBackups - Called to list backups: onListBackups() => backups[]
 * @param {Function} options.onCreateBackup - Called to create backup: onCreateBackup(suffix) => path
 * @param {Function} options.onRestoreBackup - Called to restore backup: onRestoreBackup(path) => void
 * @param {Function} options.onReload - Called to reload database: onReload() => { nodeCount }
 * @param {Function} options.onAfterRestore - Called after restore to reload app state: onAfterRestore()
 * @param {Function} options.onAfterReload - Called after reload to refresh app state: onAfterReload()
 * @param {Function} options.confirm - Confirm function (defaults to window.confirm)
 */
export function useSnapshots({
  onListBackups,
  onCreateBackup,
  onRestoreBackup,
  onReload,
  onAfterRestore,
  onAfterReload,
  confirm: confirmFn = (msg) => window.confirm(msg)
} = {}) {
  const { handleError } = useErrorHandler()

  const availableSnapshots = ref([])
  const showSnapshotList = ref(false)
  const snapshotMessage = ref('')

  let messageTimeout = null

  function showMessage(message, duration = 3000) {
    snapshotMessage.value = message
    if (messageTimeout) clearTimeout(messageTimeout)
    if (duration > 0) {
      messageTimeout = setTimeout(() => {
        snapshotMessage.value = ''
      }, duration)
    }
  }

  async function loadSnapshots() {
    try {
      if (onListBackups) {
        const snapshots = await onListBackups()
        availableSnapshots.value = (snapshots || []).filter(Boolean)
      }
    } catch (e) {
      handleError(e, { context: 'Loading snapshots' })
      availableSnapshots.value = []
    }
  }

  async function createSnapshot() {
    try {
      if (onCreateBackup) {
        await onCreateBackup('-manual')
        showMessage('Snapshot created')
        await loadSnapshots()
      }
    } catch (e) {
      handleError(e, { context: 'Creating snapshot' })
    }
  }

  async function restoreSnapshot(backupPath) {
    if (!confirmFn('Restore this snapshot? Current data will be backed up first.')) return

    try {
      if (onRestoreBackup) {
        showMessage('Snapshot restored - reloading...', 0) // No auto-clear
        await onRestoreBackup(backupPath)

        if (onAfterRestore) {
          await onAfterRestore()
        }

        showMessage('Snapshot restored successfully')
      }
    } catch (e) {
      handleError(e, { context: 'Restoring snapshot' })
    }
  }

  async function reloadDatabase() {
    try {
      if (onReload) {
        const result = await onReload()
        showMessage(`Database reloaded (${result?.nodeCount || 0} nodes)`)

        if (onAfterReload) {
          await onAfterReload()
        }
      }
    } catch (e) {
      handleError(e, { context: 'Reloading database' })
    }
  }

  function formatSnapshotDate(dateString) {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function toggleSnapshotList() {
    showSnapshotList.value = !showSnapshotList.value
    if (showSnapshotList.value) {
      loadSnapshots()
    }
  }

  function closeSnapshotList() {
    showSnapshotList.value = false
  }

  function cleanup() {
    if (messageTimeout) {
      clearTimeout(messageTimeout)
      messageTimeout = null
    }
  }

  return {
    // State
    availableSnapshots,
    showSnapshotList,
    snapshotMessage,

    // Methods
    loadSnapshots,
    createSnapshot,
    restoreSnapshot,
    reloadDatabase,
    formatSnapshotDate,
    toggleSnapshotList,
    closeSnapshotList,
    cleanup
  }
}
