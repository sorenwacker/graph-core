import { ref, nextTick, type Ref } from 'vue'
import { useErrorHandler } from './useErrorHandler'
import type { Node, SearchOptions } from '../types'

const SEARCH_PAGE_SIZE = 50

/**
 * Search mode discriminator.
 */
export type SearchMode = 'normal' | 'link' | 'move'

/**
 * Search result with optional breadcrumb.
 */
export interface SearchResult extends Node {
  breadcrumb?: string
}

/**
 * Pagination options for search.
 */
export interface SearchPaginationOptions {
  limit: number
  offset: number
}

/**
 * Options for useSearch composable.
 */
export interface UseSearchOptions {
  /** Called to perform search */
  onSearch?: (
    query: string,
    mode: SearchMode,
    workspaceId: number | null,
    paginationOptions: SearchPaginationOptions
  ) => Promise<Node[]>
  /** Called when a result is selected (legacy callback) */
  onSelect?: (node: Node, mode: SearchMode, linkSourceId: number | null) => void
  /** Called when linking */
  onLink?: (targetNode: Node, sourceId: number) => Promise<void>
  /** Called when moving */
  onMove?: (sourceId: number, targetId: number) => Promise<void>
  /** Called for navigation */
  onNavigate?: (node: Node) => Promise<void>
  /** Called to fetch ancestors for a node */
  getAncestors?: (nodeId: number) => Promise<Node[]>
  /** Ref to the currently selected node (for link mode) */
  selectedNode?: Ref<Node | null>
  /** Function that returns current workspace ID */
  getWorkspace?: () => number | null
}

/**
 * Return type for useSearch composable.
 */
export interface UseSearchReturn {
  // State
  searchQuery: Ref<string>
  searchResults: Ref<SearchResult[]>
  showSearch: Ref<boolean>
  selectedResultIndex: Ref<number>
  searchMode: Ref<SearchMode>
  linkSourceNodeId: Ref<number | null>
  searchInputRef: Ref<HTMLInputElement | null>
  hasMoreResults: Ref<boolean>
  isLoadingMore: Ref<boolean>

  // Methods
  openSearch: () => void
  openLinkSearch: (node?: Node | null) => void
  openMoveSearch: (node?: Node | null) => void
  closeSearch: () => void
  handleSearch: (workspaceId: number | null, loadMore?: boolean) => Promise<void>
  onSearchInput: () => void
  handleSearchKeydown: (e: KeyboardEvent) => void
  goToSearchResult: (node: SearchResult) => Promise<void>
  isResultSelected: (index: number) => boolean
  loadMoreResults: () => Promise<void>
}

/**
 * Composable for spotlight-style search functionality.
 * Handles search state, debounced input, and navigation through results.
 *
 * @param options - Configuration options
 * @returns Search state and functions
 */
export function useSearch({
  onSearch,
  onSelect,
  onLink,
  onMove,
  onNavigate,
  getAncestors,
  selectedNode,
  getWorkspace,
}: UseSearchOptions = {}): UseSearchReturn {
  const { handleError } = useErrorHandler()

  const searchQuery = ref('')
  const searchResults = ref<SearchResult[]>([])
  const showSearch = ref(false)
  const searchTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const selectedResultIndex = ref(0)
  const searchMode = ref<SearchMode>('normal')
  const linkSourceNodeId = ref<number | null>(null)
  const searchInputRef = ref<HTMLInputElement | null>(null)
  const searchOffset = ref(0)
  const hasMoreResults = ref(false)
  const isLoadingMore = ref(false)

  function openSearch(): void {
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

  function openLinkSearch(node: Node | null = null): void {
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

  function openMoveSearch(node: Node | null = null): void {
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

  function closeSearch(): void {
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

  async function handleSearch(workspaceId: number | null, loadMore = false): Promise<void> {
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

        const paginationOptions: SearchPaginationOptions = {
          limit: SEARCH_PAGE_SIZE,
          offset: searchOffset.value,
        }

        const results = await onSearch(searchQuery.value, searchMode.value, workspaceId, paginationOptions)

        // Check if there are more results
        hasMoreResults.value = results.length === SEARCH_PAGE_SIZE

        // Fetch breadcrumbs for each result if getAncestors is provided
        let processedResults: SearchResult[] = results
        if (getAncestors && results.length > 0) {
          processedResults = await Promise.all(
            results.map(async result => {
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
      handleError(e as Error, { context: 'Searching' })
      isLoadingMore.value = false
    }
  }

  async function loadMoreResults(): Promise<void> {
    if (!hasMoreResults.value || isLoadingMore.value) return
    searchOffset.value += SEARCH_PAGE_SIZE
    const workspaceId = getWorkspace ? getWorkspace() : null
    await handleSearch(workspaceId, true)
  }

  function onSearchInput(): void {
    if (searchTimeout.value) {
      clearTimeout(searchTimeout.value)
    }
    const workspaceId = getWorkspace ? getWorkspace() : null
    searchTimeout.value = setTimeout(() => handleSearch(workspaceId), 200)
  }

  function handleSearchKeydown(e: KeyboardEvent): void {
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
        selectedResultIndex.value =
          selectedResultIndex.value === 0 ? searchResults.value.length - 1 : selectedResultIndex.value - 1
      }
    } else if (e.key === 'Enter' && searchResults.value.length > 0) {
      e.preventDefault()
      const selectedResult = searchResults.value[selectedResultIndex.value]
      if (selectedResult) {
        goToSearchResult(selectedResult)
      }
    }
  }

  async function goToSearchResult(node: SearchResult): Promise<void> {
    const mode = searchMode.value
    const sourceId = linkSourceNodeId.value
    closeSearch()

    // Use mode-specific handlers if available
    if (mode === 'link' && sourceId && onLink) {
      await onLink(node, sourceId)
      return
    }
    if (mode === 'move' && sourceId && onMove) {
      await onMove(sourceId, node.id)
      return
    }
    if (mode === 'normal' && onNavigate) {
      await onNavigate(node)
      return
    }

    // Fallback to legacy onSelect callback
    if (onSelect) {
      onSelect(node, mode, sourceId)
    }
  }

  function isResultSelected(index: number): boolean {
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
    loadMoreResults,
  }
}
