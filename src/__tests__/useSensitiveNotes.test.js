import { describe, it, expect, vi, beforeEach } from 'vitest'

const captured = vi.hoisted(() => ({ onLocked: null }))
vi.mock('../services/api', () => ({
  api: {
    sensitiveStatus: vi.fn(),
    sensitiveEnable: vi.fn(),
    sensitiveUnlock: vi.fn(),
    sensitiveLock: vi.fn(),
    sensitiveDisable: vi.fn(),
    onSensitiveLocked: vi.fn(cb => {
      captured.onLocked = cb
      return () => {}
    }),
  },
}))

import { api } from '../services/api'
import { useSensitiveNotes } from '../composables/useSensitiveNotes'

beforeEach(() => {
  vi.clearAllMocks()
  api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: false })
})

describe('useSensitiveNotes', () => {
  it('refresh reads the status', async () => {
    const s = useSensitiveNotes()
    await s.refresh()
    expect(s.status.value.enabled).toBe(true)
    expect(s.status.value.unlocked).toBe(false)
  })

  it('unlock refreshes status on success', async () => {
    api.sensitiveUnlock.mockResolvedValue({ success: true })
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: true })
    const s = useSensitiveNotes()
    const result = await s.unlock('pw')
    expect(result.success).toBe(true)
    expect(s.status.value.unlocked).toBe(true)
  })

  it('unlock returns the error without refreshing on failure', async () => {
    api.sensitiveUnlock.mockResolvedValue({ success: false, error: 'Wrong password' })
    const s = useSensitiveNotes()
    const result = await s.unlock('nope')
    expect(result.error).toBe('Wrong password')
  })

  it('detects locked ciphertext note values', () => {
    const s = useSensitiveNotes()
    expect(s.isLockedNote('SNENC1:abcd')).toBe(true)
    expect(s.isLockedNote('plain notes')).toBe(false)
    expect(s.isLockedNote(null)).toBe(false)
  })

  it('re-reads status when the main process reports a relock', async () => {
    const s = useSensitiveNotes()
    // Simulate the app being unlocked, then a relock event arriving.
    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: true })
    await s.refresh()
    expect(s.status.value.unlocked).toBe(true)

    api.sensitiveStatus.mockResolvedValue({ available: true, enabled: true, unlocked: false })
    expect(typeof captured.onLocked).toBe('function')
    await captured.onLocked()
    expect(s.status.value.unlocked).toBe(false)
  })
})
