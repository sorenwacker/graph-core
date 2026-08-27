import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { registerDatabaseHandlers } from '../../electron/ipc/database.js'
import { SENSITIVE_SETTINGS_KEY } from '../../electron/ipc/sensitiveNotes.js'
import {
  DB_GET_SETTING,
  DB_GET_ALL_SETTINGS,
  DB_SET_SETTING,
  DB_SET_SETTINGS,
  DB_DELETE_SETTING,
} from '../../electron/ipcChannels.js'

/**
 * The wrapped sensitive-notes key is stored in the settings table but belongs
 * to the main process. Handing it to the renderer exposes key material, and
 * letting the renderer write or delete it makes every sensitive note
 * permanently unreadable (docs/architecture/sensitive-notes.md).
 */

let dir, db, handlers

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gc-settings-'))
  db = new Database(join(dir, 'graph.db'))
  await db.ready
  handlers = {}
  registerDatabaseHandlers({ handle: (channel, fn) => (handlers[channel] = fn) }, db)
  db.setSetting(SENSITIVE_SETTINGS_KEY, 'the-wrapped-key')
  db.setSetting('theme', 'dark')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const call = (channel, ...args) => handlers[channel](null, ...args)

describe('the wrapped sensitive-notes key', () => {
  it('is withheld from a single-setting read', () => {
    expect(call(DB_GET_SETTING, SENSITIVE_SETTINGS_KEY)).toBeNull()
  })

  it('is withheld from the all-settings read', () => {
    const all = call(DB_GET_ALL_SETTINGS)
    expect(all).not.toHaveProperty(SENSITIVE_SETTINGS_KEY)
    expect(all.theme).toBe('dark')
  })

  it('cannot be overwritten through the settings channel', () => {
    expect(() => call(DB_SET_SETTING, SENSITIVE_SETTINGS_KEY, 'replaced')).toThrow()
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBe('the-wrapped-key')
  })

  it('cannot be overwritten through a bulk settings write', () => {
    expect(() => call(DB_SET_SETTINGS, { theme: 'light', [SENSITIVE_SETTINGS_KEY]: 'replaced' })).toThrow()
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBe('the-wrapped-key')
    // The whole write is rejected rather than silently applied in part.
    expect(db.getSetting('theme')).toBe('dark')
  })

  it('cannot be deleted through the settings channel', () => {
    expect(() => call(DB_DELETE_SETTING, SENSITIVE_SETTINGS_KEY)).toThrow()
    expect(db.getSetting(SENSITIVE_SETTINGS_KEY)).toBe('the-wrapped-key')
  })
})

describe('ordinary settings', () => {
  it('still read, write and delete normally', () => {
    expect(call(DB_GET_SETTING, 'theme')).toBe('dark')
    call(DB_SET_SETTING, 'theme', 'light')
    expect(db.getSetting('theme')).toBe('light')
    call(DB_SET_SETTINGS, { a: '1', b: '2' })
    expect(db.getSetting('a')).toBe('1')
    call(DB_DELETE_SETTING, 'theme')
    expect(db.getSetting('theme')).toBeFalsy()
  })
})
