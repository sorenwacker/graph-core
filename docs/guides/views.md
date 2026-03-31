# Views

Graph Core provides multiple ways to visualize and interact with your data.

## Tree View

Displays nodes in a traditional hierarchical tree structure.

**Features:**

- Expand/collapse nodes with arrow icons
- Drag to reorder within parent
- Inline title editing (double-click)
- Multi-select with Ctrl/Cmd+Click
- Completion checkboxes for tasks and projects

**Best for:** Browsing hierarchies, organizing projects

## Cards View

Shows nodes as nested cards with visual hierarchy.

**Layout Rules:**

- Cards use all available space
- When a card has both notes and children: 50/50 split
- Small cards: children become vertical list
- Large cards: children display as grid

**Features:**

- Nested card display up to 4 levels deep
- Inline notes editing
- Color inheritance from parent nodes
- Hover tooltips for quick preview
- Progress bars showing child completion percentage
- Due date badges with urgency indicators
- Drag and drop reordering

**Best for:** Visual overview, dashboard-style browsing

## Graph View

Force-directed graph visualization using Cytoscape.js.

### Layout Modes

| Layout | Description |
|--------|-------------|
| Tree | Vertical hierarchical layout (top to bottom) |
| Horizontal | Left-to-right hierarchical layout |
| Radial | Circular layout with customizable sectors |
| Grid | Grid-based positioning |
| Circle | Nodes arranged in a circle |

Change layouts using the layout selector in the Graph toolbar.

### Graph Controls

| Control | Description |
|---------|-------------|
| Relax Layout | Apply physics-based node arrangement |
| Fit to View | Auto-zoom to fit all visible nodes |
| Reset Layout | Randomize node positions |
| Lock Relax | Toggle continuous physics simulation |
| Lock Fit | Toggle auto-fit behavior |

### Display Options

| Option | Description |
|--------|-------------|
| Show External Links | Display non-parent-child relationships |
| Show Root Node | Toggle parent node visibility |
| Type Filtering | Show/hide specific node types |
| Show Type Borders | Colored borders indicating node type |

### Interactions

| Action | Result |
|--------|--------|
| Click node | Select |
| Double-click node | Navigate into |
| Drag node | Reposition |
| Option+drag | Create link to another node |
| Shift+click | Multi-select toggle |
| Shift+drag | Lasso select multiple |
| Scroll wheel | Zoom in/out |
| Drag background | Pan view |

**Best for:** Seeing relationships, mind mapping

## Table View

Spreadsheet-like view with sortable columns.

**Columns:**

- Title
- Type
- Status (completion)
- Due date, Start date, End date
- Importance
- Tags

**Features:**

- Click headers to sort
- Expand/collapse tree rows
- Bulk selection with checkboxes
- Direct cell editing

**Best for:** Data management, bulk operations

## Timeline View

Displays nodes with dates on a horizontal timeline.

**Features:**

- Zoom in/out with Ctrl/Cmd+scroll (centered on cursor)
- Drag bars to move dates
- Resize handles for start/end dates
- Draggable labels column
- Weekend shading
- Today marker
- Multi-day event support

**Date Behavior:**

- Uses due_date, start_date, or end_date fields
- Nodes without end_date stretch to today
- Project boxes span the range of child tasks
- Events display as date-range bars
- Groups render as vertical bars spanning child rows

**Best for:** Project planning, scheduling

## Calendar View

Monthly calendar displaying nodes by date.

**Features:**

- Standard calendar grid (7 days x 6 weeks)
- Navigate months with arrow buttons
- "Go to Today" button for quick navigation
- Nodes grouped by due_date/start_date/end_date
- Multi-day events spanning multiple days
- Weekend highlighting
- Adjacent month date padding
- Color-coded by node type

**Best for:** Date-focused browsing, deadlines

## Tasks View

Filtered view showing task-type nodes from the current container and its descendants.

**Grouping:**

- Overdue
- Today
- This Week
- Later
- No Date
- Completed (when visible)

**Sorting Options:**

| Sort | Description |
|------|-------------|
| Due Date | By deadline proximity |
| Importance | Critical to Trivial |
| Created | Most recent first |
| Title | Alphabetical |

**Features:**

- One-click completion toggle
- Urgency indicators with countdown
- Filter by importance level (1-5)
- Show/hide completed tasks
- Path breadcrumbs showing ancestry
- Completion percentage for groups

**Best for:** Daily task management, GTD workflows

## Persons View

Contact management for person-type nodes.

**Features:**

- Organization grouping and filtering
- Contact fields: email, phone, role, organization, website, address
- Sensitive data masking (email, phone)
- Organization linking with autocomplete
- Color assignment (random or inherited from organization)
- Sorting by title or custom fields

**Best for:** Contact management, team organization

## Trash View

Browse and manage deleted items.

**Features:**

- View all trashed nodes
- Restore nodes to their original location
- Permanently delete items
- Empty all trash at once

**Access:** Via the Trash item in the sidebar navigation.

## View-Specific Settings

Access via the settings panel:

| Setting | Affects |
|---------|---------|
| Detail Threshold | Graph view node limit before abbreviation |
| Max Depth | Graph view hierarchy depth |
| Root Max Depth | Graph view multi-root depth |
| Hide Completed | All views |
| Hide Sensitive | Persons view, Detail panel |
| Sort Alphabetically | Cards, Graph views |

## See Also

- [Interactions](../reference/interactions.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
- [Settings](../reference/settings.md)
