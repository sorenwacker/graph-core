import { ref, computed } from 'vue'

/**
 * Reusable autocomplete composable for entity selection
 * Used by PersonDetailForm (organization linking) and OrganizationDetailForm (member linking)
 */
export function useAutocomplete(options = {}) {
  const {
    items = ref([]),
    maxResults = 10,
    filterFn = (item, query) => item.title?.toLowerCase().includes(query.toLowerCase()),
    matchFn = (item, query) => item.title?.toLowerCase() === query.toLowerCase()
  } = options

  const query = ref('')
  const showDropdown = ref(false)
  const selectedIndex = ref(0)

  // Filtered items based on query
  const filteredItems = computed(() => {
    if (!query.value) {
      return items.value.slice(0, maxResults)
    }
    return items.value
      .filter(item => filterFn(item, query.value))
      .slice(0, maxResults)
  })

  // Check if query exactly matches an existing item
  const exactMatch = computed(() => {
    if (!query.value) return null
    return items.value.find(item => matchFn(item, query.value))
  })

  // Handle keyboard navigation
  function handleKeydown(e, { onSelect, onCreate, linkedItems = [] }) {
    if (!showDropdown.value) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        showDropdown.value = true
        e.preventDefault()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const max = filteredItems.value.length
      selectedIndex.value = Math.min(selectedIndex.value + 1, max)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIndex.value < filteredItems.value.length) {
        const item = filteredItems.value[selectedIndex.value]
        // Don't select if already linked
        if (!linkedItems.find(l => l.id === item.id)) {
          onSelect(item)
        }
      } else if (!exactMatch.value && query.value.trim() && onCreate) {
        onCreate(query.value.trim())
      }
    } else if (e.key === 'Escape') {
      showDropdown.value = false
    }
  }

  function handleInput() {
    showDropdown.value = true
    selectedIndex.value = 0
  }

  function reset() {
    query.value = ''
    showDropdown.value = false
    selectedIndex.value = 0
  }

  function select(item, onSelect) {
    onSelect(item)
    reset()
  }

  return {
    query,
    showDropdown,
    selectedIndex,
    filteredItems,
    exactMatch,
    handleKeydown,
    handleInput,
    reset,
    select
  }
}
