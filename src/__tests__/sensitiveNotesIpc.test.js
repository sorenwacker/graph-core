import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { isEncryptedNote, isLegacyEncryptedNote } from '../../electron/database/sensitiveNotes.js'
import {
  registerSensitiveNotesHandlers,
  SENSITIVE_SETTINGS_KEYS,
  SENSITIVE_KEYS,
  dropSensitiveKeychainSlot,
} from '../../electron/ipc/sensitiveNotes.js'
import {
  SENSITIVE_ENABLE,
  SENSITIVE_DISABLE,
  SENSITIVE_STATUS,
  SENSITIVE_UNLOCK,
  SENSITIVE_UNLOCK_TOUCH_ID,
  SENSITIVE_LOCK,
} from '../../electron/ipcChannels.js'
import { legacyEncryptNote, legacyKey, legacyWrapKey } from './helpers/legacySensitiveNotes.js'

/**
 * The sensitive-notes IPC handlers against the real Database and session
 * (docs/architecture/sensitive-notes.md). Enabling stores the public key in
 * the open and the private key in its slots. Revealing takes Touch ID through
 * the keychain slot or the recovery password. Disabling decrypts every note
 * before any key is dropped.
 */

const RECOVERY_PW = 'recovery-pw'

/** A fake keychain, machine-bound by construction. */
const keychain = {
  wrap: key => Buffer.concat([Buffer.from('kc:'), key]),
  unwrap: blob => {
    if (!blob.subarray(0, 3).equals(Buffer.from('kc:'))) throw new Error('foreign blob')
    return blob.subarray(3)
  },
}

let dir, db, handlers, session, verifyCalls, gate

function setup({ encrypted = true, touchIdGate = true, keychainAvailable = true, promptTouchId } = {}) {
  handlers = {}
  session = null
  verifyCalls = []
  gate = { touchIdGate }
  const ipcMain = { handle: (channel, fn) => (handlers[channel] = fn) }
  registerSensitiveNotesHandlers(ipcMain, {
    getDb: () => db,
    getSession: () => session,
    setSession: s => {
      session = s
      db.sensitiveSession = s
    },
    createSession: keys => createSensitiveSession({ keys }),
    isDatabaseEncrypted: () => encrypted,
    verifyRecoveryPassword: password => {
      verifyCalls.push(password)
      if (password !== RECOVERY_PW) throw new Error('Wrong password')
    },
    keychainWrap: keychainAvailable ? keychain.wrap : null,
    keychainUnwrap: keychain.unwrap,
    isTouchIdGateOn: () => gate.touchIdGate,
    touchIdAvailable: () => true,
    promptTouchId: promptTouchId || (async () => {}),
  })
}

const call = (channel, ...args) => handlers[channel](null, ...args)
const setting = key => db.getSetting(key)

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gc-sn-ipc-'))
  db = new Database(join(dir, 'graph.db'))
  await db.ready
  setup()
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function sensitiveNote(title, notes) {
  return db.createNode({ type: 'note', title, notes, notes_sensitive: true, workspace_id: 'work' })
}

/** Reopen the session from what is stored, as the next boot would. */
function reboot(options) {
  setup(options)
  const keys = Object.fromEntries(
    Object.entries(SENSITIVE_KEYS).map(([name, key]) => [
      name,
      setting(key) ? Buffer.from(setting(key), 'base64') : null,
    ])
  )
  session = createSensitiveSession({ keys })
  db.sensitiveSession = session
}

describe('enable', () => {
  it('verifies the recovery password before wrapping the private key under it', () => {
    expect(call(SENSITIVE_ENABLE, 'not-the-recovery-password')).toEqual({ success: false, error: 'Wrong password' })
    expect(verifyCalls).toEqual(['not-the-recovery-password'])
    expect(session).toBeNull()
    expect(setting(SENSITIVE_KEYS.publicKey)).toBeFalsy()
  })

  it('stores the public key, the password slot and, with the gate on, the keychain slot', () => {
    expect(call(SENSITIVE_ENABLE, RECOVERY_PW)).toEqual({ success: true })
    expect(setting(SENSITIVE_KEYS.publicKey)).toBeTruthy()
    expect(setting(SENSITIVE_KEYS.passwordSlot)).toBeTruthy()
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeTruthy()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ enabled: true, unlocked: true, lockable: true, touchId: true })
  })

  it('stores no keychain slot while the gate is off', () => {
    setup({ touchIdGate: false })
    call(SENSITIVE_ENABLE, RECOVERY_PW)
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeFalsy()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ touchId: false })
  })

  it('names every settings row it writes, so the renderer can be kept out of all of them', () => {
    expect(new Set(SENSITIVE_SETTINGS_KEYS)).toEqual(new Set(Object.values(SENSITIVE_KEYS)))
  })
})

describe('locking a note while the session is locked', () => {
  it('works, and the note reads as locked until an unlock', () => {
    call(SENSITIVE_ENABLE, RECOVERY_PW)
    reboot()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ enabled: true, unlocked: false, lockable: true })

    const node = sensitiveNote('vault', 'the secret')
    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
    expect(raw.startsWith('SNENC2:')).toBe(true)
    expect(db.getNodeNotes(node.id)).toEqual({ notes: null, locked: true })

    expect(call(SENSITIVE_UNLOCK, RECOVERY_PW)).toEqual({ success: true })
    expect(db.getNodeNotes(node.id)).toEqual({ notes: 'the secret', locked: false })
  })
})

describe('unlocking with Touch ID', () => {
  beforeEach(() => {
    call(SENSITIVE_ENABLE, RECOVERY_PW)
    reboot()
  })

  it('prompts, then unwraps the keychain slot', async () => {
    const prompt = vi.fn(async () => {})
    reboot({ promptTouchId: prompt })
    expect(await call(SENSITIVE_UNLOCK_TOUCH_ID)).toEqual({ success: true })
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(session.isUnlocked()).toBe(true)
  })

  it('stays locked when the prompt is declined', async () => {
    reboot({
      promptTouchId: async () => {
        throw new Error('declined')
      },
    })
    expect(await call(SENSITIVE_UNLOCK_TOUCH_ID)).toEqual({ success: false, error: 'Touch ID was not confirmed' })
    expect(session.isUnlocked()).toBe(false)
  })

  it('is not offered without a keychain slot', async () => {
    dropSensitiveKeychainSlot(db, session)
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeFalsy()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ touchId: false })
    expect((await call(SENSITIVE_UNLOCK_TOUCH_ID)).success).toBe(false)
  })
})

describe('the keychain slot over time', () => {
  beforeEach(() => {
    call(SENSITIVE_ENABLE, RECOVERY_PW)
  })

  it('is rewritten by a password unlock, so a lost keychain comes back', () => {
    db.setSetting(SENSITIVE_KEYS.keychainSlot, Buffer.from('xx:foreign').toString('base64'))
    reboot()
    expect(call(SENSITIVE_UNLOCK, RECOVERY_PW)).toEqual({ success: true })
    expect(Buffer.from(setting(SENSITIVE_KEYS.keychainSlot), 'base64').subarray(0, 3).toString()).toBe('kc:')
  })

  it('is dropped by a password unlock while the gate is off', () => {
    reboot({ touchIdGate: false })
    call(SENSITIVE_UNLOCK, RECOVERY_PW)
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeFalsy()
  })

  it('is dropped at once when the gate is turned off', () => {
    dropSensitiveKeychainSlot(db, session)
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeFalsy()
    expect(session.hasKeychainSlot()).toBe(false)
  })
})

describe('a database from before the key pair', () => {
  const oldKey = legacyKey()
  let oldNote, trashedOld

  beforeEach(() => {
    db.setSetting(SENSITIVE_KEYS.legacyWrappedKey, legacyWrapKey(oldKey, RECOVERY_PW).toString('base64'))
    oldNote = db.createNode({ type: 'note', title: 'old', workspace_id: 'work' })
    db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', [
      legacyEncryptNote('old secret', oldKey),
      oldNote.id,
    ])
    trashedOld = db.createNode({ type: 'note', title: 'trashed', workspace_id: 'work' })
    db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', [
      legacyEncryptNote('gone', oldKey),
      trashedOld.id,
    ])
    db.deleteNode(trashedOld.id, false)
    reboot()
  })

  it('is enabled but not lockable until the first password unlock', () => {
    expect(call(SENSITIVE_STATUS)).toMatchObject({ enabled: true, unlocked: false, lockable: false, touchId: false })
    expect(() => sensitiveNote('new', 'x')).toThrow(/unlock/i)
  })

  it('creates the key pair and re-seals every old note, including trashed ones, on that unlock', () => {
    expect(call(SENSITIVE_UNLOCK, RECOVERY_PW)).toEqual({ success: true })

    expect(setting(SENSITIVE_KEYS.publicKey)).toBeTruthy()
    expect(setting(SENSITIVE_KEYS.keychainSlot)).toBeTruthy()
    expect(setting(SENSITIVE_KEYS.legacyWrappedKey)).toBeFalsy()
    for (const id of [oldNote.id, trashedOld.id]) {
      const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [id])[0].notes
      expect(isLegacyEncryptedNote(raw)).toBe(false)
      expect(isEncryptedNote(raw)).toBe(true)
    }
    expect(db.getNodeNotes(oldNote.id)).toEqual({ notes: 'old secret', locked: false })
    expect(call(SENSITIVE_STATUS)).toMatchObject({ lockable: true, touchId: true })

    // The next boot reads the new keys and opens with Touch ID.
    reboot()
    expect(session.needsMigration()).toBe(false)
    expect(session.unlockWithKeychain(keychain.unwrap)).toBe(true)
    expect(db.getNodeNotes(oldNote.id).notes).toBe('old secret')
  })

  it('leaves everything as it was when an old note cannot be decrypted', () => {
    const broken = db.createNode({ type: 'note', title: 'broken', workspace_id: 'work' })
    db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', ['SNENC1:bad', broken.id])

    const result = call(SENSITIVE_UNLOCK, RECOVERY_PW)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/broken|cannot decrypt/i)
    expect(setting(SENSITIVE_KEYS.publicKey)).toBeFalsy()
    expect(setting(SENSITIVE_KEYS.legacyWrappedKey)).toBeTruthy()
    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [oldNote.id])[0].notes
    expect(isLegacyEncryptedNote(raw)).toBe(true)
  })
})

describe('disable', () => {
  beforeEach(() => {
    call(SENSITIVE_ENABLE, RECOVERY_PW)
  })

  it('decrypts a trashed note before dropping every key', () => {
    const trashed = sensitiveNote('trashed', 'secret-trashed')
    db.deleteNode(trashed.id, false)

    expect(call(SENSITIVE_DISABLE)).toEqual({ success: true })

    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [trashed.id])[0].notes
    expect(raw).toBe('secret-trashed')
    for (const key of SENSITIVE_SETTINGS_KEYS) expect(setting(key)).toBeFalsy()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ enabled: false })
  })

  it('keeps the keys when a note cannot be decrypted', () => {
    const good = sensitiveNote('good', 'recoverable')
    const broken = db.createNode({ type: 'note', title: 'broken', workspace_id: 'work' })
    db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', ['SNENC2:bad', broken.id])

    expect(call(SENSITIVE_DISABLE).success).toBe(false)

    expect(setting(SENSITIVE_KEYS.passwordSlot)).toBeTruthy()
    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [good.id])[0].notes
    expect(isEncryptedNote(raw)).toBe(true)
  })

  it('refuses to run while the session is locked', () => {
    sensitiveNote('live', 'secret')
    call(SENSITIVE_LOCK)

    expect(call(SENSITIVE_DISABLE)).toEqual({ success: false, error: 'Unlock sensitive notes first' })
    expect(setting(SENSITIVE_KEYS.passwordSlot)).toBeTruthy()
  })
})
