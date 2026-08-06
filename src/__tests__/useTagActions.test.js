import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { useTagActions } from '../composables/useTagActions.js'

vi.mock('../composables/useErrorHandler.js', () => ({ handleError: vi.fn() }))

import { handleError } from '../composables/useErrorHandler.js'

function setup(overrides = {}) {
  const deps = {
    searchQuery: ref(''),
    showSearch: ref(false),
    onSearchInput: vi.fn(),
    enterContainer: vi.fn(),
    deleteNode: vi.fn().mockResolvedValue(undefined),
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

  it('deleteTag routes through the shared deleteNode action', async () => {
    global.confirm = vi.fn().mockReturnValue(true)
    const { deps, actions } = setup()
    await actions.deleteTag({ id: 42, title: 'gone' })
    expect(deps.deleteNode).toHaveBeenCalledWith(42)
  })

  it('deleteTag does nothing when the user cancels', async () => {
    global.confirm = vi.fn().mockReturnValue(false)
    const { deps, actions } = setup()
    await actions.deleteTag({ id: 1, title: 'keep' })
    expect(deps.deleteNode).not.toHaveBeenCalled()
  })

  it('deleteTag reports a failed delete instead of throwing', async () => {
    global.confirm = vi.fn().mockReturnValue(true)
    const { deps, actions } = setup({ deleteNode: vi.fn().mockRejectedValue(new Error('boom')) })
    await actions.deleteTag({ id: 3, title: 'bad' })
    expect(deps.deleteNode).toHaveBeenCalledWith(3)
    expect(handleError).toHaveBeenCalled()
  })
})
