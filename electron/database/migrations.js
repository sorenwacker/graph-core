/**
 * Database migrations for backward compatibility.
 * @module database/migrations
 */

const fs = require('fs')

/**
 * Run all schema migrations.
 * @param {Object} ctx - Database context with db, _query, _run, backup, _save methods
 */
function runMigrations(ctx) {
  runColumnMigrations(ctx)
  seedDefaultWorkspaces(ctx)
  runDataMigrations(ctx)
}

/**
 * Add new columns to existing tables.
 * @param {Object} ctx - Database context
 */
function runColumnMigrations(ctx) {
  const columnMigrations = [
    { table: 'nodes', column: 'notes_sensitive', def: 'INTEGER DEFAULT 0' },
    { table: 'nodes', column: 'tags', def: "TEXT DEFAULT '[]'" },
    { table: 'nodes', column: 'graph_layout', def: 'TEXT DEFAULT NULL' },
    { table: 'nodes', column: 'show_root_node', def: 'INTEGER DEFAULT NULL' },
    { table: 'nodes', column: 'show_external_links', def: 'INTEGER DEFAULT NULL' },
    { table: 'nodes', column: 'show_links', def: 'INTEGER DEFAULT 1' },
    {
      table: 'nodes',
      column: 'workspace_id',
      def: 'TEXT DEFAULT NULL',
      onAdd: () => {
        // Only back up when migrating an existing database file; a brand-new
        // database (file not yet written) has nothing worth backing up.
        if (ctx.dbPath && fs.existsSync(ctx.dbPath)) {
          ctx.backup('-pre-workspace-migration')
          console.log('Created backup before workspace migration')
        }
        console.log('Added workspace_id column to nodes table')
      },
    },
    { table: 'nodes', column: 'graph_max_depth', def: 'INTEGER DEFAULT NULL' },
    { table: 'nodes', column: 'graph_type_filter', def: 'TEXT DEFAULT NULL' },
    { table: 'nodes', column: 'graph_relax_locked', def: 'INTEGER DEFAULT NULL' },
    { table: 'nodes', column: 'graph_fit_locked', def: 'INTEGER DEFAULT NULL' },
    { table: 'nodes', column: 'graph_physics', def: 'TEXT DEFAULT NULL' },
    { table: 'nodes', column: 'collapsed', def: 'INTEGER DEFAULT 0' },
    { table: 'workspaces', column: 'show_external_links', def: 'INTEGER DEFAULT 1' },
  ]

  for (const { table, column, def, onAdd } of columnMigrations) {
    let added = false
    try {
      ctx.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`)
      added = true
    } catch (e) {
      // Only "column already exists" is expected here; surface anything else.
      if (!String(e?.message).includes('duplicate column name')) {
        throw e
      }
    }
    // Run onAdd outside the try so its errors are not swallowed.
    if (added && onAdd) onAdd()
  }
}

/**
 * Seed default workspaces if they don't exist.
 * @param {Object} ctx - Database context
 */
function seedDefaultWorkspaces(ctx) {
  const defaults = [
    { id: 'work', name: 'Work', color: '#3498db', icon: 'briefcase', sort_order: 1 },
    { id: 'private', name: 'Private', color: '#27ae60', icon: 'home', sort_order: 2 },
  ]
  for (const ws of defaults) {
    try {
      ctx.db.run(`INSERT OR IGNORE INTO workspaces (id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)`, [
        ws.id,
        ws.name,
        ws.color,
        ws.icon,
        ws.sort_order,
      ])
    } catch {
      // Ignore duplicates
    }
  }
}

/**
 * Run all data migrations.
 * @param {Object} ctx - Database context
 */
function runDataMigrations(ctx) {
  migrateUnassignedNodesToWork(ctx)
  fixRootNodePaths(ctx)
  migrateOrganizationTextToLinks(ctx)
  migratePersonsOrgsToWorkWorkspace(ctx)
  migrateTasksProjectsStartDate(ctx)
  migrateShowLinksDefault(ctx)
  migrateStringTagsToTagNodes(ctx)
}

/**
 * Set show_links = 1 for nodes where it's NULL.
 * @param {Object} ctx - Database context
 */
function migrateShowLinksDefault(ctx) {
  ctx.db.run('UPDATE nodes SET show_links = 1 WHERE show_links IS NULL')
}

/**
 * Migrate nodes without workspace to 'work' workspace.
 * @param {Object} ctx - Database context
 */
function migrateUnassignedNodesToWork(ctx) {
  const unassigned = ctx._query(
    "SELECT COUNT(*) as cnt FROM nodes WHERE workspace_id IS NULL AND type NOT IN ('person', 'organization', 'group') AND deleted_at IS NULL"
  )
  if (unassigned[0]?.cnt > 0) {
    console.log(`Migrating ${unassigned[0].cnt} unassigned nodes to 'work' workspace`)
    ctx.db.run(
      "UPDATE nodes SET workspace_id = 'work' WHERE workspace_id IS NULL AND type NOT IN ('person', 'organization', 'group')"
    )
    ctx._save()
  }
}

/**
 * Set start_date to created_at for tasks/projects without one.
 * @param {Object} ctx - Database context
 */
function migrateTasksProjectsStartDate(ctx) {
  const needsMigration = ctx._query(
    "SELECT COUNT(*) as cnt FROM nodes WHERE type IN ('task', 'project') AND start_date IS NULL AND created_at IS NOT NULL AND deleted_at IS NULL"
  )
  if (needsMigration[0]?.cnt > 0) {
    console.log(`Setting start_date for ${needsMigration[0].cnt} tasks/projects`)
    ctx.db.run(
      "UPDATE nodes SET start_date = DATE(created_at) WHERE type IN ('task', 'project') AND start_date IS NULL AND created_at IS NOT NULL"
    )
    ctx._save()
  }
}

/**
 * Fix root nodes with corrupted paths.
 * @param {Object} ctx - Database context
 */
function fixRootNodePaths(ctx) {
  const corruptRoots = ctx._query(
    "SELECT id, path FROM nodes WHERE parent_id IS NULL AND path != '' AND path IS NOT NULL"
  )

  if (corruptRoots.length === 0) return

  console.log(`Fixing ${corruptRoots.length} root nodes with corrupted paths`)

  for (const root of corruptRoots) {
    const oldPrefix = root.path
    console.log(`Fixing root node ${root.id}: path '${oldPrefix}' -> ''`)

    ctx.db.run('UPDATE nodes SET path = ? WHERE id = ?', ['', root.id])

    const descendants = ctx._query('SELECT id, path FROM nodes WHERE path LIKE ? OR path = ?', [
      `${oldPrefix}/%`,
      oldPrefix,
    ])

    for (const desc of descendants) {
      let newPath = desc.path
      if (newPath === oldPrefix) {
        newPath = `${root.id}`
      } else if (newPath.startsWith(`${oldPrefix}/`)) {
        newPath = newPath.slice(oldPrefix.length + 1)
      }

      if (newPath !== desc.path) {
        console.log(`Fixing descendant ${desc.id}: path '${desc.path}' -> '${newPath}'`)
        ctx.db.run('UPDATE nodes SET path = ? WHERE id = ?', [newPath, desc.id])
      }
    }
  }

  ctx._save()
  console.log('Path corruption fix complete')
}

/**
 * Convert organization text field on persons to organization node links.
 * @param {Object} ctx - Database context
 */
function migrateOrganizationTextToLinks(ctx) {
  const personsWithOrgText = ctx._query(
    "SELECT id, organization FROM nodes WHERE type = 'person' AND organization IS NOT NULL AND organization != '' AND deleted_at IS NULL"
  )

  if (personsWithOrgText.length === 0) return

  let migrated = 0
  const orgCache = new Map()

  for (const person of personsWithOrgText) {
    const orgName = person.organization.trim()
    if (!orgName) continue

    const existingLinks = ctx._query(
      `SELECT n.id FROM node_links nl
       JOIN nodes n ON (nl.target_id = n.id OR nl.source_id = n.id) AND n.id != ?
       WHERE (nl.source_id = ? OR nl.target_id = ?) AND n.type = 'organization' AND n.deleted_at IS NULL`,
      [person.id, person.id, person.id]
    )

    if (existingLinks.length > 0) {
      ctx.db.run('UPDATE nodes SET organization = NULL WHERE id = ?', [person.id])
      continue
    }

    let orgId = orgCache.get(orgName.toLowerCase())
    if (!orgId) {
      const existingOrg = ctx._query(
        "SELECT id FROM nodes WHERE type = 'organization' AND LOWER(title) = LOWER(?) AND deleted_at IS NULL",
        [orgName]
      )[0]

      if (existingOrg) {
        orgId = existingOrg.id
      } else {
        ctx.db.run(
          "INSERT INTO nodes (type, title, workspace_id, path, depth, created_at, updated_at) VALUES (?, ?, NULL, '', 0, datetime('now'), datetime('now'))",
          ['organization', orgName]
        )
        const result = ctx._query('SELECT last_insert_rowid() as id')
        orgId = result[0]?.id
      }
      orgCache.set(orgName.toLowerCase(), orgId)
    }

    if (orgId) {
      try {
        ctx.db.run('INSERT OR IGNORE INTO node_links (source_id, target_id) VALUES (?, ?)', [person.id, orgId])
        migrated++
      } catch {
        // Link might already exist
      }
      ctx.db.run('UPDATE nodes SET organization = NULL WHERE id = ?', [person.id])
    }
  }

  if (migrated > 0) {
    console.log(`Migrated ${migrated} person organization text fields to links`)
    ctx._save()
  }
}

/**
 * Move persons and organizations to work workspace.
 * @param {Object} ctx - Database context
 */
function migratePersonsOrgsToWorkWorkspace(ctx) {
  const nodesToMigrate = ctx._query(
    "SELECT id, type FROM nodes WHERE workspace_id IS NULL AND type IN ('person', 'organization', 'group') AND deleted_at IS NULL"
  )
  if (nodesToMigrate.length === 0) return

  ctx.db.run(
    "UPDATE nodes SET workspace_id = 'work' WHERE workspace_id IS NULL AND type IN ('person', 'organization', 'group') AND deleted_at IS NULL"
  )

  console.log(`Migrated ${nodesToMigrate.length} persons/organizations/groups to work workspace`)
  ctx._save()
}

/**
 * Convert string tags to tag nodes with node_links.
 * Creates tag nodes for each unique tag string and links them to the original nodes.
 * @param {Object} ctx - Database context
 */
function migrateStringTagsToTagNodes(ctx) {
  // Check if migration already done by looking for existing tag nodes
  const existingTagNodes = ctx._query("SELECT COUNT(*) as cnt FROM nodes WHERE type = 'tag' AND deleted_at IS NULL")
  if (existingTagNodes[0]?.cnt > 0) {
    return // Migration already completed
  }

  // Find all nodes with non-empty tags arrays
  const nodesWithTags = ctx._query(
    "SELECT id, tags, workspace_id FROM nodes WHERE deleted_at IS NULL AND tags IS NOT NULL AND tags != '[]'"
  )

  if (nodesWithTags.length === 0) return

  console.log(`Migrating string tags to tag nodes for ${nodesWithTags.length} nodes`)
  if (ctx.dbPath && fs.existsSync(ctx.dbPath)) {
    ctx.backup('-pre-tag-migration')
    console.log('Created backup before tag migration')
  }

  // Track created tag nodes per workspace: Map<workspaceId, Map<tagName, tagNodeId>>
  const tagNodeCache = new Map()
  let tagsCreated = 0
  let linksMade = 0

  for (const node of nodesWithTags) {
    let tags = []
    try {
      tags = JSON.parse(node.tags || '[]')
    } catch {
      continue
    }

    if (!tags.length) continue

    const workspaceId = node.workspace_id

    // Get or create workspace cache
    if (!tagNodeCache.has(workspaceId)) {
      tagNodeCache.set(workspaceId, new Map())
    }
    const workspaceTagCache = tagNodeCache.get(workspaceId)

    for (const tagName of tags) {
      const normalizedTag = tagName.trim().toLowerCase()
      if (!normalizedTag) continue

      let tagNodeId = workspaceTagCache.get(normalizedTag)

      if (!tagNodeId) {
        // Check if tag node already exists in this workspace
        const existing = ctx._query(
          "SELECT id FROM nodes WHERE type = 'tag' AND LOWER(title) = LOWER(?) AND workspace_id = ? AND deleted_at IS NULL",
          [tagName.trim(), workspaceId]
        )[0]

        if (existing) {
          tagNodeId = existing.id
        } else {
          // Also check workspace_id IS NULL case
          const existingNull =
            workspaceId === null
              ? null
              : ctx._query(
                  "SELECT id FROM nodes WHERE type = 'tag' AND LOWER(title) = LOWER(?) AND workspace_id IS NULL AND deleted_at IS NULL",
                  [tagName.trim()]
                )[0]

          if (existingNull) {
            tagNodeId = existingNull.id
          } else {
            // Create new tag node at root level
            ctx.db.run(
              "INSERT INTO nodes (type, title, workspace_id, parent_id, path, depth, created_at, updated_at) VALUES (?, ?, ?, NULL, '', 0, datetime('now'), datetime('now'))",
              ['tag', tagName.trim(), workspaceId]
            )
            const result = ctx._query('SELECT last_insert_rowid() as id')
            tagNodeId = result[0]?.id
            tagsCreated++
          }
        }

        workspaceTagCache.set(normalizedTag, tagNodeId)
      }

      // Create link from original node to tag node
      if (tagNodeId) {
        try {
          ctx.db.run('INSERT OR IGNORE INTO node_links (source_id, target_id) VALUES (?, ?)', [node.id, tagNodeId])
          linksMade++
        } catch {
          // Link might already exist
        }
      }
    }

    // Clear the tags array on the original node
    ctx.db.run('UPDATE nodes SET tags = ? WHERE id = ?', ['[]', node.id])
  }

  if (tagsCreated > 0 || linksMade > 0) {
    console.log(`Created ${tagsCreated} tag nodes and ${linksMade} links`)
    ctx._save()
  }
}

module.exports = {
  runMigrations,
  runColumnMigrations,
  seedDefaultWorkspaces,
  runDataMigrations,
  migrateShowLinksDefault,
  migrateUnassignedNodesToWork,
  migrateTasksProjectsStartDate,
  fixRootNodePaths,
  migrateOrganizationTextToLinks,
  migratePersonsOrgsToWorkWorkspace,
  migrateStringTagsToTagNodes,
}
