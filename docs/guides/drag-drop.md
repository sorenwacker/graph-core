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

## Dropping on the breadcrumb root

The breadcrumb trail's home icon is a drop target. Dragging a node onto it moves that node to the top level, clearing its parent - the same operation as the detail panel's "Move to Root" button and the Root entry in "Move to...". The icon highlights while a dragged node is over it.

This works while dragging in graph, cards and table view. Each view drags by a different mechanism, so each detects the target its own way, but the outcome is identical. A multi-node selection moves as a whole in cards and table view; graph view moves the single node being dragged.

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
| Drop on breadcrumb home | Move to top level |
| Shift+drag | Reorder only (no nesting) |

Cards show colored drop indicators:
- Left edge highlight = drop before
- Right edge highlight = drop after
- Full card highlight = drop inside

### Graph View

| Action | Result |
|--------|--------|
| Drag node | Reposition in graph (layout) |
| Drop on breadcrumb home | Move to top level |
| Option+drag to node | Create link |
| Cmd/Ctrl+click edge | Insert node between |

Graph view dragging repositions nodes within the visualization rather than changing hierarchy, with one exception: dropping a node on the breadcrumb home icon moves it to the top level. Use the context menu or other views for other hierarchy changes.

Node positions are persisted per-workspace and per-parent context.

### Table View

| Action | Result |
|--------|--------|
| Drag row | Shows ghost preview at cursor |
| Drop on row | Move as child |
| Drop between rows | Reorder within parent |
| Drop on breadcrumb home | Move to top level |
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

Dragging between different views is not supported. Each view handles its own drag operations independently. The breadcrumb root target is the one shared destination: it sits outside the views and accepts a drag from any of them.

## Undo Support

All drag operations that modify hierarchy or dates can be undone:

- `Cmd/Ctrl + Z` to undo
- `Cmd/Ctrl + Shift + Z` to redo

The undo stack persists for the browser session, with two limits:

- **Switching workspace clears it.** Commands record node ids, which carry no workspace, so an undo after a switch would edit an item in the workspace you just left without showing it to you.
- **Note edits are not restored after a window reload.** The stack is persisted to session storage, which note content must not reach; see [sensitive notes](../architecture/sensitive-notes.md). Only the actions taken since the most recent note edit come back.

One user action is one undo step, including actions on a multi-node selection.

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
