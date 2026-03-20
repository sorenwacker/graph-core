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

## View-Specific Interactions

### Tree View

| Action | Result |
|--------|--------|
| Click arrow | Expand/collapse children |
| Cmd/Ctrl + Click | Add child node |
| Double-click title | Edit title inline |

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
| Click expand | Show/hide children |
| Arrow keys | Navigate cells |

### Calendar View

| Action | Result |
|--------|--------|
| Click date | Show nodes for that date |
| Click node | Select and show detail |
| Click arrows | Navigate months |

## Context Menu

Right-click any node to access:

- **Enter**: Navigate into the node
- **Add Child**: Create a new child node
- **Edit**: Open detail panel
- **Move**: Change parent node
- **Duplicate**: Create a copy
- **Delete**: Remove the node

## Drag and Drop

Drag nodes to:

- Reorder within the same parent
- Move to a different parent (drop on target)
- Create links (Option + drag in Graph view)

## See Also

- [Keyboard Shortcuts](keyboard-shortcuts.md)
- [Views Guide](../guides/views.md)
