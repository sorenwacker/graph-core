import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from '../../electron/database/index.js'
import { createSensitiveSession } from '../../electron/database/sensitiveSession.js'

/**
 * The content of a sensitive note leaves the database through one call,
 * getNodeNotes. Every other read returns the node without it, in every session
 * state (docs/architecture/sensitive-notes.md, "Read path").
 */

const SECRET = 'the-secret-text'
const WS = 'work'

let dir, db

/** Every read that returns nodes, as [name, call, fixture]. `ids` names the fixture nodes. */
const READS = [
  ['getNodes', ids => db.getNodes({ workspace_id: WS })],
  ['getNode', ids => [db.getNode(ids.secret)]],
  ['getChildren', ids => db.getChildren(ids.parent)],
  ['getDescendants', ids => db.getDescendants(ids.parent)],
  ['getDescendantsBatch', ids => [...db.getDescendantsBatch([ids.parent]).values()].flat()],
  ['getAncestors', ids => db.getAncestors(ids.leaf)],
  ['getRoots', () => db.getRoots(WS), 'secretRoot'],
  ['getTree', ids => flattenTree(db.getTree(ids.parent))],
  ['getRecent', () => db.getRecent(50, WS)],
  ['getFavorites', () => db.getFavorites(WS)],
  ['getTasks', () => db.getTasks({ workspace_id: WS })],
  ['search by title', () => db.search('Vault', null, WS)],
  ['getLinkedNodes', ids => db.getLinkedNodes(ids.linker)],
  ['getTrash', ids => (db.deleteNode(ids.secret), db.getTrash())],
  ['updateNode result', ids => [db.updateNode(ids.secret, { title: 'Vault renamed' })]],
]

function flattenTree(tree) {
  const roots = Array.isArray(tree) ? tree : [tree]
  return roots.filter(Boolean).flatMap(n => [n, ...flattenTree(n.children || [])])
}

function seed() {
  const parent = db.createNode({ type: 'project', title: 'Parent', workspace_id: WS })
  const secret = db.createNode({
    type: 'task',
    title: 'Vault',
    notes: SECRET,
    notes_sensitive: true,
    favorite: true,
    parent_id: parent.id,
    workspace_id: WS,
  })
  const secretRoot = db.createNode({
    type: 'note',
    title: 'Vault root',
    notes: SECRET,
    notes_sensitive: true,
    workspace_id: WS,
  })
  const leaf = db.createNode({ type: 'note', title: 'Leaf', parent_id: secret.id, workspace_id: WS })
  const linker = db.createNode({ type: 'note', title: 'Linker', notes: 'plain', workspace_id: WS })
  db.linkNodes(linker.id, secret.id)
  return { parent: parent.id, secret: secret.id, secretRoot: secretRoot.id, leaf: leaf.id, linker: linker.id }
}

function openDb() {
  dir = mkdtempSync(join(tmpdir(), 'gc-readpath-'))
  db = new Database(join(dir, 'graph.db'))
  return db.ready
}

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const STATES = {
  'feature off': () => {},
  unlocked: () => {
    const session = createSensitiveSession()
    session.enable('recovery-pw')
    db.sensitiveSession = session
  },
}

for (const [state, setUp] of Object.entries(STATES)) {
  describe(`sensitive note content with the session ${state}`, () => {
    let ids
    beforeEach(async () => {
      await openDb()
      setUp()
      ids = seed()
    })

    for (const [name, read, fixture = 'secret'] of READS) {
      it(`is absent from ${name}`, () => {
        const nodes = read(ids)
        const secret = nodes.find(n => n.id === ids[fixture])
        expect(secret, `${name} did not return the fixture node`).toBeTruthy()
        expect(JSON.stringify(nodes)).not.toContain(SECRET)
        expect(secret.notes).toBeNull()
        expect(secret.notes_withheld).toBe(true)
        expect(secret.has_notes).toBe(true)
      })
    }

    it('is returned by getNodeNotes', () => {
      expect(db.getNodeNotes(ids.secret)).toEqual({ notes: SECRET, locked: false })
    })

    it('leaves an ordinary note in place', () => {
      const linker = db.getNode(ids.linker)
      expect(linker.notes).toBe('plain')
      expect(linker.notes_withheld).toBe(false)
      expect(linker.has_notes).toBe(true)
    })
  })
}

describe('sensitive note content with the session locked', () => {
  let ids
  beforeEach(async () => {
    await openDb()
    const session = createSensitiveSession()
    session.enable('recovery-pw')
    db.sensitiveSession = session
    ids = seed()
    session.lock()
  })

  it('is withheld from reads without exposing the ciphertext', () => {
    const node = db.getNode(ids.secret)
    expect(node.notes).toBeNull()
    expect(node.notes_withheld).toBe(true)
    expect(JSON.stringify(db.getChildren(ids.parent))).not.toContain('SNENC1:')
  })

  it('is reported locked by getNodeNotes, again without ciphertext', () => {
    expect(db.getNodeNotes(ids.secret)).toEqual({ notes: null, locked: true })
  })

  it('withholds a marker-carrying note even when its flag is clear', () => {
    db._run('UPDATE nodes SET notes_sensitive = 0 WHERE id = ?', [ids.secret])
    const node = db.getNode(ids.secret)
    expect(node.notes).toBeNull()
    expect(node.notes_withheld).toBe(true)
  })
})

describe('writes to a node whose notes were withheld', () => {
  let ids
  beforeEach(async () => {
    await openDb()
    ids = seed()
  })

  it('ignore a notes value from a caller that never revealed them', () => {
    db.updateNode(ids.secret, { title: 'Renamed', notes: null })
    expect(db.getNodeNotes(ids.secret).notes).toBe(SECRET)
    db.updateNode(ids.secret, { notes: '' })
    expect(db.getNodeNotes(ids.secret).notes).toBe(SECRET)
  })

  it('accept a notes value from the editor that revealed them', () => {
    db.updateNode(ids.secret, { notes: 'edited', notes_revealed: true })
    expect(db.getNodeNotes(ids.secret).notes).toBe('edited')
  })

  it('accept the notes that arrive together with turning the flag on', () => {
    db.updateNode(ids.linker, { notes: 'now secret', notes_sensitive: true })
    expect(db.getNodeNotes(ids.linker).notes).toBe('now secret')
  })
})

describe('export, which is plaintext by design', () => {
  let ids, session
  beforeEach(async () => {
    await openDb()
    session = createSensitiveSession()
    session.enable('recovery-pw')
    db.sensitiveSession = session
    ids = seed()
  })

  it('carries the decrypted note while unlocked, without the read-path fields', () => {
    const { root } = db.exportJSON(ids.secret)
    expect(root.notes).toBe(SECRET)
    expect(root).not.toHaveProperty('notes_withheld')
    expect(root).not.toHaveProperty('has_notes')
    expect(db.exportMarkdown(ids.secret).markdown).toContain(SECRET)
    expect(db.exportCSV(ids.parent).csv).toContain(SECRET)
  })

  it('carries the ciphertext marker while locked', () => {
    session.lock()
    expect(db.exportJSON(ids.secret).root.notes).toMatch(/^SNENC1:/)
  })
})
