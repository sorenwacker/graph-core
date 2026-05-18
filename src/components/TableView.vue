<script setup>
import { computed } from 'vue'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { useNodeInteractions } from '../composables/useNodeInteractions.js'
import { useColumnResize } from '../composables/useColumnResize.js'
import { useTableDrag } from '../composables/useTableDrag.js'
import { getTypeIcon, personIconSvg } from '../utils/constants.js'
import {
  formatDate,
  truncateNotes,
  isOverdue,
  getBadgeStyle,
  getIndentPadding,
  getTreePrefix,
  getDepthRowClass,
  getRowStyle,
} from './config/tableFormatters.js'

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
  hoverPreviewEnabled: { type: Boolean, default: true },
})

const emit = defineEmits([
  'hover',
  'select',
  'select-multiple',
  'enter',
  'toggle-complete',
  'toggle-favorite',
  'toggle-expand',
  'expand-all',
  'collapse-all',
  'add-child',
  'delete',
  'move',
  'move-multiple',
  'reorder',
  'go-parent',
  'open-fullscreen',
  'context-menu',
])

// Setup column resize
const { colWidths, resizing, startResize } = useColumnResize()

// Setup tooltips
const { showTooltip, hideTooltip } = useNodeTooltip({
  onOpenDetail: nodeId => emit('open-fullscreen', nodeId),
  onToggleComplete: nodeId => emit('toggle-complete', nodeId),
  getHideSensitive: () => props.hideSensitive,
  shouldShowTooltip: () => props.hoverPreviewEnabled && !props.showDetail,
})

// Setup node interactions (shared logic for hover/click/double-click)
const { handleHover, handleLeave, handleClick, handleDoubleClick } = useNodeInteractions({
  onHover: node => emit('hover', node), // Light select on hover
  onSelect: node => emit('select', node), // Full select + open detail on click
  onNavigate: node => emit('enter', node), // Navigate on double-click
  onMultiSelect: (node, opts) => emit('select-multiple', { node, ...opts }),
  onAddChild: node => emit('add-child', { parentId: node.id, title: '', prompt: true }),
  onDelete: node => emit('delete', node.id),
  getShowDetail: () => props.showDetail,
  showTooltip,
  hideTooltip,
})

// Filter nodes recursively to hide completed items and tag nodes
function filterNodes(nodeList) {
  // Always filter out tag nodes
  let filtered = nodeList.filter(node => node.type !== 'tag')

  // Apply hideCompleted filter if enabled
  if (props.hideCompleted) {
    filtered = filtered.filter(node => !node.completed && !node.inheritedCompleted)
  }

  // Recursively filter children
  return filtered.map(node => ({
    ...node,
    children: node.children ? filterNodes(node.children) : [],
  }))
}

const filteredNodes = computed(() => filterNodes(props.nodes))

// Flatten tree into a list of rows based on expanded state
const flattenedRows = computed(() => {
  const rows = []

  function flatten(nodeList, parentIsLastStack = []) {
    nodeList.forEach((node, index) => {
      const isLast = index === nodeList.length - 1
      rows.push({
        node,
        isLast,
        parentIsLastStack: [...parentIsLastStack],
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

// Setup drag and drop
const { isDragging, justFinishedDrag, onMouseDown, getDropClass } = useTableDrag({
  findNodeById,
  selectedIds: computed(() => props.selectedIds),
  onMove: data => emit('move', data),
  onMoveMultiple: data => emit('move-multiple', data),
  onReorder: data => emit('reorder', data),
})

// Context menu handler
function handleContextMenu(e, node) {
  e.preventDefault()
  emit('context-menu', { event: e, node })
}

function handleExpand(nodeId) {
  // Don't expand while dragging or just after drag
  if (isDragging.value || justFinishedDrag.value) return
  emit('toggle-expand', nodeId)
}

function confirmDelete(nodeId) {
  emit('delete', nodeId)
}

function isSelected(nodeId) {
  return props.selectedIds?.has(nodeId) || props.selectedId === nodeId
}

// Create bound version of getRowStyle that includes colorMap
function getNodeRowStyle(node) {
  return getRowStyle(node, props.colorMap)
}
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
        <tr v-if="currentContainer" class="node-row parent-row" @click="emit('go-parent')">
          <td class="col-expand">..</td>
          <td class="col-type">
            <span
              v-if="currentContainer.type === 'person'"
              class="type-badge person"
              :style="getBadgeStyle(currentContainer)"
              v-html="personIconSvg"
            ></span>
            <span
              v-else
              class="type-badge"
              :class="currentContainer.type"
              v-html="getTypeIcon(currentContainer.type)"
            ></span>
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
              ...getDropClass(row.node),
            },
          ]"
          :style="{ '--indent': getIndentPadding(row.node), ...getNodeRowStyle(row.node) }"
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
            <button v-if="row.node.children?.length" class="expand-btn" @click.stop="handleExpand(row.node.id)">
              {{ expandedIds.has(row.node.id) ? '−' : '+' }}
            </button>
          </td>
          <td class="col-type">
            <span class="tree-prefix">{{ getTreePrefix(row.node, row.isLast, row.parentIsLastStack) }}</span>
            <span
              v-if="row.node.type === 'person'"
              class="type-badge person"
              :style="getBadgeStyle(row.node)"
              v-html="personIconSvg"
            ></span>
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
