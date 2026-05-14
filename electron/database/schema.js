/**
 * Database schema definitions and table creation.
 * @module database/schema
 */

/**
 * Shared field list for node CRUD operations.
 * Used by nodes.js for building INSERT/UPDATE queries.
 */
const NODE_FIELDS = [
  'type',
  'title',
  'parent_id',
  'notes',
  'completed',
  'color',
  'sort_order',
  'importance',
  'start_date',
  'end_date',
  'due_date',
  'location',
  'email',
  'phone',
  'organization',
  'role',
  'address',
  'website',
  'favorite',
  'notes_sensitive',
  'category_id',
  'status_id',
  'tags',
  'workspace_id',
  'graph_layout',
  'show_root_node',
  'show_external_links',
  'show_links',
  'graph_max_depth',
  'graph_type_filter',
  'graph_relax_locked',
  'graph_fit_locked',
  'graph_physics',
  'collapsed',
]

/**
 * Create all database tables.
 * @param {Object} db - sql.js Database instance
 */
function createTables(db) {
  db.run(`
    CREATE TABLE IF NOT EXISTS nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'task',
      title TEXT NOT NULL,
      parent_id INTEGER REFERENCES nodes(id) ON DELETE SET NULL,
      depth INTEGER DEFAULT 0,
      path TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      color TEXT,
      sort_order INTEGER DEFAULT 0,
      importance INTEGER,
      start_date TEXT,
      end_date TEXT,
      due_date TEXT,
      location TEXT,
      email TEXT,
      phone TEXT,
      organization TEXT,
      role TEXT,
      address TEXT,
      website TEXT,
      favorite INTEGER DEFAULT 0,
      notes_sensitive INTEGER DEFAULT 0,
      category_id INTEGER,
      status_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      deleted_at TEXT
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3498db',
      icon TEXT DEFAULT 'folder',
      sort_order INTEGER DEFAULT 0,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS node_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      link_type TEXT DEFAULT 'related',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_id, target_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3498db',
      symbol TEXT DEFAULT '*',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS statuses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3498db',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS node_tables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
      name TEXT DEFAULT 'Table',
      column_definitions TEXT NOT NULL DEFAULT '[]',
      row_count INTEGER DEFAULT 5,
      settings TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(node_id)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS node_table_cells (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_id INTEGER NOT NULL REFERENCES node_tables(id) ON DELETE CASCADE,
      row_index INTEGER NOT NULL,
      col_index INTEGER NOT NULL,
      value TEXT,
      formula TEXT,
      computed_value TEXT,
      style TEXT,
      UNIQUE(table_id, row_index, col_index)
    )
  `)

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

/**
 * Create all database indexes.
 * @param {Object} db - sql.js Database instance
 */
function createIndexes(db) {
  // Single-column indexes
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_parent_id ON nodes(parent_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(type)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(path)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_deleted ON nodes(deleted_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_workspace ON nodes(workspace_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_workspaces_sort ON workspaces(sort_order)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_node_tables_node_id ON node_tables(node_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_node_table_cells_table_id ON node_table_cells(table_id)`)

  // Composite indexes for common query patterns
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_workspace_parent ON nodes(workspace_id, parent_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_workspace_deleted ON nodes(workspace_id, deleted_at)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_nodes_parent_sort ON nodes(parent_id, sort_order)`)
}

module.exports = {
  NODE_FIELDS,
  createTables,
  createIndexes,
}
