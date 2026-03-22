<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { useNodeInteractions } from '../composables/useNodeInteractions.js'
import { getTypeIcon, personIconSvg } from '../utils/constants.js'

// Column widths (resizable)
const defaultColWidths = {
  expand: 30,
  type: 60,
  check: 30,
  title: 300,
  notes: 200,
  due: 90,
  children: 40,
  fav: 30,
  actions: 60
}

// Load saved widths from localStorage
function loadColWidths() {
  const saved = localStorage.getItem('graphcore-table-colwidths')
  if (saved) {
    try {
      return { ...defaultColWidths, ...JSON.parse(saved) }
    } catch {
      return { ...defaultColWidths }
    }
  }
  return { ...defaultColWidths }
}

const colWidths = ref(loadColWidths())

// Save widths to localStorage
function saveColWidths() {
  localStorage.setItem('graphcore-table-colwidths', JSON.stringify(colWidths.value))
}

// Resize state
const resizing = ref(null) // column name being resized
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)

function startResize(e, colName) {
  e.preventDefault()
  resizing.value = colName
  resizeStartX.value = e.clientX
  resizeStartWidth.value = colWidths.value[colName]
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}

function onResizeMove(e) {
  if (!resizing.value) return
  const diff = e.clientX - resizeStartX.value
  const newWidth = Math.max(30, resizeStartWidth.value + diff)
  colWidths.value[resizing.value] = newWidth
}

function onResizeEnd() {
  if (resizing.value) {
    saveColWidths()
    resizing.value = null
  }
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  selectedIds: { type: Set, default: () => new Set() },
  expandedIds: { type: Set, default: () => new Set() },
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  showDetail: { type: Boolean, default: false },
  currentParentId: { type: Number, default: null },
  currentContainer: { type: Object, default: null },
  colorMap: { type: Object, default: () => ({}) },
  hoverPreviewEnabled: { type: Boolean, default: true }
})

const emit = defineEmits(['hover', 'select', 'select-multiple', 'enter', 'toggle-complete', 'toggle-favorite', 'toggle-expand', 'expand-all', 'collapse-all', 'add-child', 'delete', 'move', 'move-multiple', 'reorder', 'go-parent', 'open-fullscreen', 'context-menu'])

// Setup tooltips
const { showTooltip, hideTooltip } = useNodeTooltip({
  onOpenDetail: (nodeId) => emit('open-fullscreen', nodeId),
  onToggleComplete: (nodeId) => emit('toggle-complete', nodeId),
  getHideSensitive: () => props.hideSensitive,
  shouldShowTooltip: () => props.hoverPreviewEnabled && !props.showDetail
})

// Setup node interactions (shared logic for hover/click/double-click)
const { handleHover, handleLeave, handleClick, handleDoubleClick } = useNodeInteractions({
  onHover: (node) => emit('hover', node),    // Light select on hover
  onSelect: (node) => emit('select', node),  // Full select + open detail on click
  onNavigate: (node) => emit('enter', node), // Navigate on double-click
  onMultiSelect: (node, opts) => emit('select-multiple', { node, ...opts }),
  onAddChild: (node) => emit('add-child', { parentId: node.id, title: '', prompt: true }),
  onDelete: (node) => emit('delete', node.id),
  getShowDetail: () => props.showDetail,
  showTooltip,
  hideTooltip
})

// Context menu handler
function handleContextMenu(e, node) {
  e.preventDefault()
  emit('context-menu', { event: e, node })
}

function getRowStyle(node) {
  const color = props.colorMap[node.id] || node.color
  if (color && color !== '#0f4c75') {
    return { background: `linear-gradient(90deg, ${color}55 0%, transparent 50%)` }
  }
  return {}
}

// Filter nodes recursively to hide completed items
function filterNodes(nodeList) {
  if (!props.hideCompleted) return nodeList
  return nodeList
    .filter(node => !node.completed && !node.inheritedCompleted)
    .map(node => ({
      ...node,
      children: node.children ? filterNodes(node.children) : []
    }))
}

const filteredNodes = computed(() => filterNodes(props.nodes))

// Flatten tree into a list of rows based on expanded state
// Each row includes metadata for rendering: isLast (for tree prefix)
const flattenedRows = computed(() => {
  const rows = []

  function flatten(nodeList, parentIsLastStack = []) {
    nodeList.forEach((node, index) => {
      const isLast = index === nodeList.length - 1
      rows.push({
        node,
        isLast,
        parentIsLastStack: [...parentIsLastStack]
      })

      // If expanded and has children, recurse
      if (props.expandedIds.has(node.id) && node.children?.length) {
        flatten(node.children, [...parentIsLastStack, isLast])
      }
    })
  }

  flatten(filteredNodes.value)
  return rows
})

// Get tree prefix for visual hierarchy - uses parentIsLastStack for correct lines
function getTreePrefixFlat(node, isLast, parentIsLastStack) {
  const depth = node.depth || 0
  if (depth === 0) return ''

  let prefix = ''
  // Add continuation lines for each ancestor level
  for (let i = 0; i < parentIsLastStack.length; i++) {
    prefix += parentIsLastStack[i] ? '  ' : '│ '
  }
  // Add branch and horizontal line
  prefix += isLast ? '└─' : '├─'
  return prefix
}

// Drag state
const draggedNode = ref(null)
const dropTarget = ref(null)
const dropPosition = ref(null) // 'before', 'after', 'inside'
const isDragging = ref(false)
const dragGhost = ref(null)
const justFinishedDrag = ref(false)

function handleExpand(nodeId) {
  // Don't expand while dragging or just after drag
  if (isDragging.value || justFinishedDrag.value) return
  emit('toggle-expand', nodeId)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

function truncateNotes(notes) {
  if (!notes) return ''
  let text = notes.replace(/[#*_`[\]]/g, '').trim()
  // Decode HTML entities for plain text display
  text = text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
  return text.length > 50 ? text.substring(0, 50) + '...' : text
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const due = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

// getTypeIcon imported from constants.js

// Get badge style for person nodes - uses CSS variables, no inline colors needed
function getBadgeStyle() {
  // CSS variables handle all type colors including person
  return {}
}

// Get indentation based on database depth
function getIndentPadding(node) {
  const depth = node.depth || 0
  const basePadding = 8
  const indentPerLevel = 24
  return `${basePadding + (depth * indentPerLevel)}px`
}

// Get tree prefix for visual hierarchy - uses Unicode box-drawing chars
function _getTreePrefix(node, isLast = false) {
  const depth = node.depth || 0
  if (depth === 0) return ''

  let prefix = ''
  // Add continuation lines for each ancestor level
  for (let i = 1; i < depth; i++) {
    prefix += '│ '
  }
  // Add branch and horizontal line
  prefix += isLast ? '└─' : '├─'
  return prefix
}

// Get row class based on database depth
function getDepthRowClass(node) {
  const depth = node.depth || 0
  if (depth === 0) return 'depth-row-0'
  if (depth === 1) return 'depth-row-1'
  if (depth === 2) return 'depth-row-2'
  if (depth === 3) return 'depth-row-3'
  return 'depth-row-deep'
}

function confirmDelete(nodeId) {
  emit('delete', nodeId)
}

// Mouse-based Drag and Drop
function onMouseDown(e, node) {
  // Don't start drag from interactive elements
  if (e.target.closest('input, button, .expand-btn')) return

  e.preventDefault()
  draggedNode.value = node

  // Reset tracking variables for new drag
  lastTargetId = null
  lastPosition = null

  // Create ghost element with node preview
  const ghost = document.createElement('div')
  ghost.className = 'drag-ghost'
  ghost.innerHTML = `
    <span class="ghost-type" style="background: ${node.color || '#0f4c75'}">${node.type[0].toUpperCase()}</span>
    <span class="ghost-title">${node.title}</span>
    <span class="ghost-action"></span>
  `
  ghost.style.cssText = `
    position: fixed;
    left: ${e.clientX + 10}px;
    top: ${e.clientY + 10}px;
    background: var(--bg-primary, #1a1a2e);
    border: 2px solid var(--accent-color, #4a9eff);
    color: var(--text-primary, #fff);
    padding: 6px 10px;
    border-radius: 6px;
    pointer-events: none;
    z-index: 9999;
    font-size: 13px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 300px;
  `
  document.body.appendChild(ghost)
  dragGhost.value = ghost
  isDragging.value = true

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

let lastTargetId = null
let lastPosition = null

function onMouseMove(e) {
  if (!isDragging.value || !dragGhost.value) return

  // Move ghost
  dragGhost.value.style.left = `${e.clientX + 10}px`
  dragGhost.value.style.top = `${e.clientY + 10}px`

  const actionEl = dragGhost.value.querySelector('.ghost-action')

  // Find drop target
  const elemBelow = document.elementFromPoint(e.clientX, e.clientY)
  const row = elemBelow?.closest('tr.node-row')
  const table = elemBelow?.closest('.table-view')

  let newTargetId = null
  let newPosition = null

  if (row) {
    const nodeId = parseInt(row.dataset.nodeId)
    if (nodeId && nodeId !== draggedNode.value?.id) {
      newTargetId = nodeId

      // Determine position
      const rect = row.getBoundingClientRect()
      const y = e.clientY - rect.top
      const height = rect.height

      // Shift key forces reorder-only mode (no nesting)
      const reorderOnly = e.shiftKey

      // Top 35% = before, bottom 35% = after, middle 30% = inside
      // This makes it easier to reorder without accidentally nesting
      if (y < height * 0.35) {
        newPosition = 'before'
      } else if (y > height * 0.65) {
        newPosition = 'after'
      } else if (reorderOnly) {
        // In reorder-only mode, use top/bottom half for before/after
        newPosition = y < height * 0.5 ? 'before' : 'after'
      } else {
        newPosition = 'inside'
      }
    }
  } else if (table) {
    newTargetId = 'root'
    newPosition = 'root'
  }

  // Only update DOM if target or position changed
  if (newTargetId !== lastTargetId || newPosition !== lastPosition) {
    // Clear previous drop indicators
    document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
      el.classList.remove('drop-before', 'drop-after', 'drop-inside')
    })

    if (newTargetId && newTargetId !== 'root' && row) {
      const targetNode = findNodeById(newTargetId)
      if (targetNode) {
        dropTarget.value = targetNode
        dropPosition.value = newPosition
        row.classList.add(`drop-${newPosition}`)

        if (actionEl) {
          if (newPosition === 'before') actionEl.textContent = '↑ before'
          else if (newPosition === 'after') actionEl.textContent = '↓ after'
          else actionEl.textContent = '→ as child'
        }
      }
    } else if (newTargetId === 'root') {
      dropTarget.value = 'root'
      dropPosition.value = null
      if (actionEl) actionEl.textContent = '→ to root'
    } else {
      dropTarget.value = null
      dropPosition.value = null
      if (actionEl) actionEl.textContent = ''
    }

    lastTargetId = newTargetId
    lastPosition = newPosition
  }
}

function onMouseUp(_e) {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)

  // Clear drop indicators
  document.querySelectorAll('.drop-before, .drop-after, .drop-inside').forEach(el => {
    el.classList.remove('drop-before', 'drop-after', 'drop-inside')
  })

  if (dragGhost.value) {
    dragGhost.value.remove()
    dragGhost.value = null
  }

  if (draggedNode.value && dropTarget.value) {
    const sourceNode = draggedNode.value
    const targetNode = dropTarget.value

    // Check if we're moving multiple selected items
    const hasMultipleSelected = props.selectedIds?.size > 1 && props.selectedIds.has(sourceNode.id)

    if (targetNode === 'root') {
      // Move to root (no parent)
      if (hasMultipleSelected) {
        emit('move-multiple', { nodeIds: Array.from(props.selectedIds), newParentId: null })
      } else {
        emit('move', { nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: null })
      }
    } else if (dropPosition.value === 'inside') {
      // Move as child of target
      if (hasMultipleSelected) {
        emit('move-multiple', { nodeIds: Array.from(props.selectedIds), newParentId: targetNode.id })
      } else {
        emit('move', { nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: targetNode.id })
      }
    } else {
      // Reorder: move before or after target
      emit('reorder', {
        nodeId: sourceNode.id,
        targetId: targetNode.id,
        position: dropPosition.value
      })
    }
  }

  isDragging.value = false
  draggedNode.value = null
  dropTarget.value = null
  dropPosition.value = null
  lastTargetId = null
  lastPosition = null

  // Prevent accidental expand clicks right after drag
  justFinishedDrag.value = true
  setTimeout(() => {
    justFinishedDrag.value = false
  }, 200)
}

// Helper to find node by ID in the tree
function findNodeById(id) {
  function search(nodes) {
    for (const node of nodes) {
      if (node.id === id) return node
      if (node.children?.length) {
        const found = search(node.children)
        if (found) return found
      }
    }
    return null
  }
  return search(filteredNodes.value)
}


function getDropClass(node) {
  if (!dropTarget.value || dropTarget.value.id !== node.id) return {}
  return {
    'drop-before': dropPosition.value === 'before',
    'drop-after': dropPosition.value === 'after',
    'drop-inside': dropPosition.value === 'inside'
  }
}

function isSelected(nodeId) {
  return props.selectedIds?.has(nodeId) || props.selectedId === nodeId
}

// handleHover and handleClick are provided by useNodeInteractions
</script>

<template>
  <div class="table-view" :class="{ 'is-dragging': isDragging }">
    <div class="table-controls">
      <button @click="emit('expand-all')" title="Expand all">++</button>
      <button @click="emit('collapse-all')" title="Collapse all">--</button>
    </div>
    <table :class="{ resizing: resizing }">
      <thead>
        <tr>
          <th class="col-expand" :style="{ width: colWidths.expand + 'px' }"></th>
          <th class="col-type" :style="{ width: colWidths.type + 'px' }">
            Type
            <span class="resize-handle" @mousedown="startResize($event, 'type')"></span>
          </th>
          <th class="col-check" :style="{ width: colWidths.check + 'px' }"></th>
          <th class="col-title" :style="{ width: colWidths.title + 'px' }">
            Title
            <span class="resize-handle" @mousedown="startResize($event, 'title')"></span>
          </th>
          <th class="col-notes" :style="{ width: colWidths.notes + 'px' }">
            Notes
            <span class="resize-handle" @mousedown="startResize($event, 'notes')"></span>
          </th>
          <th class="col-due" :style="{ width: colWidths.due + 'px' }">
            Due
            <span class="resize-handle" @mousedown="startResize($event, 'due')"></span>
          </th>
          <th class="col-children" :style="{ width: colWidths.children + 'px' }">#</th>
          <th class="col-fav" :style="{ width: colWidths.fav + 'px' }"></th>
          <th class="col-actions" :style="{ width: colWidths.actions + 'px' }"></th>
        </tr>
      </thead>
      <tbody>
        <!-- Parent row -->
        <tr
          v-if="currentContainer"
          class="node-row parent-row"
          @click="emit('go-parent')"
        >
          <td class="col-expand">..</td>
          <td class="col-type">
            <span v-if="currentContainer.type === 'person'" class="type-badge person" :style="getBadgeStyle(currentContainer)" v-html="personIconSvg"></span>
            <span v-else class="type-badge" :class="currentContainer.type" v-html="getTypeIcon(currentContainer.type)"></span>
          </td>
          <td class="col-check"></td>
          <td class="col-title">
            {{ currentContainer.title }}
          </td>
          <td class="col-notes"></td>
          <td class="col-due"></td>
          <td class="col-children"></td>
          <td class="col-actions"></td>
        </tr>
        <!-- All rows rendered from flattened tree -->
        <tr
          v-for="(row, rowIndex) in flattenedRows"
          :key="row.node.id"
          class="node-row"
          :class="[
            getDepthRowClass(row.node),
            {
              'tree-boundary': rowIndex > 0 && row.node.depth === 0,
              selected: isSelected(row.node.id),
              completed: row.node.completed,
              'inherited-completed': row.node.inheritedCompleted,
              ...getDropClass(row.node)
            }
          ]"
          :style="{ '--indent': getIndentPadding(row.node), ...getRowStyle(row.node) }"
          :data-node-id="row.node.id"
          @mousedown="onMouseDown($event, row.node)"
          @dragstart.prevent
          @click="handleClick($event, row.node)"
          @dblclick="handleDoubleClick(row.node)"
          @mouseenter="handleHover($event, row.node)"
          @mouseleave="handleLeave"
          @contextmenu.prevent="handleContextMenu($event, row.node)"
        >
          <td class="col-expand">
            <button
              v-if="row.node.children?.length"
              class="expand-btn"
              @click.stop="handleExpand(row.node.id)"
            >
              {{ expandedIds.has(row.node.id) ? '−' : '+' }}
            </button>
          </td>
          <td class="col-type">
            <span class="tree-prefix">{{ getTreePrefixFlat(row.node, row.isLast, row.parentIsLastStack) }}</span>
            <span v-if="row.node.type === 'person'" class="type-badge person" :style="getBadgeStyle(row.node)" v-html="personIconSvg"></span>
            <span v-else class="type-badge" :class="row.node.type" v-html="getTypeIcon(row.node.type)"></span>
          </td>
          <td class="col-check">
            <input
              v-if="['task', 'project'].includes(row.node.type)"
              type="checkbox"
              :checked="row.node.completed"
              @click.stop="emit('toggle-complete', row.node)"
            />
          </td>
          <td class="col-title">
            <span v-if="row.node.favorite" class="favorite-star">&#9733;</span>
            {{ row.node.title }}
            <span v-if="row.node.notes" class="has-notes-icon" title="Has notes">&#9998;</span>
          </td>
          <td class="col-notes">
            <span class="notes-preview" :title="row.node.notes">{{ truncateNotes(row.node.notes) }}</span>
          </td>
          <td class="col-due">
            <span v-if="row.node.due_date" class="due-date" :class="{ overdue: isOverdue(row.node.due_date) }">
              {{ formatDate(row.node.due_date) }}
            </span>
          </td>
          <td class="col-children">
            <span v-if="row.node.children?.length" class="children-count">{{ row.node.children.length }}</span>
          </td>
          <td class="col-actions">
            <button class="action-btn delete" @click.stop="confirmDelete(row.node.id)" title="Delete">x</button>
          </td>
        </tr>
      </tbody>
    </table>
    <div v-if="filteredNodes.length === 0" class="empty-state">
      <p>No items</p>
    </div>
  </div>
</template>

<style scoped src="./TableView.css"></style>
