/**
 * Node table (spreadsheet) operations.
 * @module database/tables
 */

/**
 * Create table operations bound to database context.
 * @param {Object} ctx - Database context with db, _query, _run, _get, _save methods
 * @returns {Object} Table operations
 */
function createTableOperations(ctx) {
  return {
    /**
     * Get table for a node.
     * @param {number} nodeId - Node ID
     * @returns {Object|null} Table object or null
     */
    getNodeTable(nodeId) {
      const row = ctx._get('SELECT * FROM node_tables WHERE node_id = ?', [nodeId])
      if (!row) return null
      return {
        ...row,
        column_definitions: JSON.parse(row.column_definitions || '[]'),
        settings: JSON.parse(row.settings || '{}'),
      }
    },

    /**
     * Create a table for a node.
     * @param {number} nodeId - Node ID
     * @param {Object} data - Table data { name?, column_definitions?, row_count?, settings? }
     * @returns {Object} Created table
     */
    createNodeTable(nodeId, data = {}) {
      const defaultColumns = [
        { id: 'col0', name: 'A', type: 'text', width: 100 },
        { id: 'col1', name: 'B', type: 'text', width: 100 },
        { id: 'col2', name: 'C', type: 'text', width: 100 },
        { id: 'col3', name: 'D', type: 'text', width: 100 },
      ]

      const columns = data.column_definitions || defaultColumns
      const rowCount = data.row_count || 5
      const name = data.name || 'Table'
      const settings = data.settings || {}

      ctx._run(
        `INSERT INTO node_tables (node_id, name, column_definitions, row_count, settings)
         VALUES (?, ?, ?, ?, ?)`,
        [nodeId, name, JSON.stringify(columns), rowCount, JSON.stringify(settings)]
      )

      return this.getNodeTable(nodeId)
    },

    /**
     * Update a node's table.
     * @param {number} nodeId - Node ID
     * @param {Object} data - Fields to update
     * @returns {Object} Updated table
     */
    updateNodeTable(nodeId, data) {
      const updates = []
      const values = []

      if (data.name !== undefined) {
        updates.push('name = ?')
        values.push(data.name)
      }
      if (data.column_definitions !== undefined) {
        updates.push('column_definitions = ?')
        values.push(JSON.stringify(data.column_definitions))
      }
      if (data.row_count !== undefined) {
        updates.push('row_count = ?')
        values.push(data.row_count)
      }
      if (data.settings !== undefined) {
        updates.push('settings = ?')
        values.push(JSON.stringify(data.settings))
      }

      if (updates.length > 0) {
        updates.push('updated_at = CURRENT_TIMESTAMP')
        values.push(nodeId)
        ctx._run(`UPDATE node_tables SET ${updates.join(', ')} WHERE node_id = ?`, values)
      }

      return this.getNodeTable(nodeId)
    },

    /**
     * Delete a node's table.
     * @param {number} nodeId - Node ID
     * @returns {Object} Success status
     */
    deleteNodeTable(nodeId) {
      ctx._run('DELETE FROM node_tables WHERE node_id = ?', [nodeId])
      return { success: true }
    },

    /**
     * Get all cells for a node's table.
     * @param {number} nodeId - Node ID
     * @returns {Array} Cell objects
     */
    getTableCells(nodeId) {
      const table = this.getNodeTable(nodeId)
      if (!table) return []

      return ctx
        ._query(
          `SELECT row_index, col_index, value, formula, computed_value, style
           FROM node_table_cells
           WHERE table_id = ?
           ORDER BY row_index, col_index`,
          [table.id]
        )
        .map(cell => ({
          ...cell,
          style: cell.style ? JSON.parse(cell.style) : null,
        }))
    },

    /**
     * Set cells for a node's table (upsert).
     * @param {number} nodeId - Node ID
     * @param {Array} cells - Cell data array
     * @returns {Object} Success status with count
     */
    setCells(nodeId, cells) {
      const table = this.getNodeTable(nodeId)
      if (!table) {
        return { success: false, error: 'Table not found' }
      }

      let updated = 0
      for (const cell of cells) {
        const styleJson = cell.style ? JSON.stringify(cell.style) : null

        ctx.db.run(
          `INSERT OR REPLACE INTO node_table_cells (table_id, row_index, col_index, value, formula, computed_value, style)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            table.id,
            cell.row_index,
            cell.col_index,
            cell.value || null,
            cell.formula || null,
            cell.computed_value || null,
            styleJson,
          ]
        )
        updated++
      }

      ctx._save()
      return { success: true, updated }
    },

    /**
     * Clear all cells for a node's table.
     * @param {number} nodeId - Node ID
     * @returns {Object} Success status with count
     */
    clearCells(nodeId) {
      const table = this.getNodeTable(nodeId)
      if (!table) {
        return { success: false, error: 'Table not found' }
      }

      const countResult = ctx._query('SELECT COUNT(*) as cnt FROM node_table_cells WHERE table_id = ?', [table.id])
      const cleared = countResult[0]?.cnt || 0

      ctx._run('DELETE FROM node_table_cells WHERE table_id = ?', [table.id])
      return { success: true, cleared }
    },
  }
}

module.exports = {
  createTableOperations,
}
