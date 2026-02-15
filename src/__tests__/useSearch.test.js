import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { ref } from 'vue'
import { useSearch } from '../composables/useSearch.js'

describe('useSearch composable', () => {
  let onSearch, onSelect, onFetchBreadcrumbs, selectedNode, search

  beforeEach(() => {
    vi.useFakeTimers()
    onSearch = vi.fn()
    onSelect = vi.fn()
    onFetchBreadcrumbs = vi.fn()
    selectedNode = ref(null)
    search = useSearch({ onSearch, onSelect, onFetchBreadcrumbs, selectedNode })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('initial state', () => {
    it('should have empty searchQuery', () => {
      expect(search.searchQuery.value).toBe('')
    })

    it('should have empty searchResults', () => {
      expect(search.searchResults.value).toEqual([])
    })

    it('should have showSearch as false', () => {
      expect(search.showSearch.value).toBe(false)
    })

    it('should have selectedResultIndex as 0', () => {
      expect(search.selectedResultIndex.value).toBe(0)
    })

    it('should have searchMode as normal', () => {
      expect(search.searchMode.value).toBe('normal')
    })

    it('should have null linkSourceNodeId', () => {
      expect(search.linkSourceNodeId.value).toBeNull()
    })
  })

  describe('openSearch', () => {
    it('should show search', () => {
      search.openSearch()
      expect(search.showSearch.value).toBe(true)
    })

    it('should reset state', () => {
      search.searchQuery.value = 'test'
      search.searchResults.value = [{ id: 1 }]
      search.selectedResultIndex.value = 5

      search.openSearch()

      expect(search.searchQuery.value).toBe('')
      expect(search.searchResults.value).toEqual([])
      expect(search.selectedResultIndex.value).toBe(0)
    })

    it('should set mode to normal', () => {
      search.searchMode.value = 'link'
      search.openSearch()
      expect(search.searchMode.value).toBe('normal')
    })

    it('should clear linkSourceNodeId', () => {
      search.linkSourceNodeId.value = 5
      search.openSearch()
      expect(search.linkSourceNodeId.value).toBeNull()
    })
  })

  describe('openLinkSearch', () => {
    it('should not open if no selected node', () => {
      selectedNode.value = null
      search.openLinkSearch()
      expect(search.showSearch.value).toBe(false)
    })

    it('should open with link mode when node is selected', () => {
      selectedNode.value = { id: 10, title: 'Test' }
      search.openLinkSearch()

      expect(search.showSearch.value).toBe(true)
      expect(search.searchMode.value).toBe('link')
      expect(search.linkSourceNodeId.value).toBe(10)
    })

    it('should reset other state', () => {
      selectedNode.value = { id: 10 }
      search.searchQuery.value = 'old'
      search.searchResults.value = [{ id: 1 }]

      search.openLinkSearch()

      expect(search.searchQuery.value).toBe('')
      expect(search.searchResults.value).toEqual([])
    })
  })

  describe('closeSearch', () => {
    it('should hide search', () => {
      search.showSearch.value = true
      search.closeSearch()
      expect(search.showSearch.value).toBe(false)
    })

    it('should reset all state', () => {
      search.searchQuery.value = 'test'
      search.searchResults.value = [{ id: 1 }]
      search.selectedResultIndex.value = 3
      search.searchMode.value = 'link'
      search.linkSourceNodeId.value = 5

      search.closeSearch()

      expect(search.searchQuery.value).toBe('')
      expect(search.searchResults.value).toEqual([])
      expect(search.selectedResultIndex.value).toBe(0)
      expect(search.searchMode.value).toBe('normal')
      expect(search.linkSourceNodeId.value).toBeNull()
    })
  })

  describe('handleSearch', () => {
    it('should not search with empty query', async () => {
      search.searchQuery.value = ''
      await search.handleSearch('work')
      expect(onSearch).not.toHaveBeenCalled()
    })

    it('should not search with whitespace-only query', async () => {
      search.searchQuery.value = '   '
      await search.handleSearch('work')
      expect(onSearch).not.toHaveBeenCalled()
    })

    it('should call onSearch with query and mode', async () => {
      search.searchQuery.value = 'test'
      search.searchMode.value = 'normal'
      onSearch.mockResolvedValue([])

      await search.handleSearch('work')

      expect(onSearch).toHaveBeenCalledWith('test', 'normal', 'work')
    })

    it('should call onFetchBreadcrumbs if results exist', async () => {
      search.searchQuery.value = 'test'
      const results = [{ id: 1 }, { id: 2 }]
      onSearch.mockResolvedValue(results)
      onFetchBreadcrumbs.mockResolvedValue(results.map(r => ({ ...r, breadcrumb: 'path' })))

      await search.handleSearch('work')

      expect(onFetchBreadcrumbs).toHaveBeenCalledWith(results)
    })

    it('should not call onFetchBreadcrumbs if no results', async () => {
      search.searchQuery.value = 'test'
      onSearch.mockResolvedValue([])

      await search.handleSearch('work')

      expect(onFetchBreadcrumbs).not.toHaveBeenCalled()
    })

    it('should reset selectedResultIndex on new search', async () => {
      search.selectedResultIndex.value = 5
      search.searchQuery.value = 'test'
      onSearch.mockResolvedValue([{ id: 1 }])

      await search.handleSearch('work')

      expect(search.selectedResultIndex.value).toBe(0)
    })
  })

  describe('onSearchInput', () => {
    it('should debounce search', async () => {
      search.searchQuery.value = 'test'
      onSearch.mockResolvedValue([])

      search.onSearchInput('work')

      // Should not have called yet
      expect(onSearch).not.toHaveBeenCalled()

      // Advance timer
      await vi.advanceTimersByTimeAsync(200)

      expect(onSearch).toHaveBeenCalled()
    })

    it('should cancel previous timeout on new input', async () => {
      search.searchQuery.value = 'test'
      onSearch.mockResolvedValue([])

      search.onSearchInput('work')
      await vi.advanceTimersByTimeAsync(100)

      // New input before timeout
      search.searchQuery.value = 'test2'
      search.onSearchInput('work')

      // Wait for original timeout (should not fire)
      await vi.advanceTimersByTimeAsync(100)
      expect(onSearch).not.toHaveBeenCalled()

      // Wait for new timeout
      await vi.advanceTimersByTimeAsync(100)
      expect(onSearch).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleSearchKeydown', () => {
    it('should close on Escape', () => {
      search.showSearch.value = true
      const e = { key: 'Escape' }

      search.handleSearchKeydown(e)

      expect(search.showSearch.value).toBe(false)
    })

    it('should move down on ArrowDown', () => {
      search.searchResults.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
      search.selectedResultIndex.value = 0
      const e = { key: 'ArrowDown', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(search.selectedResultIndex.value).toBe(1)
    })

    it('should wrap around on ArrowDown at end', () => {
      search.searchResults.value = [{ id: 1 }, { id: 2 }]
      search.selectedResultIndex.value = 1
      const e = { key: 'ArrowDown', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(search.selectedResultIndex.value).toBe(0)
    })

    it('should move up on ArrowUp', () => {
      search.searchResults.value = [{ id: 1 }, { id: 2 }, { id: 3 }]
      search.selectedResultIndex.value = 2
      const e = { key: 'ArrowUp', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(search.selectedResultIndex.value).toBe(1)
    })

    it('should wrap around on ArrowUp at beginning', () => {
      search.searchResults.value = [{ id: 1 }, { id: 2 }]
      search.selectedResultIndex.value = 0
      const e = { key: 'ArrowUp', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(search.selectedResultIndex.value).toBe(1)
    })

    it('should select on Enter', () => {
      search.searchResults.value = [{ id: 1 }, { id: 2 }]
      search.selectedResultIndex.value = 1
      const e = { key: 'Enter', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(e.preventDefault).toHaveBeenCalled()
      expect(onSelect).toHaveBeenCalledWith({ id: 2 }, 'normal', null)
    })

    it('should not select on Enter with no results', () => {
      search.searchResults.value = []
      const e = { key: 'Enter', preventDefault: vi.fn() }

      search.handleSearchKeydown(e)

      expect(onSelect).not.toHaveBeenCalled()
    })

    it('should not change index with arrow keys when no results', () => {
      search.searchResults.value = []
      search.selectedResultIndex.value = 0
      const downE = { key: 'ArrowDown', preventDefault: vi.fn() }
      const upE = { key: 'ArrowUp', preventDefault: vi.fn() }

      search.handleSearchKeydown(downE)
      search.handleSearchKeydown(upE)

      // Index should remain 0
      expect(search.selectedResultIndex.value).toBe(0)
    })
  })

  describe('goToSearchResult', () => {
    it('should call onSelect with node and mode', () => {
      search.searchMode.value = 'normal'
      const node = { id: 5, title: 'Test' }

      search.goToSearchResult(node)

      expect(onSelect).toHaveBeenCalledWith(node, 'normal', null)
    })

    it('should pass linkSourceNodeId in link mode', () => {
      search.searchMode.value = 'link'
      search.linkSourceNodeId.value = 10
      const node = { id: 5, title: 'Test' }

      search.goToSearchResult(node)

      expect(onSelect).toHaveBeenCalledWith(node, 'link', 10)
    })

    it('should close search after selection', () => {
      search.showSearch.value = true
      const node = { id: 5 }

      search.goToSearchResult(node)

      expect(search.showSearch.value).toBe(false)
    })
  })

  describe('isResultSelected', () => {
    it('should return true for selected index', () => {
      search.selectedResultIndex.value = 2
      expect(search.isResultSelected(2)).toBe(true)
    })

    it('should return false for non-selected index', () => {
      search.selectedResultIndex.value = 2
      expect(search.isResultSelected(0)).toBe(false)
      expect(search.isResultSelected(1)).toBe(false)
      expect(search.isResultSelected(3)).toBe(false)
    })
  })

  describe('without callbacks', () => {
    it('should work without onSearch', async () => {
      const s = useSearch({})
      s.searchQuery.value = 'test'
      await s.handleSearch('work')
      // Should not throw
      expect(s.searchResults.value).toEqual([])
    })

    it('should work without onSelect', () => {
      const s = useSearch({})
      s.goToSearchResult({ id: 1 })
      // Should not throw
      expect(s.showSearch.value).toBe(false)
    })

    it('should work without onFetchBreadcrumbs', async () => {
      const mockSearch = vi.fn().mockResolvedValue([{ id: 1 }])
      const s = useSearch({ onSearch: mockSearch })
      s.searchQuery.value = 'test'
      await s.handleSearch('work')
      expect(s.searchResults.value).toEqual([{ id: 1 }])
    })
  })
})
