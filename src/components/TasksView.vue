<script setup>
import { onMounted, watch } from 'vue'
import { useTaskFiltering } from '../composables/useTaskFiltering.js'
import { boardChanges } from '../utils/taskBoard.js'
import TaskBoard from './TaskBoard.vue'

const props = defineProps({
  workspaceId: { type: String, default: 'work' },
  hideSensitive: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false }, // The main toolbar's completed toggle
  containerId: { type: Number, default: null }, // Current subgraph root
  containerTitle: { type: String, default: null },
  colorMap: { type: Object, default: () => ({}) },
  selectedId: { type: Number, default: null },
})

const emit = defineEmits(['select', 'enter', 'toggle-complete', 'update'])

const { loading, sortedTasks, filterImportance, loadTasks } = useTaskFiltering({
  getWorkspaceId: () => props.workspaceId,
  getContainerId: () => props.containerId,
  getShowCompleted: () => !props.hideCompleted,
})

/** A card dropped on another board column: write the fields that put it there. */
function onBoardMove(task, columnId) {
  const changes = boardChanges(task, columnId)
  if (changes) emit('update', { id: task.id, ...changes })
}

watch(() => props.workspaceId, loadTasks)
watch(() => props.containerId, loadTasks)
watch(() => props.hideCompleted, loadTasks)
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

    <TaskBoard
      v-else
      :tasks="sortedTasks"
      :show-completed="!hideCompleted"
      :color-map="colorMap"
      :selected-id="selectedId"
      @select="emit('select', $event)"
      @enter="emit('enter', $event)"
      @toggle-complete="emit('toggle-complete', $event)"
      @move="onBoardMove"
    />

    <div class="tasks-footer">
      {{ sortedTasks.length }} task{{ sortedTasks.length !== 1 ? 's' : '' }}
      <span v-if="hideCompleted"> (hiding completed)</span>
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

.filter-select {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 0.9rem;
  cursor: pointer;
}

.loading {
  color: var(--text-secondary);
  padding: 40px;
  text-align: center;
}

.tasks-footer {
  flex-shrink: 0;
  padding-top: 12px;
  color: var(--text-tertiary);
  font-size: 0.85rem;
}
</style>
