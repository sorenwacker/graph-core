<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import tippy from 'tippy.js'
import { useFiltersStore } from '../stores/filters.js'
import { DEFAULT_VISIBLE_TYPES } from '../composables/useGraphSettings'

const filtersStore = useFiltersStore()

const dropdownRef = ref(null)
const buttonRef = ref(null)
const showDropdown = ref(false)

// Type display configuration
const typeConfig = {
  task: { label: 'Tasks', color: 'var(--type-task-text)' },
  note: { label: 'Notes', color: 'var(--type-note-text)' },
  project: { label: 'Projects', color: 'var(--type-project-text)' },
  milestone: { label: 'Milestones', color: 'var(--type-milestone-text)' },
  topic: { label: 'Topics', color: 'var(--type-topic-text)' },
  component: { label: 'Components', color: 'var(--type-component-text)' },
  group: { label: 'Groups', color: 'var(--type-group-text)' },
  event: { label: 'Events', color: 'var(--type-event-text)' },
  person: { label: 'People', color: 'var(--type-person-text)' },
  organization: { label: 'Organizations', color: 'var(--type-org-text)' },
}

const availableTypes = computed(() => {
  return DEFAULT_VISIBLE_TYPES.map(type => ({
    type,
    ...typeConfig[type],
    visible: filtersStore.visibleTypes.includes(type),
  }))
})

const buttonLabel = computed(() => {
  if (!filtersStore.hasTypeFilter) return 'All types'
  const hidden = filtersStore.hiddenTypesCount
  return `${filtersStore.visibleTypes.length} types`
})

const isActive = computed(() => filtersStore.hasTypeFilter)

function toggleType(type) {
  filtersStore.toggleType(type)
}

function showAll() {
  filtersStore.showAllTypes()
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

function closeDropdown(e) {
  if (dropdownRef.value && !dropdownRef.value.contains(e.target)) {
    showDropdown.value = false
  }
}

let tippyInstance = null

onMounted(() => {
  document.addEventListener('click', closeDropdown)
  if (buttonRef.value) {
    tippyInstance = tippy(buttonRef.value, {
      content: 'Filter by node type',
      placement: 'bottom',
      delay: [200, 0],
      duration: [150, 100],
      theme: 'toolbar',
    })
  }
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
  if (tippyInstance) tippyInstance.destroy()
})
</script>

<template>
  <div ref="dropdownRef" class="type-filter-dropdown">
    <button
      ref="buttonRef"
      class="filter-btn"
      :class="{ active: isActive }"
      @click.stop="toggleDropdown"
      aria-label="Filter by type"
      :aria-expanded="showDropdown"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
      </svg>
      <span class="filter-label">{{ buttonLabel }}</span>
    </button>

    <div v-if="showDropdown" class="dropdown-menu">
      <div class="dropdown-header">
        <span>Show types</span>
        <button v-if="isActive" class="reset-btn" @click="showAll">Show all</button>
      </div>
      <div class="type-list">
        <label v-for="item in availableTypes" :key="item.type" class="type-item">
          <input type="checkbox" :checked="item.visible" @change="toggleType(item.type)" />
          <span class="type-indicator" :style="{ background: item.color }"></span>
          <span class="type-label">{{ item.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<style scoped>
.type-filter-dropdown {
  position: relative;
}

.filter-btn {
  height: 28px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.filter-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.filter-btn.active {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.filter-label {
  font-size: 0.75rem;
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 180px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.reset-btn {
  padding: 2px 6px;
  font-size: 0.7rem;
  background: var(--bg-tertiary);
  border: none;
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  text-transform: none;
  letter-spacing: normal;
  font-weight: normal;
}

.reset-btn:hover {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.type-list {
  padding: 4px 0;
  max-height: 300px;
  overflow-y: auto;
}

.type-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.type-item:hover {
  background: var(--bg-hover);
}

.type-item input[type='checkbox'] {
  width: 14px;
  height: 14px;
  accent-color: var(--accent-color);
  cursor: pointer;
}

.type-indicator {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.type-label {
  font-size: 0.85rem;
  color: var(--text-primary);
}
</style>
