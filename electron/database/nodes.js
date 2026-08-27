/**
 * Node CRUD operations for creating, reading, updating, and deleting nodes.
 * Provides hierarchical node management with path-based ancestry tracking.
 * @module database/nodes
 */

const { NODE_FIELDS } = require('./schema')

/**
 * @typedef {Object} Node
 * @property {number} id - Unique node identifier
 * @property {string} title - Node title
 * @property {string} type - Node type (note, task, project, person, etc.)
 * @property {number|null} parent_id - Parent node ID or null for root nodes
 * @property {string|null} workspace_id - Workspace identifier
 * @property {string|null} notes - Node content/notes in markdown
 * @property {boolean} completed - Whether the node is completed (for tasks)
 * @property {number|null} importance - Importance level (1-5)
 * @property {string|null} due_date - Due date in ISO format
 * @property {string|null} start_date - Start date in ISO format
 * @property {string|null} end_date - End date in ISO format
 * @property {string[]} tags - Array of tag strings
 * @property {boolean} favorite - Whether the node is marked as favorite
 * @property {number} sort_order - Sort order within siblings
 * @property {number} depth - Depth in the tree hierarchy (0 for root)
 * @property {string} path - Slash-separated ancestor IDs (e.g., "1/5/12")
 * @property {boolean} has_table - Whether node has an associated table
 * @property {string} created_at - Creation timestamp
 * @property {string} updated_at - Last update timestamp
 * @property {string|null} deleted_at - Soft delete timestamp or null
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Function} _query - Execute SQL query returning array of rows
 * @property {Function} _run - Execute SQL statement returning result info
 * @property {Function} _get - Execute SQL query returning single row
 * @property {Function} _rowToNode - Convert database row to Node object
 * @property {Function} _applyWorkspaceFilter - Add workspace filter to SQL query
 * @property {Function} _batch - Run a function in a single transaction with one disk write
 */

/**
 * @typedef {Object} NodeFilterParams
 * @property {string} [type] - Filter by node type
 * @property {number|null} [parent_id] - Filter by parent ID (null for root nodes)
 * @property {string|null} [workspace_id] - Filter by workspace
 */

/**
 * Creates node CRUD operations bound to a database context.
 * All operations use the context's methods for database access.
 * @param {DatabaseContext} ctx - Database context with query methods
 * @returns {Object} Object containing all node operations
 */
function createNodeOperations(ctx) {
  /**
   * Fetches a node row regardless of its deleted_at state. Path maintenance has
   * to see soft-deleted rows too: they are still real children in the table and
   * their stale path/depth would resurface when they are restored.
   * @param {number} id - Node ID
   * @returns {Object|null} Raw node row or null
   * @private
   */
  function getNodeRow(id) {
    return ctx._get('SELECT id, parent_id, path, depth FROM nodes WHERE id = ?', [id])
  }

  /**
   * Recursively updates path and depth for all descendants of a node.
   * Called after moving or reparenting operations to maintain path consistency.
   * @param {number} nodeId - ID of the node whose descendants should be updated
   * @private
   */
  function updateDescendantPaths(nodeId) {
    const node = getNodeRow(nodeId)
    if (!node) return

    const childPath = node.path ? `${node.path}/${node.id}` : `${node.id}`
    const childDepth = (node.depth || 0) + 1
    const children = ctx._query('SELECT id FROM nodes WHERE parent_id = ?', [nodeId])
    for (const child of children) {
      ctx._run('UPDATE nodes SET path = ?, depth = ? WHERE id = ?', [childPath, childDepth, child.id])
      updateDescendantPaths(child.id)
    }
  }

  /**
   * Recomputes a node's own path and depth from its current parent_id, then
   * rewrites all descendant paths. Used after reparenting operations
   * (delete-reparent, cross-parent reorder, updateNode, trash purge) where the
   * node's stored path may still reference its old ancestry.
   * @param {number} nodeId - ID of the reparented node
   * @private
   */
  function updateSubtreePath(nodeId) {
    const node = getNodeRow(nodeId)
    if (!node) return

    let depth = 0
    let path = ''
    if (node.parent_id) {
      const parent = getNodeRow(node.parent_id)
      if (parent) {
        depth = (parent.depth || 0) + 1
        path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
      }
    }

    if (node.path !== path || node.depth !== depth) {
      ctx._run('UPDATE nodes SET path = ?, depth = ? WHERE id = ?', [path, depth, nodeId])
    }
    updateDescendantPaths(nodeId)
  }

  const ops = {
    /**
     * Retrieves nodes with optional filtering by type, parent, and workspace.
     * Returns nodes ordered by sort_order then created_at.
     * @param {NodeFilterParams} [params={}] - Filter parameters
     * @returns {Node[]} Array of matching node objects
     */
    getNodes(params = {}) {
      let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, params.workspace_id)

      if (params.type) {
        sql += ' AND type = ?'
        values.push(params.type)
      }
      if (params.parent_id !== undefined) {
        if (params.parent_id === null) {
          sql += ' AND parent_id IS NULL'
        } else {
          sql += ' AND parent_id = ?'
          values.push(params.parent_id)
        }
      }

      sql += ' ORDER BY sort_order, created_at'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Retrieves a single node by its ID.
     * Includes has_table flag indicating if node has an associated table.
     * @param {number} id - The node ID to retrieve
     * @returns {Node|null} The node object or null if not found or deleted
     */
    getNode(id) {
      const row = ctx._get(
        `SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table
         FROM nodes WHERE id = ? AND deleted_at IS NULL`,
        [id]
      )
      return ctx._rowToNode(row)
    },

    /**
     * Creates a new node with the provided data.
     * Automatically calculates depth and path based on parent.
     * @param {Object} data - Node data to create
     * @param {string} data.title - Node title (required)
     * @param {string} [data.type='note'] - Node type
     * @param {number|null} [data.parent_id] - Parent node ID
     * @param {string|null} [data.workspace_id] - Workspace identifier
     * @param {string|null} [data.notes] - Node content
     * @param {boolean} [data.completed=false] - Completion status
     * @param {number|null} [data.importance] - Importance level
     * @param {string|null} [data.due_date] - Due date
     * @param {string[]} [data.tags] - Array of tags
     * @returns {Node} The created node with generated id, depth, and path
     */
    createNode(data) {
      data = ctx._encodeNotesForWrite(null, data)
      const presentFields = NODE_FIELDS.filter(f => data[f] !== undefined)
      const values = presentFields.map(f => {
        const val = data[f]
        // Arrays and objects need to be JSON stringified for SQLite
        if (Array.isArray(val)) {
          return JSON.stringify(val)
        } else if (typeof val === 'object' && val !== null) {
          return JSON.stringify(val)
        }
        return val
      })

      let depth = 0
      let path = ''
      if (data.parent_id) {
        const parent = ops.getNode(data.parent_id)
        if (parent) {
          depth = (parent.depth || 0) + 1
          path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
        }
      }

      presentFields.push('depth', 'path')
      values.push(depth, path)

      const placeholders = presentFields.map(() => '?').join(', ')
      const sql = `INSERT INTO nodes (${presentFields.join(', ')}) VALUES (${placeholders})`

      const result = ctx._run(sql, values)
      return ops.getNode(result.lastInsertRowid)
    },

    /**
     * Updates an existing node with the provided fields.
     * Only fields present in data are updated; others remain unchanged.
     * Automatically updates the updated_at timestamp.
     * parent_id is an updatable field, so an update can reparent the node; when
     * it does, the node's own path/depth and its whole subtree are recomputed.
     * @param {number} id - ID of the node to update
     * @param {Object} data - Fields to update (partial node data)
     * @returns {Node} The updated node object
     */
    updateNode(id, data) {
      data = ctx._encodeNotesForWrite(id, data)
      const updates = []
      const values = []

      const current = getNodeRow(id)
      const reparenting =
        data.parent_id !== undefined && (data.parent_id ?? null) !== (current?.parent_id ?? null) && current !== null

      for (const field of NODE_FIELDS) {
        if (data[field] !== undefined) {
          updates.push(`${field} = ?`)
          // Arrays need to be JSON stringified for SQLite
          if (Array.isArray(data[field])) {
            values.push(JSON.stringify(data[field]))
          } else if (typeof data[field] === 'object' && data[field] !== null) {
            // Objects also need to be stringified
            values.push(JSON.stringify(data[field]))
          } else {
            values.push(data[field])
          }
        }
      }

      if (updates.length === 0) return ops.getNode(id)

      updates.push('updated_at = CURRENT_TIMESTAMP')
      values.push(id)

      const sql = `UPDATE nodes SET ${updates.join(', ')} WHERE id = ?`

      if (!reparenting) {
        ctx._run(sql, values)
        return ops.getNode(id)
      }

      return ctx._batch(() => {
        ctx._run(sql, values)
        updateSubtreePath(id)
        return ops.getNode(id)
      })
    },

    /**
     * Deletes a node, reassigning its children to its parent.
     * Supports soft delete (default) or hard delete.
     * Children are moved up to the deleted node's parent to prevent orphans.
     * @param {number} id - ID of the node to delete
     * @param {boolean} [hard=false] - If true, permanently removes the node; otherwise soft deletes
     * @returns {{success: boolean}} Success status object
     */
    deleteNode(id, hard = false) {
      return ctx._batch(() => {
        const node = ops.getNode(id)
        const newParentId = node?.parent_id || null

        // Capture the deleted node's children before reparenting so their
        // path/depth (and their descendants') can be recomputed afterwards.
        const reparentedChildren = ctx._query('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [id])

        // A hard delete fires nodes.parent_id's ON DELETE SET NULL on whatever
        // children the reparent below skips — the soft-deleted ones. They would
        // otherwise keep a path/depth pointing at the removed parent.
        const trashedChildren = hard
          ? ctx._query('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NOT NULL', [id])
          : []

        ctx._run('UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [newParentId, id])

        if (hard) {
          ctx._run('DELETE FROM nodes WHERE id = ?', [id])
        } else {
          ctx._run('UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
        }

        for (const child of [...reparentedChildren, ...trashedChildren]) {
          updateSubtreePath(child.id)
        }

        return { success: true }
      })
    },

    /**
     * Moves a node to a new parent, updating its depth and path.
     * Also recursively updates all descendant paths.
     * @param {number} id - ID of the node to move
     * @param {number|null} newParentId - ID of the new parent, or null to make it a root node
     * @returns {Node|null} The updated node, or null if node not found
     */
    moveNode(id, newParentId) {
      const node = ops.getNode(id)
      if (!node) return null

      // A node may not become its own ancestor. Without this the tree gains a
      // cycle and updateSubtreePath below walks it until the stack overflows.
      if (newParentId != null) {
        if (newParentId === id) throw new Error('Cannot move a node into itself')
        const target = ops.getNode(newParentId)
        if (target) {
          const ancestorIds = String(target.path || '')
            .split('/')
            .filter(Boolean)
            .map(Number)
          if (ancestorIds.includes(id)) {
            throw new Error('Cannot move a node into its own descendant')
          }
        }
      }

      return ctx._batch(() => {
        let depth = 0
        let path = ''
        if (newParentId) {
          const parent = ops.getNode(newParentId)
          if (parent) {
            depth = (parent.depth || 0) + 1
            path = parent.path ? `${parent.path}/${parent.id}` : `${parent.id}`
          }
        }

        ctx._run('UPDATE nodes SET parent_id = ?, depth = ?, path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
          newParentId,
          depth,
          path,
          id,
        ])

        updateDescendantPaths(id)

        return ops.getNode(id)
      })
    },

    /**
     * Reorders a node relative to a target sibling.
     * Updates sort_order and parent_id to position the node before or after target.
     * @param {number} nodeId - ID of the node to reorder
     * @param {number} targetId - ID of the target node to position relative to
     * @param {string} position - Position relative to target: 'before' or 'after'
     * @returns {Node|null} The updated node, or null if either node not found
     */
    reorderNode(nodeId, targetId, position) {
      const node = ops.getNode(nodeId)
      const target = ops.getNode(targetId)
      if (!node || !target) return null

      // Resequence the target's whole sibling set with contiguous sort_order
      // values. The previous relative scheme produced colliding/ambiguous orders
      // (and an 'after' branch whose ternary was a no-op). `parent_id IS ?`
      // matches both a real parent and the null-parent (root) set.
      const siblings = ctx
        ._query('SELECT * FROM nodes WHERE parent_id IS ? AND deleted_at IS NULL ORDER BY sort_order, created_at', [
          target.parent_id,
        ])
        .map(r => ctx._rowToNode(r))
        .filter(s => s.id !== nodeId)

      const targetIndex = siblings.findIndex(s => s.id === targetId)
      if (targetIndex === -1) return null

      const insertIndex = position === 'before' ? targetIndex : targetIndex + 1
      siblings.splice(insertIndex, 0, node)

      return ctx._batch(() => {
        siblings.forEach((sibling, index) => {
          ctx._run('UPDATE nodes SET sort_order = ?, parent_id = ? WHERE id = ?', [index, target.parent_id, sibling.id])
        })

        // Reordering onto a target under a different parent reparents the
        // node; recompute its own path/depth (and its descendants') to match.
        if ((node.parent_id ?? null) !== (target.parent_id ?? null)) {
          updateSubtreePath(nodeId)
        }

        return ops.getNode(nodeId)
      })
    },

    /**
     * Retrieves all children of a node, optionally filtered by type.
     * Includes has_table flag for each child.
     * @param {number} id - Parent node ID
     * @param {string|null} [type=null] - Optional type filter
     * @param {string|undefined} [workspaceId] - Optional workspace filter (defaults to parent's workspace)
     * @returns {Node[]} Array of child nodes ordered by sort_order then created_at
     */
    getChildren(id, type = null, workspaceId = undefined) {
      const parent = ops.getNode(id)
      let sql =
        'SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE parent_id = ? AND deleted_at IS NULL'
      const values = [id]

      if (type) {
        sql += ' AND type = ?'
        values.push(type)
      }

      const effectiveWorkspace = workspaceId !== undefined ? workspaceId : parent?.workspace_id
      sql = ctx._applyWorkspaceFilter(sql, values, effectiveWorkspace)

      sql += ' ORDER BY sort_order, created_at'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Retrieves all descendants of a node using path-based lookup.
     * More efficient than recursive queries for large subtrees.
     * @param {number} id - Root node ID to get descendants of
     * @param {number|null} [maxDepth=null] - Maximum depth to traverse (null for unlimited)
     * @returns {Node[]} Array of descendant nodes ordered by depth, sort_order, created_at
     */
    getDescendants(id, maxDepth = null) {
      const node = ops.getNode(id)
      if (!node) return []

      const pathPrefix = node.path ? `${node.path}/${id}` : `${id}`

      let sql =
        'SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL'
      const values = [pathPrefix, `${pathPrefix}/%`]

      sql = ctx._applyWorkspaceFilter(sql, values, node.workspace_id)

      if (maxDepth !== null) {
        sql += ' AND depth <= ?'
        values.push(node.depth + maxDepth)
      }

      sql += ' ORDER BY depth, sort_order, created_at'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Batch retrieves descendants for multiple root nodes in a single query.
     * More efficient than calling getDescendants multiple times.
     * @param {number[]} rootIds - Array of root node IDs
     * @returns {Map<number, Node[]>} Map where keys are root IDs and values are arrays of their descendants
     */
    getDescendantsBatch(rootIds) {
      const result = new Map()

      if (!rootIds || rootIds.length === 0) {
        return result
      }

      for (const rootId of rootIds) {
        result.set(rootId, [])
      }

      const nodes = rootIds.map(id => ops.getNode(id)).filter(Boolean)
      if (nodes.length === 0) {
        return result
      }

      const pathConditions = []
      const values = []

      for (const node of nodes) {
        const pathPrefix = node.path ? `${node.path}/${node.id}` : `${node.id}`
        pathConditions.push('(path = ? OR path LIKE ?)')
        values.push(pathPrefix, `${pathPrefix}/%`)
      }

      // Path prefixes already scope each root's subtree uniquely, so no
      // workspace filter is needed. Applying one root's workspace_id globally
      // (as before) wrongly dropped descendants of roots in other workspaces.
      let sql = `SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE (${pathConditions.join(' OR ')}) AND deleted_at IS NULL`

      sql += ' ORDER BY depth, sort_order, created_at'
      const allDescendants = ctx._query(sql, values).map(r => ctx._rowToNode(r))

      for (const descendant of allDescendants) {
        for (const rootId of rootIds) {
          const rootNode = nodes.find(n => n.id === rootId)
          if (!rootNode) continue

          const rootPathPrefix = rootNode.path ? `${rootNode.path}/${rootId}` : `${rootId}`
          if (descendant.path === rootPathPrefix || descendant.path.startsWith(`${rootPathPrefix}/`)) {
            result.get(rootId).push(descendant)
            break
          }
        }
      }

      return result
    },

    /**
     * Retrieves all ancestors of a node by parsing its path.
     * Returns nodes from root to immediate parent.
     * @param {number} id - Node ID to get ancestors of
     * @returns {Node[]} Array of ancestor nodes ordered by depth (root first)
     */
    getAncestors(id) {
      const node = ops.getNode(id)
      if (!node || !node.path) return []

      const ancestorIds = node.path.split('/').filter(Boolean).map(Number)
      if (ancestorIds.length === 0) return []

      const placeholders = ancestorIds.map(() => '?').join(', ')
      return ctx
        ._query(`SELECT * FROM nodes WHERE id IN (${placeholders}) AND deleted_at IS NULL ORDER BY depth`, ancestorIds)
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Internal helper exposed for migrations and tree operations.
     * Updates path and depth for all descendants of a node.
     * @private
     */
    _updateDescendantPaths: updateDescendantPaths,

    /**
     * Internal helper exposed for tree operations (trash purge).
     * Recomputes a node's own path/depth from its parent, then its descendants'.
     * @private
     */
    _updateSubtreePath: updateSubtreePath,
  }

  return ops
}

module.exports = {
  createNodeOperations,
}
