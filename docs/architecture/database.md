# Database Schema

Graph Core uses SQLite as its data store, accessed through sql.js in the Electron main process.

## Tables

### nodes

Primary data table storing all node information.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key, auto-increment |
| type | TEXT | Node type (task, project, note, etc.) |
| title | TEXT | Node title |
| parent_id | INTEGER | Parent node ID (NULL for roots), `REFERENCES nodes(id) ON DELETE SET NULL` |
| workspace_id | TEXT | Workspace assignment |
| depth | INTEGER | Tree depth (0 for roots) |
| path | TEXT | Ancestor path (e.g., "1/5/12") |
| notes | TEXT | Markdown content |
| completed | INTEGER | Completion status (0/1) |
| color | TEXT | Custom color hex |
| sort_order | INTEGER | Position within parent |
| importance | INTEGER | Priority level (1-5) |
| start_date | TEXT | ISO date string |
| end_date | TEXT | ISO date string |
| due_date | TEXT | ISO date string |
| location, email, phone, organization, role, address, website | TEXT | Contact fields (person and organization nodes) |
| category_id, status_id | INTEGER | Optional category/status references |
| favorite | INTEGER | Favorite flag (0/1) |
| notes_sensitive | INTEGER | Sensitive content flag (0/1) |
| collapsed | INTEGER | Collapsed in tree/graph (0/1) |
| tags | TEXT | JSON array of tags |
| graph_layout, show_root_node, show_external_links, show_links, graph_max_depth, graph_type_filter, graph_relax_locked, graph_fit_locked, graph_physics | mixed | Per-node graph view state (`graph_physics` is a JSON settings object) |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last modification timestamp |
| deleted_at | TEXT | Soft delete timestamp |

Columns after `deleted_at` in the base schema (`workspace_id`, `tags`, `collapsed`, the `graph_*` set) are added by migrations on existing databases, so their physical order varies between installs. Always select by name.

### workspaces

Workspace definitions for organizing nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT | Primary key (e.g., "work", "private") |
| name | TEXT | Display name |
| color | TEXT | Theme color hex |
| icon | TEXT | Icon identifier |
| sort_order | INTEGER | Display order |
| is_default | INTEGER | Default workspace flag |
| created_at | TEXT | Creation timestamp |

### node_links

Many-to-many relationships between nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| source_id | INTEGER | Source node ID, `ON DELETE CASCADE` |
| target_id | INTEGER | Target node ID, `ON DELETE CASCADE` |
| link_type | TEXT | Relationship type (default: "related") |
| created_at | TEXT | Creation timestamp |

`UNIQUE(source_id, target_id)` prevents duplicate links.

### node_tables

Spreadsheet data attached to nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| node_id | INTEGER | Owning node ID, `ON DELETE CASCADE`, `UNIQUE` (one table per node) |
| name | TEXT | Table name |
| column_definitions | TEXT | JSON column config |
| row_count | INTEGER | Number of rows |
| settings | TEXT | JSON table settings |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last modification timestamp |

### node_table_cells

Individual cell data for node tables.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| table_id | INTEGER | Parent table ID, `ON DELETE CASCADE` |
| row_index | INTEGER | Row position |
| col_index | INTEGER | Column position |
| value | TEXT | Cell value |
| formula | TEXT | Cell formula |
| computed_value | TEXT | Computed result |
| style | TEXT | JSON style config |

`UNIQUE(table_id, row_index, col_index)` keeps one row per cell.

### categories, statuses, settings

Supporting tables: `categories` and `statuses` hold the optional labels referenced by `nodes.category_id` / `nodes.status_id`; `settings` is a `key`/`value` store for settings that must survive a reinstall (for example the per-workspace graph max depth).

## Foreign Keys

sql.js opens databases with foreign-key enforcement **off**, so the schema's `ON DELETE CASCADE` / `ON DELETE SET NULL` clauses would be inert. `Database._init()` runs `PRAGMA foreign_keys = ON` immediately after opening the file, which makes them live:

- Hard-deleting a node cascades away its `node_links` rows and its `node_tables` / `node_table_cells`
- Hard-deleting a node sets `parent_id = NULL` on rows still pointing at it

!!! warning "sql.js caveat"
    `db.export()` — used by every save, snapshot, and restore — closes and reopens the underlying connection, which resets per-connection pragmas. The pragma is therefore re-issued after every `export()` in `_save()`, `backup()`, `restoreBackup()`, and `reload()`. Any new code path that calls `export()` or constructs a `new SQL.Database(...)` must do the same.

## Path and Depth Invariant

Every node's `path` is the slash-joined ids of its ancestors (`''` for a root) and `depth` is the number of ancestors. Descendant queries (`getDescendants`, `getDescendantsBatch`) rely on `path` prefix matching, so a stale path makes a subtree invisible to them.

The invariant is maintained by two helpers in `electron/database/nodes.js`:

| Helper | Responsibility |
|--------|----------------|
| `updateDescendantPaths(nodeId)` | Rewrites `path`/`depth` for the node's descendants, recursively |
| `updateSubtreePath(nodeId)` | Recomputes the node's *own* `path`/`depth` from its current parent, then calls `updateDescendantPaths` |

`updateSubtreePath` is used everywhere a node can change parent:

| Operation | Where |
|-----------|-------|
| Delete with reparenting of children | `deleteNode` (`nodes.js`) |
| Hard delete (children left behind by `ON DELETE SET NULL`) | `deleteNode(id, true)` |
| Reorder onto a target under a different parent | `reorderNode` |
| Reparent via `updateNode({ parent_id })` | `updateNode` |
| Trash purge that orphans live children | `emptyTrash` (`tree.js`) |
| Reparent to root | `reparentToRoot` resets `path`/`depth` itself, then rebuilds descendants |

Both helpers read rows regardless of `deleted_at`: soft-deleted nodes are still rows in the table, and a stale path would resurface when they are restored.

## Batched Writes

`_save()` writes the whole database file, so a naive subtree update would write the file once per row. `Database._batch(fn)` wraps `fn` in a single `BEGIN`/`COMMIT` and defers the write until the outermost batch ends — one transaction, one file write, rolled back on error. It is nestable, so helpers can batch without knowing their caller.

Every tree mutation listed above runs inside `_batch`, as do `importJSON` and `importCSV`. This makes them crash-atomic: either the whole move (or import) is on disk, or none of it.

## Indexes

Indexes optimize common query patterns:

### Single-column indexes

| Index | Column(s) | Purpose |
|-------|-----------|---------|
| idx_nodes_parent_id | parent_id | Tree traversal |
| idx_nodes_type | type | Type filtering |
| idx_nodes_path | path | Descendant queries |
| idx_nodes_deleted | deleted_at | Soft delete filtering |
| idx_nodes_workspace | workspace_id | Workspace filtering |
| idx_workspaces_sort | workspaces.sort_order | Workspace selector ordering |
| idx_node_tables_node_id | node_tables.node_id | Table lookup by node |
| idx_node_table_cells_table_id | node_table_cells.table_id | Cell lookup by table |

### Composite indexes

| Index | Column(s) | Purpose |
|-------|-----------|---------|
| idx_nodes_workspace_parent | workspace_id, parent_id | Workspace tree queries |
| idx_nodes_workspace_deleted | workspace_id, deleted_at | Workspace trash queries |
| idx_nodes_parent_sort | parent_id, sort_order | Ordered child retrieval |

## Query Patterns

### Get children with ordering

```sql
SELECT * FROM nodes
WHERE parent_id = ? AND deleted_at IS NULL
ORDER BY sort_order, created_at
```

Uses `idx_nodes_parent_sort` for efficient ordering.

### Workspace-filtered roots

```sql
SELECT * FROM nodes
WHERE parent_id IS NULL
  AND workspace_id = ?
  AND deleted_at IS NULL
ORDER BY sort_order, created_at
```

Uses `idx_nodes_workspace_parent`.

### Search with pagination

```sql
SELECT * FROM nodes
WHERE deleted_at IS NULL
  AND (title LIKE ? OR notes LIKE ?)
  AND workspace_id = ?
ORDER BY updated_at DESC
LIMIT ? OFFSET ?
```

## Migrations

Schema migrations run automatically on startup (`electron/database/migrations.js`):

1. Column additions are idempotent — only a "duplicate column name" error is swallowed, anything else is raised
2. Default workspaces (`work`, `private`) are seeded with `INSERT OR IGNORE`
3. Data migrations run conditionally (assigning unassigned nodes to `work`, repairing root paths, converting string tags to tag nodes)
4. A snapshot is taken before a destructive migration, but only when an existing database file is being upgraded — a brand-new database has nothing to back up

## See Also

- [Architecture Overview](overview.md)
- [Development Guide](../contributing/development.md)
