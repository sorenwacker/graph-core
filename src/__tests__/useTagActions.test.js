import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useTagActions } from '../composables/useTagActions.js'

vi.mock('../services/api.js', () => ({
  api: { deleteNode: vi.fn().mockResolvedValue({ success: true }) },
}))
vi.mock('../composables/useErrorHandler.js', () => ({ handleError: vi.fn() }))

import { api } from '../services/api.js'

function setup(overrides = {}) {
  const deps = {
    searchQuery: ref(''),
    showSearch: ref(false),
    onSearchInput: vi.fn(),
    enterContainer: vi.fn(),
    currentContainerId: ref(null),
    navigateToBreadcrumb: vi.fn(),
    loadTags: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { deps, actions: useTagActions(deps) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useTagActions', () => {
  it('selectTag sets a hashtag query and opens search', () => {
    const { deps, actions } = setup()
    actions.selectTag({ title: 'urgent' })
    expect(deps.searchQuery.value).toBe('#urgent')
    expect(deps.showSearch.value).toBe(true)
    expect(deps.onSearchInput).toHaveBeenCalled()
  })

  it('navigateToTag enters the tag container', async () => {
    const { deps, actions } = setup()
    const tag = { id: 7, title: 'work' }
    await actions.navigateToTag(tag)
    expect(deps.enterContainer).toHaveBeenCalledWith(tag)
  })

  it('navigateToTag ignores a tag without an id', async () => {
    const { deps, actions } = setup()
    await actions.navigateToTag({ title: 'noid' })
    expect(deps.enterContainer).not.toHaveBeenCalled()
  })

  it('deleteTag deletes, reloads tags, and redirects when viewing the deleted tag', async () => {
    global.confirm = vi.fn().mockReturnValue(true)
    const { deps, actions } = setup({ currentContainerId: ref(42) })
    await actions.deleteTag({ id: 42, title: 'gone' })
    expect(api.deleteNode).toHaveBeenCalledWith(42)
    expect(deps.navigateToBreadcrumb).toHaveBeenCalledWith(-1)
    expect(deps.loadTags).toHaveBeenCalled()
  })

  it('deleteTag does nothing when the user cancels', async () => {
    global.confirm = vi.fn().mockReturnValue(false)
    const { actions } = setup()
    await actions.deleteTag({ id: 1, title: 'keep' })
    expect(api.deleteNode).not.toHaveBeenCalled()
  })
})
