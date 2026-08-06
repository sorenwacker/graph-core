import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ref } from 'vue'
import { useTreeExpand } from '../composables/useTreeExpand.js'

// Mock localStorage
const localStorageMock = (() => {
  let store = {}
  return {
    getItem: vi.fn(key => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value
    }),
    removeItem: vi.fn(key => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(global, 'localStorage', { value: localStorageMock })

describe('useTreeExpand', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  describe('initialization', () => {
    it('should return all expected properties', () => {
      const workspace = ref('test-workspace')
      const result = useTreeExpand({ workspace })

      expect(result).toHaveProperty('expandedIds')
      expect(result).toHaveProperty('toggleExpand')
      expect(result).toHaveProperty('expandAll')
      expect(result).toHaveProperty('collapseAll')
      expect(result).toHaveProperty('expandAncestors')
      expect(result).toHaveProperty('isExpanded')
      expect(result).toHaveProperty('setExpandedIds')
      expect(result).toHaveProperty('loadExpandedState')
      expect(result).toHaveProperty('saveExpandedState')
    })

    it('should start with empty expandedIds', () => {
      const workspace = ref('test-workspace')
      const { expandedIds } = useTreeExpand({ workspace })

      expect(expandedIds.value.size).toBe(0)
    })
  })

  describe('toggleExpand', () => {
    it('should add nodeId when not expanded', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, toggleExpand } = useTreeExpand({ workspace })

      toggleExpand(1)

      expect(expandedIds.value.has(1)).toBe(true)
    })

    it('should remove nodeId when already expanded', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, toggleExpand } = useTreeExpand({ workspace })

      toggleExpand(1)
      expect(expandedIds.value.has(1)).toBe(true)

      toggleExpand(1)
      expect(expandedIds.value.has(1)).toBe(false)
    })

    it('should persist state to localStorage', () => {
      const workspace = ref('test-workspace')
      const { toggleExpand } = useTreeExpand({ workspace })

      toggleExpand(1)
      toggleExpand(2)

      const stored = JSON.parse(localStorage.getItem('graphcore-expanded-test-workspace'))
      expect(stored).toContain(1)
      expect(stored).toContain(2)
    })
  })

  describe('expandAll', () => {
    it('should expand all nodes from flatChildren', () => {
      const workspace = ref('test-workspace')
      const flatChildren = ref([{ id: 1 }, { id: 2 }, { id: 3 }])
      const { expandedIds, expandAll } = useTreeExpand({ workspace, flatChildren })

      expandAll()

      expect(expandedIds.value.has(1)).toBe(true)
      expect(expandedIds.value.has(2)).toBe(true)
      expect(expandedIds.value.has(3)).toBe(true)
    })

    it('should do nothing if flatChildren is not provided', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, expandAll } = useTreeExpand({ workspace })

      expandAll()

      expect(expandedIds.value.size).toBe(0)
    })
  })

  describe('collapseAll', () => {
    it('should collapse all nodes', () => {
      const workspace = ref('test-workspace')
      const flatChildren = ref([{ id: 1 }, { id: 2 }, { id: 3 }])
      const { expandedIds, expandAll, collapseAll } = useTreeExpand({ workspace, flatChildren })

      expandAll()
      expect(expandedIds.value.size).toBe(3)

      collapseAll()
      expect(expandedIds.value.size).toBe(0)
    })
  })

  describe('expandAncestors', () => {
    it('should expand all ancestor nodes based on path', () => {
      const workspace = ref('test-workspace')
      const flatChildren = ref([
        { id: 1, path: '/1' },
        { id: 2, path: '/1/2' },
        { id: 3, path: '/1/2/3' },
      ])
      const { expandedIds, expandAncestors } = useTreeExpand({ workspace, flatChildren })

      expandAncestors(3)

      expect(expandedIds.value.has(1)).toBe(true)
      expect(expandedIds.value.has(2)).toBe(true)
      expect(expandedIds.value.has(3)).toBe(true)
    })

    it('should do nothing if node not found', () => {
      const workspace = ref('test-workspace')
      const flatChildren = ref([{ id: 1, path: '/1' }])
      const { expandedIds, expandAncestors } = useTreeExpand({ workspace, flatChildren })

      expandAncestors(999)

      expect(expandedIds.value.size).toBe(0)
    })

    it('should do nothing if flatChildren not provided', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, expandAncestors } = useTreeExpand({ workspace })

      expandAncestors(1)

      expect(expandedIds.value.size).toBe(0)
    })
  })

  describe('isExpanded', () => {
    it('should return true for expanded nodes', () => {
      const workspace = ref('test-workspace')
      const { isExpanded, toggleExpand } = useTreeExpand({ workspace })

      toggleExpand(1)

      expect(isExpanded(1)).toBe(true)
    })

    it('should return false for collapsed nodes', () => {
      const workspace = ref('test-workspace')
      const { isExpanded } = useTreeExpand({ workspace })

      expect(isExpanded(1)).toBe(false)
    })
  })

  describe('setExpandedIds', () => {
    it('should set expandedIds from array', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, setExpandedIds } = useTreeExpand({ workspace })

      setExpandedIds([1, 2, 3])

      expect(expandedIds.value.has(1)).toBe(true)
      expect(expandedIds.value.has(2)).toBe(true)
      expect(expandedIds.value.has(3)).toBe(true)
    })
  })

  describe('loadExpandedState', () => {
    it('should load state from localStorage', () => {
      const workspace = ref('test-workspace')
      localStorage.setItem('graphcore-expanded-test-workspace', JSON.stringify([1, 2, 3]))

      const { expandedIds, loadExpandedState } = useTreeExpand({ workspace })
      loadExpandedState()

      expect(expandedIds.value.has(1)).toBe(true)
      expect(expandedIds.value.has(2)).toBe(true)
      expect(expandedIds.value.has(3)).toBe(true)
    })

    it('should handle invalid JSON gracefully', () => {
      const workspace = ref('test-workspace')
      localStorage.setItem('graphcore-expanded-test-workspace', 'invalid-json')

      const { expandedIds, loadExpandedState } = useTreeExpand({ workspace })
      loadExpandedState()

      expect(expandedIds.value.size).toBe(0)
    })

    it('should handle missing localStorage key', () => {
      const workspace = ref('test-workspace')
      const { expandedIds, loadExpandedState } = useTreeExpand({ workspace })

      loadExpandedState()

      expect(expandedIds.value.size).toBe(0)
    })
  })

  describe('saveExpandedState', () => {
    it('should save current state to localStorage when called directly', () => {
      const workspace = ref('test-workspace')
      const { setExpandedIds, saveExpandedState } = useTreeExpand({ workspace })

      // setExpandedIds does NOT persist, so localStorage must still be empty
      setExpandedIds([1, 2])
      expect(localStorage.getItem('graphcore-expanded-test-workspace')).toBeNull()

      saveExpandedState()

      const stored = JSON.parse(localStorage.getItem('graphcore-expanded-test-workspace'))
      expect(stored).toEqual(expect.arrayContaining([1, 2]))
      expect(stored).toHaveLength(2)
    })
  })

  describe('workspace isolation', () => {
    it('should use different keys for different workspaces', () => {
      const workspace1 = ref('workspace-1')
      const workspace2 = ref('workspace-2')

      const tree1 = useTreeExpand({ workspace: workspace1 })
      const tree2 = useTreeExpand({ workspace: workspace2 })

      tree1.toggleExpand(1)
      tree2.toggleExpand(2)

      expect(tree1.expandedIds.value.has(1)).toBe(true)
      expect(tree1.expandedIds.value.has(2)).toBe(false)
      expect(tree2.expandedIds.value.has(1)).toBe(false)
      expect(tree2.expandedIds.value.has(2)).toBe(true)
    })
  })
})
