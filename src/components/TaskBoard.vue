<script setup>
import { ref, computed } from 'vue'
import { BOARD_COLUMNS, boardColumn } from '../utils/taskBoard.js'
import { useTaskDisplayUtils } from '../composables/useTaskFiltering.js'

const props = defineProps({
  tasks: { type: Array, default: () => [] },
  showCompleted: { type: Boolean, default: false },
  colorMap: { type: Object, default: () => ({}) },
  selectedId: { type: Number, default: null },
})

const emit = defineEmits(['select', 'enter', 'toggle-complete', 'move'])

const { isOverdue, isDueSoon, formatRelativeDate, getImportanceLabel, getImportanceClass, getTaskColor } =
  useTaskDisplayUtils()

// Done exists only while completed items are shown: its cards are the
// completed tasks, which are not loaded otherwise.
const columns = computed(() =>
  BOARD_COLUMNS.filter(column => column.id !== 'done' || props.showCompleted).map(column => ({
    ...column,
    tasks: props.tasks.filter(task => boardColumn(task) === column.id),
  }))
)

const draggingId = ref(null)
const overColumn = ref(null)

function onDragStart(event, task) {
  draggingId.value = task.id
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(task.id))
}

function onDragEnd() {
  draggingId.value = null
  overColumn.value = null
}

function onDragLeave(columnId) {
  if (overColumn.value === columnId) overColumn.value = null
}

function onDrop(columnId) {
  const task = props.tasks.find(t => t.id === draggingId.value)
  onDragEnd()
  if (task) emit('move', task, columnId)
}

function onCheckbox(task, event) {
  event.stopPropagation()
  emit('toggle-complete', task)
}

function cardClasses(task) {
  return {
    dragging: draggingId.value === task.id,
    selected: props.selectedId === task.id,
    completed: Boolean(task.completed),
    blocked: !task.completed && Boolean(task.blocked),
    overdue: !task.completed && isOverdue(task.due_date),
    'due-soon': !task.completed && !isOverdue(task.due_date) && isDueSoon(task.due_date),
  }
}

function cardStyle(task) {
  const color = getTaskColor(task, props.colorMap)
  return color ? { borderLeftColor: color } : {}
}
</script>

<template>
  <div class="task-board">
    <section
      v-for="column in columns"
      :key="column.id"
      class="board-column"
      :class="{ 'drop-target': overColumn === column.id }"
      :data-column="column.id"
      @dragover.prevent="overColumn = column.id"
      @dragleave="onDragLeave(column.id)"
      @drop.prevent="onDrop(column.id)"
    >
      <header class="board-column-header">
        {{ column.label }}
        <span class="board-count">{{ column.tasks.length }}</span>
      </header>
      <article
        v-for="task in column.tasks"
        :key="task.id"
        class="board-card"
        :class="cardClasses(task)"
        :style="cardStyle(task)"
        :data-task-id="task.id"
        draggable="true"
        @dragstart="onDragStart($event, task)"
        @dragend="onDragEnd"
        @click="emit('select', task)"
        @dblclick="emit('enter', task)"
      >
        <input
          type="checkbox"
          class="board-card-check"
          :checked="Boolean(task.completed)"
          @click="onCheckbox(task, $event)"
        />
        <div class="board-card-body">
          <div class="board-card-title">{{ task.title }}</div>
          <div class="board-card-meta">
            <span
              v-if="task.due_date"
              class="board-due"
              :class="{ overdue: isOverdue(task.due_date), 'due-soon': isDueSoon(task.due_date) }"
            >
              {{ formatRelativeDate(task.due_date) }}
            </span>
            <span v-if="task.importance" :class="getImportanceClass(task.importance)">
              {{ getImportanceLabel(task.importance) }}
            </span>
            <span v-if="task.parentPath && task.parentPath.length > 0" class="board-path">
              {{ task.parentPath.join(' / ') }}
            </span>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.task-board {
  display: flex;
  gap: 16px;
  flex: 1;
  min-height: 0;
  overflow-x: auto;
}

.board-column {
  flex: 1 1 0;
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow-y: auto;
}

.board-column.drop-target {
  border-color: var(--accent-color);
  box-shadow: inset 0 0 0 1px var(--accent-color);
}

.board-column-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
}

.board-count {
  font-weight: 400;
  color: var(--text-tertiary);
}

.board-card {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 8px 10px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-left: 4px solid var(--border-color);
  border-radius: 6px;
  cursor: grab;
}

.board-card:hover {
  border-color: var(--accent-color);
}

.board-card.dragging {
  opacity: 0.5;
}

.board-card.selected {
  border-color: var(--accent-color);
  box-shadow: 0 0 0 1px var(--accent-color);
}

.board-card.blocked {
  border-style: dashed;
  border-left-style: solid;
}

.board-card.completed .board-card-title {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.board-card.overdue {
  background: rgba(231, 76, 60, 0.1);
}

.board-card.due-soon {
  background: rgba(241, 196, 15, 0.1);
}

.board-card-check {
  margin-top: 3px;
  cursor: pointer;
}

.board-card-body {
  min-width: 0;
  flex: 1;
}

.board-card-title {
  color: var(--text-primary);
  overflow-wrap: anywhere;
}

.board-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  margin-top: 4px;
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.board-due.overdue {
  color: var(--error-color);
}

.board-due.due-soon {
  color: var(--warning-color);
}

.board-path {
  color: var(--text-tertiary);
}

.importance-medium {
  color: var(--accent-color);
}

.importance-high {
  color: var(--warning-color);
}

.importance-critical {
  color: var(--error-color);
}
</style>
