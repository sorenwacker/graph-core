# Interactions

Mouse and keyboard interactions for each view.

## Common Interactions

These interactions work across all views:

| Action | Result |
|--------|--------|
| Single click | Select node, open detail panel |
| Double click | Navigate into node |
| Right click | Open context menu |
| Drag | Reorder nodes |

## Sidebar Reveal

When the sidebar is unpinned it stays hidden and slides in on demand. The hover target is a handle vertically centered on the left edge - a narrow zone about a quarter of the window tall, marked by a subtle vertical bar that brightens on hover. Only that handle opens the sidebar; the rest of the left edge is inert.

The handle is deliberately not the full window edge. In a non-fullscreen window the left edge borders other windows and the desktop, so a full-height trigger opened the sidebar on every incidental mouse pass. Centering the target and marking it visibly means opening the sidebar is always an intentional act.

Once open, the whole sidebar area keeps it open; it closes shortly after the pointer leaves the sidebar, and the pin button keeps it open permanently. Pinning removes the handle entirely.

## Node Tooltip

Hovering over a node displays a preview tooltip with the node's title, metadata, and notes excerpt.

| Action | Result |
|--------|--------|
| Hover | Show tooltip after 500ms delay |
| Move away | Hide tooltip after 200ms delay |
| Click node | Lock tooltip in place, enable scrolling |
| Space | Dismiss locked tooltip |
| Escape | Dismiss locked tooltip |
| Click elsewhere | Dismiss locked tooltip |

When a tooltip is locked:

- The tooltip stays visible even when moving the mouse away
- Notes content becomes scrollable for longer content
- The tooltip has a subtle visual indicator (pin icon or border)
- Clicking the same node again unlocks the tooltip

## View-Specific Interactions

### Cards View

| Action | Result |
|--------|--------|
| Click card | Select and show detail |
| Cmd/Ctrl + Click | Add child node |
| Opt + Cmd/Ctrl + Click | Delete node |

### Graph View

| Action | Result |
|--------|--------|
| Drag node | Reposition node |
| Double-click background | Open the add-node dialog at that position |
| Option + Drag | Create link to another node |
| Shift + Click | Multi-select toggle |
| Shift + Drag | Lasso select multiple |
| Cmd/Ctrl + Click | Add child node |
| Cmd/Ctrl + Click edge | Insert node between |
| Opt + Cmd/Ctrl + Click edge | Delete edge |
| Scroll wheel | Zoom in/out |
| Drag background | Pan view |

### Timeline View

| Action | Result |
|--------|--------|
| Click bar | Select node |
| Double-click bar | Navigate into node |
| Drag bar | Move start/end dates |
| Drag left handle | Adjust start date |
| Drag right handle | Adjust end date |
| Ctrl + Scroll | Zoom timeline |
| Hover | Show tooltip with details |

### Table View

| Action | Result |
|--------|--------|
| Click header | Sort by column |
| Click row | Select node |
| Click arrow | Expand/collapse children |
| Cmd/Ctrl + Click | Add child node |
| Double-click title | Edit title inline |
| Arrow keys | Move up/down the rows |

## Context Menu

Right-click any node to access:

- **View Details**: Open detail panel
- **Open in Window**: Open in separate window (desktop only)
- **Enter**: Navigate into the node
- **Add Child**: Create a new child node (not shown for person nodes)
- **Mark Complete/Incomplete**: Toggle completion status (not shown for person nodes)
- **Add/Remove Favorite**: Star or unstar the node
- **Link to...**: Create a link to another node
- **Move to...**: Change parent node
- **Linked items**: The node's existing links, each with an unlink button
- **Move to Workspace**: Move the node to one of your workspaces; the current one is highlighted
- **Delete**: Send to trash

## Drag and Drop

Drag nodes to:

- Reorder within the same parent
- Move to a different parent (drop on target)
- Create links (Option + drag in Graph view)

## See Also

- [Keyboard Shortcuts](keyboard-shortcuts.md)
- [Views Guide](../guides/views.md)
