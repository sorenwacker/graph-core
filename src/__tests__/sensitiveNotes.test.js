import { describe, it, expect } from 'vitest'
import {
  SENSITIVE_MARKER,
  generateSensitiveKey,
  isEncryptedNote,
  encryptNote,
  decryptNote,
  wrapSensitiveKey,
  unwrapSensitiveKey,
} from '../../electron/database/sensitiveNotes.js'

/**
 * Sensitive-note content encryption (docs/architecture/sensitive-notes.md).
 * A note marked sensitive is stored as ciphertext under a key that is wrapped
 * by the recovery password, so silent database unlock alone never reveals it.
 */

describe('note content encryption', () => {
  it('round-trips note text through the marker format', () => {
    const key = generateSensitiveKey()
    const stored = encryptNote('secret plan for Q3', key)

    expect(stored.startsWith(SENSITIVE_MARKER)).toBe(true)
    expect(decryptNote(stored, key)).toBe('secret plan for Q3')
  })

  it('tells encrypted note values apart from plaintext', () => {
    const key = generateSensitiveKey()
    expect(isEncryptedNote(encryptNote('x', key))).toBe(true)
    expect(isEncryptedNote('just plain notes')).toBe(false)
    expect(isEncryptedNote('')).toBe(false)
    expect(isEncryptedNote(null)).toBe(false)
  })

  it('produces different ciphertext each time (fresh nonce)', () => {
    const key = generateSensitiveKey()
    expect(encryptNote('same', key)).not.toBe(encryptNote('same', key))
  })

  it('rejects a wrong key instead of returning garbage', () => {
    const stored = encryptNote('secret', generateSensitiveKey())
    expect(() => decryptNote(stored, generateSensitiveKey())).toThrow()
  })

  it('rejects a tampered value (GCM authentication)', () => {
    const key = generateSensitiveKey()
    const stored = encryptNote('secret', key)
    const tampered = stored.slice(0, -4) + (stored.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA')
    expect(() => decryptNote(tampered, key)).toThrow()
  })

  it('handles unicode and empty content', () => {
    const key = generateSensitiveKey()
    for (const text of ['', 'café ☕ 日本語', 'multi\nline\nnote']) {
      expect(decryptNote(encryptNote(text, key), key)).toBe(text)
    }
  })
})

describe('sensitive key wrapping under the recovery password', () => {
  it('round-trips the key through the password wrap', () => {
    const key = generateSensitiveKey()
    const blob = wrapSensitiveKey(key, 'recovery-pw')
    expect(Buffer.compare(unwrapSensitiveKey(blob, 'recovery-pw'), key)).toBe(0)
  })

  it('rejects a wrong password', () => {
    const blob = wrapSensitiveKey(generateSensitiveKey(), 'right')
    expect(() => unwrapSensitiveKey(blob, 'wrong')).toThrow()
  })
})
