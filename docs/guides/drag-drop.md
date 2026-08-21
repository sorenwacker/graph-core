# Drag and Drop

Drag and drop enables reorganizing nodes across all views. Each view has specific behaviors and modifier keys that control how drops are interpreted.

## Drop Zones

When dragging a node over a target, three drop zones determine the outcome:

| Zone | Position | Result |
|------|----------|--------|
| Before | Left 35% of target | Reorder before target (same parent) |
| After | Right 35% of target | Reorder after target (same parent) |
| Inside | Middle 30% of target | Move as child of target |

Visual indicators show the active drop zone during drag operations.

A node always moves with its whole subtree — including dropping it before or after a target that has a different parent, which reparents it. Descendants keep their position under the moved node.

## Modifier Keys

### Shift+Drag (Reorder Only)

Hold `Shift` while dragging to disable the "inside" drop zone:

- Left 50% = drop before
- Right 50% = drop after
- Cannot nest (no "inside" option)

Use this when reordering siblings to prevent accidental nesting.

### Option+Drag (Link Mode - Graph View Only)

In Graph view, hold `Option` (Mac) or `Alt` (Windows/Linux) while dragging to create a link instead of moving:

- Drag from source node to target node
- Release to create a non-hierarchical link
- Original hierarchy is preserved

See [Linking Nodes](linking.md) for more on links.

## View-Specific Behavior

### Cards View

| Action | Result |
|--------|--------|
| Drag card | Card follows cursor with opacity |
| Drop on card | Move as child |
| Drop at card edge | Reorder within parent |
| Shift+drag | Reorder only (no nesting) |

Cards show colored drop indicators:
- Left edge highlight = drop before
- Right edge highlight = drop after
- Full card highlight = drop inside

### Graph View

| Action | Result |
|--------|--------|
| Drag node | Reposition in graph (layout) |
| Option+drag to node | Create link |
| Cmd/Ctrl+click edge | Insert node between |

Graph view dragging repositions nodes within the visualization rather than changing hierarchy. Use the context menu or other views for hierarchy changes.

Node positions are persisted per-workspace and per-parent context.

### Table View

| Action | Result |
|--------|--------|
| Drag row | Shows ghost preview at cursor |
| Drop on row | Move as child |
| Drop between rows | Reorder within parent |
| Shift+drag | Reorder only (no nesting) |

Rows show insertion lines during drag, and expand/collapse indicators for rows with children. Dragging over a collapsed row expands it after a short delay.

### Timeline View

Timeline view uses drag for date manipulation rather than hierarchy:

| Action | Result |
|--------|--------|
| Drag bar | Move start/end dates together |
| Drag left handle | Adjust start date |
| Drag right handle | Adjust end date |
| Ctrl+scroll | Zoom timeline |

Date changes are applied when the drag ends. A preview shows the new dates during drag.

**Date Field Behavior:**

- Nodes with `start_date`: updates both start and end dates
- Nodes with only `due_date`: updates the due date
- Minimum bar width: 20 pixels

## Cross-View Dragging

Dragging between different views is not supported. Each view handles its own drag operations independently.

## Undo Support

All drag operations that modify hierarchy or dates can be undone:

- `Cmd/Ctrl + Z` to undo
- `Cmd/Ctrl + Shift + Z` to redo

The undo stack persists for the browser session.

## Keyboard Alternatives

For users who prefer keyboard navigation:

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + X` | Cut selected nodes |
| `Cmd/Ctrl + V` | Paste as children of selected |
| Right-click > Move to | Move via dialog |

## See Also

- [Views Guide](views.md) - View-specific features
- [Linking Nodes](linking.md) - Option+drag linking
- [Keyboard Shortcuts](../reference/keyboard-shortcuts.md)
