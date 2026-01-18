# Cards View Specification

## Overview

The cards view displays nodes as nested cards. The behavior should be consistent regardless of whether viewing root level or a subgraph.

## Card Hierarchy

- **Main cards**: Direct children of current container
- **Child cards**: Grandchildren (inside main cards)
- **Grandchild cards**: Great-grandchildren (inside child cards)
- **Great-grandchild items**: Deepest visible level (simple list items)

## Interactions (All Card Levels)

### Click Behavior
- **Single click**: Navigate into that card (enter container)
- **Double click**: Open fullscreen detail panel
- **Ctrl/Cmd + click**: Multi-select
- **Shift + click**: Range select

### Title
- Display title text
- **Double click on title**: Inline edit mode
- Title should always be readable (no truncation that hides meaning)

### Controls
- **+ button**: Open add node modal (same as Cmd+Enter in graph view)
- **x button**: Delete node (soft delete, does NOT navigate)
- **Checkbox**: Only for task type, toggles completed status

### Hover Tooltip
- Appears after 400ms delay on smaller cards
- Shows: title, type, dates, notes preview, child count
- **Open Details button**: Opens fullscreen detail panel
- Tooltip stays open when mouse moves into it
- Same implementation used everywhere (single module)

### Notes
- If card has notes, show notes area
- **Add notes button**: Appears when no notes exist, click to add
- **Click on notes**: Inline edit mode
- Sensitive notes show lock icon

### Right-click Context Menu
- Should work on all views (cards, table, timeline, graph)
- Same menu options everywhere

## Layout Rules

### Space Allocation
- Cards use all available space (no unnecessary scrolling)
- When card has both notes and children: 50/50 split
- Horizontal scrolling: NEVER allowed at any level

### Small Cards (Limited Space)
- Children become vertical list (stacked rows)
- Each item: checkbox (if task) + title + controls
- Use available width, no min-width constraint
- Vertical scroll only if needed

### Large Cards (Ample Space)
- Children display as grid/flex wrap
- Min-width per child card for readability

## Color Coding

### Type Colors (Left Border)
- project: #3498db (blue)
- task: #f1c40f (yellow)
- note: #2ecc71 (green)
- milestone: #9b59b6 (purple)
- group: #8e44ad (violet)
- topic: #00bcd4 (cyan)
- folder: #95a5a6 (gray)
- person: #e67e22 (orange)
- event: #e74c3c (red)
- organization: #1abc9c (teal)

### Color Inheritance
- If parent has custom color, children inherit gradient background
- Works in all containers (root and subgraphs)

## Workspace Filtering

- Only show nodes from current workspace
- People workspace nodes (persons) can be @mentioned from any workspace
- Switching workspace reloads all data

## Consistency Requirements

1. **Same behavior at all levels**: Root view and subgraph view work identically
2. **Single implementation**: One tooltip module, one click handler, one context menu
3. **No code duplication**: Shared utilities for common patterns
