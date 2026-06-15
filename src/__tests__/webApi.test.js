import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { api } from '../services/api.ts'

/**
 * Web (HTTP) API implementation tests.
 *
 * In the test environment window.electronAPI is undefined, so the exported
 * `api` resolves to the web/HTTP implementation. These tests guard against the
 * web path diverging from the Electron path (e.g. a missing method that the
 * renderer calls unconditionally).
 */

describe('webApi.getDescendantsBatch', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        const match = String(url).match(/\/nodes\/(\d+)\/descendants/)
        const rootId = match ? Number(match[1]) : 0
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: rootId * 10, parent_id: rootId, title: `child-of-${rootId}` }],
        }
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('is implemented on the web API (was missing, crashing sidebar load)', () => {
    expect(typeof api.getDescendantsBatch).toBe('function')
  })

  it('returns a Map keyed by root id', async () => {
    const result = await api.getDescendantsBatch([1, 2])
    expect(result).toBeInstanceOf(Map)
    expect(result.get(1)).toEqual([{ id: 10, parent_id: 1, title: 'child-of-1' }])
    expect(result.get(2)).toEqual([{ id: 20, parent_id: 2, title: 'child-of-2' }])
  })

  it('fetches each root in parallel', async () => {
    await api.getDescendantsBatch([1, 2, 3])
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('returns an empty Map for no roots', async () => {
    const result = await api.getDescendantsBatch([])
    expect(result.size).toBe(0)
  })
})
