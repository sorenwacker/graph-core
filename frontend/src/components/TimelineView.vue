<script setup>
import { computed } from 'vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number
})

const emit = defineEmits(['select', 'enter'])

// Flatten nodes and filter those with dates
const timelineNodes = computed(() => {
  const result = []

  function flatten(nodeList) {
    for (const node of nodeList) {
      if (node.start_date || node.end_date || node.due_date) {
        result.push({
          ...node,
          displayDate: node.start_date || node.due_date || node.end_date,
          endDisplayDate: node.end_date || node.due_date || node.start_date
        })
      }
      if (node.children?.length) {
        flatten(node.children)
      }
    }
  }

  flatten(props.nodes)

  // Sort by date
  return result.sort((a, b) => {
    const dateA = a.displayDate || ''
    const dateB = b.displayDate || ''
    return dateA.localeCompare(dateB)
  })
})

// Get date range
const dateRange = computed(() => {
  if (timelineNodes.value.length === 0) return { start: null, end: null, days: 0 }

  const dates = timelineNodes.value.flatMap(n => [n.displayDate, n.endDisplayDate].filter(Boolean))
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)

  const start = new Date(minDate)
  const end = new Date(maxDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return { start: minDate, end: maxDate, days: Math.max(days, 1) }
})

// Generate month markers
const months = computed(() => {
  if (!dateRange.value.start) return []

  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  let current = new Date(start.getFullYear(), start.getMonth(), 1)
  while (current <= end) {
    const position = getDatePosition(current.toISOString().split('T')[0])
    result.push({
      label: current.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      position
    })
    current.setMonth(current.getMonth() + 1)
  }

  return result
})

function getDatePosition(dateStr) {
  if (!dateRange.value.start || !dateStr) return 0

  const start = new Date(dateRange.value.start)
  const date = new Date(dateStr)
  const days = Math.ceil((date - start) / (1000 * 60 * 60 * 24))

  return (days / dateRange.value.days) * 100
}

function getNodeWidth(node) {
  if (!node.displayDate || !node.endDisplayDate) return 2

  const start = new Date(node.displayDate)
  const end = new Date(node.endDisplayDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return Math.max((days / dateRange.value.days) * 100, 2)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getTypeColor(type) {
  const colors = {
    project: '#1a4d7a',
    todo: '#5a5a2a',
    note: '#2a5a2a',
    milestone: '#5a2a5a',
    topic: '#2a5a5a',
    folder: '#4a4a4a',
    person: '#4a2a1a'
  }
  return colors[type] || colors.task
}
</script>

<template>
  <div class="timeline-view">
    <div v-if="timelineNodes.length === 0" class="empty-state">
      <p>No items with dates</p>
      <p class="hint">Add start_date, end_date, or due_date to nodes to see them on the timeline</p>
    </div>

    <template v-else>
      <!-- Month markers -->
      <div class="timeline-header">
        <div
          v-for="month in months"
          :key="month.label"
          class="month-marker"
          :style="{ left: month.position + '%' }"
        >
          {{ month.label }}
        </div>
      </div>

      <!-- Timeline tracks -->
      <div class="timeline-body">
        <div class="timeline-grid">
          <div
            v-for="month in months"
            :key="'grid-' + month.label"
            class="grid-line"
            :style="{ left: month.position + '%' }"
          ></div>
        </div>

        <div
          v-for="(node, index) in timelineNodes"
          :key="node.id"
          class="timeline-row"
        >
          <div class="row-label" @click="emit('select', node)">
            <span class="type-badge" :class="node.type">{{ node.type[0].toUpperCase() }}</span>
            <span class="node-title">{{ node.title }}</span>
          </div>
          <div class="row-track">
            <div
              class="timeline-bar"
              :class="{ selected: selectedId === node.id, completed: node.completed }"
              :style="{
                left: getDatePosition(node.displayDate) + '%',
                width: getNodeWidth(node) + '%',
                backgroundColor: getTypeColor(node.type)
              }"
              @click="emit('select', node)"
              @dblclick="emit('enter', node)"
              :title="`${node.title}\n${formatDate(node.displayDate)} - ${formatDate(node.endDisplayDate)}`"
            >
              <span class="bar-label">{{ node.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.timeline-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
}

.empty-state .hint {
  font-size: 0.8rem;
  margin-top: 8px;
}

.timeline-header {
  position: relative;
  height: 30px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.month-marker {
  position: absolute;
  font-size: 0.75rem;
  color: var(--text-secondary);
  padding: 8px 4px;
  white-space: nowrap;
}

.timeline-body {
  flex: 1;
  overflow-y: auto;
  position: relative;
}

.timeline-grid {
  position: absolute;
  top: 0;
  left: 200px;
  right: 0;
  bottom: 0;
  pointer-events: none;
}

.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border-color);
  opacity: 0.5;
}

.timeline-row {
  display: flex;
  height: 36px;
  border-bottom: 1px solid var(--border-color);
}

.timeline-row:hover {
  background: var(--bg-hover);
}

.row-label {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  cursor: pointer;
  overflow: hidden;
}

.node-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.85rem;
}

.row-track {
  flex: 1;
  position: relative;
}

.timeline-bar {
  position: absolute;
  top: 6px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 8px;
  min-width: 20px;
  transition: opacity 0.15s;
}

.timeline-bar:hover {
  opacity: 0.8;
}

.timeline-bar.selected {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.timeline-bar.completed {
  opacity: 0.5;
}

.bar-label {
  color: white;
  font-size: 0.7rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.type-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  flex-shrink: 0;
}

.type-badge.project { background: #1a4d7a; color: #7db3e0; }
.type-badge.task { background: #4a4a1a; color: #e0e07d; }
.type-badge.note { background: #1a4a1a; color: #7de07d; }
.type-badge.milestone { background: #4a1a4a; color: #e07de0; }
.type-badge.topic { background: #1a4a4a; color: #7de0e0; }
.type-badge.folder { background: #3a3a3a; color: #aaa; }
.type-badge.person { background: #4a2a1a; color: #e0a07d; }
</style>
