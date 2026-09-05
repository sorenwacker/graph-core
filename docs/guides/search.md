# Search

Graph Core provides a spotlight-style search for quick navigation and node operations.

## Opening Search

Press `Cmd/Ctrl + K` to open the spotlight search from anywhere in the application.

## Search Modes

The search operates in three modes:

### Normal Mode

The default mode for finding and navigating to nodes.

- Type to search node titles and notes
- Press Enter to navigate to the selected result
- Results show breadcrumb paths for context

### Link Mode

Create relationships between nodes.

1. Select a node in the app
2. Open search with `Cmd/Ctrl + K`
3. Search for the target node
4. Select to create a link

### Move Mode

Relocate nodes to new parents.

1. Right-click a node and select "Move to..."
2. Search opens in Move mode
3. Select the new parent node
4. Node is moved to the new location

The top level is not a node, so it cannot be found by searching. Move mode therefore offers a **Root** destination as its first result: it is listed while the search box is empty, and stays listed while what you type is still a prefix of "root". Selecting it clears the node's parent, the same operation as the detail panel's "Move to Root" button.

## Search Filters

### Type Filter

Filter results by node type:

- Click the type dropdown in the search bar
- Select one or more types to filter
- Clear to show all types

### Workspace Filter

Search is scoped to the current workspace by default. Results from other workspaces are not shown.

### Hide Completed

Toggle to exclude completed tasks and projects from results.

## Search Syntax

### Basic Search

Type any text to search titles and note content:

```
meeting notes
```

### Tag Search

Prefix with `#` to search by tag:

```
#urgent
```

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `Arrow Up` | Select previous result |
| `Arrow Down` | Select next result |
| `Enter` | Navigate to selected result |
| `Escape` | Close search |

## Results

### Ranking

Results are ordered by how well the query matches the node **title**, because the node a query names is almost always wanted ahead of the notes that merely mention it. Searching for a person returns that person's node before the meeting notes they appear in.

Four tiers, in order:

1. The title equals the query.
2. The title starts with the query.
3. The title contains the query.
4. Only the notes match.

Within a tier, the most recently updated node comes first. Ranking is applied in the database query, so it holds across pages rather than only reordering the page you are looking at.

### Pagination

Results are paginated with 50 items per page. Click "Load More" to fetch additional results.

### Breadcrumbs

Each result shows its ancestry path, helping identify the correct node when multiple have similar names.

### Result Actions

From search results you can:

- Navigate to the node (Enter or click)
- View the node's location in the hierarchy via breadcrumbs

## See Also

- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
- [Workspaces](workspaces.md)
