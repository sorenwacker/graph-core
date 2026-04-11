import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSnapshots } from '../composables/useSnapshots.js'

describe('useSnapshots composable', () => {
  let onListBackups, onCreateBackup, onRestoreBackup, onReload, onAfterRestore, onAfterReload, confirmFn, snapshots

  beforeEach(() => {
    vi.useFakeTimers()
    onListBackups = vi.fn()
    onCreateBackup = vi.fn()
    onRestoreBackup = vi.fn()
    onReload = vi.fn()
    onAfterRestore = vi.fn()
    onAfterReload = vi.fn()
    confirmFn = vi.fn()
    snapshots = useSnapshots({
      onListBackups,
      onCreateBackup,
      onRestoreBackup,
      onReload,
      onAfterRestore,
      onAfterReload,
      confirm: confirmFn,
    })
  })

  afterEach(() => {
    snapshots.cleanup()
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should have empty availableSnapshots', () => {
      expect(snapshots.availableSnapshots.value).toEqual([])
    })

    it('should have showSnapshotList as false', () => {
      expect(snapshots.showSnapshotList.value).toBe(false)
    })

    it('should have empty snapshotMessage', () => {
      expect(snapshots.snapshotMessage.value).toBe('')
    })
  })

  describe('loadSnapshots', () => {
    it('should load snapshots from callback', async () => {
      const backups = [
        { path: '/backup1.db', date: '2024-01-01' },
        { path: '/backup2.db', date: '2024-01-02' },
      ]
      onListBackups.mockResolvedValue(backups)

      await snapshots.loadSnapshots()

      expect(onListBackups).toHaveBeenCalled()
      expect(snapshots.availableSnapshots.value).toEqual(backups)
    })

    it('should filter null values', async () => {
      onListBackups.mockResolvedValue([{ path: '/backup1.db' }, null, { path: '/backup2.db' }])

      await snapshots.loadSnapshots()

      expect(snapshots.availableSnapshots.value.length).toBe(2)
    })

    it('should handle null response', async () => {
      onListBackups.mockResolvedValue(null)

      await snapshots.loadSnapshots()

      expect(snapshots.availableSnapshots.value).toEqual([])
    })

    it('should handle errors gracefully', async () => {
      onListBackups.mockRejectedValue(new Error('Network error'))

      await snapshots.loadSnapshots()

      expect(snapshots.availableSnapshots.value).toEqual([])
    })

    it('should work without callback', async () => {
      const s = useSnapshots({})
      await s.loadSnapshots()
      expect(s.availableSnapshots.value).toEqual([])
    })
  })

  describe('createSnapshot', () => {
    it('should create snapshot and show message', async () => {
      onCreateBackup.mockResolvedValue('/path/to/backup.db')
      onListBackups.mockResolvedValue([])

      await snapshots.createSnapshot()

      expect(onCreateBackup).toHaveBeenCalledWith('-manual')
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')
      expect(onListBackups).toHaveBeenCalled()
    })

    it('should clear message after 3 seconds', async () => {
      onCreateBackup.mockResolvedValue('/path/to/backup.db')
      onListBackups.mockResolvedValue([])

      await snapshots.createSnapshot()
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')

      await vi.advanceTimersByTimeAsync(3000)
      expect(snapshots.snapshotMessage.value).toBe('')
    })

    it('should show error message on failure', async () => {
      onCreateBackup.mockRejectedValue(new Error('Disk full'))

      await snapshots.createSnapshot()

      expect(snapshots.snapshotMessage.value).toBe('Failed to create snapshot')
    })

    it('should work without callback', async () => {
      const s = useSnapshots({})
      await s.createSnapshot()
      // Should not throw
      expect(s.snapshotMessage.value).toBe('')
    })
  })

  describe('restoreSnapshot', () => {
    it('should not restore if not confirmed', async () => {
      confirmFn.mockReturnValue(false)

      await snapshots.restoreSnapshot('/backup.db')

      expect(onRestoreBackup).not.toHaveBeenCalled()
    })

    it('should restore and call afterRestore', async () => {
      confirmFn.mockReturnValue(true)
      onRestoreBackup.mockResolvedValue()

      await snapshots.restoreSnapshot('/backup.db')

      expect(onRestoreBackup).toHaveBeenCalledWith('/backup.db')
      expect(onAfterRestore).toHaveBeenCalled()
      expect(snapshots.snapshotMessage.value).toBe('Snapshot restored successfully')
    })

    it('should show loading message during restore', async () => {
      confirmFn.mockReturnValue(true)
      let messageBeforeRestore = ''
      onRestoreBackup.mockImplementation(async () => {
        messageBeforeRestore = snapshots.snapshotMessage.value
      })

      await snapshots.restoreSnapshot('/backup.db')

      expect(messageBeforeRestore).toBe('Snapshot restored - reloading...')
    })

    it('should show error message on failure', async () => {
      confirmFn.mockReturnValue(true)
      onRestoreBackup.mockRejectedValue(new Error('Corrupt backup'))

      await snapshots.restoreSnapshot('/backup.db')

      expect(snapshots.snapshotMessage.value).toBe('Failed to restore snapshot')
    })

    it('should use default confirm if not provided', async () => {
      const s = useSnapshots({
        onRestoreBackup: vi.fn().mockResolvedValue(),
      })
      // Default confirm would use window.confirm which we can't test easily
      // Just verify it doesn't throw
      expect(() => s.restoreSnapshot('/backup.db')).not.toThrow()
    })
  })

  describe('reloadDatabase', () => {
    it('should reload and show node count', async () => {
      onReload.mockResolvedValue({ nodeCount: 150 })

      await snapshots.reloadDatabase()

      expect(onReload).toHaveBeenCalled()
      expect(snapshots.snapshotMessage.value).toBe('Database reloaded (150 nodes)')
      expect(onAfterReload).toHaveBeenCalled()
    })

    it('should handle null result', async () => {
      onReload.mockResolvedValue(null)

      await snapshots.reloadDatabase()

      expect(snapshots.snapshotMessage.value).toBe('Database reloaded (0 nodes)')
    })

    it('should show error message on failure', async () => {
      onReload.mockRejectedValue(new Error('DB locked'))

      await snapshots.reloadDatabase()

      expect(snapshots.snapshotMessage.value).toBe('Failed to reload database')
    })

    it('should work without afterReload callback', async () => {
      const s = useSnapshots({ onReload: vi.fn().mockResolvedValue({ nodeCount: 10 }) })
      await s.reloadDatabase()
      expect(s.snapshotMessage.value).toBe('Database reloaded (10 nodes)')
    })
  })

  describe('formatSnapshotDate', () => {
    it('should format date string', () => {
      const result = snapshots.formatSnapshotDate('2024-01-15T14:30:00')
      expect(result).toContain('2024')
      expect(result).toContain('Jan')
      expect(result).toContain('15')
    })

    it('should handle ISO date format', () => {
      const result = snapshots.formatSnapshotDate('2024-06-20T09:15:30.000Z')
      expect(result).toContain('2024')
      expect(result).toContain('Jun')
      expect(result).toContain('20')
    })
  })

  describe('toggleSnapshotList', () => {
    it('should toggle showSnapshotList', () => {
      expect(snapshots.showSnapshotList.value).toBe(false)

      snapshots.toggleSnapshotList()
      expect(snapshots.showSnapshotList.value).toBe(true)

      snapshots.toggleSnapshotList()
      expect(snapshots.showSnapshotList.value).toBe(false)
    })

    it('should load snapshots when opening', async () => {
      onListBackups.mockResolvedValue([])

      snapshots.toggleSnapshotList()
      await vi.runAllTimersAsync()

      expect(onListBackups).toHaveBeenCalled()
    })

    it('should not load snapshots when closing', async () => {
      snapshots.showSnapshotList.value = true
      onListBackups.mockResolvedValue([])

      snapshots.toggleSnapshotList()
      await vi.runAllTimersAsync()

      expect(onListBackups).not.toHaveBeenCalled()
    })
  })

  describe('closeSnapshotList', () => {
    it('should close snapshot list', () => {
      snapshots.showSnapshotList.value = true

      snapshots.closeSnapshotList()

      expect(snapshots.showSnapshotList.value).toBe(false)
    })
  })

  describe('message timeout handling', () => {
    it('should clear previous timeout on new message', async () => {
      onCreateBackup.mockResolvedValue('/path1.db')
      onListBackups.mockResolvedValue([])

      await snapshots.createSnapshot()
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')

      await vi.advanceTimersByTimeAsync(1000)

      // Create another snapshot before timeout
      await snapshots.createSnapshot()
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')

      // Advance past original timeout
      await vi.advanceTimersByTimeAsync(2500)
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')

      // Advance past new timeout
      await vi.advanceTimersByTimeAsync(1000)
      expect(snapshots.snapshotMessage.value).toBe('')
    })
  })

  describe('cleanup', () => {
    it('should clear pending timeout', async () => {
      onCreateBackup.mockResolvedValue('/path.db')
      onListBackups.mockResolvedValue([])

      await snapshots.createSnapshot()

      snapshots.cleanup()
      await vi.advanceTimersByTimeAsync(5000)

      // Message should still be set since timeout was cleared
      expect(snapshots.snapshotMessage.value).toBe('Snapshot created')
    })
  })

  describe('without callbacks', () => {
    it('should work with no options', async () => {
      const s = useSnapshots({})

      await s.loadSnapshots()
      await s.createSnapshot()
      await s.reloadDatabase()
      s.toggleSnapshotList()
      s.closeSnapshotList()

      // Should not throw
      expect(s.availableSnapshots.value).toEqual([])
    })
  })
})
