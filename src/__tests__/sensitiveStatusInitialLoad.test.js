import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The sensitive-notes status is shared module state. It used to be fetched only
 * by the settings panel on mount, so until the user opened that panel every
 * other consumer saw the default `{enabled: false, unlocked: false}` - and any
 * guard written against it was inert on a freshly started app.
 * See docs/architecture/sensitive-notes.md.
 */

const sensitiveStatus = vi.fn(async () => ({ available: true, enabled: true, unlocked: false }))

vi.mock('../services/api', () => ({
  api: {
    sensitiveStatus,
    onSensitiveLocked: vi.fn(() => () => {}),
  },
}))

beforeEach(() => {
  vi.resetModules()
  sensitiveStatus.mockClear()
})

describe('the shared sensitive-notes status', () => {
  it('is loaded the first time any consumer asks for it', async () => {
    const { useSensitiveNotes } = await import('../composables/useSensitiveNotes.js')

    const { status } = useSensitiveNotes()
    await vi.waitFor(() => expect(status.value.enabled).toBe(true))

    expect(sensitiveStatus).toHaveBeenCalled()
  })

  it('is fetched once however many consumers use it', async () => {
    const { useSensitiveNotes } = await import('../composables/useSensitiveNotes.js')

    useSensitiveNotes()
    useSensitiveNotes()
    useSensitiveNotes()
    await vi.waitFor(() => expect(sensitiveStatus).toHaveBeenCalled())

    expect(sensitiveStatus).toHaveBeenCalledTimes(1)
  })

  it('survives a status call that rejects, rather than raising unhandled', async () => {
    sensitiveStatus.mockRejectedValueOnce(new Error('database is locked'))
    const { useSensitiveNotes } = await import('../composables/useSensitiveNotes.js')

    const { status } = useSensitiveNotes()
    await Promise.resolve()

    expect(status.value.enabled).toBe(false)
  })
})
