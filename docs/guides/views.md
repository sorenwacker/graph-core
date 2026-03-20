# Views

Graph Core provides multiple ways to visualize and interact with your data.

## Tree View

Displays nodes in a traditional hierarchical tree structure.

**Features:**

- Expand/collapse nodes
- Drag to reorder
- Inline editing
- Multi-select with Ctrl/Cmd+Click

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

**Best for:** Visual overview, dashboard-style browsing

## Graph View

Force-directed graph visualization using Cytoscape.js.

**Features:**

- Drag nodes to reposition
- Option+drag to create links between nodes
- Zoom with scroll wheel
- Pan by dragging background
- Adjust detail threshold in settings

**Interactions:**

- Click node: Select
- Double-click node: Navigate into
- Right-click: Context menu
- Option+drag: Create link

**Best for:** Seeing relationships, mind mapping

## Table View

Spreadsheet-like view with sortable columns.

**Columns:**

- Title
- Type
- Status
- Dates
- Tags

**Features:**

- Click headers to sort
- Expand/collapse tree rows
- Bulk selection

**Best for:** Data management, bulk operations

## Timeline View

Displays nodes with dates on a horizontal timeline.

**Features:**

- Zoom in/out with Ctrl+scroll
- Drag bars to change dates
- Resize handles for start/end dates
- Weekend shading
- Today marker

**Date Behavior:**

- Nodes without end_date stretch to today
- Project boxes group child tasks
- Due date markers with urgency colors

**Best for:** Project planning, scheduling

## Calendar View

Monthly calendar displaying nodes by date.

**Features:**

- Navigate months with arrows
- Click dates to see nodes
- Color-coded by node type

**Best for:** Date-focused browsing, deadlines

## Tasks View

Filtered view showing only task-type nodes.

**Grouping:**

- Overdue
- Today
- This Week
- Later
- No Date

**Features:**

- One-click completion toggle
- Urgency indicators
- Filter by context

**Best for:** Daily task management, GTD workflows

## Persons View

Contact management for person-type nodes.

**Features:**

- Organization grouping
- Contact details
- Related nodes

**Best for:** Contact management, team organization

## View-Specific Settings

Access via the settings panel:

| Setting | Affects |
|---------|---------|
| Detail Threshold | Graph view complexity |
| Max Depth | Graph view depth limit |
| Hide Completed | All views |
| Sort Alphabetically | Cards, Graph views |

## See Also

- [Interactions](../reference/interactions.md)
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
