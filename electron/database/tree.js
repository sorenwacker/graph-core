/**
 * Tree operations for hierarchical node navigation and management.
 * Provides root access, tree building, trash management, and tree repair utilities.
 * @module database/tree
 */

/**
 * @typedef {Object} TreeNode
 * @property {number} id - Node ID
 * @property {string} title - Node title
 * @property {string} type - Node type
 * @property {number|null} parent_id - Parent node ID
 * @property {TreeNode[]} children - Array of child tree nodes
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Function} _query - Execute SQL query returning array of rows
 * @property {Function} _run - Execute SQL statement returning result info
 * @property {Function} _rowToNode - Convert database row to Node object
 * @property {Function} _applyWorkspaceFilter - Add workspace filter to SQL query
 * @property {Function} _save - Persist changes to disk
 * @property {Function} getNode - Get a single node by ID
 * @property {Function} getDescendants - Get all descendants of a node
 * @property {Function} _updateDescendantPaths - Update paths for node descendants
 */

/**
 * Creates tree navigation and management operations bound to a database context.
 * Handles tree traversal, root access, trash management, and tree integrity repair.
 * @param {DatabaseContext} ctx - Database context with query methods
 * @returns {Object} Object containing all tree operations
 */
function createTreeOperations(ctx) {
  return {
    /**
     * Retrieves all root nodes (nodes without a parent).
     * Includes has_table flag for each node.
     * @param {string|null|undefined} [workspaceId] - Workspace filter
     * @returns {Node[]} Array of root nodes ordered by sort_order then created_at
     */
    getRoots(workspaceId = undefined) {
      let sql =
        'SELECT *, (EXISTS(SELECT 1 FROM node_tables WHERE node_id = nodes.id)) as has_table FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      sql += ' ORDER BY sort_order, created_at'
      const results = ctx._query(sql, values)
      console.log(`getRoots(${workspaceId}): found ${results.length} root nodes`)
      return results.map(r => ctx._rowToNode(r))
    },

    /**
     * Retrieves all project-type nodes across all workspaces.
     * Projects are top-level organizational units in the hierarchy.
     * @returns {Node[]} Array of project nodes ordered by sort_order then created_at
     */
    getProjects() {
      return ctx
        ._query("SELECT * FROM nodes WHERE type = 'project' AND deleted_at IS NULL ORDER BY sort_order, created_at")
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Retrieves all root nodes as the inbox.
     * The inbox represents uncategorized top-level items.
     * @returns {Node[]} Array of inbox (root) nodes
     */
    getInbox() {
      return ctx
        ._query('SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL ORDER BY sort_order, created_at')
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Builds a nested tree structure from flat node data.
     * Each node includes a children array with its nested descendants.
     * @param {number|null} [rootId=null] - Starting node ID, or null to build from all root nodes
     * @returns {TreeNode[]} Array of tree nodes with nested children arrays
     */
    getTree(rootId = null) {
      const nodes = rootId
        ? [ctx.getNode(rootId), ...ctx.getDescendants(rootId)]
        : this.getRoots().flatMap(root => [root, ...ctx.getDescendants(root.id)])

      const nodeMap = new Map()
      for (const node of nodes) {
        if (node) nodeMap.set(node.id, { ...node, children: [] })
      }

      const roots = []
      for (const node of nodeMap.values()) {
        if (node.parent_id && nodeMap.has(node.parent_id)) {
          nodeMap.get(node.parent_id).children.push(node)
        } else if (!node.parent_id || node.id === rootId) {
          roots.push(node)
        }
      }

      return roots
    },

    /**
     * Retrieves soft-deleted nodes from trash.
     * Nodes in trash can be restored or permanently deleted.
     * @param {number} [limit=100] - Maximum number of nodes to return
     * @returns {Node[]} Array of deleted nodes ordered by deleted_at descending
     */
    getTrash(limit = 100) {
      return ctx
        ._query('SELECT * FROM nodes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT ?', [limit])
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Restores a soft-deleted node from trash.
     * Clears the deleted_at timestamp, making the node active again.
     * @param {number} id - ID of the node to restore
     * @returns {Node} The restored node object
     */
    restoreNode(id) {
      ctx._run('UPDATE nodes SET deleted_at = NULL WHERE id = ?', [id])
      return ctx.getNode(id)
    },

    /**
     * Permanently deletes all nodes in trash.
     * This operation cannot be undone.
     * @returns {{deleted: number}} Object with count of permanently deleted nodes
     */
    emptyTrash() {
      const result = ctx._query('SELECT COUNT(*) as count FROM nodes WHERE deleted_at IS NOT NULL')
      const count = result[0]?.count || 0
      ctx._run('DELETE FROM nodes WHERE deleted_at IS NOT NULL')
      return { deleted: count }
    },

    /**
     * Finds orphaned nodes whose parent no longer exists.
     * Orphans can occur when a parent is deleted without reassigning children.
     * @returns {Node[]} Array of orphaned nodes ordered by updated_at descending
     */
    getOrphanedNodes() {
      return ctx
        ._query(
          `
        SELECT n.* FROM nodes n
        WHERE n.deleted_at IS NULL
          AND n.parent_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM nodes p
            WHERE p.id = n.parent_id
              AND p.deleted_at IS NULL
          )
        ORDER BY n.updated_at DESC
      `
        )
        .map(r => ctx._rowToNode(r))
    },

    /**
     * Moves an orphaned node to root level.
     * Clears the parent_id and updates descendant paths.
     * @param {number} nodeId - ID of the orphaned node to reparent
     * @returns {Node} The updated node with parent_id set to null
     */
    reparentToRoot(nodeId) {
      ctx._run('UPDATE nodes SET parent_id = NULL WHERE id = ?', [nodeId])
      ctx._updateDescendantPaths(nodeId)
      return ctx.getNode(nodeId)
    },

    /**
     * Repairs workspace_id inconsistencies in the tree.
     * Ensures all descendants inherit their root node's workspace_id.
     * Automatically saves changes to disk if any fixes are made.
     * @returns {{fixed: number}} Object with count of nodes that were fixed
     */
    repairWorkspaces() {
      const roots = ctx._query('SELECT * FROM nodes WHERE parent_id IS NULL AND deleted_at IS NULL')
      let fixed = 0

      for (const root of roots) {
        const rootWorkspace = root.workspace_id
        const pathPrefix = root.path ? `${root.path}/${root.id}` : `${root.id}`
        const descendants = ctx._query(
          'SELECT id, workspace_id FROM nodes WHERE (path = ? OR path LIKE ?) AND deleted_at IS NULL',
          [pathPrefix, `${pathPrefix}/%`]
        )

        for (const desc of descendants) {
          const descWorkspace = desc.workspace_id
          const needsFix =
            (rootWorkspace === null && descWorkspace !== null) ||
            (rootWorkspace !== null && descWorkspace !== rootWorkspace)
          if (needsFix) {
            ctx._run('UPDATE nodes SET workspace_id = ? WHERE id = ?', [rootWorkspace, desc.id])
            fixed++
          }
        }
      }

      console.log(`repairWorkspaces: fixed ${fixed} nodes`)
      if (fixed > 0) ctx._save()
      return { fixed }
    },
  }
}

module.exports = {
  createTreeOperations,
}
