/**
 * Export and import operations for nodes in various formats.
 * Supports Markdown, JSON, and CSV formats for data interchange.
 * @module database/export
 */

/**
 * @typedef {Object} MarkdownExportResult
 * @property {string} markdown - The exported markdown content
 */

/**
 * @typedef {Object} JSONExportResult
 * @property {number} version - Export format version
 * @property {string} exportedAt - ISO timestamp of export
 * @property {Object} root - Root node with nested children
 * @property {Array} [links] - Array of link objects if includeLinks is true
 */

/**
 * @typedef {Object} CSVExportResult
 * @property {string} csv - The exported CSV content
 * @property {string[]} headers - Array of column header names
 * @property {number} rowCount - Number of data rows exported
 */

/**
 * @typedef {Object} JSONImportResult
 * @property {number} rootId - ID of the newly created root node
 * @property {number} nodesImported - Total number of nodes imported
 * @property {number} linksCreated - Number of links recreated
 */

/**
 * @typedef {Object} CSVImportResult
 * @property {number} nodesImported - Total number of nodes imported
 */

/**
 * @typedef {Object} JSONExportOptions
 * @property {boolean} [includeLinks=true] - Whether to include node links in export
 */

/**
 * @typedef {Object} DatabaseContext
 * @property {Function} _query - Execute SQL query returning array of rows
 * @property {Function} getNode - Get a single node by ID
 * @property {Function} getDescendants - Get all descendants of a node
 * @property {Function} getNodes - Get nodes with filtering
 * @property {Function} createNode - Create a new node
 * @property {Function} linkNodes - Create a link between nodes
 */

/**
 * Creates export and import operations bound to a database context.
 * Handles conversion between internal node format and external formats.
 * @param {DatabaseContext} ctx - Database context with query methods
 * @returns {Object} Object containing all export/import operations
 */
function createExportOperations(ctx) {
  return {
    /**
     * Exports a node and its descendants as a Markdown document.
     * Node titles become headings based on depth (max h6).
     * Headings within notes are adjusted to maintain hierarchy.
     * @param {number} nodeId - ID of the root node to export
     * @returns {MarkdownExportResult} Object containing the markdown string
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
     * Exports a node and its descendants as a JSON object.
     * Includes full node data with nested children structure.
     * Optionally includes links between nodes in the exported subtree.
     * @param {number} nodeId - ID of the root node to export
     * @param {JSONExportOptions} [options={}] - Export options
     * @returns {JSONExportResult} Versioned JSON export with root node and optional links
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
     * Exports nodes as a CSV file.
     * Can export a subtree starting from a node or all nodes in a workspace.
     * Tags are exported as semicolon-separated values.
     * @param {number|null} [nodeId=null] - Root node ID or null for all nodes
     * @param {string|null} [workspaceId=null] - Workspace filter when nodeId is null
     * @returns {CSVExportResult} Object with CSV string, headers, and row count
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
     * Imports nodes from a JSON export.
     * Creates new nodes with new IDs while preserving the tree structure.
     * Recreates links between imported nodes using ID mapping.
     * @param {Object} data - JSON export data with version, root, and optional links
     * @param {Object} data.root - Root node object with nested children
     * @param {Array} [data.links] - Optional array of link objects to recreate
     * @param {number|null} [targetParentId=null] - Parent ID to import under, or null for root level
     * @param {string} [workspaceId='work'] - Workspace to assign to imported nodes
     * @returns {JSONImportResult} Object with new root ID and import counts
     * @throws {Error} If data is invalid or missing root node
     */
    importJSON(data, targetParentId = null, workspaceId = 'work') {
      if (!data || !data.root) {
        throw new Error('Invalid import data: missing root node')
      }

      // Persist once for the whole import instead of per node (crash-atomic).
      return ctx._batch(() => {
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
      })
    },

    /**
     * Imports nodes from a CSV file.
     * Requires a 'title' column; other columns are optional.
     * Attempts to preserve parent-child relationships using ID mapping.
     * Tags should be semicolon-separated in the CSV.
     * @param {string} csvData - CSV content with header row and data rows
     * @param {number|null} [targetParentId=null] - Parent ID for imported nodes without a mapped parent
     * @param {string} [workspaceId='work'] - Workspace to assign to imported nodes
     * @returns {CSVImportResult} Object with count of imported nodes
     * @throws {Error} If CSV has fewer than 2 lines or missing title column
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

      // Persist once for the whole import instead of per row (crash-atomic).
      return ctx._batch(() => {
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
      })
    },
  }
}

module.exports = {
  createExportOperations,
}
