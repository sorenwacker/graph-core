/**
 * Workspace CRUD operations.
 * @module database/workspaces
 */

/**
 * Create workspace operations bound to database context.
 * @param {Object} ctx - Database context with _query, _run, _get methods
 * @returns {Object} Workspace operations
 */
function createWorkspaceOperations(ctx) {
  return {
    /**
     * Get all workspaces sorted by sort_order.
     * @returns {Array} List of workspace objects
     */
    getWorkspaces() {
      return ctx._query('SELECT * FROM workspaces ORDER BY sort_order, name')
    },

    /**
     * Get a single workspace by ID.
     * @param {string} id - Workspace ID
     * @returns {Object|null} Workspace object or null
     */
    getWorkspace(id) {
      return ctx._get('SELECT * FROM workspaces WHERE id = ?', [id])
    },

    /**
     * Create a new workspace.
     * @param {Object} data - Workspace data { name, color?, icon?, sort_order? }
     * @returns {Object} Created workspace
     */
    createWorkspace(data) {
      const id = data.id || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      ctx._run(`INSERT INTO workspaces (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`, [
        id,
        data.name,
        data.color || '#3498db',
        data.icon || 'folder',
        data.sort_order || 99,
      ])
      return this.getWorkspace(id)
    },

    /**
     * Update an existing workspace.
     * @param {string} id - Workspace ID
     * @param {Object} data - Fields to update { name?, color?, icon?, sort_order? }
     * @returns {Object} Updated workspace
     */
    updateWorkspace(id, data) {
      const allowedFields = ['name', 'color', 'icon', 'sort_order', 'is_default', 'show_external_links']
      const updates = []
      const values = []
      for (const [key, value] of Object.entries(data)) {
        if (allowedFields.includes(key)) {
          updates.push(`${key} = ?`)
          values.push(value)
        }
      }
      if (updates.length > 0) {
        values.push(id)
        ctx._run(`UPDATE workspaces SET ${updates.join(', ')} WHERE id = ?`, values)
      }
      return this.getWorkspace(id)
    },

    /**
     * Delete a workspace and orphan its nodes.
     * @param {string} id - Workspace ID to delete
     * @returns {Object} Success status
     */
    deleteWorkspace(id) {
      ctx._run('UPDATE nodes SET workspace_id = NULL WHERE workspace_id = ?', [id])
      ctx._run('DELETE FROM workspaces WHERE id = ?', [id])
      return { success: true }
    },
  }
}

module.exports = {
  createWorkspaceOperations,
}
