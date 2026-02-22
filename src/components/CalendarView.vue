<script setup>
import { computed, ref } from 'vue'
import { getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false },
  colorMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['select', 'enter', 'show-tooltip', 'hide-tooltip', 'context-menu', 'add-child', 'delete', 'update'])

// Current month being viewed
const currentDate = ref(new Date())

const currentYear = computed(() => currentDate.value.getFullYear())
const currentMonth = computed(() => currentDate.value.getMonth())

const monthName = computed(() => {
  return currentDate.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
})

// Navigate months
function prevMonth() {
  const d = new Date(currentDate.value)
  d.setMonth(d.getMonth() - 1)
  currentDate.value = d
}

function nextMonth() {
  const d = new Date(currentDate.value)
  d.setMonth(d.getMonth() + 1)
  currentDate.value = d
}

function goToToday() {
  currentDate.value = new Date()
}

// Get all days in the current month view (including padding from prev/next months)
const calendarDays = computed(() => {
  const year = currentYear.value
  const month = currentMonth.value

  // First day of the month
  const firstDay = new Date(year, month, 1)
  // Last day of the month
  const lastDay = new Date(year, month + 1, 0)

  // Start from Sunday of the week containing the first day
  const startDate = new Date(firstDay)
  startDate.setDate(startDate.getDate() - firstDay.getDay())

  // End on Saturday of the week containing the last day
  const endDate = new Date(lastDay)
  endDate.setDate(endDate.getDate() + (6 - lastDay.getDay()))

  const days = []
  const current = new Date(startDate)

  while (current <= endDate) {
    days.push({
      date: new Date(current),
      dateStr: current.toISOString().split('T')[0],
      day: current.getDate(),
      isCurrentMonth: current.getMonth() === month,
      isToday: isSameDay(current, new Date()),
      isWeekend: current.getDay() === 0 || current.getDay() === 6
    })
    current.setDate(current.getDate() + 1)
  }

  return days
})

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate()
}

// Flatten nodes and get those with dates
const nodesWithDates = computed(() => {
  const result = []

  function flatten(nodeList) {
    for (const node of nodeList) {
      if (props.hideCompleted && (node.completed || node.inheritedCompleted)) {
        continue
      }

      const date = node.due_date || node.start_date || node.end_date
      if (date) {
        result.push({
          ...node,
          displayDate: date.split('T')[0],
          endDate: (node.end_date || node.due_date || node.start_date)?.split('T')[0]
        })
      }

      if (node.children?.length) {
        flatten(node.children)
      }
    }
  }

  flatten(props.nodes)
  return result
})

// Group nodes by date
const nodesByDate = computed(() => {
  const map = {}
  for (const node of nodesWithDates.value) {
    // For multi-day events, add to each day
    const start = new Date(node.displayDate)
    const end = new Date(node.endDate || node.displayDate)

    const current = new Date(start)
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0]
      if (!map[dateStr]) map[dateStr] = []
      map[dateStr].push(node)
      current.setDate(current.getDate() + 1)
    }
  }
  return map
})

function getNodesForDate(dateStr) {
  return nodesByDate.value[dateStr] || []
}

function getTypeColor(type) {
  const colors = getTypeColors(type)
  return colors.text
}

function getItemStyle(node) {
  const nodeColor = props.colorMap[node.id]
  const typeColor = getTypeColor(node.type)

  if (nodeColor) {
    return {
      background: `linear-gradient(135deg, ${nodeColor}dd 0%, ${nodeColor}aa 100%)`,
      borderLeft: `3px solid ${typeColor}`
    }
  }

  return {
    background: `linear-gradient(135deg, ${typeColor}dd 0%, ${typeColor}99 100%)`,
    borderLeft: `3px solid ${typeColor}`
  }
}

function handleNodeClick(e, node) {
  e.stopPropagation()
  emit('select', node)
}

function handleDayClick(day) {
  // Could be used to create new item on this date
}

function handleContextMenu(e, node) {
  e.preventDefault()
  emit('context-menu', { event: e, node })
}

// Drag and drop support
const draggedNode = ref(null)

function handleDragStart(e, node) {
  draggedNode.value = node
  e.dataTransfer.effectAllowed = 'move'
}

function handleDragOver(e, day) {
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
}

function handleDrop(e, day) {
  e.preventDefault()
  if (draggedNode.value) {
    const node = draggedNode.value
    const newDate = day.dateStr

    // Update the appropriate date field
    const updates = { id: node.id }
    if (node.due_date) {
      updates.due_date = newDate
    } else if (node.start_date) {
      // Calculate duration and shift both dates
      const oldStart = new Date(node.start_date)
      const oldEnd = new Date(node.end_date || node.start_date)
      const duration = Math.round((oldEnd - oldStart) / (1000 * 60 * 60 * 24))

      const newStart = new Date(newDate)
      const newEnd = new Date(newStart)
      newEnd.setDate(newEnd.getDate() + duration)

      updates.start_date = newDate
      updates.end_date = newEnd.toISOString().split('T')[0]
    } else {
      updates.due_date = newDate
    }

    emit('update', updates)
    draggedNode.value = null
  }
}

function handleDragEnd() {
  draggedNode.value = null
}
</script>

<template>
  <div class="calendar-view">
    <!-- Header with navigation -->
    <div class="calendar-header">
      <button class="nav-btn" @click="prevMonth" title="Previous month">&lt;</button>
      <h2 class="month-title" @click="goToToday">{{ monthName }}</h2>
      <button class="nav-btn" @click="nextMonth" title="Next month">&gt;</button>
      <button class="today-btn" @click="goToToday">Today</button>
    </div>

    <!-- Day names header -->
    <div class="weekday-header">
      <div class="weekday" v-for="day in ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']" :key="day">
        {{ day }}
      </div>
    </div>

    <!-- Calendar grid -->
    <div class="calendar-grid">
      <div
        v-for="day in calendarDays"
        :key="day.dateStr"
        class="calendar-day"
        :class="{
          'other-month': !day.isCurrentMonth,
          'today': day.isToday,
          'weekend': day.isWeekend
        }"
        @click="handleDayClick(day)"
        @dragover="handleDragOver($event, day)"
        @drop="handleDrop($event, day)"
      >
        <div class="day-number">{{ day.day }}</div>
        <div class="day-items">
          <div
            v-for="node in getNodesForDate(day.dateStr).slice(0, 3)"
            :key="node.id"
            class="calendar-item"
            :class="{ selected: selectedId === node.id, completed: node.completed }"
            :style="getItemStyle(node)"
            draggable="true"
            @click="handleNodeClick($event, node)"
            @dblclick.stop="emit('enter', node)"
            @contextmenu="handleContextMenu($event, node)"
            @mouseenter="emit('show-tooltip', $event, node)"
            @mouseleave="emit('hide-tooltip')"
            @dragstart="handleDragStart($event, node)"
            @dragend="handleDragEnd"
          >
            <span class="item-title">{{ node.title }}</span>
          </div>
          <div
            v-if="getNodesForDate(day.dateStr).length > 3"
            class="more-items"
          >
            +{{ getNodesForDate(day.dateStr).length - 3 }} more
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.calendar-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  overflow: hidden;
}

.calendar-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.month-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  cursor: pointer;
  min-width: 180px;
  text-align: center;
}

.month-title:hover {
  color: var(--accent-color);
}

.nav-btn {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-btn:hover {
  background: var(--bg-hover);
}

.today-btn {
  margin-left: auto;
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
}

.today-btn:hover {
  background: var(--bg-hover);
}

.weekday-header {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 1px;
  margin-bottom: 8px;
}

.weekday {
  text-align: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  padding: 8px 0;
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 1px;
  flex: 1;
  min-height: 0;
  background: var(--border-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.calendar-day {
  background: var(--bg-primary);
  padding: 4px;
  min-height: 80px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.calendar-day.other-month {
  background: var(--bg-secondary);
}

.calendar-day.other-month .day-number {
  color: var(--text-tertiary);
}

.calendar-day.weekend {
  background: color-mix(in srgb, var(--bg-primary) 95%, #ef4444 5%);
}

.calendar-day.today {
  background: var(--accent-subtle);
}

.calendar-day.today .day-number {
  background: var(--accent-color);
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.day-number {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.day-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.calendar-item {
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.7rem;
  color: white;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: filter 0.15s, transform 0.1s;
}

.calendar-item:hover {
  filter: brightness(1.15);
  transform: scale(1.02);
}

.calendar-item.selected {
  outline: 2px solid var(--accent-color);
  outline-offset: 1px;
}

.calendar-item.completed {
  opacity: 0.5;
  text-decoration: line-through;
}

.item-title {
  pointer-events: none;
}

.more-items {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  padding: 2px 4px;
}
</style>
