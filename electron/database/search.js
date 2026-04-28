/**
 * Search, tags, and query operations.
 * @module database/search
 */

/**
 * Create search operations bound to database context.
 * @param {Object} ctx - Database context with _query, _rowToNode, _applyWorkspaceFilter methods
 * @returns {Object} Search operations
 */
function createSearchOperations(ctx) {
  return {
    /**
     * Search nodes by title/notes.
     * @param {string} query - Search query
     * @param {string|null} type - Filter by node type
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @param {Object} options - Additional options
     * @param {boolean} options.hideCompleted - Exclude completed nodes
     * @param {number} options.limit - Maximum results (default: 50)
     * @param {number} options.offset - Results to skip (default: 0)
     * @returns {Array} Matching nodes
     */
    search(query, type = null, workspaceId = undefined, options = {}) {
      const { hideCompleted = false, limit = 50, offset = 0 } = options
      let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)'
      const values = [`%${query}%`, `%${query}%`]

      const effectiveWorkspaceId = type === 'person' && workspaceId === undefined ? null : workspaceId
      sql = ctx._applyWorkspaceFilter(sql, values, effectiveWorkspaceId)

      if (type) {
        sql += ' AND type = ?'
        values.push(type)
      }

      if (hideCompleted) {
        sql += ' AND completed = 0'
      }

      sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      values.push(limit, offset)
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Get total count of search results.
     * @param {string} query - Search query
     * @param {string|null} type - Filter by node type
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @param {Object} options - Additional options
     * @returns {number} Total matching results
     */
    searchCount(query, type = null, workspaceId = undefined, options = {}) {
      const { hideCompleted = false } = options
      let sql = 'SELECT COUNT(*) as count FROM nodes WHERE deleted_at IS NULL AND (title LIKE ? OR notes LIKE ?)'
      const values = [`%${query}%`, `%${query}%`]

      const effectiveWorkspaceId = type === 'person' && workspaceId === undefined ? null : workspaceId
      sql = ctx._applyWorkspaceFilter(sql, values, effectiveWorkspaceId)

      if (type) {
        sql += ' AND type = ?'
        values.push(type)
      }

      if (hideCompleted) {
        sql += ' AND completed = 0'
      }

      const result = ctx._query(sql, values)
      return result[0]?.count || 0
    },

    /**
     * Get all unique tags.
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @returns {Array} Sorted tag names
     */
    getAllTags(workspaceId = undefined) {
      let sql = 'SELECT tags FROM nodes WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != "[]"'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      const nodes = ctx._query(sql, values)
      const tagSet = new Set()
      for (const node of nodes) {
        try {
          const tags = JSON.parse(node.tags || '[]')
          tags.forEach(tag => tagSet.add(tag))
        } catch {
          // Skip invalid JSON
        }
      }
      return Array.from(tagSet).sort()
    },

    /**
     * Get nodes by tag.
     * @param {string} tag - Tag to search for
     * @param {string|null|undefined} workspaceId - Workspace filter
     * @param {Object} options - Additional options
     * @param {boolean} options.hideCompleted - Exclude completed nodes
     * @returns {Array} Matching nodes
     */
    getNodesByTag(tag, workspaceId = undefined, options = {}) {
      let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL AND tags LIKE ?'
      const values = [`%"${tag}"%`]

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      if (options.hideCompleted) {
        sql += ' AND completed = 0'
      }

      sql += ' ORDER BY updated_at DESC'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Get recent nodes.
     * @param {number} limit - Maximum results
     * @param {string|undefined} workspaceId - Workspace filter
     * @returns {Array} Recent nodes
     */
    getRecent(limit = 10, workspaceId = undefined) {
      let sql = 'SELECT * FROM nodes WHERE deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      sql += ' ORDER BY updated_at DESC LIMIT ?'
      values.push(limit)
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Get favorite nodes.
     * @param {string|undefined} workspaceId - Workspace filter
     * @returns {Array} Favorite nodes
     */
    getFavorites(workspaceId = undefined) {
      let sql = 'SELECT * FROM nodes WHERE favorite = 1 AND deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      sql += ' ORDER BY updated_at DESC'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Get tasks with filtering.
     * @param {Object} params - Filter parameters
     * @returns {Array} Task nodes
     */
    getTasks(params = {}) {
      let sql = "SELECT * FROM nodes WHERE type = 'task' AND deleted_at IS NULL"
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, params.workspaceId)

      if (params.completed !== undefined) {
        sql += ' AND completed = ?'
        values.push(params.completed ? 1 : 0)
      }

      if (params.dueDateFrom) {
        sql += ' AND due_date >= ?'
        values.push(params.dueDateFrom)
      }
      if (params.dueDateTo) {
        sql += ' AND due_date <= ?'
        values.push(params.dueDateTo)
      }

      if (params.importance !== undefined) {
        sql += ' AND importance = ?'
        values.push(params.importance)
      }

      if (params.parentId !== undefined) {
        sql += ' AND parent_id = ?'
        values.push(params.parentId)
      }

      sql += ' ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, sort_order, created_at'

      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },
  }
}

module.exports = {
  createSearchOperations,
}
