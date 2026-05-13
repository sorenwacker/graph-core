<script setup>
import { ref, computed } from 'vue'
import { getInitials, getDueStatus } from '../../utils/formatting.js'
import { getTypeIcon, personIconSvg } from '../../utils/constants.js'

const props = defineProps({
  children: { type: Array, default: () => [] },
  hideCompleted: { type: Boolean, default: false },
  loadingChildren: { type: Boolean, default: false },
  collapsed: { type: Boolean, default: false },
  parentId: { type: [Number, String], required: true },
  width: { type: Number, default: 400 },
  fullscreen: { type: Boolean, default: false },
})

const emit = defineEmits(['update:collapsed', 'select-child', 'toggle-complete', 'add-task', 'add-subtask', 'reorder'])

const newTaskTitle = ref('')

// Filter children based on hideCompleted
const filteredChildren = computed(() => {
  if (!props.hideCompleted) return props.children
  return props.children.filter(child => !child.completed)
})

const completedCount = computed(() => {
  return props.children.filter(c => c.completed).length
})

// Expanded children and grandchildren
const expandedChildren = ref(new Set())
const grandchildren = ref({})

// Drag state
const draggedChild = ref(null)
const dropTarget = ref(null)
const dropPosition = ref(null)

function toggleCollapsed() {
  emit('update:collapsed', !props.collapsed)
}

function addTask() {
  const title = newTaskTitle.value.trim()
  if (!title) return
  emit('add-task', { parentId: props.parentId, title, type: 'task' })
  newTaskTitle.value = ''
}

function onDragStart(e, child) {
  draggedChild.value = child
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', child.id)
}

function onDragOver(e, child) {
  if (!draggedChild.value || draggedChild.value.id === child.id) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  dropPosition.value = e.clientY < midY ? 'before' : 'after'
  dropTarget.value = child
}

function onDragLeave() {
  dropTarget.value = null
  dropPosition.value = null
}

function onDrop(e, targetChild) {
  e.preventDefault()
  if (!draggedChild.value || draggedChild.value.id === targetChild.id) return

  emit('reorder', {
    draggedId: draggedChild.value.id,
    targetId: targetChild.id,
    position: dropPosition.value,
  })

  draggedChild.value = null
  dropTarget.value = null
  dropPosition.value = null
}

function onDragEnd() {
  draggedChild.value = null
  dropTarget.value = null
  dropPosition.value = null
}
</script>

<template>
  <div class="children-section" :class="{ collapsed }">
    <div class="section-header" @click="toggleCollapsed">
      <span class="section-title">Tasks</span>
      <span v-if="children.length" class="section-count">{{ completedCount }}/{{ children.length }}</span>
    </div>
    <div v-show="!collapsed" class="section-content">
      <!-- Add task input -->
      <div class="add-task-row">
        <input
          v-model="newTaskTitle"
          type="text"
          placeholder="Add task..."
          class="add-task-input"
          @keydown.enter="addTask"
        />
        <button class="add-task-btn" @click="addTask" :disabled="!newTaskTitle.trim()" title="Add task">+</button>
      </div>
      <div v-if="loadingChildren" class="loading">Loading...</div>
      <div v-if="filteredChildren.length" class="children-list">
        <template v-for="child in filteredChildren" :key="child.id">
          <!-- Person: circle with initials -->
          <div
            v-if="child.type === 'person'"
            class="child-item person-item"
            :title="child.title + (child.organization ? ' - ' + child.organization : '')"
            @click="emit('select-child', child.id)"
          >
            <span class="person-avatar" :style="{ backgroundColor: child.color || '#3498db' }">
              {{ getInitials(child.title) }}
            </span>
          </div>
          <!-- Other types: color dot with checkbox -->
          <div
            v-else
            class="child-item"
            :class="{
              completed: child.completed,
              dragging: draggedChild?.id === child.id,
              'drop-before': dropTarget?.id === child.id && dropPosition === 'before',
              'drop-after': dropTarget?.id === child.id && dropPosition === 'after',
            }"
            :data-child-id="child.id"
            draggable="true"
            @dragstart="onDragStart($event, child)"
            @dragover="onDragOver($event, child)"
            @dragleave="onDragLeave"
            @drop="onDrop($event, child)"
            @dragend="onDragEnd"
            @click="emit('select-child', child.id)"
          >
            <span class="child-color-dot" :style="{ backgroundColor: child.color || '#0f4c75' }">
              <input type="checkbox" :checked="child.completed" @click.stop @change="emit('toggle-complete', child)" />
            </span>
            <span class="child-title">{{ child.title?.slice(0, 30) }}{{ child.title?.length > 30 ? '...' : '' }}</span>
            <span v-if="child.end_date && (fullscreen || width >= 500)" class="child-end-date">{{
              child.end_date.split('T')[0]
            }}</span>
            <span
              v-if="child.due_date"
              class="child-due"
              :class="{
                'due-warning': getDueStatus(child) === 'soon',
                'due-overdue': getDueStatus(child) === 'overdue',
              }"
              >{{ child.due_date }}</span
            >
            <button
              class="add-subtask-btn"
              @click.stop="emit('add-subtask', { parentId: child.id })"
              title="Add subtask"
            >
              +
            </button>
          </div>
          <!-- Grandchildren -->
          <template v-if="expandedChildren.has(child.id) && grandchildren[child.id]?.length">
            <div
              v-for="gc in grandchildren[child.id]"
              :key="gc.id"
              class="grandchild-item"
              :class="{ completed: gc.completed }"
              @click="emit('select-child', gc.id)"
            >
              <span v-if="gc.type === 'person'" class="gc-type person" v-html="personIconSvg"></span>
              <span v-else class="gc-type" :class="gc.type" v-html="getTypeIcon(gc.type)"></span>
              <span class="gc-title">{{ gc.title }}</span>
              <button
                class="add-subtask-btn"
                @click.stop="emit('add-subtask', { parentId: gc.id })"
                title="Add subtask"
              >
                +
              </button>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.children-section {
  display: flex;
  flex-direction: column;
  padding: 4px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.children-section.collapsed {
  padding: 0;
  background: transparent;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 6px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  border-radius: 4px;
  margin: 0;
  min-height: 0;
  line-height: 1;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-decoration: none;
  border: none;
  line-height: 1;
  margin: 0;
  padding: 0;
}

.section-count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
  line-height: 1;
}

.add-task-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.add-task-input {
  flex: 1;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}

.add-task-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.add-task-btn {
  background: var(--accent-color);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0 12px;
  font-size: 16px;
  cursor: pointer;
}

.add-task-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px;
}

.children-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.child-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.child-item:hover {
  background: var(--bg-hover);
}

.child-item.completed {
  opacity: 0.6;
}

.child-item.completed .child-title {
  text-decoration: line-through;
}

.child-item.dragging {
  opacity: 0.5;
}

.child-item.drop-before {
  border-top: 2px solid var(--accent-color);
}

.child-item.drop-after {
  border-bottom: 2px solid var(--accent-color);
}

.person-item {
  display: inline-flex;
  padding: 4px;
}

.person-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.child-color-dot {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.child-color-dot input[type='checkbox'] {
  width: 14px;
  height: 14px;
  cursor: pointer;
  accent-color: var(--accent-color);
}

.child-title {
  flex: 1;
  font-size: 13px;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.child-end-date {
  font-size: 10px;
  color: var(--text-tertiary);
}

.child-due {
  font-size: 10px;
  color: var(--text-secondary);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.child-due.due-warning {
  background: #f39c12;
  color: white;
}

.child-due.due-overdue {
  background: #e74c3c;
  color: white;
}

.add-subtask-btn {
  opacity: 0;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
}

.child-item:hover .add-subtask-btn {
  opacity: 1;
}

.add-subtask-btn:hover {
  color: var(--accent-color);
}

.grandchild-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 32px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
}

.grandchild-item:hover {
  background: var(--bg-hover);
}

.grandchild-item.completed {
  opacity: 0.6;
}

.grandchild-item.completed .gc-title {
  text-decoration: line-through;
}

.gc-type {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gc-type :deep(svg) {
  width: 12px;
  height: 12px;
}

.gc-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
