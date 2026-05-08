/**
 * Search, tags, and query operations for finding and filtering nodes.
 * Provides full-text search, tag-based filtering, and specialized queries.
 * @module database/search
 */

/**
 * @typedef {Object} SearchOptions
 * @property {boolean} [hideCompleted=false] - Exclude completed nodes from results
 * @property {number} [limit=50] - Maximum number of results to return
 * @property {number} [offset=0] - Number of results to skip for pagination
 */

/**
 * @typedef {Object} TaskFilterParams
 * @property {string|undefined} [workspaceId] - Filter by workspace
 * @property {boolean} [completed] - Filter by completion status
 * @property {string} [dueDateFrom] - Filter tasks with due_date >= this value
 * @property {string} [dueDateTo] - Filter tasks with due_date <= this value
 * @property {number} [importance] - Filter by exact importance level
 * @property {number} [parentId] - Filter by parent node ID
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Function} _query - Execute SQL query returning array of rows
 * @property {Function} _rowToNode - Convert database row to Node object
 * @property {Function} _applyWorkspaceFilter - Add workspace filter to SQL query
 */

/**
 * Creates search and query operations bound to a database context.
 * Provides various methods for finding nodes by text, tags, and other criteria.
 * @param {DatabaseContext} ctx - Database context with query methods
 * @returns {Object} Object containing all search operations
 */
function createSearchOperations(ctx) {
  return {
    /**
     * Searches nodes by title and notes content using LIKE pattern matching.
     * Results are ordered by most recently updated first.
     * @param {string} query - Search query string (matched against title and notes)
     * @param {string|null} [type=null] - Optional node type filter
     * @param {string|null|undefined} [workspaceId] - Workspace filter (undefined uses context default, null searches all)
     * @param {SearchOptions} [options={}] - Additional search options
     * @returns {Node[]} Array of matching nodes ordered by updated_at descending
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
     * Returns the total count of search results without pagination.
     * Useful for implementing pagination UI with total page counts.
     * @param {string} query - Search query string
     * @param {string|null} [type=null] - Optional node type filter
     * @param {string|null|undefined} [workspaceId] - Workspace filter
     * @param {SearchOptions} [options={}] - Additional options (only hideCompleted is used)
     * @returns {number} Total count of matching nodes
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
     * Retrieves all unique tags across all nodes in the workspace.
     * Tags are extracted from the JSON-encoded tags field.
     * @param {string|null|undefined} [workspaceId] - Workspace filter
     * @returns {string[]} Sorted array of unique tag names
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
     * Retrieves all nodes containing a specific tag.
     * Searches using JSON string pattern matching on the tags field.
     * @param {string} tag - Tag name to search for
     * @param {string|null|undefined} [workspaceId] - Workspace filter
     * @param {SearchOptions} [options={}] - Additional options (only hideCompleted is used)
     * @returns {Node[]} Array of nodes containing the tag, ordered by updated_at descending
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
     * Retrieves the most recently updated nodes.
     * Useful for showing recent activity or recently modified items.
     * @param {number} [limit=10] - Maximum number of nodes to return
     * @param {string|undefined} [workspaceId] - Workspace filter
     * @returns {Node[]} Array of recently updated nodes
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
     * Retrieves all nodes marked as favorites.
     * @param {string|undefined} [workspaceId] - Workspace filter
     * @returns {Node[]} Array of favorite nodes ordered by updated_at descending
     */
    getFavorites(workspaceId = undefined) {
      let sql = 'SELECT * FROM nodes WHERE favorite = 1 AND deleted_at IS NULL'
      const values = []

      sql = ctx._applyWorkspaceFilter(sql, values, workspaceId)

      sql += ' ORDER BY updated_at DESC'
      return ctx._query(sql, values).map(r => ctx._rowToNode(r))
    },

    /**
     * Retrieves task nodes with comprehensive filtering options.
     * Tasks are ordered by due date (nulls last), then sort_order, then created_at.
     * @param {TaskFilterParams} [params={}] - Filter parameters for tasks
     * @returns {Node[]} Array of task nodes matching the filter criteria
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
