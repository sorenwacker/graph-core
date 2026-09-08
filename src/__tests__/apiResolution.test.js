import { describe, it, expect } from 'vitest'
import { resolveApi, MISSING_BRIDGE_MESSAGE } from '../services/api.ts'

/**
 * A packaged app whose preload bundle is missing has no `window.electronAPI`.
 * The renderer used to fall back to the HTTP client, which issues requests to
 * `/api` that nothing serves, so the app loaded and rendered nothing at all.
 * The release workflow gates every artifact on the preload being packaged
 * precisely because that failure is invisible.
 *
 * A build must refuse instead. Outside a build - Vitest, and the Vite renderer
 * that `electron:dev` runs - the HTTP implementation is what the code is
 * exercised against, so it stays available there.
 */

const electron = { getNodes: () => [] }
const web = { getNodes: () => [] }

describe('choosing the API implementation', () => {
  it('uses the Electron bridge whenever it is present', () => {
    expect(resolveApi({ bridge: electron, web, electron, isProduction: true })).toBe(electron)
    expect(resolveApi({ bridge: electron, web, electron, isProduction: false })).toBe(electron)
  })

  it('refuses to start a build with no bridge, rather than falling back', () => {
    expect(() => resolveApi({ bridge: undefined, web, electron, isProduction: true })).toThrow(MISSING_BRIDGE_MESSAGE)
  })

  it('names the preload bundle, so the failure points at its own cause', () => {
    expect(MISSING_BRIDGE_MESSAGE).toContain('preload')
  })

  it('still resolves the HTTP implementation outside a build', () => {
    expect(resolveApi({ bridge: undefined, web, electron, isProduction: false })).toBe(web)
  })
})
