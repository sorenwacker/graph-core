# Import and Export

Graph Core supports multiple formats for importing and exporting your data.

## Export

Open a node's detail panel and use the **Export** menu in the panel footer. The export covers that node and its descendants.

### Export Formats

| Format | Description | Best For |
|--------|-------------|----------|
| Markdown | Single node as `.md` file | Documentation, sharing notes |
| JSON | Complete node tree with metadata | Backup, migration, programmatic use |
| CSV | Flat table format | Spreadsheet tools, analysis |

### Markdown Export

Exports the node and its descendants as one Markdown document.

**Includes:**

- Each node title as a heading, nested by depth (`#` for the exported node, `##` for its children, down to `######`; deeper titles are bold text)
- Each node's notes, with headings inside the notes shifted down so they stay below their node's heading

Other metadata (dates, tags, importance) is not included — use JSON or CSV for that.

**Use Cases:**

- Share notes externally
- Create documentation
- Archive content

### JSON Export

Exports the complete node structure with all metadata.

**Includes:**

- Full node hierarchy (descendants)
- All node properties
- Relationships and links
- Tags and metadata

**Use Cases:**

- Full backup
- Migration between instances
- Data analysis

### CSV Export

Exports nodes as a flat table.

**Columns (in order):**

`id`, `title`, `type`, `parent_id`, `workspace_id`, `notes`, `completed`, `importance`, `due_date`, `start_date`, `end_date`, `tags`, `created_at`, `updated_at`

Tags are joined with semicolons. Fields containing a comma, quote, or newline are quoted and internal quotes are doubled, following RFC 4180 — so multi-line notes survive the round trip.

**Use Cases:**

- Import to spreadsheet applications
- Reporting
- Bulk analysis

## Import

Import from **Settings > Data > Import** with the **JSON** or **CSV** button. Imported nodes are created at the root level of the current workspace.

### JSON Import

Import a previously exported JSON file.

**Behavior:**

- Creates new nodes with new IDs (does not update existing ones)
- Preserves the hierarchy below the imported root
- Restores links between imported nodes
- Assigns everything to the current workspace
- Runs as a single transaction with one write to disk, so a crash mid-import cannot leave a half-imported tree

### CSV Import

Import data from a CSV file.

**Required Columns:**

- `title` - Node title

**Optional Columns:**

- `id`, `parent_id` - Used to rebuild parent/child relationships between imported rows
- `type` - Node type (defaults to "note")
- `notes` - Note content
- `completed` - `true` or `1`
- `due_date`, `start_date`, `end_date`
- `importance`
- `tags` - Semicolon-separated list

**Behavior:**

- The parser follows RFC 4180: quoted fields may contain commas, doubled quotes, and newlines, so a CSV exported from Graph Core re-imports unchanged (multi-line notes included)
- Rows are matched to parents through their original `id`/`parent_id`; rows whose parent is not in the file are created at root level
- Rows with too few columns or an empty `title` are skipped, and the import summary reports how many were skipped:

```
Imported 42 nodes
Skipped 2 malformed or title-less rows
```

- Like JSON import, the whole file is imported in one transaction with a single write to disk

## Backup and Restore

For full database backup and restore, see [Settings - Database Management](../reference/settings.md#database-management).

## See Also

- [Settings](../reference/settings.md)
- [Workspaces](workspaces.md)
