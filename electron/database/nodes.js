/**
 * Node CRUD operations.
 * @module database/nodes
 */

const { NODE_FIELDS } = require('./schema')

/**
 * Create node operations bound to database context.
 * @param {Object} ctx - Database context with _query, _run, _get, _rowToNode, _applyWorkspaceFilter methods
 * @returns {Object} Node operations
 */
function createNodeOperations(ctx) {
  /**
   * Update paths for all descendants of a node.
   * @param {number} nodeId - Parent node ID
   */
  function updateDescendantPaths(nodeId) {
    const node = ops.getNode(nodeId)
    if (!node) return

    const children = ops.getChildren(nodeId)
    for (const child of children) {
      const newPath = node.path ? `${node.path}/${node.id}` : `${node.id}`
      const newDepth = node.depth + 1
      ctx._run('UPDATE nodes SET path = ?, depth = ? WHERE id = ?', [newPath, newDepth, child.id])
      updateDescendantPaths(child.id)
    }
  }

  const ops = {
    /**
     * Get nodes with optional filtering.
     * @param {Object} params - Filter parameters
     * @param {string} params.type - Filter by node type
     * @param {number|null} params.parent_id - Filter by parent ID
     * @param {string|null} params.workspace_id - Filter by workspace
     * @returns {Array} Node objects
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
     * Get a single node by ID.
     * @param {number} id - Node ID
     * @returns {Object|null} Node object or null
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
     * Create a new node.
     * @param {Object} data - Node data
     * @returns {Object} Created node
     */
    createNode(data) {
      const presentFields = NODE_FIELDS.filter(f => data[f] !== undefined)
      const values = presentFields.map(f => {
        if (f === 'tags' && Array.isArray(data[f])) {
          return JSON.stringify(data[f])
        }
        return data[f]
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
     * Update an existing node.
     * @param {number} id - Node ID
     * @param {Object} data - Fields to update
     * @returns {Object} Updated node
     */
    updateNode(id, data) {
      const updates = []
      const values = []

      for (const field of NODE_FIELDS) {
        if (data[field] !== undefined) {
          updates.push(`${field} = ?`)
          if (field === 'tags' && Array.isArray(data[field])) {
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
      ctx._run(sql, values)

      return ops.getNode(id)
    },

    /**
     * Delete a node (soft or hard delete).
     * @param {number} id - Node ID
     * @param {boolean} hard - If true, permanently delete
     * @returns {Object} Success status
     */
    deleteNode(id, hard = false) {
      const node = ops.getNode(id)
      const newParentId = node?.parent_id || null

      ctx._run('UPDATE nodes SET parent_id = ? WHERE parent_id = ? AND deleted_at IS NULL', [newParentId, id])

      if (hard) {
        ctx._run('DELETE FROM nodes WHERE id = ?', [id])
      } else {
        ctx._run('UPDATE nodes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [id])
      }

      const reassignedChildren = ctx._query('SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL', [
        newParentId,
      ])
      for (const child of reassignedChildren) {
        updateDescendantPaths(child.id)
      }

      return { success: true }
    },

    /**
     * Move a node to a new parent.
     * @param {number} id - Node ID
     * @param {number|null} newParentId - New parent ID
     * @returns {Object|null} Updated node
     */
    moveNode(id, newParentId) {
      const node = ops.getNode(id)
      if (!node) return null

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
    },

    /**
     * Reorder a node relative to a target.
     * @param {number} nodeId - Node to reorder
     * @param {number} targetId - Target node
     * @param {string} position - 'before' or 'after'
     * @returns {Object|null} Updated node
     */
    reorderNode(nodeId, targetId, position) {
      const node = ops.getNode(nodeId)
      const target = ops.getNode(targetId)
      if (!node || !target) return null

      const siblings = ops.getChildren(target.parent_id)
      const targetIndex = siblings.findIndex(s => s.id === targetId)

      let newOrder
      if (position === 'before') {
        newOrder = targetIndex > 0 ? siblings[targetIndex - 1].sort_order + 1 : target.sort_order - 1
      } else {
        newOrder = targetIndex < siblings.length - 1 ? target.sort_order + 1 : target.sort_order + 1
      }

      ctx._run('UPDATE nodes SET sort_order = ?, parent_id = ? WHERE id = ?', [newOrder, target.parent_id, nodeId])

      return ops.getNode(nodeId)
    },

    /**
     * Get children of a node.
     * @param {number} id - Parent node ID
     * @param {string|null} type - Filter by type
     * @param {string|undefined} workspaceId - Workspace filter
     * @returns {Array} Child nodes
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
     * Get all descendants of a node.
     * @param {number} id - Root node ID
     * @param {number|null} maxDepth - Maximum depth to traverse
     * @returns {Array} Descendant nodes
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
     * Batch fetch descendants for multiple root IDs.
     * @param {number[]} rootIds - Array of root node IDs
     * @returns {Map<number, Object[]>} Map of rootId -> descendants
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

      let sql = `SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE (${pathConditions.join(' OR ')}) AND deleted_at IS NULL`

      if (nodes[0].workspace_id) {
        sql += ' AND workspace_id = ?'
        values.push(nodes[0].workspace_id)
      }

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
     * Get ancestors of a node.
     * @param {number} id - Node ID
     * @returns {Array} Ancestor nodes
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

    // Internal helper exposed for migrations
    _updateDescendantPaths: updateDescendantPaths,
  }

  return ops
}

module.exports = {
  createNodeOperations,
}
