import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { useNavigation } from '../composables/useNavigation'

/**
 * loadChildren refused to run while another load was in flight. That dropped
 * navigations rather than sequencing them, and it silently disarmed the 404
 * recovery: onNotFound is awaited inside the catch, so App's fallback load
 * re-entered before the finally released the guard and returned immediately.
 *
 * The guard is now a request token: the newest call wins and a stale response
 * is discarded rather than the newer request being refused.
 */

function deferred() {
  let resolve
  const promise = new Promise(r => (resolve = r))
  return { promise, resolve }
}

function makeApi({ getChildren } = {}) {
  return {
    getRoots: vi.fn(async () => []),
    getChildren: getChildren || vi.fn(async () => []),
    getNode: vi.fn(async id => ({ id, title: `Node ${id}`, parent_id: null })),
    getDescendants: vi.fn(async () => []),
    getAncestors: vi.fn(async () => []),
  }
}

const setup = (api, opts = {}) =>
  useNavigation({ api, workspace: ref(null), debounce: { enabled: false, delay: 0 }, ...opts })

describe('concurrent navigation', () => {
  it('does not drop the second navigation', async () => {
    const first = deferred()
    const api = makeApi({
      getChildren: vi.fn(id => (id === 1 ? first.promise : Promise.resolve([]))),
    })
    const nav = setup(api)

    const a = nav.loadChildren(1)
    const b = nav.loadChildren(2)
    first.resolve([])
    await Promise.all([a, b])

    // The second navigation is carried out. The first bows out as soon as it
    // sees a newer ticket, which is why it never reaches getChildren.
    expect(api.getNode.mock.calls.map(c => c[0])).toContain(2)
    expect(nav.currentContainer.value.id).toBe(2)
  })

  it('lets the newest navigation win when an older response lands late', async () => {
    const slow = deferred()
    const api = makeApi({
      getChildren: vi.fn(id => (id === 1 ? slow.promise : Promise.resolve([{ id: 20, title: 'From 2' }]))),
    })
    const nav = setup(api)

    const a = nav.loadChildren(1)
    const b = nav.loadChildren(2)
    await b
    slow.resolve([{ id: 10, title: 'From 1' }])
    await a

    expect(nav.children.value.map(n => n.title)).toEqual(['From 2'])
  })

  it('reloads the same container when asked again', async () => {
    const api = makeApi()
    const nav = setup(api)

    await nav.loadChildren(5)
    await nav.loadChildren(5)

    // A refresh after a mutation targets the container already shown; refusing
    // it left the view stale.
    expect(api.getChildren.mock.calls.filter(c => c[0] === 5)).toHaveLength(2)
  })
})

describe('recovering from a missing container', () => {
  it('lets the not-found handler load somewhere else', async () => {
    const api = makeApi({
      getChildren: vi.fn(async id => {
        if (id === 99) throw new Error('404 Not found')
        return []
      }),
    })

    let recovered = false
    const nav = setup(api, {
      onNotFound: async () => {
        // App does exactly this: fall back to the root listing.
        await nav.loadChildren(null)
        recovered = true
      },
    })

    await nav.loadChildren(99)

    expect(recovered).toBe(true)
    expect(api.getRoots).toHaveBeenCalled()
  })
})
