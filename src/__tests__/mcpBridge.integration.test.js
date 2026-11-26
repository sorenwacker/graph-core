import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestDatabase, createNodeFactory } from './helpers/testDatabase.js'
import { createMcpBridge } from '../../electron/mcp/bridge.js'

/**
 * The MCP bridge against the real database (docs/architecture/mcp.md).
 */
describe('MCP bridge', () => {
  let db
  let factory
  let onDataChanged
  let openWorkspace
  let bridge
  let connection

  beforeEach(async () => {
    db = await createTestDatabase()
    factory = createNodeFactory(db)
    onDataChanged = vi.fn()
    openWorkspace = 'work'
    bridge = createMcpBridge({ db, onDataChanged, getOpenWorkspace: () => openWorkspace })
    connection = {}
  })

  afterEach(() => db.close())

  const call = (method, params = {}) => bridge.handle(method, params, connection)

  describe('live updates', () => {
    it('signals a data change after every write', () => {
      const a = call('create_node', { title: 'A' })
      const b = call('create_node', { title: 'B' })
      call('update_node', { id: a.id, title: 'A2' })
      call('move_node', { id: b.id, parent_id: a.id })
      call('link_nodes', { source_id: a.id, target_id: b.id })
      call('unlink_nodes', { source_id: a.id, target_id: b.id })
      call('delete_node', { id: b.id })
      expect(onDataChanged).toHaveBeenCalledTimes(7)
    })

    it('does not signal on reads', () => {
      const node = factory.note({ title: 'Read me' })
      call('get_node', { id: node.id })
      call('search_nodes', { query: 'Read' })
      call('get_roots')
      expect(onDataChanged).not.toHaveBeenCalled()
    })
  })

  describe('workspace scoping', () => {
    it('creates root nodes in the workspace open in the app', () => {
      const node = call('create_node', { title: 'Root note' })
      expect(node.workspace_id).toBe('work')
    })

    it('follows the app when the open workspace changes', () => {
      openWorkspace = 'personal'
      expect(call('create_node', { title: 'X' }).workspace_id).toBe('personal')
    })

    it('uses the workspace a connection set, regardless of the app', () => {
      db.createWorkspace({ name: 'Research' })
      call('set_workspace', { workspace: 'Research' })
      expect(call('create_node', { title: 'X' }).workspace_id).toBe('research')
      expect(call('get_roots').map(n => n.title)).toEqual(['X'])
    })

    it('resolves a workspace by id as well as name', () => {
      db.createWorkspace({ name: 'Research' })
      call('set_workspace', { workspace: 'research' })
      expect(call('create_node', { title: 'X' }).workspace_id).toBe('research')
    })

    it('rejects an unknown workspace', () => {
      expect(() => call('set_workspace', { workspace: 'nope' })).toThrow(/not found/)
    })

    it('puts a child in its parent workspace', () => {
      const parent = factory.project({ title: 'P', workspace_id: 'personal' })
      expect(call('create_node', { title: 'C', parent_id: parent.id }).workspace_id).toBe('personal')
    })
  })

  describe('sensitive nodes', () => {
    let secret
    let parent

    beforeEach(() => {
      parent = factory.project({ title: 'Folder' })
      secret = factory.person({
        title: 'Diary',
        notes: 'the secret text',
        email: 'someone@example.org',
        due_date: '2026-12-01',
        tags: ['private-tag'],
        notes_sensitive: 1,
        parent_id: parent.id,
      })
    })

    const REDUCED = {
      id: expect.any(Number),
      title: 'Diary',
      type: 'person',
      parent_id: expect.anything(),
      workspace_id: 'work',
      sensitive: true,
    }

    it('returns a sensitive node reduced to its identity, from every read tool', () => {
      const responses = [
        call('get_node', { id: secret.id }),
        call('get_children', { id: parent.id }),
        call('get_tree'),
        call('get_tree', { root_id: parent.id }),
        call('search_nodes', { query: 'Diary' }),
        call('get_nodes_of_type', { type: 'person' }),
      ]
      const text = JSON.stringify(responses)
      for (const content of ['the secret text', 'someone@example.org', '2026-12-01', 'private-tag']) {
        expect(text).not.toContain(content)
      }
      expect(call('get_node', { id: secret.id })).toEqual(REDUCED)
    })

    it('withholds a sensitive node among ancestors and links', () => {
      const child = factory.note({ title: 'Child', parent_id: secret.id })
      const other = factory.note({ title: 'Other' })
      db.linkNodes(other.id, secret.id)
      const ancestors = call('get_ancestors', { id: child.id })
      const links = call('get_links', { id: other.id })
      expect(ancestors.find(n => n.id === secret.id)).toEqual(REDUCED)
      expect(links.find(n => n.id === secret.id)).toEqual(REDUCED)
    })

    it('does not confirm content of a sensitive node through search', () => {
      expect(call('search_nodes', { query: 'secret text' })).toEqual([])
    })

    it('moves a sensitive node', () => {
      call('move_node', { id: secret.id, parent_id: null })
      expect(db.getNode(secret.id).parent_id).toBeNull()
    })

    it('creates a node under a sensitive node', () => {
      expect(call('create_node', { title: 'Under', parent_id: secret.id }).parent_id).toBe(secret.id)
    })

    it('refuses every other write to a sensitive node', () => {
      const other = factory.note({ title: 'Other' })
      expect(() => call('update_node', { id: secret.id, title: 'Renamed' })).toThrow(/sensitive/)
      expect(() => call('delete_node', { id: secret.id })).toThrow(/sensitive/)
      expect(() => call('link_nodes', { source_id: other.id, target_id: secret.id })).toThrow(/sensitive/)
      expect(() => call('unlink_nodes', { source_id: secret.id, target_id: other.id })).toThrow(/sensitive/)
      const stored = db.getNode(secret.id)
      expect(stored.title).toBe('Diary')
      expect(stored.deleted_at).toBeFalsy()
    })

    it('cannot clear the sensitive flag', () => {
      const other = factory.note({ title: 'Plain' })
      expect(() => call('update_node', { id: other.id, notes_sensitive: 0 })).toThrow(/No writable fields/)
      expect(db.getNode(secret.id).notes_withheld).toBe(true)
    })
  })

  describe('writes', () => {
    it('moves a deleted node to the trash, where it can be restored', () => {
      const node = factory.note({ title: 'Gone' })
      call('delete_node', { id: node.id })
      expect(db.getTrash().map(n => n.id)).toContain(node.id)
      expect(() => call('get_node', { id: node.id })).toThrow(/not found/)
    })

    it('reparents a node', () => {
      const parent = factory.project({ title: 'P' })
      const child = factory.note({ title: 'C' })
      call('move_node', { id: child.id, parent_id: parent.id })
      expect(db.getChildren(parent.id).map(n => n.id)).toEqual([child.id])
    })

    it('links two nodes', () => {
      const a = factory.note({ title: 'A' })
      const b = factory.note({ title: 'B' })
      call('link_nodes', { source_id: a.id, target_id: b.id })
      expect(call('get_links', { id: a.id }).map(n => n.id)).toContain(b.id)
    })

    it('rejects unknown methods', () => {
      expect(() => call('drop_database')).toThrow(/Unknown method/)
    })
  })
})
