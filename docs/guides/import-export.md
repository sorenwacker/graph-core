# Import and Export

Graph Core supports multiple formats for importing and exporting your data.

## Export

Access export options from the context menu or toolbar.

### Export Formats

| Format | Description | Best For |
|--------|-------------|----------|
| Markdown | Single node as `.md` file | Documentation, sharing notes |
| JSON | Complete node tree with metadata | Backup, migration, programmatic use |
| CSV | Flat table format | Spreadsheet tools, analysis |

### Markdown Export

Exports a single node's content as a Markdown document.

**Includes:**

- Node title as heading
- Notes content
- Basic metadata

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

**Columns:**

- ID, Title, Type
- Parent ID
- Dates (due, start, end)
- Status fields
- Tags

**Use Cases:**

- Import to spreadsheet applications
- Reporting
- Bulk analysis

## Import

### JSON Import

Import a previously exported JSON file.

**Steps:**

1. Select target workspace
2. Choose parent node (optional)
3. Select JSON file
4. Nodes are created with relationships preserved

**Behavior:**

- Creates new nodes (does not update existing)
- Preserves hierarchy
- Restores links between imported nodes
- Assigns to selected workspace

### CSV Import

Import data from a CSV file.

**Required Columns:**

- `title` - Node title

**Optional Columns:**

- `type` - Node type (defaults to "note")
- `notes` - Note content
- `due_date`, `start_date`, `end_date`
- `importance`
- `tags` - Comma-separated list

**Steps:**

1. Prepare CSV with required columns
2. Select target workspace
3. Choose parent node
4. Select CSV file
5. Nodes are created as children of the parent

## Backup and Restore

For full database backup and restore, see [Settings - Database Management](../reference/settings.md#database-management).

## See Also

- [Settings](../reference/settings.md)
- [Workspaces](workspaces.md)
