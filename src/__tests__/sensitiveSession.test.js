import { describe, it, expect, vi } from 'vitest'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { generateSensitiveKey, encryptNote, wrapSensitiveKey } from '../../electron/database/sensitiveNotes.js'

/**
 * The sensitive session holds the sensitive-notes key in the main process for
 * the length of an unlocked session and clears it on relock. It is the only
 * place the key lives while the app runs; the renderer never receives it.
 */

describe('lifecycle', () => {
  it('starts locked with no configured key', () => {
    const s = createSensitiveSession()
    expect(s.isEnabled()).toBe(false)
    expect(s.isUnlocked()).toBe(false)
  })

  it('enable stores a wrapped key and leaves the session unlocked', () => {
    const s = createSensitiveSession()
    const wrapped = s.enable('recovery-pw')
    expect(Buffer.isBuffer(wrapped)).toBe(true)
    expect(s.isEnabled()).toBe(true)
    expect(s.isUnlocked()).toBe(true)
  })

  it('unlock with the right password opens the session, wrong password does not', () => {
    const key = generateSensitiveKey()
    const wrapped = wrapSensitiveKey(key, 'recovery-pw')
    const s = createSensitiveSession({ wrappedKey: wrapped })

    expect(s.isEnabled()).toBe(true)
    expect(s.isUnlocked()).toBe(false)
    expect(s.unlock('wrong')).toBe(false)
    expect(s.isUnlocked()).toBe(false)
    expect(s.unlock('recovery-pw')).toBe(true)
    expect(s.isUnlocked()).toBe(true)
  })

  it('lock clears the key from memory', () => {
    const s = createSensitiveSession()
    s.enable('pw')
    expect(s.isUnlocked()).toBe(true)
    s.lock()
    expect(s.isUnlocked()).toBe(false)
  })
})

describe('encrypt and decrypt through the session', () => {
  it('encrypts a note only while unlocked', () => {
    const s = createSensitiveSession()
    s.enable('pw')
    const stored = s.encrypt('secret')
    expect(stored.startsWith('SNENC1:')).toBe(true)

    s.lock()
    expect(() => s.encrypt('secret')).toThrow(/locked/i)
  })

  it('decrypts when unlocked, returns the raw marker when locked', () => {
    const s = createSensitiveSession()
    s.enable('pw')
    const stored = s.encrypt('secret plan')

    expect(s.decryptForRead(stored)).toBe('secret plan')
    s.lock()
    // Locked: the caller gets the ciphertext marker, not plaintext.
    expect(s.decryptForRead(stored)).toBe(stored)
  })

  it('passes plaintext note values through unchanged', () => {
    const s = createSensitiveSession()
    s.enable('pw')
    expect(s.decryptForRead('plain note')).toBe('plain note')
    expect(s.decryptForRead(null)).toBe(null)
  })
})

describe('idle relock', () => {
  it('relocks after the idle timeout and can be kept alive by activity', () => {
    vi.useFakeTimers()
    const s = createSensitiveSession({ idleMs: 1000 })
    s.enable('pw')
    expect(s.isUnlocked()).toBe(true)

    vi.advanceTimersByTime(600)
    s.touch()
    vi.advanceTimersByTime(600)
    expect(s.isUnlocked()).toBe(true) // touch reset the timer

    vi.advanceTimersByTime(1000)
    expect(s.isUnlocked()).toBe(false)
    vi.useRealTimers()
  })
})
