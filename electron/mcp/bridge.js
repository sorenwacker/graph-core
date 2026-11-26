/**
 * MCP bridge: maps MCP tool calls to database operations
 * (docs/architecture/mcp.md).
 *
 * The bridge holds no socket; the server in ./server.js feeds it requests.
 * Its collaborators are injected so tests run it against a real database
 * without Electron.
 */

/** Node fields an agent may set. notes_sensitive is excluded: clearing it decrypts a note. */
const WRITABLE_FIELDS = [
  'title',
  'type',
  'notes',
  'completed',
  'color',
  'importance',
  'start_date',
  'end_date',
  'due_date',
  'tags',
  'favorite',
  'location',
  'email',
  'phone',
  'organization',
  'role',
  'address',
  'website',
]

class McpBridgeError extends Error {}

/**
 * Keep only the fields an agent may set.
 * @param {Object} fields - Requested field values
 * @returns {Object} The writable subset
 */
function pickWritable(fields = {}) {
  const out = {}
  for (const key of WRITABLE_FIELDS) {
    if (fields[key] !== undefined) out[key] = fields[key]
  }
  return out
}

/**
 * Create the bridge.
 * @param {Object} deps - Injected collaborators
 * @param {Object} deps.db - Database instance (electron/database)
 * @param {Function} deps.onDataChanged - Called after every write, to refresh open windows
 * @param {Function} deps.getOpenWorkspace - Returns the workspace id open in the app
 * @returns {{handle: Function, METHODS: string[]}} The bridge
 */
function createMcpBridge({ db, onDataChanged, getOpenWorkspace }) {
  const requireNode = id => {
    const node = db.getNode(id)
    if (!node || node.deleted_at) throw new McpBridgeError(`Node ${id} not found`)
    return node
  }

  const write = result => {
    onDataChanged()
    return result
  }

  /** Workspace a connection acts in: its own scope, else the app's open one. */
  const workspaceOf = connection => connection.workspace ?? getOpenWorkspace()

  const handlers = {
    list_workspaces: () => {
      const open = getOpenWorkspace()
      return db.getWorkspaces().map(w => ({ ...w, open: w.id === open }))
    },
    set_workspace: ({ workspace }, connection) => {
      const match = db
        .getWorkspaces()
        .find(w => w.id === workspace || String(w.name).toLowerCase() === String(workspace).toLowerCase())
      if (!match) throw new McpBridgeError(`Workspace "${workspace}" not found`)
      connection.workspace = match.id
      return { workspace: match.id, name: match.name }
    },

    get_roots: (_params, connection) => db.getRoots(workspaceOf(connection)),
    get_tree: ({ root_id }, connection) => {
      if (root_id != null) {
        requireNode(root_id)
        return db.getTree(root_id)
      }
      return db.getRoots(workspaceOf(connection)).flatMap(root => [root, ...db.getDescendants(root.id)])
    },
    get_children: ({ id }) => {
      requireNode(id)
      return db.getChildren(id)
    },
    get_ancestors: ({ id }) => {
      requireNode(id)
      return db.getAncestors(id)
    },
    get_node: ({ id }) => requireNode(id),
    search_nodes: ({ query, type, limit }, connection) => {
      const q = String(query ?? '').toLowerCase()
      // A withheld note matched on its text would confirm what the text
      // contains; such a node is returned only when its title matches
      return db
        .search(query, type || null, workspaceOf(connection), { limit })
        .filter(n => !n.notes_withheld || String(n.title).toLowerCase().includes(q))
    },
    get_nodes_of_type: ({ type }, connection) => db.getNodesOfType(type, workspaceOf(connection)),
    get_nodes_by_tag: ({ tag }, connection) => db.getNodesByTag(tag, workspaceOf(connection)),
    list_tags: (_params, connection) => db.getAllTags(workspaceOf(connection)),
    get_links: ({ id }) => {
      requireNode(id)
      return db.getLinkedNodes(id)
    },

    create_node: ({ parent_id, ...fields }, connection) => {
      if (!fields.title) throw new McpBridgeError('title is required')
      let workspace = workspaceOf(connection)
      if (parent_id != null) workspace = requireNode(parent_id).workspace_id
      return write(
        db.createNode({ type: 'note', ...pickWritable(fields), parent_id: parent_id ?? null, workspace_id: workspace })
      )
    },
    update_node: ({ id, ...fields }) => {
      const node = requireNode(id)
      const data = pickWritable(fields)
      if (data.notes !== undefined && node.notes_withheld) {
        throw new McpBridgeError(`Node ${id} has sensitive notes; they cannot be changed over MCP`)
      }
      if (Object.keys(data).length === 0) throw new McpBridgeError('No writable fields given')
      return write(db.updateNode(id, data))
    },
    move_node: ({ id, parent_id, before_id, after_id }) => {
      requireNode(id)
      if (before_id != null || after_id != null) {
        const target = before_id ?? after_id
        requireNode(target)
        return write(db.reorderNode(id, target, before_id != null ? 'before' : 'after'))
      }
      if (parent_id != null) requireNode(parent_id)
      return write(db.moveNode(id, parent_id ?? null))
    },
    link_nodes: ({ source_id, target_id }) => {
      requireNode(source_id)
      requireNode(target_id)
      return write(db.linkNodes(source_id, target_id))
    },
    unlink_nodes: ({ source_id, target_id }) => write(db.unlinkNodes(source_id, target_id)),
    delete_node: ({ id }) => {
      requireNode(id)
      return write(db.deleteNode(id, false))
    },
  }

  /**
   * Execute one request.
   * @param {string} method - Tool name
   * @param {Object} params - Tool arguments
   * @param {Object} connection - Per-connection state ({ workspace })
   * @returns {*} The operation's result
   */
  function handle(method, params, connection) {
    const handler = handlers[method]
    if (!handler) throw new McpBridgeError(`Unknown method "${method}"`)
    return handler(params || {}, connection)
  }

  return { handle, METHODS: Object.keys(handlers) }
}

module.exports = { createMcpBridge, McpBridgeError, WRITABLE_FIELDS }
