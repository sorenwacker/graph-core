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

| Key | Action |
|-----|--------|
| `Cmd/Ctrl + K` | Open spotlight search |
| `Cmd/Ctrl + Up` | Go to parent |
| `Cmd/Ctrl + Down` | Go to first child |
| `Cmd/Ctrl + Left` | Go to previous sibling |
| `Cmd/Ctrl + Right` | Go to next sibling |
| `Enter` | Toggle detail panel |
| `Escape` | Close detail panel / Clear selection |

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

## Using Search

1. Press `Cmd/Ctrl + K` to open spotlight search
2. Type to search node titles and notes
3. Use `#tag` to search by tag
4. Press Enter to navigate to the selected result

## See Also

- [Views Guide](views.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
- [Node Types](../reference/node-types.md)
