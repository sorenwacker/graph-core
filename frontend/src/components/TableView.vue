<script setup>
import { ref, computed } from 'vue'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { getTypeIcon, getTypeIconHtml, getTypeColors, typeConfig, personIconSvg } from '../utils/constants.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  selectedIds: { type: Set, default: () => new Set() },
  expandedIds: { type: Set, default: () => new Set() },
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  currentParentId: { type: Number, default: null },
  currentContainer: { type: Object, default: null },
  colorMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['select', 'select-multiple', 'enter', 'toggle-complete', 'toggle-expand', 'add-child', 'delete', 'move', 'move-multiple', 'reorder', 'go-parent', 'open-fullscreen'])

// Setup tooltips
const { showTooltip, hideTooltip } = useNodeTooltip({
  onOpenDetail: (nodeId) => emit('open-fullscreen', nodeId),
  onToggleComplete: (nodeId) => emit('toggle-complete', nodeId),
  getHideSensitive: () => props.hideSensitive
})

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

// getTypeIcon imported from constants.js

// Get badge style for person nodes (random colors based on ID)
function getBadgeStyle(node) {
  if (node.type === 'person') {
    const colors = getTypeColors('person', node.id)
    return { background: colors.bg, color: colors.text }
  }
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
function getTreePrefix(node, isLast = false) {
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
    color: #fff;
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

      if (y < height * 0.3) {
        newPosition = 'before'
      } else if (y > height * 0.7) {
        newPosition = 'after'
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

function onMouseUp(e) {
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

function handleClick(e, node) {
  if (e.ctrlKey || e.metaKey) {
    // Toggle selection
    emit('select-multiple', { node, add: true })
  } else if (e.shiftKey) {
    // Range selection
    emit('select-multiple', { node, range: true })
  } else {
    emit('select', node)
  }
}
</script>

<template>
  <div class="table-view" :class="{ 'is-dragging': isDragging }">
    <table>
      <thead>
        <tr>
          <th class="col-expand"></th>
          <th class="col-type">Type</th>
          <th class="col-check"></th>
          <th class="col-title">Title</th>
          <th class="col-actions"></th>
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
          <td class="col-actions"></td>
        </tr>
        <template v-for="(node, nodeIndex) in filteredNodes" :key="node.id">
          <!-- Main row -->
          <tr
            class="node-row"
            :class="[
              getDepthRowClass(node),
              {
                'tree-boundary': nodeIndex > 0,
                selected: isSelected(node.id),
                completed: node.completed,
                'inherited-completed': node.inheritedCompleted,
                ...getDropClass(node)
              }
            ]"
            :style="{ '--indent': getIndentPadding(node), ...getRowStyle(node) }"
            :data-node-id="node.id"
            @mousedown="onMouseDown($event, node)"
            @dragstart.prevent
            @click="handleClick($event, node)"
            @dblclick="emit('enter', node)"
            @mouseenter="showTooltip($event, node)"
            @mouseleave="hideTooltip"
          >
            <td class="col-expand">
              <button
                v-if="node.children?.length"
                class="expand-btn"
                @click.stop="handleExpand(node.id)"
              >
                {{ expandedIds.has(node.id) ? '−' : '+' }}
              </button>
            </td>
            <td class="col-type">
              <span class="tree-prefix">{{ getTreePrefix(node, nodeIndex === filteredNodes.length - 1) }}</span>
              <span v-if="node.type === 'person'" class="type-badge person" :style="getBadgeStyle(node)" v-html="personIconSvg"></span>
              <span v-else class="type-badge" :class="node.type" v-html="getTypeIcon(node.type)"></span>
            </td>
            <td class="col-check">
              <input
                v-if="['task', 'project'].includes(node.type)"
                type="checkbox"
                :checked="node.completed"
                @click.stop="emit('toggle-complete', node)"
              />
            </td>
            <td class="col-title">
              <span v-if="node.favorite" class="favorite-star">&#9733;</span>
              {{ node.title }}
            </td>
                                                <td class="col-actions">
                            <button class="action-btn delete" @click.stop="confirmDelete(node.id)" title="Delete">x</button>
            </td>
          </tr>
          <!-- Child rows (when expanded) -->
          <template v-if="expandedIds.has(node.id) && node.children?.length">
            <template v-for="(child, childIndex) in node.children" :key="'child-' + child.id">
              <tr
                class="node-row"
                :class="[
                  getDepthRowClass(child),
                  {
                    selected: isSelected(child.id),
                    completed: child.completed,
                    'inherited-completed': child.inheritedCompleted,
                    ...getDropClass(child)
                  }
                ]"
                :style="{ '--indent': getIndentPadding(child), ...getRowStyle(child) }"
                :data-node-id="child.id"
                @mousedown="onMouseDown($event, child)"
                @dragstart.prevent
                @click="handleClick($event, child)"
                @dblclick="emit('enter', child)"
                @mouseenter="showTooltip($event, child)"
                @mouseleave="hideTooltip"
              >
                <td class="col-expand">
                  <button
                    v-if="child.children?.length"
                    class="expand-btn"
                    @click.stop="handleExpand(child.id)"
                  >
                    {{ expandedIds.has(child.id) ? '−' : '+' }}
                  </button>
                </td>
                <td class="col-type">
                  <span class="tree-prefix">{{ getTreePrefix(child, childIndex === node.children.length - 1) }}</span>
                  <span v-if="child.type === 'person'" class="type-badge person" :style="getBadgeStyle(child)" v-html="personIconSvg"></span>
                  <span v-else class="type-badge" :class="child.type" v-html="getTypeIcon(child.type)"></span>
                </td>
                <td class="col-check">
                  <input
                    v-if="['task', 'project'].includes(child.type)"
                    type="checkbox"
                    :checked="child.completed"
                    @click.stop="emit('toggle-complete', child)"
                  />
                </td>
                <td class="col-title">
                  <span v-if="child.favorite" class="favorite-star">&#9733;</span>
                  {{ child.title }}
                </td>
                                                                <td class="col-actions">
                                    <button class="action-btn delete" @click.stop="confirmDelete(child.id)" title="Delete">x</button>
                </td>
              </tr>
              <!-- Grandchild rows -->
              <template v-if="expandedIds.has(child.id) && child.children?.length">
                <tr
                  v-for="(grandchild, grandchildIndex) in child.children"
                  :key="'grandchild-' + grandchild.id"
                  class="node-row"
                  :class="[
                    getDepthRowClass(grandchild),
                    {
                      selected: isSelected(grandchild.id),
                      completed: grandchild.completed,
                      'inherited-completed': grandchild.inheritedCompleted,
                      ...getDropClass(grandchild)
                    }
                  ]"
                  :style="{ '--indent': getIndentPadding(grandchild), ...getRowStyle(grandchild) }"
                  :data-node-id="grandchild.id"
                  @mousedown="onMouseDown($event, grandchild)"
                  @dragstart.prevent
                  @click="handleClick($event, grandchild)"
                  @dblclick="emit('enter', grandchild)"
                  @mouseenter="showTooltip($event, grandchild)"
                  @mouseleave="hideTooltip"
                >
                  <td class="col-expand"></td>
                  <td class="col-type">
                    <span class="tree-prefix">{{ getTreePrefix(grandchild, grandchildIndex === child.children.length - 1) }}</span>
                    <span v-if="grandchild.type === 'person'" class="type-badge person" :style="getBadgeStyle(grandchild)" v-html="personIconSvg"></span>
                    <span v-else class="type-badge" :class="grandchild.type" v-html="getTypeIcon(grandchild.type)"></span>
                  </td>
                  <td class="col-check">
                    <input
                      v-if="['task', 'project'].includes(grandchild.type)"
                      type="checkbox"
                      :checked="grandchild.completed"
                      @click.stop="emit('toggle-complete', grandchild)"
                    />
                  </td>
                  <td class="col-title">
                    <span v-if="grandchild.favorite" class="favorite-star">&#9733;</span>
                    {{ grandchild.title }}
                  </td>
                                                                        <td class="col-actions">
                                        <button class="action-btn delete" @click.stop="confirmDelete(grandchild.id)" title="Delete">x</button>
                  </td>
                </tr>
              </template>
            </template>
          </template>
        </template>
      </tbody>
    </table>
    <div v-if="filteredNodes.length === 0" class="empty-state">
      <p>No items</p>
    </div>
  </div>
</template>

<style scoped>
.table-view {
  flex: 1;
  overflow: auto;
  background: #0a0a0a;
}

table {
  width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  font-size: 0.9rem;
}

thead {
  position: sticky;
  top: 0;
  background: #161616;
  z-index: 1;
}

thead tr {
  height: 28px;
  max-height: 28px;
  min-height: 28px;
}

th {
  text-align: left;
  padding: 0 12px;
  border-bottom: 1px solid #333;
  font-weight: 600;
  color: #888;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  height: 28px;
  max-height: 28px;
  line-height: 28px;
  vertical-align: middle;
}

td {
  padding: 0 14px;
  height: 30px;
}

.node-row {
  cursor: pointer;
  transition: background 0.1s;
  background: #0d0d0d;
  -webkit-user-drag: element;
  user-select: none;
  height: 30px;
}

.node-row:hover {
  background: #1a1a1a;
}

.node-row.selected {
  background: #1a3a5a;
  border-left: 3px solid #4a9eff;
}

.node-row.completed {
  opacity: 0.6;
}

.node-row.completed .col-title {
  text-decoration: line-through;
  color: #666;
}

/* Inherited completed - parent is done, so children are visually muted */
.node-row.inherited-completed {
  opacity: 0.5;
  background: rgba(0, 0, 0, 0.3);
}

.node-row.inherited-completed .col-title {
  color: #555;
  font-style: italic;
}

.node-row.inherited-completed .col-title::after {
  content: ' (parent done)';
  font-size: 0.75em;
  color: #4a4;
  font-style: italic;
}

.node-row.dragging {
  opacity: 0.5;
}

/* Drop indicators */
.node-row.drop-before {
  border-top: 2px solid #4a9eff;
}

.node-row.drop-after {
  border-bottom: 2px solid #4a9eff;
}

.node-row.drop-inside {
  background: rgba(74, 158, 255, 0.1);
  outline: 1px solid #4a9eff;
}

/* Depth-based row styling */
.depth-row-0 {
  font-size: 1rem;
}

.depth-row-1 {
  font-size: 0.9rem;
}

.depth-row-2 {
  font-size: 0.85rem;
}

.depth-row-deep {
  font-size: 0.8rem;
}

.tree-indent {
  color: #4a9eff;
  font-family: monospace;
  font-weight: 500;
  margin-right: 10px;
  white-space: pre;
  font-size: 14px;
  opacity: 0.8;
}

.tree-indent.depth-1 {
  color: #4a9eff;
}

.tree-indent.depth-2 {
  color: #3a7ecf;
}

.node-row {
  cursor: grab;
}

.node-row:active {
  cursor: grabbing;
}

.node-row.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.col-expand {
  width: 30px;
  text-align: center;
  vertical-align: middle;
}

.parent-row {
  background: #0a0a0a;
  opacity: 0.7;
  border-left: 4px solid #444 !important;
}

.parent-row:hover {
  opacity: 1;
  background: #1a1a1a;
}

.parent-row .col-expand {
  color: #666;
  font-size: 0.8rem;
  font-weight: 600;
}

.col-check {
  width: 40px;
  text-align: center;
  padding: 0 12px;
}

.col-check input[type="checkbox"] {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  max-width: 16px;
  max-height: 16px;
  border: 2px solid #555;
  border-radius: 2px;
  background: #000;
  cursor: pointer;
  position: relative;
  box-sizing: border-box;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
}

.col-check input[type="checkbox"]:checked {
  background: #3498db;
  border-color: #3498db;
}

.col-check input[type="checkbox"]:checked::after {
  content: '✓';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #fff;
  font-size: 12px;
  font-weight: bold;
}

.col-type {
  width: 1px;
  padding: 0;
  padding-left: 4px;
  white-space: nowrap;
}

.tree-prefix {
  color: #666;
  font-family: 'Courier New', Courier, monospace;
  font-size: 14px;
  white-space: pre;
  display: inline-block;
  line-height: 26px;
  height: 26px;
  vertical-align: middle;
  letter-spacing: 0;
  margin: 0;
  padding: 0;
}

.col-title {
  min-width: 200px;
}

td.col-title {
  font-weight: 500;
  color: #f0f0f0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 0;
}

.favorite-star {
  color: #ffd700;
  font-size: 14px;
  flex-shrink: 0;
}

.col-children {
  width: 60px;
  text-align: center;
  color: #888;
}

.col-due {
  width: 100px;
  color: #a0a0a0;
}

.col-notes {
  max-width: 200px;
  color: #777;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-actions {
  width: 60px;
  text-align: right;
}

.expand-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  background: #222;
  border: 1px solid #555;
  color: #ccc;
  cursor: pointer;
  font-size: 0.9rem;
  line-height: 1;
  border-radius: 3px;
  font-weight: 700;
}

.expand-btn:hover {
  background: #333;
  border-color: #777;
  color: #fff;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 700;
  margin: 0;
  flex-shrink: 0;
}

.type-badge.project { background: var(--type-project-bg); color: var(--type-project-text); }
.type-badge.task { background: var(--type-task-bg); color: var(--type-task-text); }
.type-badge.note { background: var(--type-note-bg); color: var(--type-note-text); }
.type-badge.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.type-badge.group { background: var(--type-group-bg); color: var(--type-group-text); }
.type-badge.event { background: var(--type-event-bg); color: var(--type-event-text); }
.type-badge.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.type-badge.folder { background: var(--type-folder-bg); color: var(--type-folder-text); }
.type-badge.person { background: var(--type-person-bg); color: var(--type-person-text); }
.type-badge.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }

/* SVG icons in type badges */
.type-badge :deep(svg) {
  width: 14px;
  height: 14px;
}

.action-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: none;
  border: none;
  color: #aaa;
  cursor: pointer;
  font-size: 0.85rem;
  opacity: 1;
  transition: all 0.15s;
}

.action-btn:hover {
  opacity: 1;
  color: #fff;
}

.action-btn.delete:hover {
  color: #ff6b6b;
}

.empty-state {
  text-align: center;
  padding: 60px;
  color: #666;
  font-size: 1rem;
}

/* Root drop zone */
.root-drop-zone {
  background: #1a1a1a;
  border: 2px dashed #444;
}

.root-drop-zone td {
  padding: 12px;
  text-align: center;
  color: #666;
  font-style: italic;
}

.root-drop-zone.active {
  background: rgba(74, 158, 255, 0.1);
  border-color: #4a9eff;
}

.root-drop-zone.active td {
  color: #4a9eff;
}

/* Drop indicators */
.node-row.drop-before {
  position: relative;
}

.node-row.drop-before::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #4a9eff;
  z-index: 10;
}

.node-row.drop-after {
  position: relative;
}

.node-row.drop-after::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: #4a9eff;
  z-index: 10;
}

.node-row.drop-inside {
  background: rgba(74, 158, 255, 0.15) !important;
  outline: 2px solid #4a9eff;
  outline-offset: -2px;
}

/* Ghost element styles */
.drag-ghost .ghost-type {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.drag-ghost .ghost-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.drag-ghost .ghost-action {
  font-size: 11px;
  color: #4a9eff;
  font-weight: 500;
}
</style>
