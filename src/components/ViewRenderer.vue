<script setup>
import TableView from './TableView.vue'
import CardsView from './CardsView.vue'
import GraphView from './GraphView.vue'
import TimelineView from './TimelineView.vue'
import CalendarView from './CalendarView.vue'
import PersonsView from './PersonsView.vue'
import TasksView from './TasksView.vue'
import TrashView from './TrashView.vue'
import { ref, computed } from 'vue'

const props = defineProps({
  viewMode: { type: String, required: true },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  // Node data
  sortedChildren: { type: Array, default: () => [] },
  filteredChildren: { type: Array, default: () => [] },
  // Selection state
  selectedNode: { type: Object, default: null },
  selectedIds: { type: Set, default: () => new Set() },
  expandedIds: { type: Set, default: () => new Set() },
  // Filters
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  // Container state
  currentContainerId: { type: [Number, String], default: null },
  currentContainer: { type: Object, default: null },
  // Display options
  colorMap: { type: Object, default: () => ({}) },
  hoverPreviewEnabled: { type: Boolean, default: true },
  showDetail: { type: Boolean, default: false },
  // Graph-specific
  graphDetailThreshold: { type: Number, default: 50 },
  effectiveGraphMaxDepth: { type: Number, default: 3 },
  fullscreenDetail: { type: Boolean, default: false },
  sortAlphabetically: { type: Boolean, default: false },
  workspace: { type: String, default: null },
  workspaces: { type: Array, default: () => [] },
  // Cards-specific
  cardSizeClass: { type: String, default: '' },
  cardsGridStyle: { type: Object, default: () => ({}) },
  editingCardId: { type: [Number, String], default: null },
  editingTitle: { type: String, default: '' },
  inlineNotesId: { type: [Number, String], default: null },
  inlineNotesText: { type: String, default: '' },
  dropTarget: { type: Object, default: null },
  dropPosition: { type: String, default: null },
  // Tasks-specific
  containerTitle: { type: String, default: '' },
  // Trash-specific
  trashedItems: { type: Array, default: () => [] }
})

const emit = defineEmits([
  // Common events
  'select', 'select-multiple', 'enter', 'toggle-complete', 'delete',
  'context-menu', 'update', 'go-parent',
  // TableView events
  'hover', 'toggle-expand', 'expand-all', 'collapse-all', 'move',
  'move-multiple', 'reorder', 'open-fullscreen',
  // CardsView events
  'add-child', 'create', 'show-tooltip', 'hide-tooltip',
  'drag-start', 'drag-end', 'drag-over', 'drag-leave', 'drop',
  'start-edit', 'save-edit', 'cancel-edit',
  'start-notes', 'save-notes', 'cancel-notes',
  'update:editing-title', 'update:inline-notes-text',
  // GraphView events
  'link', 'unlink', 'insert-between', 'wrap-with-parent',
  'delete-multiple', 'go-first-child', 'go-prev-sibling', 'go-next-sibling',
  // TasksView events
  'navigate',
  // TrashView events
  'empty-all', 'restore'
])

// Component refs exposed to parent
const graphViewRef = ref(null)
const tasksViewRef = ref(null)

// Convert Set to array for components that need arrays
const selectedIdsArray = computed(() => [...props.selectedIds])

defineExpose({
  graphViewRef,
  tasksViewRef,
  // Expose methods that parent might need
  updateGraph: () => graphViewRef.value?.updateGraph(),
  loadTasks: () => tasksViewRef.value?.loadTasks()
})
</script>

<template>
  <!-- Loading -->
  <div v-if="loading" class="loading">Loading...</div>

  <!-- Error -->
  <div v-else-if="error" class="error">{{ error }}</div>

  <!-- Table View -->
  <TableView
    v-else-if="viewMode === 'tree'"
    :nodes="sortedChildren"
    :selected-id="selectedNode?.id"
    :selected-ids="selectedIds"
    :expanded-ids="expandedIds"
    :hide-completed="hideCompleted"
    :hide-sensitive="hideSensitive"
    :show-detail="showDetail"
    :current-parent-id="currentContainerId"
    :current-container="currentContainer"
    :color-map="colorMap"
    :hover-preview-enabled="hoverPreviewEnabled"
    @hover="emit('hover', $event)"
    @select="emit('select', $event)"
    @select-multiple="emit('select-multiple', $event)"
    @enter="emit('enter', $event)"
    @toggle-complete="emit('toggle-complete', $event)"
    @toggle-expand="emit('toggle-expand', $event)"
    @expand-all="emit('expand-all')"
    @collapse-all="emit('collapse-all')"
    @delete="emit('delete', $event)"
    @move="emit('move', $event)"
    @move-multiple="emit('move-multiple', $event)"
    @reorder="emit('reorder', $event)"
    @go-parent="emit('go-parent')"
    @open-fullscreen="emit('open-fullscreen', $event)"
    @context-menu="emit('context-menu', $event)"
  />

  <!-- Cards View -->
  <CardsView
    v-else-if="viewMode === 'cards'"
    :nodes="filteredChildren"
    :selected-id="selectedNode?.id"
    :selected-ids="selectedIdsArray"
    :hide-completed="hideCompleted"
    :current-container-id="currentContainerId"
    :color-map="colorMap"
    :card-size-class="cardSizeClass"
    :grid-style="cardsGridStyle"
    :editing-card-id="editingCardId"
    :editing-title="editingTitle"
    :inline-notes-id="inlineNotesId"
    :inline-notes-text="inlineNotesText"
    :drag-over-node-id="dropTarget?.id"
    :drag-position="dropPosition"
    @select="emit('select', $event)"
    @select-multiple="emit('select-multiple', $event)"
    @enter="emit('enter', $event)"
    @toggle-complete="emit('toggle-complete', $event)"
    @delete="emit('delete', $event)"
    @add-child="(parentId, e) => emit('add-child', parentId, e)"
    @create="emit('create')"
    @context-menu="(e, node) => emit('context-menu', { event: e, node })"
    @show-tooltip="(e, node) => emit('show-tooltip', e, node)"
    @hide-tooltip="emit('hide-tooltip')"
    @drag-start="emit('drag-start', $event)"
    @drag-end="emit('drag-end')"
    @drag-over="emit('drag-over', $event)"
    @drag-leave="emit('drag-leave')"
    @drop="emit('drop', $event)"
    @start-edit="emit('start-edit', $event)"
    @save-edit="emit('save-edit', $event)"
    @cancel-edit="emit('cancel-edit')"
    @start-notes="emit('start-notes', $event)"
    @save-notes="emit('save-notes')"
    @cancel-notes="emit('cancel-notes')"
    @update:editing-title="emit('update:editing-title', $event)"
    @update:inline-notes-text="emit('update:inline-notes-text', $event)"
  />

  <!-- Graph View -->
  <GraphView
    v-else-if="viewMode === 'graph'"
    ref="graphViewRef"
    :nodes="sortedChildren"
    :parent="currentContainer"
    :selected-id="selectedNode?.id"
    :selected-ids="selectedIdsArray"
    :detail-threshold="graphDetailThreshold"
    :max-depth="effectiveGraphMaxDepth"
    :hide-completed="hideCompleted"
    :hide-sensitive="hideSensitive"
    :workspace="workspace"
    :workspaces="workspaces"
    :show-detail="showDetail"
    :fullscreen-detail-open="fullscreenDetail"
    :hover-preview-enabled="hoverPreviewEnabled"
    :sort-alphabetically="sortAlphabetically"
    @select="emit('select', $event)"
    @select-multiple="emit('select-multiple', $event)"
    @enter="emit('enter', $event)"
    @move="emit('move', $event)"
    @link="emit('link', $event)"
    @unlink="emit('unlink', $event)"
    @add-child="emit('add-child', $event)"
    @insert-between="emit('insert-between', $event)"
    @update="emit('update', $event)"
    @create="emit('create', $event)"
    @delete="emit('delete', $event)"
    @delete-multiple="emit('delete-multiple', $event)"
    @wrap-with-parent="emit('wrap-with-parent', $event)"
    @open-fullscreen="emit('open-fullscreen', $event)"
    @context-menu="emit('context-menu', $event)"
    @go-parent="emit('go-parent')"
    @go-first-child="emit('go-first-child')"
    @go-prev-sibling="emit('go-prev-sibling')"
    @go-next-sibling="emit('go-next-sibling')"
  />

  <!-- Timeline View -->
  <TimelineView
    v-else-if="viewMode === 'timeline'"
    :nodes="sortedChildren"
    :selected-id="selectedNode?.id"
    :hide-completed="hideCompleted"
    :color-map="colorMap"
    @select="emit('select', $event)"
    @enter="emit('enter', $event)"
    @show-tooltip="(e, node) => emit('show-tooltip', e, node)"
    @hide-tooltip="emit('hide-tooltip')"
    @context-menu="emit('context-menu', $event)"
    @update="emit('update', $event)"
  />

  <!-- Calendar View -->
  <CalendarView
    v-else-if="viewMode === 'calendar'"
    :nodes="sortedChildren"
    :selected-id="selectedNode?.id"
    :hide-completed="hideCompleted"
    :color-map="colorMap"
    @select="emit('select', $event)"
    @enter="emit('enter', $event)"
    @show-tooltip="(e, node) => emit('show-tooltip', e, node)"
    @hide-tooltip="emit('hide-tooltip')"
    @context-menu="emit('context-menu', $event)"
    @update="emit('update', $event)"
  />

  <!-- Persons View -->
  <PersonsView
    v-else-if="viewMode === 'persons'"
    :selected-id="selectedNode?.id"
    :hide-completed="hideCompleted"
    :workspace-id="workspace"
    @select="emit('select', $event)"
    @delete="emit('delete', $event)"
    @context-menu="emit('context-menu', $event)"
  />

  <!-- Tasks View -->
  <TasksView
    v-else-if="viewMode === 'tasks'"
    ref="tasksViewRef"
    :workspace-id="workspace"
    :hide-sensitive="hideSensitive"
    :container-id="currentContainerId"
    :container-title="containerTitle"
    @navigate="emit('navigate', $event)"
    @toggle-complete="emit('toggle-complete', $event)"
  />

  <!-- Trash View -->
  <TrashView
    v-else-if="viewMode === 'trash'"
    :items="trashedItems"
    @empty-all="emit('empty-all')"
    @restore="emit('restore', $event)"
    @delete="emit('delete', $event)"
  />
</template>

<style scoped>
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary);
}

.error {
  color: #e07d7d;
  padding: var(--spacing-lg);
  text-align: center;
}
</style>
