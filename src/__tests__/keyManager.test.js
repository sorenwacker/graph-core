import { describe, it, expect, vi } from 'vitest'
import { createKeyManager } from '../../electron/database/keyManager.js'
import {
  generateDatabaseKey,
  encryptDatabase,
  wrapKeyWithPassword,
  readSlots,
  unwrapKeyWithPassword,
  SLOT_TYPE_KEYCHAIN,
  SLOT_TYPE_PASSWORD,
} from '../../electron/database/encryption.js'

/**
 * The key manager owns unlock and enablement (docs/architecture/encryption.md
 * "Unlock flow"). safeStorage is injected so every path is testable: the
 * keychain unlock, the password fallback that re-wraps into the keychain, and
 * enablement with and without an available keychain.
 */

function fakeSafeStorage({ available = true } = {}) {
  // Reversible stand-in for the OS keychain: prefix marks the wrapped blob.
  return {
    isEncryptionAvailable: () => available,
    encryptString: vi.fn(s => Buffer.concat([Buffer.from('WRAPPED:'), Buffer.from(s, 'base64')])),
    decryptString: vi.fn(b => b.subarray('WRAPPED:'.length).toString('base64')),
  }
}

const plaintext = Buffer.from('pretend sqlite bytes')

describe('enable', () => {
  it('builds both slots when the keychain is available', () => {
    const km = createKeyManager({ safeStorage: fakeSafeStorage() })
    const { key, slots } = km.enable('recovery-pw')

    expect(key).toHaveLength(32)
    expect(slots.map(s => s.type).sort()).toEqual([SLOT_TYPE_KEYCHAIN, SLOT_TYPE_PASSWORD])
    expect(
      Buffer.compare(unwrapKeyWithPassword(slots.find(s => s.type === SLOT_TYPE_PASSWORD).blob, 'recovery-pw'), key)
    ).toBe(0)
  })

  it('builds only the password slot when the keychain is unavailable', () => {
    const km = createKeyManager({ safeStorage: fakeSafeStorage({ available: false }) })
    const { slots } = km.enable('recovery-pw')

    expect(slots.map(s => s.type)).toEqual([SLOT_TYPE_PASSWORD])
  })

  it('refuses an empty recovery password', () => {
    const km = createKeyManager({ safeStorage: fakeSafeStorage() })
    expect(() => km.enable('')).toThrow(/password/i)
  })
})

describe('unlock with keychain', () => {
  it('recovers the key from the keychain slot without a password', () => {
    const safeStorage = fakeSafeStorage()
    const km = createKeyManager({ safeStorage })
    const { key, slots } = km.enable('pw')
    const file = encryptDatabase(plaintext, key, slots)

    const unlocked = km.unlockWithKeychain(file)
    expect(Buffer.compare(unlocked, key)).toBe(0)
  })

  it('returns null when there is no keychain slot or the keychain fails', () => {
    const km = createKeyManager({ safeStorage: fakeSafeStorage() })
    const key = generateDatabaseKey()
    const file = encryptDatabase(plaintext, key, [{ type: SLOT_TYPE_PASSWORD, blob: wrapKeyWithPassword(key, 'pw') }])

    expect(km.unlockWithKeychain(file)).toBeNull()

    const broken = createKeyManager({
      safeStorage: {
        ...fakeSafeStorage(),
        decryptString: () => {
          throw new Error('keychain gone')
        },
      },
    })
    const withSlot = encryptDatabase(
      plaintext,
      key,
      createKeyManager({ safeStorage: fakeSafeStorage() }).enable('x').slots
    )
    expect(broken.unlockWithKeychain(withSlot)).toBeNull()
  })
})

describe('unlock with password', () => {
  it('recovers the key and re-wraps it into this keychain', () => {
    const enableSide = createKeyManager({ safeStorage: fakeSafeStorage() })
    const { key, slots } = enableSide.enable('recovery-pw')
    const file = encryptDatabase(plaintext, key, slots)

    // A different machine: fresh keychain, same file and password.
    const newMachine = fakeSafeStorage()
    const km = createKeyManager({ safeStorage: newMachine })
    const { key: recovered, slots: newSlots } = km.unlockWithPassword(file, 'recovery-pw')

    expect(Buffer.compare(recovered, key)).toBe(0)
    // The keychain slot was re-wrapped by the new machine's keychain.
    expect(newMachine.encryptString).toHaveBeenCalled()
    const keychainSlot = newSlots.find(s => s.type === SLOT_TYPE_KEYCHAIN)
    expect(keychainSlot).toBeDefined()
    expect(Buffer.compare(km.unlockWithKeychain(encryptDatabase(plaintext, recovered, newSlots)), key)).toBe(0)
    // The password slot survives untouched.
    expect(
      Buffer.compare(unwrapKeyWithPassword(newSlots.find(s => s.type === SLOT_TYPE_PASSWORD).blob, 'recovery-pw'), key)
    ).toBe(0)
  })

  it('throws on a wrong password', () => {
    const km = createKeyManager({ safeStorage: fakeSafeStorage() })
    const { key, slots } = km.enable('right')
    const file = encryptDatabase(plaintext, key, slots)

    expect(() => km.unlockWithPassword(file, 'wrong')).toThrow()
  })

  it('keeps only the password slot when the new machine has no keychain', () => {
    const { key, slots } = createKeyManager({ safeStorage: fakeSafeStorage() }).enable('pw')
    const file = encryptDatabase(plaintext, key, slots)

    const km = createKeyManager({ safeStorage: fakeSafeStorage({ available: false }) })
    const { slots: newSlots } = km.unlockWithPassword(file, 'pw')

    expect(newSlots.map(s => s.type)).toEqual([SLOT_TYPE_PASSWORD])
  })
})
