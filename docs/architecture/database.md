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
| parent_id | INTEGER | Parent node ID (NULL for roots) |
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
| favorite | INTEGER | Favorite flag (0/1) |
| notes_sensitive | INTEGER | Sensitive content flag (0/1) |
| tags | TEXT | JSON array of tags |
| created_at | TEXT | Creation timestamp |
| updated_at | TEXT | Last modification timestamp |
| deleted_at | TEXT | Soft delete timestamp |

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
| source_id | INTEGER | Source node ID |
| target_id | INTEGER | Target node ID |
| link_type | TEXT | Relationship type (default: "related") |
| created_at | TEXT | Creation timestamp |

### node_tables

Spreadsheet data attached to nodes.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| node_id | INTEGER | Parent node ID |
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
| table_id | INTEGER | Parent table ID |
| row_index | INTEGER | Row position |
| col_index | INTEGER | Column position |
| value | TEXT | Cell value |
| formula | TEXT | Cell formula |
| computed_value | TEXT | Computed result |
| style | TEXT | JSON style config |

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

## Materialized path invariant

`depth` and `path` form a materialized-path encoding of the tree, enabling
descendant lookups (`path LIKE '1/5/%'`) and depth-capped queries without
recursion. The invariant for every live node is:

- `depth` equals the number of its ancestors (0 for roots).
- `path` is the slash-joined ids of its ancestors, root first, and references
  only live ancestors (e.g. `"1/5"` for a node whose ancestors are 1 then 5).

Any operation that changes a node's parent must reset that node's **own**
`depth`/`path` and then recompute its descendants. `moveNode` is the single
source of truth for this; `deleteNode` (which reassigns children to the
grandparent) and `reparentToRoot` apply the same reset. Updating only a node's
descendants while leaving its own `depth`/`path` stale corrupts the whole
subtree, because descendant paths are derived from the parent's path.

## Migrations

Schema migrations run automatically on startup in `_runMigrations()`:

1. Column additions wrapped in try/catch (idempotent)
2. Data migrations run conditionally
3. Backup created before destructive migrations

## See Also

- [Architecture Overview](overview.md)
- [Development Guide](../contributing/development.md)
