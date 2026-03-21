<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../services/api'
import { useErrorHandler } from '../composables/useErrorHandler.js'

const { handleError } = useErrorHandler()

const props = defineProps({
  workspaceId: { type: String, default: 'work' },
  hideSensitive: { type: Boolean, default: false },
  containerId: { type: Number, default: null },  // Current subgraph root
  containerTitle: { type: String, default: null }
})

const emit = defineEmits(['select', 'navigate', 'toggle-complete'])

const tasks = ref([])
const loading = ref(true)
const sortBy = ref('due_date') // due_date, importance, created_at, title
const sortAsc = ref(true)
const showCompleted = ref(false)
const filterImportance = ref(0) // 0 = all

async function loadTasks() {
  loading.value = true
  try {
    const params = {
      workspaceId: props.workspaceId,
      completed: showCompleted.value ? undefined : false
    }
    if (filterImportance.value > 0) {
      params.importance = filterImportance.value
    }
    // Filter by parent container if specified
    if (props.containerId) {
      params.parentId = props.containerId
    }

    let items = await api.getTasks(params)

    // If we have a container, also get tasks from descendants
    if (props.containerId && items) {
      // Get all descendant IDs
      try {
        const descendants = await api.getDescendants(props.containerId)
        const descendantIds = new Set((descendants || []).map(d => d.id))
        descendantIds.add(props.containerId)

        // Get all tasks and filter to those in the subtree
        const allParams = {
          workspaceId: props.workspaceId,
          completed: showCompleted.value ? undefined : false
        }
        if (filterImportance.value > 0) {
          allParams.importance = filterImportance.value
        }
        const allTasks = await api.getTasks(allParams)

        // Filter to tasks that are descendants of the container
        items = (allTasks || []).filter(task => {
          // Check if task itself or any of its ancestors is in the descendant set
          return descendantIds.has(task.id) || descendantIds.has(task.parent_id)
        })

        // Also need to check full ancestry for deeply nested tasks
        const filteredItems = []
        for (const task of items) {
          try {
            const ancestors = await api.getAncestors(task.id)
            const ancestorIds = (ancestors || []).map(a => a.id)
            if (ancestorIds.includes(props.containerId) || task.parent_id === props.containerId) {
              filteredItems.push(task)
            }
          } catch {
            // If we can't get ancestors, include if direct child
            if (task.parent_id === props.containerId) {
              filteredItems.push(task)
            }
          }
        }
        items = filteredItems
      } catch (e) {
        handleError(e, { context: 'Filtering tasks by container', silent: true })
      }
    }

    // Load parent paths for each task
    const tasksWithPaths = await Promise.all(
      (items || []).filter(Boolean).map(async (task) => {
        let path = []
        let isDirectChild = false
        try {
          // getAncestors returns ancestors ordered by depth (root first)
          const ancestors = await api.getAncestors(task.id)
          if (ancestors && ancestors.length > 0) {
            let ancestorList = [...ancestors]

            // If in a container, show path relative to container
            if (props.containerId) {
              const containerIndex = ancestorList.findIndex(a => a.id === props.containerId)
              if (containerIndex >= 0) {
                // Check if task is direct child of container
                if (containerIndex === ancestorList.length - 1) {
                  isDirectChild = true
                }
                // Show everything after the container
                ancestorList = ancestorList.slice(containerIndex + 1)
              }
            }

            path = ancestorList.map(a => a.title)
          } else if (task.parent_id) {
            // No ancestors returned but has parent - fetch parent directly
            try {
              const parent = await api.getNode(task.parent_id)
              if (parent && parent.title) {
                if (props.containerId && parent.id === props.containerId) {
                  isDirectChild = true
                } else {
                  path = [parent.title]
                }
              }
            } catch {
              // Ignore
            }
          }
        } catch {
          // Silently fail - task might be at root
          if (task.parent_id) {
            try {
              const parent = await api.getNode(task.parent_id)
              if (parent && parent.title) {
                if (props.containerId && parent.id === props.containerId) {
                  isDirectChild = true
                } else {
                  path = [parent.title]
                }
              }
            } catch {
              // Ignore
            }
          }
        }
        return { ...task, parentPath: path, isDirectChild }
      })
    )

    tasks.value = tasksWithPaths
  } catch (e) {
    handleError(e, { context: 'Loading tasks', silent: true })
    tasks.value = []
  } finally {
    loading.value = false
  }
}

const sortedTasks = computed(() => {
  const sorted = [...tasks.value]

  sorted.sort((a, b) => {
    let cmp = 0

    switch (sortBy.value) {
      case 'due_date':
        // Nulls last
        if (!a.due_date && !b.due_date) cmp = 0
        else if (!a.due_date) cmp = 1
        else if (!b.due_date) cmp = -1
        else cmp = a.due_date.localeCompare(b.due_date)
        break
      case 'importance':
        // Higher importance first (descending by default)
        cmp = (b.importance || 0) - (a.importance || 0)
        break
      case 'created_at':
        cmp = (a.created_at || '').localeCompare(b.created_at || '')
        break
      case 'title':
        cmp = (a.title || '').localeCompare(b.title || '')
        break
      case 'project': {
        // Sort by joined path string
        const pathA = (a.parentPath || []).join(' / ')
        const pathB = (b.parentPath || []).join(' / ')
        // Empty paths last
        if (!pathA && !pathB) cmp = 0
        else if (!pathA) cmp = 1
        else if (!pathB) cmp = -1
        else cmp = pathA.localeCompare(pathB)
        break
      }
      case 'completed':
        cmp = (a.completed ? 1 : 0) - (b.completed ? 1 : 0)
        break
    }

    return sortAsc.value ? cmp : -cmp
  })

  return sorted
})

function isOverdue(dueDateStr) {
  if (!dueDateStr) return false
  const dueDate = new Date(dueDateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)
  return dueDate < today
}

function isDueSoon(dueDateStr) {
  if (!dueDateStr) return false
  const dueDate = new Date(dueDateStr)
  const today = new Date()
  const threeDays = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)
  today.setHours(0, 0, 0, 0)
  dueDate.setHours(0, 0, 0, 0)
  return dueDate >= today && dueDate <= threeDays
}

function formatDate(dateStr) {
  if (!dateStr) return '-'
  return dateStr.split('T')[0]
}

function formatRelativeDate(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((date - now) / (1000 * 60 * 60 * 24))

  if (diff < -1) return `${Math.abs(diff)}d ago`
  if (diff === -1) return 'Yesterday'
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff <= 7) return `in ${diff}d`
  return dateStr.split('T')[0]
}

function toggleSort(column) {
  if (sortBy.value === column) {
    sortAsc.value = !sortAsc.value
  } else {
    sortBy.value = column
    sortAsc.value = column === 'importance' ? false : true
  }
}

function getSortIcon(column) {
  if (sortBy.value !== column) return ''
  return sortAsc.value ? ' ^' : ' v'
}

function onTaskClick(task) {
  emit('navigate', task)
}

function onCheckboxClick(task, event) {
  event.stopPropagation()
  emit('toggle-complete', task)
}

function getImportanceLabel(importance) {
  if (!importance) return '-'
  const labels = { 1: 'Low', 2: 'Medium', 3: 'High', 4: 'Urgent', 5: 'Critical' }
  return labels[importance] || importance
}

function getImportanceClass(importance) {
  if (!importance) return ''
  if (importance >= 4) return 'importance-critical'
  if (importance >= 3) return 'importance-high'
  if (importance >= 2) return 'importance-medium'
  return 'importance-low'
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
      <h2>Tasks<span v-if="containerTitle" class="container-scope"> in {{ containerTitle }}</span></h2>
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

    <div v-else-if="sortedTasks.length === 0" class="empty-state">
      No tasks found
    </div>

    <table v-else class="tasks-table">
      <thead>
        <tr>
          <th class="col-checkbox sortable" @click="toggleSort('completed')">
            {{ getSortIcon('completed') }}
          </th>
          <th class="col-title sortable" @click="toggleSort('title')">
            Task{{ getSortIcon('title') }}
          </th>
          <th class="col-project sortable" @click="toggleSort('project')">
            Project / Path{{ getSortIcon('project') }}
          </th>
          <th class="col-created sortable" @click="toggleSort('created_at')">
            Created{{ getSortIcon('created_at') }}
          </th>
          <th class="col-due sortable" @click="toggleSort('due_date')">
            Due{{ getSortIcon('due_date') }}
          </th>
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
            'due-soon': !task.completed && !isOverdue(task.due_date) && isDueSoon(task.due_date)
          }"
          @click="onTaskClick(task)"
        >
          <td class="col-checkbox">
            <input
              type="checkbox"
              :checked="task.completed"
              @click="onCheckboxClick(task, $event)"
            />
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

.loading, .empty-state {
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

.col-created, .col-due {
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

.importance-low { color: var(--text-secondary); }
.importance-medium { color: var(--accent-color); }
.importance-high { color: var(--warning-color); }
.importance-critical { color: var(--error-color); font-weight: 600; }

.tasks-footer {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  color: var(--text-tertiary);
  font-size: 0.85rem;
  flex-shrink: 0;
}
</style>
