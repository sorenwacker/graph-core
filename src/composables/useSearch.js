import { ref, nextTick } from 'vue'

/**
 * Composable for spotlight-style search functionality.
 * Handles search state, debounced input, and navigation through results.
 *
 * @param {Object} options
 * @param {Function} options.onSearch - Called to perform search: onSearch(query, mode, workspaceId) => results[]
 * @param {Function} options.onSelect - Called when a result is selected: onSelect(node, mode, linkSourceId)
 * @param {Function} options.onFetchBreadcrumbs - Called to fetch breadcrumbs for results: onFetchBreadcrumbs(results) => resultsWithBreadcrumbs[]
 * @param {Object} options.selectedNode - Ref to the currently selected node (for link mode)
 */
export function useSearch({ onSearch, onSelect, onFetchBreadcrumbs, selectedNode } = {}) {
  const searchQuery = ref('')
  const searchResults = ref([])
  const showSearch = ref(false)
  const searchTimeout = ref(null)
  const selectedResultIndex = ref(0)
  const searchMode = ref('normal') // 'normal', 'link', or 'move'
  const linkSourceNodeId = ref(null)
  const searchInputRef = ref(null)

  function openSearch() {
    showSearch.value = true
    searchQuery.value = ''
    searchResults.value = []
    selectedResultIndex.value = 0
    searchMode.value = 'normal'
    linkSourceNodeId.value = null
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus()
      }
    })
  }

  function openLinkSearch(node = null) {
    const targetNode = node || selectedNode?.value
    if (!targetNode) return
    showSearch.value = true
    searchQuery.value = ''
    searchResults.value = []
    selectedResultIndex.value = 0
    searchMode.value = 'link'
    linkSourceNodeId.value = targetNode.id
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus()
      }
    })
  }

  function openMoveSearch(node = null) {
    const targetNode = node || selectedNode?.value
    if (!targetNode) return
    showSearch.value = true
    searchQuery.value = ''
    searchResults.value = []
    selectedResultIndex.value = 0
    searchMode.value = 'move'
    linkSourceNodeId.value = targetNode.id
    nextTick(() => {
      if (searchInputRef.value) {
        searchInputRef.value.focus()
      }
    })
  }

  function closeSearch() {
    showSearch.value = false
    searchQuery.value = ''
    searchResults.value = []
    selectedResultIndex.value = 0
    searchMode.value = 'normal'
    linkSourceNodeId.value = null
  }

  async function handleSearch(workspaceId) {
    if (!searchQuery.value.trim()) {
      searchResults.value = []
      return
    }

    try {
      if (onSearch) {
        const results = await onSearch(searchQuery.value, searchMode.value, workspaceId)

        // Fetch breadcrumbs if callback provided
        if (onFetchBreadcrumbs && results.length > 0) {
          searchResults.value = await onFetchBreadcrumbs(results)
        } else {
          searchResults.value = results
        }
        selectedResultIndex.value = 0
      }
    } catch (e) {
      console.error('Search failed:', e)
    }
  }

  function onSearchInput(workspaceId) {
    clearTimeout(searchTimeout.value)
    searchTimeout.value = setTimeout(() => handleSearch(workspaceId), 200)
  }

  function handleSearchKeydown(e) {
    if (e.key === 'Escape') {
      closeSearch()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (searchResults.value.length > 0) {
        selectedResultIndex.value = (selectedResultIndex.value + 1) % searchResults.value.length
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (searchResults.value.length > 0) {
        selectedResultIndex.value = selectedResultIndex.value === 0
          ? searchResults.value.length - 1
          : selectedResultIndex.value - 1
      }
    } else if (e.key === 'Enter' && searchResults.value.length > 0) {
      e.preventDefault()
      const selectedResult = searchResults.value[selectedResultIndex.value]
      if (selectedResult) {
        goToSearchResult(selectedResult)
      }
    }
  }

  function goToSearchResult(node) {
    const mode = searchMode.value
    const sourceId = linkSourceNodeId.value
    closeSearch()

    if (onSelect) {
      onSelect(node, mode, sourceId)
    }
  }

  function isResultSelected(index) {
    return selectedResultIndex.value === index
  }

  return {
    // State
    searchQuery,
    searchResults,
    showSearch,
    selectedResultIndex,
    searchMode,
    linkSourceNodeId,
    searchInputRef,

    // Methods
    openSearch,
    openLinkSearch,
    openMoveSearch,
    closeSearch,
    handleSearch,
    onSearchInput,
    handleSearchKeydown,
    goToSearchResult,
    isResultSelected
  }
}
