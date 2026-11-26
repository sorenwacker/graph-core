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

  describe('sensitive notes', () => {
    let secret

    beforeEach(() => {
      secret = factory.note({ title: 'Diary', notes: 'the secret text', notes_sensitive: 1 })
    })

    it('never returns the notes of a sensitive node', () => {
      const responses = [
        call('get_node', { id: secret.id }),
        call('get_roots'),
        call('get_tree'),
        call('search_nodes', { query: 'Diary' }),
        call('get_nodes_of_type', { type: 'note' }),
      ]
      expect(JSON.stringify(responses)).not.toContain('the secret text')
    })

    it('does not confirm text of a sensitive note through search', () => {
      expect(call('search_nodes', { query: 'secret text' })).toEqual([])
    })

    it('refuses to change the notes of a sensitive node', () => {
      expect(() => call('update_node', { id: secret.id, notes: 'overwritten' })).toThrow(/sensitive/)
    })

    it('ignores an attempt to clear the sensitive flag', () => {
      expect(() => call('update_node', { id: secret.id, notes_sensitive: 0 })).toThrow(/No writable fields/)
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
