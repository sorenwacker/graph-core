import { ref, nextTick } from 'vue'
import { useErrorHandler } from './useErrorHandler'

const SEARCH_PAGE_SIZE = 50

/**
 * Composable for spotlight-style search functionality.
 * Handles search state, debounced input, and navigation through results.
 *
 * @param {Object} options
 * @param {Function} options.onSearch - Called to perform search: onSearch(query, mode, workspaceId, paginationOptions) => results[]
 * @param {Function} options.onSelect - Called when a result is selected: onSelect(node, mode, linkSourceId)
 * @param {Function} options.getAncestors - Called to fetch ancestors for a node: getAncestors(nodeId) => ancestors[]
 * @param {Object} options.selectedNode - Ref to the currently selected node (for link mode)
 */
export function useSearch({ onSearch, onSelect, getAncestors, selectedNode } = {}) {
  const { handleError } = useErrorHandler()

  const searchQuery = ref('')
  const searchResults = ref([])
  const showSearch = ref(false)
  const searchTimeout = ref(null)
  const selectedResultIndex = ref(0)
  const searchMode = ref('normal') // 'normal', 'link', or 'move'
  const linkSourceNodeId = ref(null)
  const searchInputRef = ref(null)
  const searchOffset = ref(0)
  const hasMoreResults = ref(false)
  const isLoadingMore = ref(false)

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
    searchOffset.value = 0
    hasMoreResults.value = false
    isLoadingMore.value = false
  }

  async function handleSearch(workspaceId, loadMore = false) {
    if (!searchQuery.value.trim()) {
      searchResults.value = []
      searchOffset.value = 0
      hasMoreResults.value = false
      return
    }

    try {
      if (onSearch) {
        if (loadMore) {
          isLoadingMore.value = true
        } else {
          searchOffset.value = 0
        }

        const paginationOptions = {
          limit: SEARCH_PAGE_SIZE,
          offset: searchOffset.value
        }

        const results = await onSearch(searchQuery.value, searchMode.value, workspaceId, paginationOptions)

        // Check if there are more results
        hasMoreResults.value = results.length === SEARCH_PAGE_SIZE

        // Fetch breadcrumbs for each result if getAncestors is provided
        let processedResults = results
        if (getAncestors && results.length > 0) {
          processedResults = await Promise.all(
            results.map(async (result) => {
              try {
                const ancestors = await getAncestors(result.id)
                const breadcrumb = ancestors.map(a => a.title).join(' / ')
                return { ...result, breadcrumb }
              } catch {
                return { ...result, breadcrumb: '' }
              }
            })
          )
        }

        if (loadMore) {
          // Append to existing results
          searchResults.value = [...searchResults.value, ...processedResults]
          isLoadingMore.value = false
        } else {
          searchResults.value = processedResults
          selectedResultIndex.value = 0
        }
      }
    } catch (e) {
      handleError(e, { context: 'Searching' })
      isLoadingMore.value = false
    }
  }

  async function loadMoreResults(workspaceId) {
    if (!hasMoreResults.value || isLoadingMore.value) return
    searchOffset.value += SEARCH_PAGE_SIZE
    await handleSearch(workspaceId, true)
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
    hasMoreResults,
    isLoadingMore,

    // Methods
    openSearch,
    openLinkSearch,
    openMoveSearch,
    closeSearch,
    handleSearch,
    onSearchInput,
    handleSearchKeydown,
    goToSearchResult,
    isResultSelected,
    loadMoreResults
  }
}
