<script setup>
import { computed, ref, onMounted, watch, nextTick } from 'vue'
import { getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false },
  colorMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['select', 'enter', 'show-tooltip', 'hide-tooltip', 'context-menu', 'add-child', 'delete'])

// Context menu handler
function handleContextMenu(e, node) {
  e.preventDefault()
  emit('context-menu', { event: e, node })
}

// Click handler with modifier support
function handleNodeClick(e, node) {
  const hasCmd = e.metaKey || e.ctrlKey
  const hasAlt = e.altKey

  if (hasCmd && hasAlt) {
    emit('delete', node.id)
  } else if (hasCmd) {
    emit('add-child', { parentId: node.id, title: '', prompt: true })
  } else {
    emit('select', node)
  }
}

// Zoom level: pixels per day (higher = more zoomed in)
const zoomLevel = ref(20)
const minZoom = 5
const maxZoom = 100

// Throttle zoom to reduce sensitivity and flickering
let lastZoomTime = 0
const zoomThrottle = 50 // ms between zoom steps
let pendingScrollUpdate = null

function handleWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const now = Date.now()
    if (now - lastZoomTime < zoomThrottle) return
    lastZoomTime = now

    const container = scrollableRef.value
    if (!container) return

    // Get mouse position relative to the scrollable content
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left + container.scrollLeft

    // Calculate the position ratio (where mouse is pointing)
    const oldWidth = timelineWidth.value
    const positionRatio = oldWidth > 0 ? mouseX / oldWidth : 0

    // Calculate new zoom level
    const oldZoom = zoomLevel.value
    let newZoom
    if (e.deltaY < 0) {
      newZoom = Math.min(maxZoom, oldZoom * 1.08)
    } else {
      newZoom = Math.max(minZoom, oldZoom / 1.08)
    }

    // Skip if no change
    if (newZoom === oldZoom) return

    // Cancel pending scroll update
    if (pendingScrollUpdate) {
      cancelAnimationFrame(pendingScrollUpdate)
    }

    // Update zoom
    zoomLevel.value = newZoom

    // Schedule scroll update for next frame to avoid flicker
    pendingScrollUpdate = requestAnimationFrame(() => {
      const newWidth = dateRange.value.days * newZoom
      const newMouseX = positionRatio * newWidth
      const newScrollLeft = newMouseX - (e.clientX - rect.left)
      container.scrollLeft = Math.max(0, newScrollLeft)
      pendingScrollUpdate = null
    })
  }
}

// Button zoom functions
function zoomIn() {
  const now = Date.now()
  if (now - lastZoomTime < zoomThrottle) return
  lastZoomTime = now
  zoomLevel.value = Math.min(maxZoom, zoomLevel.value * 1.25)
}

function zoomOut() {
  const now = Date.now()
  if (now - lastZoomTime < zoomThrottle) return
  lastZoomTime = now
  zoomLevel.value = Math.max(minZoom, zoomLevel.value / 1.25)
}

// Calculate timeline width based on zoom
const timelineWidth = computed(() => {
  return dateRange.value.days * zoomLevel.value
})

// Flatten nodes and filter those with dates, keeping depth for indentation
const timelineNodes = computed(() => {
  const result = []

  function hasDate(node) {
    return !!(node.start_date || node.end_date || node.due_date)
  }

  function flatten(nodeList, depth = 0) {
    for (const node of nodeList) {
      // Skip completed items if hideCompleted is true
      if (props.hideCompleted && (node.completed || node.inheritedCompleted)) {
        continue
      }
      // Only include nodes that actually have dates
      if (hasDate(node)) {
        // Use created_at as start date if no explicit start_date but has due_date
        const startFallback = node.due_date && node.created_at ? node.created_at.split('T')[0] : null
        const displayDate = node.start_date || startFallback || node.due_date || node.end_date
        const endDisplayDate = node.end_date || node.due_date || node.start_date || startFallback
        // Double check we have valid dates
        if (displayDate) {
          result.push({
            ...node,
            depth,
            displayDate,
            endDisplayDate
          })
        }
      }
      if (node.children?.length) {
        flatten(node.children, depth + 1)
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

// Get date range - extends from earliest date to 1 year in future
const dateRange = computed(() => {
  if (timelineNodes.value.length === 0) return { start: null, end: null, days: 0 }

  const dates = timelineNodes.value.flatMap(n => [n.displayDate, n.endDisplayDate].filter(Boolean))
  const minDate = dates.reduce((a, b) => a < b ? a : b)
  const maxDate = dates.reduce((a, b) => a > b ? a : b)

  // Start from earliest date or 3 months ago, whichever is earlier
  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const startDate = new Date(minDate) < threeMonthsAgo ? minDate : threeMonthsAgo.toISOString().split('T')[0]

  // End at latest date or 1 year from now, whichever is later
  const oneYearFromNow = new Date()
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1)
  const endDate = new Date(maxDate) > oneYearFromNow ? maxDate : oneYearFromNow.toISOString().split('T')[0]

  const start = new Date(startDate)
  const end = new Date(endDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return { start: startDate, end: endDate, days: Math.max(days, 1) }
})

// Generate year markers
const years = computed(() => {
  if (!dateRange.value.start) return []
  const zoom = zoomLevel.value // explicit dependency
  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  let current = new Date(start.getFullYear(), 0, 1)
  if (current < start) current.setFullYear(current.getFullYear() + 1)

  while (current <= end) {
    result.push({
      label: current.getFullYear().toString(),
      position: getDatePosition(current.toISOString().split('T')[0])
    })
    current.setFullYear(current.getFullYear() + 1)
  }
  return result
})

// Generate month markers
const months = computed(() => {
  if (!dateRange.value.start) return []
  const zoom = zoomLevel.value // explicit dependency

  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  let current = new Date(start.getFullYear(), start.getMonth(), 1)
  while (current <= end) {
    const position = getDatePosition(current.toISOString().split('T')[0])
    result.push({
      label: current.toLocaleDateString('en-US', { month: 'short' }),
      position
    })
    current.setMonth(current.getMonth() + 1)
  }

  return result
})

// Generate week markers (Mondays)
const weeks = computed(() => {
  const zoom = zoomLevel.value // explicit dependency
  if (!dateRange.value.start || zoom < 10) return []
  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  // Find first Monday
  let current = new Date(start)
  const day = current.getDay()
  const daysUntilMonday = day === 0 ? 1 : (8 - day) % 7
  current.setDate(current.getDate() + daysUntilMonday)

  while (current <= end) {
    result.push({
      position: getDatePosition(current.toISOString().split('T')[0])
    })
    current.setDate(current.getDate() + 7)
  }
  return result
})

// Generate day markers (show at lower zoom levels)
const days = computed(() => {
  const zoom = zoomLevel.value // explicit dependency
  if (!dateRange.value.start || zoom < 8) return []
  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  let current = new Date(start)
  while (current <= end) {
    const dayOfWeek = current.getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    const isFirst = current.getDate() === 1
    result.push({
      label: current.getDate().toString(),
      position: getDatePosition(current.toISOString().split('T')[0]),
      isWeekend,
      isFirst
    })
    current.setDate(current.getDate() + 1)
  }
  return result
})

// Generate weekend ranges for shading
const weekends = computed(() => {
  const zoom = zoomLevel.value // explicit dependency
  if (!dateRange.value.start || zoom < 8) return []
  const result = []
  const start = new Date(dateRange.value.start)
  const end = new Date(dateRange.value.end)

  let current = new Date(start)
  // Find first Saturday
  while (current.getDay() !== 6 && current <= end) {
    current.setDate(current.getDate() + 1)
  }

  while (current <= end) {
    const saturdayPos = getDatePosition(current.toISOString().split('T')[0])
    result.push({
      position: saturdayPos,
      width: zoom * 2 // 2 days (Sat + Sun)
    })
    current.setDate(current.getDate() + 7)
  }
  return result
})

function getDatePosition(dateStr) {
  if (!dateRange.value.start || !dateStr) return 0

  const start = new Date(dateRange.value.start)
  const date = new Date(dateStr)
  const days = Math.ceil((date - start) / (1000 * 60 * 60 * 24))

  return days * zoomLevel.value
}

function getNodeWidth(node) {
  if (!node.displayDate || !node.endDisplayDate) return 20

  const start = new Date(node.displayDate)
  const end = new Date(node.endDisplayDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return Math.max(days * zoomLevel.value, 20)
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getTypeColor(type) {
  const colors = getTypeColors(type)
  return colors.text
}

function getBarStyle(node) {
  const left = getDatePosition(node.displayDate) + 'px'
  const width = getNodeWidth(node) + 'px'
  const nodeColor = props.colorMap[node.id]
  const typeColor = getTypeColor(node.type)

  if (nodeColor) {
    // Use custom color gradient like cards
    return {
      left,
      width,
      background: `linear-gradient(135deg, ${nodeColor}88 0%, ${nodeColor}55 100%)`,
      borderLeft: `3px solid ${typeColor}`
    }
  }

  // Use subtle background with type border
  return {
    left,
    width,
    background: `linear-gradient(135deg, ${typeColor}55 0%, ${typeColor}33 100%)`,
    borderLeft: `3px solid ${typeColor}`
  }
}

// Today marker position
const todayPosition = computed(() => {
  if (!dateRange.value.start) return null
  const today = new Date().toISOString().split('T')[0]
  const pos = getDatePosition(today)
  // Only show if today is within the date range
  if (pos < 0 || pos > timelineWidth.value) return null
  return pos
})

// Refs for scrollable containers
const scrollableRef = ref(null)
const labelsRef = ref(null)

// Sync vertical scroll between labels and timeline
function syncScroll(source) {
  if (!scrollableRef.value || !labelsRef.value) return
  if (source === 'timeline') {
    labelsRef.value.scrollTop = scrollableRef.value.scrollTop
  } else {
    scrollableRef.value.scrollTop = labelsRef.value.scrollTop
  }
}

// Scroll to today on mount
function scrollToToday() {
  if (todayPosition.value !== null && scrollableRef.value) {
    nextTick(() => {
      const container = scrollableRef.value
      if (container) {
        // Center today in the view
        const scrollLeft = todayPosition.value - container.clientWidth / 3
        container.scrollLeft = Math.max(0, scrollLeft)
      }
    })
  }
}

onMounted(() => {
  scrollToToday()
})

watch(() => props.nodes, () => {
  nextTick(scrollToToday)
})
</script>

<template>
  <div class="timeline-view" @wheel="handleWheel">
    <div v-if="timelineNodes.length === 0" class="empty-state">
      <p>No items with dates</p>
      <p class="hint">Add start_date, end_date, or due_date to nodes to see them on the timeline</p>
    </div>

    <template v-else>
      <!-- Zoom controls -->
      <div class="timeline-controls">
        <button class="zoom-btn" @click="zoomOut" title="Zoom out">-</button>
        <span class="zoom-label">{{ Math.round(zoomLevel) }}px/day</span>
        <button class="zoom-btn" @click="zoomIn" title="Zoom in">+</button>
        <span class="zoom-hint">Ctrl+scroll to zoom</span>
      </div>

      <!-- Scrollable timeline container -->
      <div class="timeline-scroll-container">
        <!-- Fixed row labels column -->
        <div ref="labelsRef" class="timeline-labels" @scroll="syncScroll('labels')">
          <div class="label-header">Items</div>
          <div class="labels-body">
            <div
              v-for="node in timelineNodes"
              :key="'label-' + node.id"
              class="row-label"
              :class="{ selected: selectedId === node.id }"
              @click="handleNodeClick($event, node)"
              @mouseenter="emit('show-tooltip', $event, node)"
              @mouseleave="emit('hide-tooltip')"
              @contextmenu.prevent="handleContextMenu($event, node)"
            >
              <span class="tree-indent" :style="{ width: (node.depth * 5) + 'px' }"></span>
              <span v-if="node.type === 'person'" class="type-badge person" v-html="personIconSvg"></span>
              <span v-else class="type-badge" :class="node.type" v-html="getTypeIcon(node.type)"></span>
              <span class="node-title">{{ node.title }}</span>
            </div>
          </div>
        </div>

        <!-- Scrollable timeline area -->
        <div ref="scrollableRef" class="timeline-scrollable" @scroll="syncScroll('timeline')">
          <!-- Time scale header -->
          <div class="timeline-header" :style="{ width: timelineWidth + 'px' }">
            <!-- Year markers -->
            <div
              v-for="year in years"
              :key="'year-' + year.label"
              class="year-marker"
              :style="{ left: year.position + 'px' }"
            >
              {{ year.label }}
            </div>
            <!-- Month markers -->
            <div
              v-for="(month, idx) in months"
              :key="'month-' + idx"
              class="month-marker"
              :style="{ left: month.position + 'px' }"
            >
              {{ month.label }}
            </div>
            <!-- Day markers (when zoomed in) -->
            <div
              v-for="(day, idx) in days"
              :key="'day-' + idx"
              class="day-marker"
              :class="{ weekend: day.isWeekend }"
              :style="{ left: day.position + 'px' }"
            >
              {{ day.label }}
            </div>
          </div>

          <!-- Timeline tracks -->
          <div class="timeline-body" :style="{ width: timelineWidth + 'px' }">
            <div class="timeline-grid">
              <!-- Weekend shading -->
              <div
                v-for="(weekend, idx) in weekends"
                :key="'weekend-' + idx"
                class="weekend-shade"
                :style="{ left: weekend.position + 'px', width: weekend.width + 'px' }"
              ></div>
              <!-- Year lines -->
              <div
                v-for="year in years"
                :key="'yeargrid-' + year.label"
                class="grid-line year-line"
                :style="{ left: year.position + 'px' }"
              ></div>
              <!-- Month lines -->
              <div
                v-for="(month, idx) in months"
                :key="'monthgrid-' + idx"
                class="grid-line month-line"
                :style="{ left: month.position + 'px' }"
              ></div>
              <!-- Week lines -->
              <div
                v-for="(week, idx) in weeks"
                :key="'weekgrid-' + idx"
                class="grid-line week-line"
                :style="{ left: week.position + 'px' }"
              ></div>
              <!-- Day lines -->
              <div
                v-for="(day, idx) in days"
                :key="'daygrid-' + idx"
                class="grid-line day-line"
                :class="{ weekend: day.isWeekend }"
                :style="{ left: day.position + 'px' }"
              ></div>
              <!-- Today marker -->
              <div
                v-if="todayPosition !== null"
                class="today-marker"
                :style="{ left: todayPosition + 'px' }"
              >
                <span class="today-label">Today</span>
              </div>
            </div>

            <div class="rows-body">
              <div
                v-for="node in timelineNodes"
                :key="node.id"
                class="timeline-row"
              >
                <div class="row-track">
                  <div
                    class="timeline-bar"
                    :class="{ selected: selectedId === node.id, completed: node.completed }"
                    :style="getBarStyle(node)"
                    @click="handleNodeClick($event, node)"
                    @dblclick="emit('enter', node)"
                    @mouseenter="emit('show-tooltip', $event, node)"
                    @mouseleave="emit('hide-tooltip')"
                    @contextmenu.prevent="handleContextMenu($event, node)"
                  >
                    <span class="bar-label">{{ node.title }}</span>
                  </div>
                </div>
              </div>
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
  min-height: 0;
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

/* Zoom controls */
.timeline-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.zoom-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-primary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  font-weight: bold;
}

.zoom-btn:hover {
  background: var(--bg-hover);
}

.zoom-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  min-width: 70px;
  text-align: center;
}

.zoom-hint {
  font-size: 0.7rem;
  color: var(--text-tertiary);
  margin-left: auto;
}

/* Scroll container with fixed labels */
.timeline-scroll-container {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.timeline-labels {
  width: 200px;
  flex-shrink: 0;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.labels-body {
  /* Just a container for fixed-height row labels */
}

.label-header {
  position: sticky;
  top: 0;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-secondary);
  z-index: 1;
}

.timeline-scrollable {
  flex: 1;
  overflow: auto;
  min-height: 0;
  contain: layout;
}

.timeline-header {
  position: sticky;
  top: 0;
  height: 44px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  z-index: 1;
  min-width: 100%;
  contain: layout style;
}

.year-marker {
  position: absolute;
  top: 2px;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--text-primary);
  padding: 0 4px;
  white-space: nowrap;
  will-change: left;
}

.month-marker {
  position: absolute;
  top: 16px;
  font-size: 0.65rem;
  font-weight: 500;
  color: var(--text-secondary);
  padding: 0 4px;
  white-space: nowrap;
  will-change: left;
}

.day-marker {
  position: absolute;
  top: 30px;
  font-size: 0.55rem;
  color: var(--text-tertiary);
  padding: 0 2px;
  white-space: nowrap;
  will-change: left;
}

.day-marker.weekend {
  color: #ef4444;
  opacity: 0.7;
}

.timeline-body {
  position: relative;
  min-width: 100%;
  contain: layout style;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.rows-body {
  /* Just a container for fixed-height timeline rows */
}

.timeline-grid {
  position: absolute;
  top: 0;
  left: 0;
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
  will-change: left;
  transform: translateZ(0);
}

.grid-line.year-line {
  width: 2px;
  background: var(--text-tertiary);
  opacity: 0.5;
}

.grid-line.month-line {
  opacity: 0.4;
}

.grid-line.week-line {
  opacity: 0.2;
  background: var(--text-muted);
}

.grid-line.day-line {
  opacity: 0.1;
  background: var(--text-muted);
}

.grid-line.day-line.weekend {
  opacity: 0.15;
  background: #ef4444;
}

.weekend-shade {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(239, 68, 68, 0.05);
  pointer-events: none;
  will-change: left, width;
}

.today-marker {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ef4444;
  z-index: 2;
  will-change: left;
}

.today-label {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.65rem;
  font-weight: 600;
  color: #ef4444;
  background: var(--bg-secondary);
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
}

.timeline-row {
  height: 36px;
  border-bottom: 1px solid var(--border-color);
  position: relative;
}

.timeline-row:hover {
  background: var(--bg-hover);
}

.row-label {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  cursor: pointer;
  overflow: hidden;
  border-bottom: 1px solid var(--border-color);
}

.row-label:hover {
  background: var(--bg-hover);
}

.row-label.selected {
  background: var(--accent-subtle);
}

.tree-indent {
  flex-shrink: 0;
}

.tree-prefix {
  font-family: monospace;
  font-size: 0.7rem;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

.node-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 0.8rem;
}

.row-track {
  position: relative;
  height: 100%;
}

.timeline-bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 24px;
  border-radius: 0 4px 4px 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 8px;
  min-width: 20px;
  transition: filter 0.15s, box-shadow 0.15s, outline 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  will-change: left, width;
  backface-visibility: hidden;
}

.timeline-bar:hover {
  filter: brightness(1.15);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
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

.type-badge.project { background: var(--type-project-bg); color: var(--type-project-text); }
.type-badge.task { background: var(--type-task-bg); color: var(--type-task-text); }
.type-badge.note { background: var(--type-note-bg); color: var(--type-note-text); }
.type-badge.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.type-badge.group { background: var(--type-group-bg); color: var(--type-group-text); }
.type-badge.event { background: var(--type-event-bg); color: var(--type-event-text); }
.type-badge.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.type-badge.person { background: var(--type-person-bg); color: var(--type-person-text); }
.type-badge.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }
.type-badge.component { background: var(--type-component-bg); color: var(--type-component-text); }

/* SVG icons in type badges */
.type-badge :deep(svg) {
  width: 12px;
  height: 12px;
  fill: currentColor;
}
</style>
