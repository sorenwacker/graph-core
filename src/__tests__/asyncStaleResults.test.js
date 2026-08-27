import { describe, it, expect, vi } from 'vitest'
import { useTaskFiltering } from '../composables/useTaskFiltering.js'
import { useSearch } from '../composables/useSearch'
import { api } from '../services/api'

// useTaskFiltering imports the api module directly rather than taking it as an
// option, so the module is what has to be stubbed here.
vi.mock('../services/api', () => ({
  api: {
    getTasks: vi.fn(),
    getNode: vi.fn(async id => ({ id })),
    getDescendants: vi.fn(async () => []),
    getAncestors: vi.fn(async () => []),
  },
}))

/**
 * Loaders that can overlap must let the newest call win. Without a guard a
 * slower earlier response lands last and overwrites the newer one, so the view
 * settles on data the user has already navigated away from.
 */

function deferred() {
  let resolve
  const promise = new Promise(r => (resolve = r))
  return { promise, resolve }
}

describe('loading tasks', () => {
  it('keeps the newest result when an earlier load finishes late', async () => {
    const slow = deferred()
    let call = 0
    api.getTasks.mockImplementation(() =>
      ++call === 1 ? slow.promise : Promise.resolve([{ id: 2, title: 'Newer', parent_id: null }])
    )
    const filtering = useTaskFiltering({ getWorkspaceId: () => null, getContainerId: () => null })

    const first = filtering.loadTasks()
    const second = filtering.loadTasks()
    await second
    slow.resolve([{ id: 1, title: 'Older', parent_id: null }])
    await first

    expect(filtering.tasks.value.map(t => t.title)).toEqual(['Newer'])
  })

  it('leaves loading false once the newest load settles', async () => {
    api.getTasks.mockImplementation(async () => [])
    const filtering = useTaskFiltering({ getWorkspaceId: () => null, getContainerId: () => null })

    await Promise.all([filtering.loadTasks(), filtering.loadTasks()])
    expect(filtering.loading.value).toBe(false)
  })
})

describe('loading more search results', () => {
  function setup(onSearch) {
    const search = useSearch({ onSearch, getWorkspace: () => null })
    return search
  }

  it('does not append results belonging to an older query', async () => {
    const slow = deferred()
    const onSearch = vi.fn(query => (query === 'old' ? slow.promise : Promise.resolve([])))
    const search = setup(onSearch)

    search.searchQuery.value = 'old'
    const stale = search.handleSearch(null, true)
    search.searchQuery.value = 'new'
    await search.handleSearch(null, false)

    slow.resolve([{ id: 99, title: 'From the old query' }])
    await stale

    expect(search.searchResults.value.map(r => r.title)).not.toContain('From the old query')
  })

  it('does not leave the page window advanced when a load-more fails', async () => {
    let calls = 0
    const onSearch = vi.fn(async () => {
      calls += 1
      if (calls === 1) return Array.from({ length: 50 }, (_, i) => ({ id: i, title: `r${i}` }))
      if (calls === 2) throw new Error('network down')
      return []
    })
    const search = setup(onSearch)

    search.searchQuery.value = 'thing'
    await search.handleSearch(null, false)
    await search.loadMoreResults() // fails
    await search.loadMoreResults() // retry

    // The failed page must be retried, not skipped over.
    const offsets = onSearch.mock.calls.map(c => c[3].offset)
    expect(offsets[2]).toBe(offsets[1])
  })
})
