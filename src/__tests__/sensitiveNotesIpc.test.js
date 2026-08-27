import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { isEncryptedNote } from '../../electron/database/sensitiveNotes.js'
import { registerSensitiveNotesHandlers, SENSITIVE_SETTINGS_KEY } from '../../electron/ipc/sensitiveNotes.js'
import { SENSITIVE_ENABLE, SENSITIVE_DISABLE, SENSITIVE_STATUS } from '../../electron/ipcChannels.js'

/**
 * The sensitive-notes IPC handlers against the real Database and session.
 * Enabling wraps the key under the recovery password, so the password has to be
 * verified before it is used. Disabling has to decrypt every note before the
 * key is dropped (docs/architecture/sensitive-notes.md).
 */

const RECOVERY_PW = 'recovery-pw'

let dir, db, handlers, session, verifyCalls

function setup({ encrypted = true } = {}) {
  handlers = {}
  session = null
  verifyCalls = []
  const ipcMain = { handle: (channel, fn) => (handlers[channel] = fn) }
  registerSensitiveNotesHandlers(ipcMain, {
    getDb: () => db,
    getSession: () => session,
    setSession: s => {
      session = s
      db.sensitiveSession = s
    },
    createSession: wrappedKey => createSensitiveSession({ wrappedKey }),
    isDatabaseEncrypted: () => encrypted,
    verifyRecoveryPassword: password => {
      verifyCalls.push(password)
      if (password !== RECOVERY_PW) throw new Error('Wrong password')
    },
  })
}

const call = (channel, ...args) => handlers[channel](null, ...args)

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

describe('enable', () => {
  it('verifies the recovery password before wrapping the key under it', () => {
    expect(call(SENSITIVE_ENABLE, 'not-the-recovery-password')).toEqual({
      success: false,
      error: 'Wrong password',
    })
    expect(verifyCalls).toEqual(['not-the-recovery-password'])
    // Nothing was enabled, so nothing was wrapped under the wrong password.
    expect(session).toBeNull()
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBeFalsy()
  })

  it('enables and stores the wrapped key when the password is right', () => {
    expect(call(SENSITIVE_ENABLE, RECOVERY_PW)).toEqual({ success: true })
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBeTruthy()
    expect(call(SENSITIVE_STATUS)).toMatchObject({ enabled: true, unlocked: true })
  })
})

describe('disable', () => {
  beforeEach(() => {
    call(SENSITIVE_ENABLE, RECOVERY_PW)
  })

  it('decrypts a trashed note before dropping the key', () => {
    const trashed = sensitiveNote('trashed', 'secret-trashed')
    db.deleteNode(trashed.id, false)

    expect(call(SENSITIVE_DISABLE)).toEqual({ success: true })

    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [trashed.id])[0].notes
    expect(isEncryptedNote(raw)).toBe(false)
    expect(raw).toBe('secret-trashed')
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBeFalsy()
  })

  it('keeps the key when a note cannot be decrypted', () => {
    const good = sensitiveNote('good', 'recoverable')
    const broken = db.createNode({ type: 'note', title: 'broken', workspace_id: 'work' })
    db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', ['SNENC1:bad', broken.id])

    expect(call(SENSITIVE_DISABLE).success).toBe(false)

    // The wrapped key must survive, or `good` becomes unreadable forever.
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBeTruthy()
    const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [good.id])[0].notes
    expect(isEncryptedNote(raw)).toBe(true)
  })

  it('refuses to run while the session is locked', () => {
    sensitiveNote('live', 'secret')
    session.lock()

    expect(call(SENSITIVE_DISABLE)).toEqual({ success: false, error: 'Unlock sensitive notes first' })
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBeTruthy()
  })
})
