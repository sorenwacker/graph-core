import { describe, it, expect } from 'vitest'
import {
  ENCRYPTION_MAGIC,
  isEncrypted,
  generateDatabaseKey,
  encryptDatabase,
  decryptDatabase,
  wrapKeyWithPassword,
  unwrapKeyWithPassword,
  SLOT_TYPE_KEYCHAIN,
  SLOT_TYPE_PASSWORD,
} from '../../electron/database/encryption.js'

/**
 * The at-rest encryption engine (docs/architecture/encryption.md). Everything
 * here is pure Node crypto: the safeStorage keychain slot is wrapped at the
 * Electron layer, but the format, the password slot, and the payload cipher
 * are all testable without Electron.
 */

const plaintext = Buffer.from('SQLite format 3\0 pretend this is a database export')

describe('payload encryption', () => {
  it('round-trips a buffer through encrypt and decrypt', () => {
    const key = generateDatabaseKey()
    const slots = [{ type: SLOT_TYPE_PASSWORD, blob: wrapKeyWithPassword(key, 'pw') }]
    const file = encryptDatabase(plaintext, key, slots)

    expect(Buffer.compare(decryptDatabase(file, key), plaintext)).toBe(0)
  })

  it('marks the file with the magic so isEncrypted can tell it apart', () => {
    const key = generateDatabaseKey()
    const file = encryptDatabase(plaintext, key, [])

    expect(file.subarray(0, ENCRYPTION_MAGIC.length).toString()).toBe(ENCRYPTION_MAGIC)
    expect(isEncrypted(file)).toBe(true)
    expect(isEncrypted(plaintext)).toBe(false)
  })

  it('produces a different ciphertext every time (fresh nonce)', () => {
    const key = generateDatabaseKey()
    const a = encryptDatabase(plaintext, key, [])
    const b = encryptDatabase(plaintext, key, [])

    expect(Buffer.compare(a, b)).not.toBe(0)
  })

  it('rejects a wrong key instead of returning garbage', () => {
    const file = encryptDatabase(plaintext, generateDatabaseKey(), [])

    expect(() => decryptDatabase(file, generateDatabaseKey())).toThrow()
  })

  it('rejects a tampered file (GCM authentication)', () => {
    const key = generateDatabaseKey()
    const file = encryptDatabase(plaintext, key, [])
    file[file.length - 1] ^= 0xff

    expect(() => decryptDatabase(file, key)).toThrow()
  })
})

describe('password key slot', () => {
  it('round-trips the database key through the password slot', () => {
    const key = generateDatabaseKey()
    const blob = wrapKeyWithPassword(key, 'correct horse battery staple')

    expect(Buffer.compare(unwrapKeyWithPassword(blob, 'correct horse battery staple'), key)).toBe(0)
  })

  it('rejects a wrong password loudly', () => {
    const blob = wrapKeyWithPassword(generateDatabaseKey(), 'right')

    expect(() => unwrapKeyWithPassword(blob, 'wrong')).toThrow()
  })

  it('salts the derivation: same password, different blobs', () => {
    const key = generateDatabaseKey()
    const a = wrapKeyWithPassword(key, 'pw')
    const b = wrapKeyWithPassword(key, 'pw')

    expect(Buffer.compare(a, b)).not.toBe(0)
  })
})

describe('key slots travel with the file', () => {
  it('recovers the key from the file itself with only the password', () => {
    // The complete keychain-loss story: file plus password is enough.
    const key = generateDatabaseKey()
    const slots = [
      { type: SLOT_TYPE_KEYCHAIN, blob: Buffer.from('machine-bound-opaque-blob') },
      { type: SLOT_TYPE_PASSWORD, blob: wrapKeyWithPassword(key, 'recovery-pw') },
    ]
    const file = encryptDatabase(plaintext, key, slots)

    const { readSlots } = require('../../electron/database/encryption.js')
    const parsed = readSlots(file)
    const passwordSlot = parsed.find(s => s.type === SLOT_TYPE_PASSWORD)
    const recovered = unwrapKeyWithPassword(passwordSlot.blob, 'recovery-pw')

    expect(Buffer.compare(decryptDatabase(file, recovered), plaintext)).toBe(0)
  })

  it('preserves slot order and opaque keychain blobs', () => {
    const key = generateDatabaseKey()
    const keychainBlob = Buffer.from([1, 2, 3, 250, 251])
    const file = encryptDatabase(plaintext, key, [{ type: SLOT_TYPE_KEYCHAIN, blob: keychainBlob }])

    const { readSlots } = require('../../electron/database/encryption.js')
    const parsed = readSlots(file)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe(SLOT_TYPE_KEYCHAIN)
    expect(Buffer.compare(parsed[0].blob, keychainBlob)).toBe(0)
  })
})

describe('Database integration', () => {
  const { mkdtempSync, rmSync, readFileSync, readdirSync } = require('fs')
  const { tmpdir } = require('os')
  const { join } = require('path')
  const Database = require('../../electron/database/index.js')

  async function withDir(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'gc-enc-'))
    try {
      await fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('writes ciphertext, reloads with the key, and refuses without it', async () => {
    await withDir(async dir => {
      const path = join(dir, 'graph.db')
      const key = generateDatabaseKey()

      const db = new Database(path, { encryptionKey: key })
      await db.ready
      db.createNode({ type: 'note', title: 'secret note', workspace_id: 'work' })

      const onDisk = readFileSync(path)
      expect(isEncrypted(onDisk)).toBe(true)
      expect(onDisk.includes('secret note')).toBe(false)

      const reloaded = new Database(path, { encryptionKey: key })
      await reloaded.ready
      expect(reloaded.getNode(1).title).toBe('secret note')

      // Without the key the file is locked, not corrupt: loading must throw,
      // and must not preserve-and-replace the file with an empty database.
      const locked = new Database(path)
      await expect(locked.ready).rejects.toThrow(/encrypted/)
      expect(isEncrypted(readFileSync(path))).toBe(true)
    })
  })

  it('encrypts backups with the same key and restores through them', async () => {
    await withDir(async dir => {
      const path = join(dir, 'graph.db')
      const key = generateDatabaseKey()

      const db = new Database(path, { encryptionKey: key })
      await db.ready
      db.createNode({ type: 'note', title: 'backed up', workspace_id: 'work' })
      const backupPath = db.backup()

      expect(isEncrypted(readFileSync(backupPath))).toBe(true)

      db.deleteNode(1, true)
      db.restoreBackup(backupPath)
      expect(db.getNode(1).title).toBe('backed up')

      // Every db file the flow produced is ciphertext - no plaintext leaks.
      for (const f of readdirSync(dir).filter(f => f.endsWith('.db'))) {
        expect(isEncrypted(readFileSync(join(dir, f))), f).toBe(true)
      }
    })
  })

  it('migrates a legacy plaintext file to ciphertext on the next save', async () => {
    await withDir(async dir => {
      const path = join(dir, 'graph.db')

      const plain = new Database(path)
      await plain.ready
      plain.createNode({ type: 'note', title: 'pre-encryption', workspace_id: 'work' })
      expect(isEncrypted(readFileSync(path))).toBe(false)

      const key = generateDatabaseKey()
      const encrypted = new Database(path, { encryptionKey: key })
      await encrypted.ready
      encrypted.setSetting('migrated', 'yes')

      expect(isEncrypted(readFileSync(path))).toBe(true)
      expect(encrypted.getNode(1).title).toBe('pre-encryption')
    })
  })
})
