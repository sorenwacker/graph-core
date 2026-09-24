import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * A secret setting must not be mirrored to localStorage in the desktop app
 * (docs/reference/settings.md, "Where settings are kept"). Every setting was
 * copied there as a pre-database fallback, including the OpenAI API key, which
 * put a live credential in plain files beside the encrypted database.
 */

const setSetting = vi.fn(async () => {})
const deleteSetting = vi.fn(async () => {})

function installBridge() {
  globalThis.window.electronAPI = {
    getAllSettings: vi.fn(async () => ({})),
    setSetting,
    deleteSetting,
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  setSetting.mockClear()
  deleteSetting.mockClear()
})

afterEach(() => {
  delete globalThis.window.electronAPI
})

describe('a secret setting in the desktop app', () => {
  it('goes to the database and not to localStorage', async () => {
    installBridge()
    const { useSettings } = await import('../composables/useSettings')
    const s = useSettings()
    await flush()

    s.openaiApiKey.value = 'sk-live-key'
    await flush()

    expect(setSetting).toHaveBeenCalledWith('graphcore-openaiApiKey', 'sk-live-key')
    expect(localStorage.getItem('graphcore-openaiApiKey')).toBeNull()
    // Nothing anywhere in localStorage may hold it.
    const dump = Object.keys(localStorage)
      .map(k => localStorage.getItem(k))
      .join('|')
    expect(dump).not.toContain('sk-live-key')
  })

  it('deletes a copy an earlier version left behind', async () => {
    localStorage.setItem('graphcore-openaiApiKey', 'sk-leaked-earlier')
    installBridge()
    const { useSettings } = await import('../composables/useSettings')
    useSettings()
    await flush()

    expect(localStorage.getItem('graphcore-openaiApiKey')).toBeNull()
  })
})

describe('an ordinary setting', () => {
  it('still keeps its localStorage copy for the first paint', async () => {
    installBridge()
    const { useSettings } = await import('../composables/useSettings')
    const s = useSettings()
    await flush()

    s.aiProvider.value = 'openai'
    await flush()

    expect(localStorage.getItem('graphcore-aiProvider')).toBe('openai')
  })
})
