import { describe, it, expect, vi } from 'vitest'

/**
 * Tests for null/undefined handling in root node loading
 *
 * These tests verify the fix for the black screen issue (2026-01-20):
 * - When api.getRoots() returns arrays with null entries, the app should not crash
 * - Null entries should be filtered out before accessing .id property
 */

describe('Null Root Handling', () => {
  // Replicate the filtering logic from App.vue loadChildren and loadSidebarTree
  function filterRoots(roots, wsFilter) {
    return (wsFilter === null ? roots : roots.filter(r => r && r.type !== 'person')).filter(Boolean)
  }

  async function processRoots(roots, wsFilter, getDescendants) {
    const filteredRoots = filterRoots(roots, wsFilter)
    const rootsWithChildren = await Promise.all(
      filteredRoots.map(async root => {
        if (!root || !root.id) return null
        const descendants = await getDescendants(root.id)
        return {
          ...root,
          children: descendants,
        }
      })
    )
    return rootsWithChildren.filter(Boolean)
  }

  describe('filterRoots', () => {
    it('should filter out null entries', () => {
      const roots = [
        { id: 1, type: 'task', title: 'Task 1' },
        null,
        { id: 2, type: 'note', title: 'Note 1' },
        undefined,
        { id: 3, type: 'task', title: 'Task 2' },
      ]

      const filtered = filterRoots(roots, 'work')

      expect(filtered).toHaveLength(3)
      expect(filtered.every(r => r !== null && r !== undefined)).toBe(true)
    })

    it('should filter out person types in non-people workspace', () => {
      const roots = [
        { id: 1, type: 'task', title: 'Task 1' },
        { id: 2, type: 'person', title: 'Person 1' },
        { id: 3, type: 'note', title: 'Note 1' },
      ]

      const filtered = filterRoots(roots, 'work')

      expect(filtered).toHaveLength(2)
      expect(filtered.find(r => r.type === 'person')).toBeUndefined()
    })

    it('should keep all types in people workspace (wsFilter = null)', () => {
      const roots = [
        { id: 1, type: 'task', title: 'Task 1' },
        { id: 2, type: 'person', title: 'Person 1' },
        { id: 3, type: 'note', title: 'Note 1' },
      ]

      const filtered = filterRoots(roots, null)

      expect(filtered).toHaveLength(3)
    })

    it('should handle array with only null entries', () => {
      const roots = [null, undefined, null]

      const filtered = filterRoots(roots, 'work')

      expect(filtered).toHaveLength(0)
    })

    it('should handle empty array', () => {
      const roots = []

      const filtered = filterRoots(roots, 'work')

      expect(filtered).toHaveLength(0)
    })
  })

  describe('processRoots', () => {
    it('should not crash when roots contain null entries', async () => {
      const roots = [{ id: 1, type: 'task', title: 'Task 1' }, null, { id: 2, type: 'note', title: 'Note 1' }]

      const getDescendants = vi.fn().mockResolvedValue([])

      const result = await processRoots(roots, 'work', getDescendants)

      expect(result).toHaveLength(2)
      expect(getDescendants).toHaveBeenCalledTimes(2)
    })

    it('should filter out roots with missing id', async () => {
      const roots = [
        { id: 1, type: 'task', title: 'Task 1' },
        { type: 'note', title: 'Note without ID' }, // Missing id
        { id: 3, type: 'task', title: 'Task 2' },
      ]

      const getDescendants = vi.fn().mockResolvedValue([])

      const result = await processRoots(roots, 'work', getDescendants)

      expect(result).toHaveLength(2)
      expect(result.find(r => r.title === 'Note without ID')).toBeUndefined()
    })

    it('should handle completely empty roots', async () => {
      const roots = []

      const getDescendants = vi.fn().mockResolvedValue([])

      const result = await processRoots(roots, 'work', getDescendants)

      expect(result).toHaveLength(0)
      expect(getDescendants).not.toHaveBeenCalled()
    })
  })
})
