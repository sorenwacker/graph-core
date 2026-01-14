<script setup>
import { ref } from 'vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  selectedIds: { type: Set, default: () => new Set() },
  expandedIds: { type: Set, default: () => new Set() }
})

const emit = defineEmits(['select', 'select-multiple', 'enter', 'toggle-complete', 'toggle-expand', 'add-child', 'delete', 'move', 'reorder'])

// Drag state
const draggedNode = ref(null)
const dropTarget = ref(null)
const dropPosition = ref(null) // 'before', 'after', 'inside'

function formatDate(dateStr) {
  if (!dateStr) return ''
  return dateStr.split('T')[0]
}

function getTypeIcon(type) {
  const icons = {
    project: 'P',
    task: 'T',
    note: 'N',
    milestone: 'M',
    topic: 'O',
    folder: 'F',
    person: 'U'
  }
  return icons[type] || 'T'
}

// Get indentation based on database depth
function getIndentPadding(node) {
  const depth = node.depth || 0
  const basePadding = 8
  const indentPerLevel = 24
  return `${basePadding + (depth * indentPerLevel)}px`
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
  if (confirm('Delete this node?')) {
    emit('delete', nodeId)
  }
}

// Drag and Drop
function onDragStart(e, node) {
  draggedNode.value = node
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', node.id)
  e.target.classList.add('dragging')
}

function onDragEnd(e) {
  e.target.classList.remove('dragging')
  draggedNode.value = null
  dropTarget.value = null
  dropPosition.value = null
}

function onDragOver(e, node) {
  if (!draggedNode.value || draggedNode.value.id === node.id) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'

  dropTarget.value = node

  // Determine drop position based on mouse Y position within row
  const rect = e.currentTarget.getBoundingClientRect()
  const y = e.clientY - rect.top
  const height = rect.height

  if (y < height * 0.25) {
    dropPosition.value = 'before'
  } else if (y > height * 0.75) {
    dropPosition.value = 'after'
  } else {
    dropPosition.value = 'inside'
  }
}

function onDragLeave(e) {
  // Only clear if leaving the row entirely
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (dropTarget.value?.id === parseInt(e.currentTarget.dataset.nodeId)) {
      dropTarget.value = null
      dropPosition.value = null
    }
  }
}

function onDrop(e, targetNode) {
  e.preventDefault()
  if (!draggedNode.value || draggedNode.value.id === targetNode.id) return

  const sourceNode = draggedNode.value

  if (dropPosition.value === 'inside') {
    // Move as child of target
    emit('move', { nodeId: sourceNode.id, newParentId: targetNode.id })
  } else {
    // Reorder: move before or after target
    emit('reorder', {
      nodeId: sourceNode.id,
      targetId: targetNode.id,
      position: dropPosition.value
    })
  }

  draggedNode.value = null
  dropTarget.value = null
  dropPosition.value = null
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
  <div class="table-view">
    <table>
      <thead>
        <tr>
          <th class="col-drag"></th>
          <th class="col-expand"></th>
          <th class="col-check"></th>
          <th class="col-type">Type</th>
          <th class="col-title">Title</th>
          <th class="col-actions"></th>
        </tr>
      </thead>
      <tbody>
        <template v-for="(node, nodeIndex) in nodes" :key="node.id">
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
            :data-node-id="node.id"
            draggable="true"
            @click="handleClick($event, node)"
            @dblclick="emit('enter', node)"
            @dragstart="onDragStart($event, node)"
            @dragend="onDragEnd"
            @dragover="onDragOver($event, node)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, node)"
          >
            <td class="col-drag" :style="{ paddingLeft: getIndentPadding(node) }">
              <span class="drag-handle">::</span>
            </td>
            <td class="col-expand">
              <button
                v-if="node.children?.length"
                class="expand-btn"
                @click.stop="emit('toggle-expand', node.id)"
              >
                {{ expandedIds.has(node.id) ? '−' : '+' }}
              </button>
            </td>
            <td class="col-check">
              <input
                v-if="node.type === 'task'"
                type="checkbox"
                :checked="node.completed"
                @click.stop="emit('toggle-complete', node)"
              />
            </td>
            <td class="col-type">
              <span class="type-badge" :class="node.type">{{ getTypeIcon(node.type) }}</span>
            </td>
            <td class="col-title">{{ node.title }}</td>
                                                <td class="col-actions">
                            <button class="action-btn delete" @click.stop="confirmDelete(node.id)" title="Delete">x</button>
            </td>
          </tr>
          <!-- Child rows (when expanded) -->
          <template v-if="expandedIds.has(node.id) && node.children?.length">
            <template v-for="child in node.children" :key="'child-' + child.id">
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
                :data-node-id="child.id"
                draggable="true"
                @click="handleClick($event, child)"
                @dblclick="emit('enter', child)"
                @dragstart="onDragStart($event, child)"
                @dragend="onDragEnd"
                @dragover="onDragOver($event, child)"
                @dragleave="onDragLeave"
                @drop="onDrop($event, child)"
              >
                <td class="col-drag" :style="{ paddingLeft: getIndentPadding(child) }">
                  <span class="drag-handle">::</span>
                </td>
                <td class="col-expand">
                  <button
                    v-if="child.children?.length"
                    class="expand-btn"
                    @click.stop="emit('toggle-expand', child.id)"
                  >
                    {{ expandedIds.has(child.id) ? '−' : '+' }}
                  </button>
                </td>
                <td class="col-check">
                  <input
                    v-if="child.type === 'task'"
                    type="checkbox"
                    :checked="child.completed"
                    @click.stop="emit('toggle-complete', child)"
                  />
                </td>
                <td class="col-type">
                  <span class="type-badge" :class="child.type">{{ getTypeIcon(child.type) }}</span>
                </td>
                <td class="col-title">{{ child.title }}</td>
                                                                <td class="col-actions">
                                    <button class="action-btn delete" @click.stop="confirmDelete(child.id)" title="Delete">x</button>
                </td>
              </tr>
              <!-- Grandchild rows -->
              <template v-if="expandedIds.has(child.id) && child.children?.length">
                <tr
                  v-for="grandchild in child.children"
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
                  :data-node-id="grandchild.id"
                  draggable="true"
                  @click="handleClick($event, grandchild)"
                  @dblclick="emit('enter', grandchild)"
                  @dragstart="onDragStart($event, grandchild)"
                  @dragend="onDragEnd"
                  @dragover="onDragOver($event, grandchild)"
                  @dragleave="onDragLeave"
                  @drop="onDrop($event, grandchild)"
                >
                  <td class="col-drag" :style="{ paddingLeft: getIndentPadding(grandchild) }">
                    <span class="drag-handle">::</span>
                  </td>
                  <td class="col-expand"></td>
                  <td class="col-check">
                    <input
                      v-if="grandchild.type === 'task'"
                      type="checkbox"
                      :checked="grandchild.completed"
                      @click.stop="emit('toggle-complete', grandchild)"
                    />
                  </td>
                  <td class="col-type">
                    <span class="type-badge" :class="grandchild.type">{{ getTypeIcon(grandchild.type) }}</span>
                  </td>
                  <td class="col-title">{{ grandchild.title }}</td>
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
    <div v-if="nodes.length === 0" class="empty-state">
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
  font-size: 0.9rem;
}

thead {
  position: sticky;
  top: 0;
  background: #161616;
  z-index: 1;
}

th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 2px solid #333;
  font-weight: 700;
  color: #e0e0e0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

td {
  padding: 4px 12px;
  border-bottom: 1px solid #222;
}

.node-row {
  cursor: pointer;
  transition: background 0.1s;
  background: #0d0d0d;
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

/* Tree indentation with visual lines */
.node-row:not(.child-row):not(.grandchild-row) {
  border-left: 3px solid #f39c12;
}

/* Visual separator between independent trees */
.tree-boundary {
  border-top: 4px solid #444;
}

.tree-boundary td {
  padding-top: 16px;
}

.tree-boundary td:first-child {
  border-top: none;
}

/* Depth-based row styling */
.depth-row-0 {
  background: #000;
  border-left: 4px solid #f39c12;
  font-size: 1rem;
}

.depth-row-1 {
  background: #000;
  border-left: 4px solid #3498db;
  font-size: 0.85rem;
}

.depth-row-2 {
  background: #000;
  border-left: 4px solid #9b59b6;
  font-size: 0.72rem;
}

.depth-row-deep {
  background: #000;
  border-left: 4px solid #1abc9c;
  font-size: 0.65rem;
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

.col-drag {
  width: 24px;
  text-align: center;
}

.drag-handle {
  cursor: grab;
  color: #888;
  font-weight: bold;
  opacity: 1;
  user-select: none;
}

.drag-handle:hover {
  color: #ccc;
}

.node-row.dragging .drag-handle {
  cursor: grabbing;
}

.col-expand {
  width: 30px;
  text-align: center;
}

.col-check {
  width: 30px;
  text-align: center;
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
  width: 40px;
}

.col-title {
  min-width: 200px;
  font-weight: 500;
  color: #f0f0f0;
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
}

.type-badge.project { background: #1a4d7a; color: #8cc4ff; }
.type-badge.task { background: #5a5a1a; color: #f0f07d; }
.type-badge.note { background: #1a5a1a; color: #7df07d; }
.type-badge.milestone { background: #5a1a5a; color: #f07df0; }
.type-badge.topic { background: #1a5a5a; color: #7df0f0; }
.type-badge.folder { background: #4a4a4a; color: #ccc; }
.type-badge.person { background: #5a3a1a; color: #f0b07d; }

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
</style>
