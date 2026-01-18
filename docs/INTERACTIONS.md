# Node Interaction Design

## Overview

Defines how users interact with nodes across all views (Cards, Table, Graph).

## Design Principles

1. **Hover to preview, click to act** - Minimal friction
2. **Consistency** - Same interaction across all views
3. **Maintainability** - Single implementation, reused everywhere

---

## Interaction Matrix

| Action | Gesture | Notes |
|--------|---------|-------|
| Light select | Hover | Updates detail panel if open, shows tooltip if closed |
| Select + open detail | Click | Opens detail panel with node info |
| Navigate | Double-click | Enters the node's subgraph |
| Multi-select add | Ctrl/Cmd + Click | Adds to persistent selection |
| Multi-select range | Shift + Click | Selects range |
| Toggle details | Enter | Opens/closes detail panel |
| Context menu | Right-click | Additional actions |

---

## Behavior Details

### Hover (Light Select)
- Highlights the node visually
- If detail panel is open: updates panel with node info
- If detail panel is closed: shows tooltip after 500ms delay
- Selection follows mouse (not persistent)

### Click (Select + Open Detail)
- Selects the node
- Opens detail panel with node info

### Double-click (Navigate)
- Enters the node's subgraph
- Updates breadcrumbs
- Loads children

### Ctrl/Cmd + Click (Persistent Multi-select)
- Adds/removes node from persistent selection
- Selection stays even when mouse moves away
- Used for bulk operations (delete, move, etc.)

### Shift + Click (Range Select)
- Selects all nodes between last selected and clicked

### Enter Key (Toggle Details)
- Opens detail panel if closed
- Closes detail panel if open

### Tooltip vs Detail Panel

Tooltips provide quick info preview. When the detail panel is open, tooltips are redundant.

**Rules:**
1. **Detail panel closed** → Show tooltip on hover (after 500ms delay)
2. **Detail panel open** → No tooltip shown
3. **Detail panel opens** → Any active/pending tooltip is immediately closed
4. **Mouse enters tooltip** → Tooltip closes immediately

This applies to all views: Cards, Table, Graph, Timeline.

---

## Implementation

Cards use direct handlers in App.vue. TableView uses the shared composable:

```javascript
// src/composables/useNodeInteractions.js
export function useNodeInteractions(options = {}) {
  const { onSelect, onNavigate, onMultiSelect, getShowDetail, showTooltip } = options

  function onNodeHover(event, node) {
    handleNodeHover(node, callbacks)
    if (showTooltip && shouldShowTooltip(getShowDetail())) {
      showTooltip(event, node)
    }
  }

  function onNodeClick(event, node) {
    handleNodeClick(event, node, callbacks)
  }

  return { onNodeHover, onNodeClick }
}
```

### Usage in TableView

```vue
<tr
  @mouseenter="onNodeHover($event, node)"
  @click="onNodeClick($event, node)"
>
```

### Usage in Cards (App.vue)

```vue
<div
  @mouseenter="showCardTooltip($event, node)"
  @click="handleCardClick($event, node)"
  @dblclick="enterContainer(node)"
>
```

---

## State

```javascript
// Currently hovered node (follows mouse)
const hoveredNode = ref(null)

// Persistently selected nodes (Ctrl+click)
const selectedIds = ref(new Set())

// Detail panel visibility
const showDetail = ref(false)
```
