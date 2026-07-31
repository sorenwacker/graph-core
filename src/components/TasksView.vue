<script setup>
import { onMounted, watch } from 'vue'
import { useTaskFiltering, useTaskDisplayUtils } from '../composables/useTaskFiltering.js'

const props = defineProps({
  workspaceId: { type: String, default: 'work' },
  hideSensitive: { type: Boolean, default: false },
  containerId: { type: Number, default: null }, // Current subgraph root
  containerTitle: { type: String, default: null },
  colorMap: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['select', 'navigate', 'toggle-complete'])

// Task filtering composable
const { loading, sortedTasks, showCompleted, filterImportance, loadTasks, toggleSort, getSortIcon } = useTaskFiltering({
  getWorkspaceId: () => props.workspaceId,
  getContainerId: () => props.containerId,
})

// Display utility functions
const { isOverdue, isDueSoon, formatDate, formatRelativeDate, getImportanceLabel, getImportanceClass } =
  useTaskDisplayUtils()

function onTaskClick(task) {
  emit('navigate', task)
}

// Get inherited color for a task by checking its ancestors
function getTaskColor(task) {
  // Check task's own color first
  if (props.colorMap[task.id]) {
    return props.colorMap[task.id]
  }
  // Check ancestors (ordered from root to parent)
  if (task.ancestorIds) {
    // Check from closest ancestor to furthest for the first color
    for (let i = task.ancestorIds.length - 1; i >= 0; i--) {
      const color = props.colorMap[task.ancestorIds[i]]
      if (color) return color
    }
  }
  return null
}

function getTaskRowStyle(task) {
  const color = getTaskColor(task)
  if (color && color !== '#0f4c75') {
    return { background: `linear-gradient(90deg, ${color}55 0%, transparent 50%)` }
  }
  return {}
}

function onCheckboxClick(task, event) {
  event.stopPropagation()
  emit('toggle-complete', task)
}

watch(() => props.workspaceId, loadTasks)
watch(() => props.containerId, loadTasks)
watch(showCompleted, loadTasks)
watch(filterImportance, loadTasks)

onMounted(loadTasks)

defineExpose({ loadTasks })
</script>

<template>
  <div class="tasks-view">
    <div class="tasks-header">
      <h2>
        Tasks<span v-if="containerTitle" class="container-scope"> in {{ containerTitle }}</span>
      </h2>
      <div class="tasks-filters">
        <label class="filter-checkbox">
          <input type="checkbox" v-model="showCompleted" />
          Show completed
        </label>
        <select v-model="filterImportance" class="filter-select">
          <option :value="0">All priorities</option>
          <option :value="5">Critical</option>
          <option :value="4">Urgent+</option>
          <option :value="3">High+</option>
          <option :value="2">Medium+</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading tasks...</div>

    <div v-else-if="sortedTasks.length === 0" class="empty-state">No tasks found</div>

    <table v-else class="tasks-table">
      <thead>
        <tr>
          <th class="col-checkbox sortable" @click="toggleSort('completed')">
            {{ getSortIcon('completed') }}
          </th>
          <th class="col-title sortable" @click="toggleSort('title')">Task{{ getSortIcon('title') }}</th>
          <th class="col-project sortable" @click="toggleSort('project')">
            Project / Path{{ getSortIcon('project') }}
          </th>
          <th class="col-created sortable" @click="toggleSort('created_at')">Created{{ getSortIcon('created_at') }}</th>
          <th class="col-due sortable" @click="toggleSort('due_date')">Due{{ getSortIcon('due_date') }}</th>
          <th class="col-importance sortable" @click="toggleSort('importance')">
            Priority{{ getSortIcon('importance') }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="task in sortedTasks"
          :key="task.id"
          class="task-row"
          :class="{
            completed: task.completed,
            overdue: !task.completed && isOverdue(task.due_date),
            'due-soon': !task.completed && !isOverdue(task.due_date) && isDueSoon(task.due_date),
          }"
          :style="getTaskRowStyle(task)"
          @click="onTaskClick(task)"
        >
          <td class="col-checkbox">
            <input type="checkbox" :checked="task.completed" @click="onCheckboxClick(task, $event)" />
          </td>
          <td class="col-title">
            <span class="task-title">{{ task.title }}</span>
          </td>
          <td class="col-project">
            <span v-if="task.parentPath && task.parentPath.length > 0" class="parent-path">
              {{ task.parentPath.join(' / ') }}
            </span>
            <span v-else-if="task.isDirectChild" class="direct-child">(here)</span>
            <span v-else class="no-project">-</span>
          </td>
          <td class="col-created">{{ formatDate(task.created_at) }}</td>
          <td class="col-due" :class="{ overdue: isOverdue(task.due_date), 'due-soon': isDueSoon(task.due_date) }">
            {{ formatRelativeDate(task.due_date) }}
          </td>
          <td class="col-importance" :class="getImportanceClass(task.importance)">
            {{ getImportanceLabel(task.importance) }}
          </td>
        </tr>
      </tbody>
    </table>

    <div class="tasks-footer">
      {{ sortedTasks.length }} task{{ sortedTasks.length !== 1 ? 's' : '' }}
      <span v-if="!showCompleted"> (hiding completed)</span>
    </div>
  </div>
</template>

<style scoped>
.tasks-view {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tasks-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.tasks-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary);
}

.container-scope {
  font-weight: 400;
  color: var(--text-secondary);
  font-size: 1.1rem;
}

.tasks-filters {
  display: flex;
  gap: 16px;
  align-items: center;
}

.filter-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
}

.filter-checkbox input {
  cursor: pointer;
}

.filter-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
}

.loading,
.empty-state {
  color: var(--text-secondary);
  text-align: center;
  padding: 40px;
}

.tasks-table {
  width: 100%;
  border-collapse: collapse;
  display: block;
  flex: 1;
  overflow-y: auto;
}

.tasks-table thead,
.tasks-table tbody,
.tasks-table tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}

.tasks-table thead {
  position: sticky;
  top: 0;
  background: var(--bg-primary);
  z-index: 1;
}

.tasks-table th {
  text-align: left;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  height: 40px;
}

.tasks-table th.sortable {
  cursor: pointer;
  user-select: none;
}

.tasks-table th.sortable:hover {
  color: var(--text-primary);
}

.tasks-table td {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
  height: 44px;
  max-height: 44px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-row {
  cursor: pointer;
  transition: background 0.15s;
  height: 44px;
}

.task-row:hover {
  background: #1a1a2e;
}

.task-row.completed {
  opacity: 0.5;
}

.task-row.completed .task-title {
  text-decoration: line-through;
}

.task-row.overdue {
  background: rgba(231, 76, 60, 0.1);
}

.task-row.due-soon {
  background: rgba(241, 196, 15, 0.1);
}

.col-checkbox {
  width: 50px;
  text-align: center;
}

.col-checkbox.sortable {
  cursor: pointer;
}

.col-checkbox input {
  cursor: pointer;
  width: 16px;
  height: 16px;
}

.col-title {
  width: 30%;
}

.task-title {
  color: var(--text-primary);
  font-weight: 500;
}

.col-project {
  width: 25%;
}

.parent-path {
  color: var(--text-secondary);
  font-size: 0.9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.no-project {
  color: var(--text-tertiary);
}

.direct-child {
  color: var(--text-tertiary);
  font-style: italic;
}

.col-created,
.col-due {
  width: 12%;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.col-due.overdue {
  color: var(--error-color);
  font-weight: 500;
}

.col-due.due-soon {
  color: var(--warning-color);
}

.col-importance {
  width: 10%;
  font-size: 0.85rem;
}

.importance-low {
  color: var(--text-secondary);
}
.importance-medium {
  color: var(--accent-color);
}
.importance-high {
  color: var(--warning-color);
}
.importance-critical {
  color: var(--error-color);
  font-weight: 600;
}

.tasks-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 0.85rem;
  flex-shrink: 0;
}
</style>
