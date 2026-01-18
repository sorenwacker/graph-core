<script setup>
import { ref, computed } from 'vue'
import { getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'

const props = defineProps({
  node: Object,
  selectedId: Number,
  level: { type: Number, default: 0 },
  expandedIds: { type: Set, default: () => new Set() },
  dragEnabled: { type: Boolean, default: true }
})

const emit = defineEmits(['select', 'toggle-complete', 'toggle-expand', 'add-child', 'move-node', 'enter'])

const hasChildren = computed(() => props.node.children?.length > 0)
const isExpanded = computed(() => props.expandedIds.has(props.node.id))

const showAddInput = ref(false)
const newChildTitle = ref('')
const isDragOver = ref(false)

// Use centralized type icon
const typeIcon = computed(() => getTypeIcon(props.node.type))
const isPerson = computed(() => props.node.type === 'person')

// Get person-specific colors if applicable
const personStyle = computed(() => {
  if (isPerson.value) {
    const colors = getTypeColors('person', props.node.id)
    return { background: colors.bg, color: colors.text }
  }
  return {}
})

function toggleExpand() {
  emit('toggle-expand', props.node.id)
}

function selectNode() {
  emit('select', props.node)
}

function enterNode() {
  emit('enter', props.node)
}

function toggleComplete(event) {
  event.stopPropagation()
  emit('toggle-complete', props.node)
}

function startAddChild(event) {
  event.stopPropagation()
  showAddInput.value = true
  setTimeout(() => {
    const input = event.target.closest('.node-item')?.parentElement?.querySelector('.add-child-input input')
    input?.focus()
  }, 0)
}

function addChild() {
  if (newChildTitle.value.trim()) {
    emit('add-child', { parentId: props.node.id, title: newChildTitle.value })
    newChildTitle.value = ''
  }
  showAddInput.value = false
}

function cancelAdd() {
  newChildTitle.value = ''
  showAddInput.value = false
}

// Drag and drop
function onDragStart(event) {
  event.dataTransfer.setData('application/json', JSON.stringify({ nodeId: props.node.id }))
  event.dataTransfer.effectAllowed = 'move'
}

function onDragOver(event) {
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  isDragOver.value = true
}

function onDragLeave() {
  isDragOver.value = false
}

function onDrop(event) {
  event.preventDefault()
  event.stopPropagation()
  isDragOver.value = false

  try {
    const data = JSON.parse(event.dataTransfer.getData('application/json'))
    if (data.nodeId && data.nodeId !== props.node.id) {
      emit('move-node', { nodeId: data.nodeId, newParentId: props.node.id })
    }
  } catch (e) {
    console.error('Drop failed:', e)
  }
}
</script>

<template>
  <div class="node-tree-item">
    <div
      class="node-item"
      :class="{ selected: selectedId === node.id, 'drag-over': isDragOver }"
      :style="{ paddingLeft: `${level * 16 + 8}px` }"
      :draggable="dragEnabled"
      @click="selectNode"
      @dblclick="enterNode"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <button
        v-if="hasChildren"
        class="expand-btn"
        @click.stop="toggleExpand"
      >
        {{ isExpanded ? '-' : '+' }}
      </button>
      <span v-else class="expand-placeholder"></span>

      <span v-if="isPerson" class="type-icon person" :style="personStyle" v-html="personIconSvg"></span>
      <span v-else class="type-icon" :class="node.type">{{ typeIcon }}</span>

      <input
        v-if="node.type === 'task'"
        type="checkbox"
        :checked="node.completed"
        @change="toggleComplete"
        @click.stop
      />

      <span class="node-title" :class="{ completed: node.completed }">
        {{ node.title }}
      </span>

      <button class="add-child-btn" @click="startAddChild" title="Add child">
        +
      </button>
    </div>

    <!-- Inline add child input -->
    <div v-if="showAddInput" class="add-child-input" :style="{ paddingLeft: `${(level + 1) * 16 + 8}px` }">
      <input
        v-model="newChildTitle"
        placeholder="New child node..."
        @keyup.enter="addChild"
        @keyup.escape="cancelAdd"
        @blur="cancelAdd"
      />
    </div>

    <div v-if="hasChildren && isExpanded" class="node-children" :class="`level-${level}`">
      <NodeTree
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :selected-id="selectedId"
        :level="level + 1"
        :expanded-ids="expandedIds"
        :drag-enabled="dragEnabled"
        @select="$emit('select', $event)"
        @enter="$emit('enter', $event)"
        @toggle-complete="$emit('toggle-complete', $event)"
        @toggle-expand="$emit('toggle-expand', $event)"
        @add-child="$emit('add-child', $event)"
        @move-node="$emit('move-node', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
.expand-placeholder {
  width: 20px;
  display: inline-block;
}

.node-item {
  position: relative;
}

.node-item.drag-over {
  background: var(--accent-color) !important;
  outline: 2px dashed var(--accent-hover);
}

.add-child-btn {
  opacity: 0;
  margin-left: auto;
  width: 20px;
  height: 20px;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.node-item:hover .add-child-btn {
  opacity: 1;
}

.add-child-btn:hover {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.add-child-input {
  display: flex;
  padding: var(--spacing-xs) var(--spacing-sm);
}

.add-child-input input {
  flex: 1;
  font-size: 0.9rem;
  padding: var(--spacing-xs) var(--spacing-sm);
}

/* Better separation of subgraphs */
.node-children {
  border-left: 2px solid var(--border-color);
  margin-left: 18px;
  margin-top: 2px;
  margin-bottom: 4px;
}

.node-children.level-0 {
  border-left-color: #3498db;
  background: rgba(52, 152, 219, 0.03);
}

.node-children.level-1 {
  border-left-color: #f1c40f;
  background: rgba(241, 196, 15, 0.03);
}

.node-children.level-2 {
  border-left-color: #2ecc71;
  background: rgba(46, 204, 113, 0.03);
}

.node-children.level-3 {
  border-left-color: #9b59b6;
  background: rgba(155, 89, 182, 0.03);
}

/* Root level items get more spacing */
.node-tree-item:has(> .node-children.level-0) {
  margin-bottom: 8px;
}

/* Type icon styles - using centralized colors from CSS variables */
.type-icon.task {
  background: var(--type-task-bg);
  color: var(--type-task-text);
  border: 1px solid var(--type-task-text);
}

.type-icon.group {
  background: var(--type-group-bg);
  color: var(--type-group-text);
}

.type-icon.event {
  background: var(--type-event-bg);
  color: var(--type-event-text);
}

.type-icon.person {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.type-icon.person :deep(svg) {
  width: 12px;
  height: 12px;
}
</style>
