# Detail Panel

The detail panel provides comprehensive editing and viewing capabilities for any selected node.

## Opening the Panel

- **Click** any node to open its detail panel
- **Press Enter** with a node selected
- **Double-click** a node's title to open in edit mode

## Panel Modes

### Pinned Mode

Click the pin icon to keep the panel open when clicking elsewhere. Useful when editing while browsing.

### Fullscreen Mode

Click the expand icon or press `Escape` to toggle fullscreen. Provides maximum editing space.

**Narrow Window Behavior:** On narrow screens (below the responsive threshold), opening the detail panel automatically enters fullscreen mode to provide adequate editing space.

### Detached Window

Open the detail panel in a separate window:

1. Click the "Open in Window" button in the panel header (or use context menu > "Open in Window")
2. A separate window opens with the node's detail view
3. Changes sync between windows via BroadcastChannel

**Detached window features:**

- Independent window that can be moved to another monitor
- Real-time sync with the main window
- Detaching the same node again focuses the existing window instead of opening a second one
- Quitting the app closes detached windows
- URL format: `?detached={nodeId}`

## Sections

The detail panel contains collapsible sections:

### Notes Section

The notes section supports full Markdown editing.

**View Modes:**

| Mode | Description |
|------|-------------|
| Edit | Raw Markdown editor with syntax highlighting |
| Preview | Rendered Markdown output |
| Split | Side-by-side edit and preview |

**Features:**

- Markdown syntax highlighting
- External links open in browser
- Code blocks with syntax highlighting
- Tables and lists support

### Mentions

Type `@` in the notes editor (Edit or Split mode) to mention and link to person nodes:

1. Type `@` followed by a name (e.g., `@John`)
2. A dropdown appears with matching persons (up to 10 results)
3. Use arrow keys to navigate, Enter or Tab to select — or click a suggestion
4. The mention is inserted and a link to that person is created on the current node

**Mention format:** `@[Person Name](person:123)`

In Preview and Split mode the mention renders as a `@Name` chip rather than raw Markdown.

**Keyboard navigation:**

| Key | Action |
|-----|--------|
| `Arrow Down` | Next suggestion |
| `Arrow Up` | Previous suggestion |
| `Enter` / `Tab` | Insert selected mention |
| `Escape` | Close dropdown |

While the dropdown is open these keys belong to it, so Enter inserts a mention instead of a newline. When it is closed they behave normally.

**Details:**

- The person list is scoped to the current workspace and re-loads when you switch workspaces
- Mentions must follow a space, newline, or opening parenthesis; maximum query length is 30 characters
- An already-inserted mention does not re-open the dropdown when the cursor passes over it
- Moving the cursor out of the query, or leaving the editor, dismisses the dropdown
- Linked persons appear in the Linked Items section immediately after insertion

**Sensitive Notes:**

Toggle the "sensitive" flag to blur note content when not editing. Useful for private information.

### Children Section

Displays and manages child nodes.

**Features:**

- Hierarchical child list
- Toggle completion status for tasks
- Add new child nodes
- Search within children
- Show/hide linked nodes (non-hierarchical relationships)

### Table Section

Attach a spreadsheet to any node.

**Features:**

- Create and delete tables
- Add, remove, and rename columns
- Edit cell values directly
- Cell color formatting (colorblind-friendly palette)
- Copy, cut, and paste operations
- Multi-cell selection: drag across cells to select a range; selected cells are highlighted
- Columns share the available width equally, so the table always spans the panel

**Formulas:**

Cells support formulas for computed values. Enter a formula by starting with `=`:

- Formulas are stored separately from display values
- The cell shows the computed result while displaying the formula when editing
- Formula syntax follows standard spreadsheet conventions

**Keyboard Shortcuts:**

| Key | Action |
|-----|--------|
| `Enter` | Edit selected cell |
| `Arrow keys` | Navigate cells |
| `Cmd/Ctrl + C` | Copy selection |
| `Cmd/Ctrl + V` | Paste |

### Metadata Section

Displays and edits all node properties in a grid layout.

**Editable Fields:**

- Title
- Type
- Due date, Start date, End date
- Importance level
- Location
- Email, Phone (for Person nodes)
- Organization, Role (for Person nodes)
- Website
- Color

**Organization Autocomplete (Person nodes):**

When editing a Person node, the organization field provides autocomplete:

1. Type to search existing organizations in the workspace
2. Arrow keys navigate the dropdown; Enter selects
3. If no match exists, press Enter to create a new organization
4. Multiple organizations can be linked to a person
5. Click the X on an organization tag to unlink it

Organizations are displayed as tags showing the full hierarchy path (e.g., "Company > Department > Team").

### Linked Items Section

Shows non-hierarchical relationships.

**Features:**

- View all nodes linked to the current node
- Create new links via search
- Remove existing links
- Navigate to linked nodes

### Tags Section

Manage node tags for categorization.

**Features:**

- Add tags with autocomplete
- Remove existing tags
- Search by tag using `#tagname` in spotlight search

## Color Picker

Click the color swatch to open the color picker.

**Options:**

- Visual color selector
- Hex value input
- Clear to remove custom color

**Color Inheritance:**

Nodes can inherit colors from their parent. When a node has no custom color set:

1. Uses own color if set
2. Falls back to parent's color
3. Falls back to type default color

## See Also

- [Node Types](../reference/node-types.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
- [Linking Nodes](linking.md)
- [AI Notes](ai-notes.md)
