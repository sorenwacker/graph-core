import { describe, it, expect, vi } from 'vitest'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { legacyEncryptNote, legacyKey, legacyWrapKey } from './helpers/legacySensitiveNotes.js'

/**
 * The sensitive session (docs/architecture/sensitive-notes.md). The public key
 * is held in the open, so encrypting works in any state. The private key lives
 * in memory only while unlocked and is cleared on relock. The renderer never
 * receives either.
 */

/** A fake keychain: wraps by prefixing, and refuses foreign blobs. */
const keychain = {
  wrap: key => Buffer.concat([Buffer.from('kc:'), key]),
  unwrap: blob => {
    if (!blob.subarray(0, 3).equals(Buffer.from('kc:'))) throw new Error('foreign blob')
    return blob.subarray(3)
  },
}

function enabled({ withKeychain = false } = {}) {
  const s = createSensitiveSession()
  const slots = s.enable('pw', { keychainWrap: withKeychain ? keychain.wrap : null })
  return { s, slots }
}

describe('lifecycle', () => {
  it('starts disabled and locked with no keys', () => {
    const s = createSensitiveSession()
    expect(s.isEnabled()).toBe(false)
    expect(s.isUnlocked()).toBe(false)
    expect(s.canEncrypt()).toBe(false)
  })

  it('enable returns the public key and the slots, and leaves the session unlocked', () => {
    const { s, slots } = enabled({ withKeychain: true })
    expect(slots.publicKey.length).toBe(32)
    expect(Buffer.isBuffer(slots.passwordSlot)).toBe(true)
    expect(Buffer.isBuffer(slots.keychainSlot)).toBe(true)
    expect(s.isEnabled()).toBe(true)
    expect(s.isUnlocked()).toBe(true)
    expect(s.hasKeychainSlot()).toBe(true)
  })

  it('writes no keychain slot without a keychain', () => {
    const { s, slots } = enabled()
    expect(slots.keychainSlot).toBeNull()
    expect(s.hasKeychainSlot()).toBe(false)
  })

  it('reopens from stored slots, locked', () => {
    const { slots } = enabled()
    const s = createSensitiveSession({ keys: slots })
    expect(s.isEnabled()).toBe(true)
    expect(s.isUnlocked()).toBe(false)
    expect(s.canEncrypt()).toBe(true)
  })

  it('unlocks with the right password and refuses the wrong one', () => {
    const { slots } = enabled()
    const s = createSensitiveSession({ keys: slots })
    expect(s.unlock('wrong')).toBe(false)
    expect(s.isUnlocked()).toBe(false)
    expect(s.unlock('pw')).toBe(true)
    expect(s.isUnlocked()).toBe(true)
  })

  it('unlocks through the keychain slot, and reports a foreign slot as a failure', () => {
    const { slots } = enabled({ withKeychain: true })
    const s = createSensitiveSession({ keys: slots })
    expect(s.unlockWithKeychain(keychain.unwrap)).toBe(true)
    expect(s.isUnlocked()).toBe(true)

    const other = createSensitiveSession({ keys: { ...slots, keychainSlot: Buffer.from('xx:junk') } })
    expect(other.unlockWithKeychain(keychain.unwrap)).toBe(false)
    expect(other.isUnlocked()).toBe(false)
  })

  it('lock clears the private key and calls back', () => {
    const onLock = vi.fn()
    const s = createSensitiveSession({ onLock })
    s.enable('pw')
    s.lock()
    expect(s.isUnlocked()).toBe(false)
    expect(s.canEncrypt()).toBe(true)
    expect(onLock).toHaveBeenCalledTimes(1)
  })
})

describe('the keychain slot over time', () => {
  it('is written by a password unlock when the gate is on and dropped when it is off', () => {
    const { slots } = enabled()
    const s = createSensitiveSession({ keys: slots })
    s.unlock('pw')
    const written = s.refreshKeychainSlot(keychain.wrap)
    expect(Buffer.isBuffer(written)).toBe(true)
    expect(s.hasKeychainSlot()).toBe(true)

    s.dropKeychainSlot()
    expect(s.hasKeychainSlot()).toBe(false)
    expect(s.refreshKeychainSlot(null)).toBeNull()
  })

  it('cannot be written while locked, since the private key is not in memory', () => {
    const { slots } = enabled()
    const s = createSensitiveSession({ keys: slots })
    expect(() => s.refreshKeychainSlot(keychain.wrap)).toThrow(/locked/i)
  })
})

describe('encrypt and decrypt through the session', () => {
  it('encrypts while locked, since only the public key is needed', () => {
    const { slots } = enabled()
    const s = createSensitiveSession({ keys: slots })
    const stored = s.encrypt('secret')
    expect(stored.startsWith('SNENC2:')).toBe(true)
    s.unlock('pw')
    expect(s.decryptForRead(stored)).toBe('secret')
  })

  it('returns the raw marker while locked', () => {
    const { s } = enabled()
    const stored = s.encrypt('secret plan')
    s.lock()
    expect(s.decryptForRead(stored)).toBe(stored)
  })

  it('passes plaintext note values through unchanged', () => {
    const { s } = enabled()
    expect(s.decryptForRead('plain note')).toBe('plain note')
    expect(s.decryptForRead(null)).toBe(null)
  })

  it('refuses to encrypt when enabled but without a key pair yet', () => {
    const s = createSensitiveSession({ keys: { legacyWrappedKey: legacyWrapKey(legacyKey(), 'pw') } })
    expect(s.isEnabled()).toBe(true)
    expect(s.canEncrypt()).toBe(false)
    expect(() => s.encrypt('x')).toThrow(/unlock/i)
  })
})

describe('a database from before the key pair', () => {
  const oldKey = legacyKey()
  const keys = { legacyWrappedKey: legacyWrapKey(oldKey, 'pw') }

  it('unlocks with the password and reads old notes, and reports the migration pending', () => {
    const s = createSensitiveSession({ keys })
    expect(s.unlock('pw')).toBe(true)
    expect(s.needsMigration()).toBe(true)
    expect(s.decryptForRead(legacyEncryptNote('old', oldKey))).toBe('old')
  })

  it('creates the key pair on request, after which it seals and still reads old notes', () => {
    const s = createSensitiveSession({ keys })
    s.unlock('pw')
    const slots = s.createKeyPair('pw', { keychainWrap: keychain.wrap })
    expect(slots.publicKey.length).toBe(32)
    expect(Buffer.isBuffer(slots.keychainSlot)).toBe(true)
    expect(s.canEncrypt()).toBe(true)
    expect(s.decryptForRead(s.encrypt('new'))).toBe('new')
    expect(s.decryptForRead(legacyEncryptNote('old', oldKey))).toBe('old')
  })

  it('forgets the old key once told the migration is done', () => {
    const s = createSensitiveSession({ keys })
    s.unlock('pw')
    s.createKeyPair('pw', {})
    s.finishMigration()
    expect(s.needsMigration()).toBe(false)
    const value = legacyEncryptNote('old', oldKey)
    expect(s.decryptForRead(value)).toBe(value)
  })

  it('has no keychain unlock until the key pair exists', () => {
    const s = createSensitiveSession({ keys })
    expect(s.unlockWithKeychain(keychain.unwrap)).toBe(false)
  })
})

describe('idle relock', () => {
  it('relocks after the idle timeout and can be kept alive by activity', () => {
    vi.useFakeTimers()
    try {
      const onLock = vi.fn()
      const s = createSensitiveSession({ idleMs: 1000, onLock })
      s.enable('pw')

      vi.advanceTimersByTime(800)
      s.touch()
      vi.advanceTimersByTime(800)
      expect(s.isUnlocked()).toBe(true)

      vi.advanceTimersByTime(300)
      expect(s.isUnlocked()).toBe(false)
      expect(onLock).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
