# Quickstart

Get up and running with Graph Core in minutes.

## Creating Your First Node

1. Launch the app with `npm run electron:dev`
2. Type a title in the input bar at the top
3. Select a node type from the dropdown
4. Press Enter or click the + button

## Navigation

### Basic Navigation

- **Single click**: Select a node and open detail panel
- **Double click**: Navigate into the node (enter its subgraph)
- **Breadcrumbs**: Click to navigate back up the hierarchy

### Keyboard Navigation

Use `Cmd/Ctrl + K` to open spotlight search for quick navigation.

For the complete list of keyboard shortcuts, see [Keyboard Shortcuts](../reference/keyboard-shortcuts.md).

## Working with Nodes

### Adding Child Nodes

1. Select a parent node
2. Press `Cmd/Ctrl + Enter` or click the + button
3. Enter the child node details

### Editing Nodes

- **Title**: Double-click the title to edit inline
- **Notes**: Click the notes area to edit
- **Details**: Use the detail panel for full editing

### Organizing Nodes

- **Drag and drop**: Reorder nodes within a view
- **Move**: Right-click > Move to change parent
- **Link**: Create relationships between nodes

## Switching Views

Use the view switcher in the toolbar:

| View | Description |
|------|-------------|
| Tree | Hierarchical tree structure |
| Cards | Nested card layout |
| Graph | Force-directed graph visualization |
| Table | Spreadsheet-like view |
| Timeline | Date-based timeline |
| Calendar | Monthly calendar view |
| Tasks | Filtered task list |
| Persons | Contact management |
| Trash | Deleted items (restore or delete permanently) |

## Using Search

1. Press `Cmd/Ctrl + K` to open spotlight search
2. Type to search node titles and notes
3. Use `#tag` to search by tag
4. Press Enter to navigate to the selected result

For advanced search features, see [Search Guide](search.md).

## Favorites and Recents

### Favorites

Star nodes for quick access:

1. Right-click a node and select "Add Favorite"
2. Or click the star icon in the detail panel
3. Access favorites from the sidebar

### Recent Items

The sidebar shows your 10 most recently accessed nodes for quick navigation back to where you were working.

## Deleting and Restoring Nodes

### Soft Delete

Deleting a node moves it to Trash rather than permanently removing it:

1. Select a node
2. Press `Cmd/Ctrl + Delete/Backspace` or right-click > Delete
3. The node moves to Trash with a timestamp

Deleted nodes are excluded from search, views, and exports. Children of deleted nodes become orphans (moved to Lost and Found).

### Restoring from Trash

1. Open the Trash view from the sidebar
2. Find the deleted node (sorted by deletion date)
3. Click "Restore" to return it to its original location

### Permanent Deletion

From Trash view:

- Click "Delete" on individual items for permanent removal
- Use "Empty Trash" in Settings to permanently delete all trashed items

Permanent deletion cannot be undone.

## Undo and Redo

All operations can be undone within your browser session:

- **Undo**: `Cmd/Ctrl + Z`
- **Redo**: `Cmd/Ctrl + Shift + Z` or `Cmd/Ctrl + Y`

The undo/redo buttons in the toolbar show when actions are available.

### Session-Based History

The undo/redo stack is stored in browser sessionStorage:

- History persists across page reloads within the same session
- Closing the browser tab clears the history
- Maximum 50 operations are retained
- Each operation shows a description when undone/redone

Operations that can be undone include: create, delete, move, reorder, link, unlink, and property changes.

## See Also

- [Views Guide](views.md)
- [Detail Panel](detail-panel.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
- [Node Types](../reference/node-types.md)
