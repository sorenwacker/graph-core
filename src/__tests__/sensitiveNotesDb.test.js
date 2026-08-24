import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { isEncryptedNote } from '../../electron/database/sensitiveNotes.js'

/**
 * Sensitive notes end to end through the real Database: content is stored
 * encrypted, decrypted on read while unlocked, and shown as the ciphertext
 * marker while locked (docs/architecture/sensitive-notes.md).
 */

let dir, db, session

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gc-sn-'))
  db = new Database(join(dir, 'graph.db'))
  await db.ready
  session = createSensitiveSession()
  session.enable('recovery-pw')
  db.sensitiveSession = session
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

it('stores a sensitive note as ciphertext but reads it back as plaintext while unlocked', () => {
  const node = db.createNode({
    type: 'note',
    title: 'Plan',
    notes: 'the secret',
    notes_sensitive: true,
    workspace_id: 'work',
  })

  // The raw stored value is ciphertext; the read path returns plaintext.
  const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
  expect(isEncryptedNote(raw)).toBe(true)
  expect(db.getNode(node.id).notes).toBe('the secret')
})

it('returns the ciphertext marker, not plaintext, once locked', () => {
  const node = db.createNode({
    type: 'note',
    title: 'Plan',
    notes: 'the secret',
    notes_sensitive: true,
    workspace_id: 'work',
  })
  session.lock()

  const read = db.getNode(node.id).notes
  expect(isEncryptedNote(read)).toBe(true)
  expect(read).not.toContain('the secret')
})

it('keeps non-sensitive notes as plaintext', () => {
  const node = db.createNode({
    type: 'note',
    title: 'Open',
    notes: 'not secret',
    notes_sensitive: false,
    workspace_id: 'work',
  })
  const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
  expect(raw).toBe('not secret')
})

it('encrypts existing notes when the flag is turned on', () => {
  const node = db.createNode({ type: 'note', title: 'Later', notes: 'becomes secret', workspace_id: 'work' })
  db.updateNode(node.id, { notes_sensitive: true })

  const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
  expect(isEncryptedNote(raw)).toBe(true)
  expect(db.getNode(node.id).notes).toBe('becomes secret')
})

it('decrypts back to plaintext when the flag is turned off', () => {
  const node = db.createNode({
    type: 'note',
    title: 'X',
    notes: 'was secret',
    notes_sensitive: true,
    workspace_id: 'work',
  })
  db.updateNode(node.id, { notes_sensitive: false })

  const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
  expect(raw).toBe('was secret')
})

it('refuses to save a sensitive note while locked', () => {
  session.lock()
  expect(() =>
    db.createNode({ type: 'note', title: 'X', notes: 'nope', notes_sensitive: true, workspace_id: 'work' })
  ).toThrow(/locked/i)
})

it('leaves notes untouched when no session is configured', () => {
  db.sensitiveSession = null
  const node = db.createNode({ type: 'note', title: 'X', notes: 'plain', notes_sensitive: true, workspace_id: 'work' })
  const raw = db._query('SELECT notes FROM nodes WHERE id = ?', [node.id])[0].notes
  expect(raw).toBe('plain')
})

describe('search and sensitive notes', () => {
  it('does not find sensitive content by its text, but finds it by title', () => {
    db.createNode({
      type: 'note',
      title: 'Quarterly plan',
      notes: 'acquire Umbrella Corp',
      notes_sensitive: true,
      workspace_id: 'work',
    })

    // Content search cannot match ciphertext.
    expect(db.search('Umbrella')).toHaveLength(0)
    // Title stays searchable.
    expect(db.search('Quarterly').length).toBeGreaterThan(0)
  })

  it('still finds plaintext note content', () => {
    db.createNode({ type: 'note', title: 'Open note', notes: 'find this phrase', workspace_id: 'work' })
    expect(db.search('find this phrase').length).toBeGreaterThan(0)
  })
})
