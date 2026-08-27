import { it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'
import { isEncryptedNote } from '../../electron/database/sensitiveNotes.js'

/**
 * Turning sensitive notes off must decrypt every stored note back to plaintext
 * before the key is dropped, including notes sitting in the trash. Anything
 * still encrypted when the key goes is unrecoverable
 * (docs/architecture/sensitive-notes.md).
 */

let dir, db, session

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'gc-sn-disable-'))
  db = new Database(join(dir, 'graph.db'))
  await db.ready
  session = createSensitiveSession()
  session.enable('recovery-pw')
  db.sensitiveSession = session
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function sensitiveNote(title, notes) {
  return db.createNode({ type: 'note', title, notes, notes_sensitive: true, workspace_id: 'work' })
}

function rawNotes(id) {
  return db._query('SELECT notes, notes_sensitive FROM nodes WHERE id = ?', [id])[0]
}

it('decrypts a live sensitive note back to plaintext', () => {
  const live = sensitiveNote('live', 'secret-live')

  db.disableSensitiveNotes()

  const row = rawNotes(live.id)
  expect(isEncryptedNote(row.notes)).toBe(false)
  expect(row.notes).toBe('secret-live')
  expect(row.notes_sensitive).toBe(0)
})

it('decrypts a trashed sensitive note instead of stranding it as ciphertext', () => {
  const trashed = sensitiveNote('trashed', 'secret-trashed')
  db.deleteNode(trashed.id, false)

  db.disableSensitiveNotes()

  const row = rawNotes(trashed.id)
  expect(isEncryptedNote(row.notes)).toBe(false)
  expect(row.notes).toBe('secret-trashed')
  expect(row.notes_sensitive).toBe(0)
})

it('restores a trashed note to readable plaintext after disable', () => {
  const trashed = sensitiveNote('trashed', 'secret-trashed')
  db.deleteNode(trashed.id, false)

  db.disableSensitiveNotes()
  db.restoreNode(trashed.id)

  expect(db.getNode(trashed.id).notes).toBe('secret-trashed')
})

it('leaves plaintext notes untouched', () => {
  const plain = db.createNode({ type: 'note', title: 'plain', notes: 'nothing secret', workspace_id: 'work' })

  db.disableSensitiveNotes()

  expect(rawNotes(plain.id).notes).toBe('nothing secret')
})

it('reports how many notes it decrypted', () => {
  sensitiveNote('a', 'one')
  const trashed = sensitiveNote('b', 'two')
  db.deleteNode(trashed.id, false)

  expect(db.disableSensitiveNotes()).toEqual({ success: true, decrypted: 2 })
})

it('refuses to run while the session is locked, leaving every note encrypted', () => {
  const live = sensitiveNote('live', 'secret-live')
  session.lock()

  expect(() => db.disableSensitiveNotes()).toThrow(/locked/i)
  expect(isEncryptedNote(rawNotes(live.id).notes)).toBe(true)
})

it('leaves every note encrypted when one note fails to decrypt', () => {
  const good = sensitiveNote('good', 'recoverable')
  // A note carrying the marker but undecryptable content: the batch must roll
  // back rather than half-disable and drop the key on the remainder.
  const broken = db.createNode({ type: 'note', title: 'broken', workspace_id: 'work' })
  db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', ['SNENC1:not-real-ciphertext', broken.id])

  expect(() => db.disableSensitiveNotes()).toThrow()
  expect(isEncryptedNote(rawNotes(good.id).notes)).toBe(true)
})

it('degrades an undecryptable note to a locked placeholder instead of breaking list queries', () => {
  db.createNode({ type: 'note', title: 'readable', notes: 'fine', workspace_id: 'work' })
  const broken = db.createNode({ type: 'note', title: 'broken', workspace_id: 'work' })
  db._run('UPDATE nodes SET notes = ?, notes_sensitive = 1 WHERE id = ?', ['SNENC1:not-real-ciphertext', broken.id])

  // A throw inside _rowToNode would take the whole listing down with it.
  const listed = db.getRecent(10)
  expect(listed.map(n => n.title).sort()).toEqual(['broken', 'readable'])
  expect(db.getNode(broken.id).notes).toBe('SNENC1:not-real-ciphertext')
})
