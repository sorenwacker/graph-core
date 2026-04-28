/**
 * Export and import operations.
 * @module database/export
 */

/**
 * Create export/import operations bound to database context.
 * @param {Object} ctx - Database context with _query, getNode, getDescendants, getNodes, createNode, linkNodes methods
 * @returns {Object} Export/import operations
 */
function createExportOperations(ctx) {
  return {
    /**
     * Export node and descendants as markdown.
     * @param {number} nodeId - Root node to export
     * @returns {Object} Markdown string
     */
    exportMarkdown(nodeId) {
      const root = ctx.getNode(nodeId)
      if (!root) return { markdown: '' }

      function adjustNoteHeadings(notes, nodeDepth) {
        if (!notes) return ''
        return notes.replace(/^(#{1,6})\s/gm, (match, hashes) => {
          const originalLevel = hashes.length
          const newLevel = Math.min(originalLevel + nodeDepth, 6)
          return '#'.repeat(newLevel) + ' '
        })
      }

      function exportNode(id, depth) {
        const node = ctx.getNode(id)
        if (!node) return ''

        let md = ''
        if (depth <= 6) {
          md += '#'.repeat(depth) + ' ' + node.title + '\n\n'
        } else {
          md += '**' + node.title + '**\n\n'
        }

        if (node.notes) {
          const adjustedNotes = adjustNoteHeadings(node.notes, depth)
          md += adjustedNotes + '\n\n'
        }

        const childRows = ctx._query(
          'SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at',
          [id]
        )
        for (const row of childRows) {
          md += exportNode(row.id, depth + 1)
        }

        return md
      }

      const markdown = exportNode(nodeId, 1)
      return { markdown }
    },

    /**
     * Export node and descendants as JSON.
     * @param {number} nodeId - Root node to export
     * @param {Object} options - Export options
     * @param {boolean} options.includeLinks - Include node links (default: true)
     * @returns {Object} JSON export
     */
    exportJSON(nodeId, options = {}) {
      const { includeLinks = true } = options

      function exportNodeRecursive(id) {
        const node = ctx.getNode(id)
        if (!node) return null

        const childRows = ctx._query(
          'SELECT id FROM nodes WHERE parent_id = ? AND deleted_at IS NULL ORDER BY sort_order, created_at',
          [id]
        )
        const children = childRows.map(row => exportNodeRecursive(row.id)).filter(Boolean)

        return {
          ...node,
          children: children.length > 0 ? children : undefined,
        }
      }

      const tree = exportNodeRecursive(nodeId)
      const result = { version: 1, exportedAt: new Date().toISOString(), root: tree }

      if (includeLinks && tree) {
        const nodeIds = []
        function collectIds(node) {
          if (!node) return
          nodeIds.push(node.id)
          if (node.children) node.children.forEach(collectIds)
        }
        collectIds(tree)

        if (nodeIds.length > 0) {
          const placeholders = nodeIds.map(() => '?').join(',')
          const links = ctx._query(
            `SELECT source_id, target_id FROM node_links
             WHERE source_id IN (${placeholders}) AND target_id IN (${placeholders})`,
            [...nodeIds, ...nodeIds]
          )
          if (links.length > 0) {
            result.links = links
          }
        }
      }

      return result
    },

    /**
     * Export nodes as CSV.
     * @param {number|null} nodeId - Root node or null for all
     * @param {string|null} workspaceId - Workspace filter
     * @returns {Object} CSV string and metadata
     */
    exportCSV(nodeId = null, workspaceId = null) {
      let nodes
      if (nodeId) {
        const descendants = ctx.getDescendants(nodeId)
        const root = ctx.getNode(nodeId)
        nodes = root ? [root, ...descendants] : descendants
      } else {
        nodes = ctx.getNodes({ workspace_id: workspaceId })
      }

      const headers = [
        'id',
        'title',
        'type',
        'parent_id',
        'workspace_id',
        'notes',
        'completed',
        'importance',
        'due_date',
        'start_date',
        'end_date',
        'tags',
        'created_at',
        'updated_at',
      ]

      const escapeCSV = val => {
        if (val === null || val === undefined) return ''
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }

      const rows = nodes.map(node =>
        headers
          .map(h => {
            if (h === 'tags') return escapeCSV(node.tags?.join(';') || '')
            return escapeCSV(node[h])
          })
          .join(',')
      )

      return {
        csv: [headers.join(','), ...rows].join('\n'),
        headers,
        rowCount: nodes.length,
      }
    },

    /**
     * Import nodes from JSON export.
     * @param {Object} data - JSON export data
     * @param {number|null} targetParentId - Parent to import under
     * @param {string} workspaceId - Target workspace
     * @returns {Object} Import result
     */
    importJSON(data, targetParentId = null, workspaceId = 'work') {
      if (!data || !data.root) {
        throw new Error('Invalid import data: missing root node')
      }

      const idMap = new Map()
      let importedCount = 0

      function importNodeRecursive(nodeData, parentId) {
        const oldId = nodeData.id
        const { id: _id, children, created_at: _created, updated_at: _updated, ...nodeFields } = nodeData

        const newNode = ctx.createNode({
          ...nodeFields,
          parent_id: parentId,
          workspace_id: workspaceId,
        })

        idMap.set(oldId, newNode.id)
        importedCount++

        if (children && Array.isArray(children)) {
          for (const child of children) {
            importNodeRecursive(child, newNode.id)
          }
        }

        return newNode
      }

      const newRoot = importNodeRecursive(data.root, targetParentId)

      let linksCreated = 0
      if (data.links && Array.isArray(data.links)) {
        for (const link of data.links) {
          const newSourceId = idMap.get(link.source_id)
          const newTargetId = idMap.get(link.target_id)
          if (newSourceId && newTargetId) {
            try {
              ctx.linkNodes(newSourceId, newTargetId)
              linksCreated++
            } catch {
              // Ignore duplicate link errors
            }
          }
        }
      }

      return {
        rootId: newRoot.id,
        nodesImported: importedCount,
        linksCreated,
      }
    },

    /**
     * Import nodes from CSV.
     * @param {string} csvData - CSV string
     * @param {number|null} targetParentId - Parent to import under
     * @param {string} workspaceId - Target workspace
     * @returns {Object} Import result
     */
    importCSV(csvData, targetParentId = null, workspaceId = 'work') {
      const lines = csvData.trim().split('\n')
      if (lines.length < 2) {
        throw new Error('CSV must have header row and at least one data row')
      }

      const headers = lines[0].split(',').map(h => h.trim())
      const titleIdx = headers.indexOf('title')

      if (titleIdx === -1) {
        throw new Error('CSV must have a "title" column')
      }

      const parseCSVLine = line => {
        const values = []
        let current = ''
        let inQuotes = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              current += '"'
              i++
            } else {
              inQuotes = !inQuotes
            }
          } else if (char === ',' && !inQuotes) {
            values.push(current)
            current = ''
          } else {
            current += char
          }
        }
        values.push(current)
        return values
      }

      let importedCount = 0
      const idMap = new Map()

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i])
        if (values.length < headers.length) continue

        const row = {}
        headers.forEach((h, idx) => {
          row[h] = values[idx] || null
        })

        if (!row.title?.trim()) continue

        const oldId = row.id ? parseInt(row.id) : null
        const oldParentId = row.parent_id ? parseInt(row.parent_id) : null

        let parentId = targetParentId
        if (oldParentId && idMap.has(oldParentId)) {
          parentId = idMap.get(oldParentId)
        }

        const newNode = ctx.createNode({
          title: row.title.trim(),
          type: row.type || 'note',
          parent_id: parentId,
          workspace_id: workspaceId,
          notes: row.notes || null,
          completed: row.completed === 'true' || row.completed === '1',
          importance: row.importance ? parseInt(row.importance) : null,
          due_date: row.due_date || null,
          start_date: row.start_date || null,
          end_date: row.end_date || null,
          tags: row.tags ? row.tags.split(';').filter(Boolean) : null,
        })

        if (oldId) {
          idMap.set(oldId, newNode.id)
        }
        importedCount++
      }

      return {
        nodesImported: importedCount,
      }
    },
  }
}

module.exports = {
  createExportOperations,
}
