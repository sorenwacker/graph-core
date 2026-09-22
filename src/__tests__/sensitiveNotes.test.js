import { describe, it, expect } from 'vitest'
import {
  SENSITIVE_MARKER,
  LEGACY_SENSITIVE_MARKER,
  generateKeyPair,
  isEncryptedNote,
  isLegacyEncryptedNote,
  sealNote,
  openNote,
  decryptLegacyNote,
  wrapPrivateKey,
  unwrapPrivateKey,
} from '../../electron/database/sensitiveNotes.js'
import { legacyEncryptNote, legacyKey } from './helpers/legacySensitiveNotes.js'

/**
 * Sensitive-note content encryption (docs/architecture/sensitive-notes.md).
 * A note is a sealed box under the stored public key, so locking needs no
 * secret; opening it needs the private key, which is stored only wrapped.
 */

describe('sealing a note', () => {
  const { publicKey, privateKey } = generateKeyPair()

  it('round-trips note text through the marker format', () => {
    const stored = sealNote('the plan', publicKey)
    expect(stored.startsWith(SENSITIVE_MARKER)).toBe(true)
    expect(stored).toBe(`SNENC2:${stored.slice(7)}`)
    expect(openNote(stored, privateKey)).toBe('the plan')
  })

  it('needs only the public key to seal', () => {
    expect(() => sealNote('x', publicKey)).not.toThrow()
    expect(publicKey.length).toBe(32)
    expect(privateKey.length).toBe(32)
  })

  it('produces different ciphertext each time (fresh ephemeral key)', () => {
    expect(sealNote('same', publicKey)).not.toBe(sealNote('same', publicKey))
  })

  it('rejects the wrong private key instead of returning garbage', () => {
    const other = generateKeyPair()
    expect(() => openNote(sealNote('x', publicKey), other.privateKey)).toThrow(/wrong key|corrupted/i)
  })

  it('rejects a tampered value (GCM authentication)', () => {
    const stored = sealNote('x', publicKey)
    const blob = Buffer.from(stored.slice(SENSITIVE_MARKER.length), 'base64')
    blob[blob.length - 1] ^= 1
    expect(() => openNote(SENSITIVE_MARKER + blob.toString('base64'), privateKey)).toThrow()
  })

  it('handles unicode and empty content', () => {
    expect(openNote(sealNote('', publicKey), privateKey)).toBe('')
    expect(openNote(sealNote('ünïcödé 🔒', publicKey), privateKey)).toBe('ünïcödé 🔒')
  })

  it('tells sealed, legacy and plaintext values apart', () => {
    expect(isEncryptedNote(sealNote('x', publicKey))).toBe(true)
    expect(isEncryptedNote(`${LEGACY_SENSITIVE_MARKER}abc`)).toBe(true)
    expect(isLegacyEncryptedNote(`${LEGACY_SENSITIVE_MARKER}abc`)).toBe(true)
    expect(isLegacyEncryptedNote(sealNote('x', publicKey))).toBe(false)
    expect(isEncryptedNote('plain')).toBe(false)
    expect(isEncryptedNote(null)).toBe(false)
  })
})

describe('notes written by earlier versions', () => {
  it('still decrypt with the old symmetric key', () => {
    const key = legacyKey()
    expect(decryptLegacyNote(legacyEncryptNote('old', key), key)).toBe('old')
    expect(() => decryptLegacyNote(legacyEncryptNote('old', key), legacyKey())).toThrow()
  })
})

describe('the private key slots', () => {
  const { privateKey } = generateKeyPair()

  it('round-trip through the password wrap', () => {
    const blob = wrapPrivateKey(privateKey, 'recovery-pw')
    expect(Buffer.compare(unwrapPrivateKey(blob, 'recovery-pw'), privateKey)).toBe(0)
  })

  it('reject a wrong password', () => {
    expect(() => unwrapPrivateKey(wrapPrivateKey(privateKey, 'right'), 'wrong')).toThrow()
  })
})
