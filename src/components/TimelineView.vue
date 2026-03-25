<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'
import { useTimelineDrag } from '../composables/useTimelineDrag.js'

// Layout constants
const ROW_HEIGHT = 36
const MIN_BAR_WIDTH = 20
const DEFAULT_ZOOM = 20
const MIN_ZOOM = 5
const MAX_ZOOM = 100
const ZOOM_THROTTLE_MS = 50
const MIN_LABELS_WIDTH = 100
const MAX_LABELS_WIDTH = 400
const DEFAULT_LABELS_WIDTH = 200

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false },
  colorMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['select', 'enter', 'show-tooltip', 'hide-tooltip', 'context-menu', 'add-child', 'delete', 'update'])

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
const zoomLevel = ref(DEFAULT_ZOOM)

// Labels column width (draggable)
const labelsWidth = ref(DEFAULT_LABELS_WIDTH)
const labelsDragState = ref(null)

// Throttle zoom to reduce sensitivity and flickering
let lastZoomTime = 0
let pendingScrollUpdate = null

function handleWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const now = Date.now()
    if (now - lastZoomTime < ZOOM_THROTTLE_MS) return
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
      newZoom = Math.min(MAX_ZOOM, oldZoom * 1.08)
    } else {
      newZoom = Math.max(MIN_ZOOM, oldZoom / 1.08)
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
  if (now - lastZoomTime < ZOOM_THROTTLE_MS) return
  lastZoomTime = now
  zoomLevel.value = Math.min(MAX_ZOOM, zoomLevel.value * 1.25)
}

function zoomOut() {
  const now = Date.now()
  if (now - lastZoomTime < ZOOM_THROTTLE_MS) return
  lastZoomTime = now
  zoomLevel.value = Math.max(MIN_ZOOM, zoomLevel.value / 1.25)
}

// Calculate timeline width based on zoom
const timelineWidth = computed(() => {
  return dateRange.value.days * zoomLevel.value
})

// Flatten nodes and filter those with dates, keeping depth for indentation
// Nodes without dates can inherit end_date from parent
const timelineNodes = computed(() => {
  const result = []

  function hasOwnDate(node) {
    return !!(node.start_date || node.end_date || node.due_date)
  }

  function flatten(nodeList, depth = 0, inheritedEndDate = null) {
    for (const node of nodeList) {
      // Skip completed items if hideCompleted is true
      if (props.hideCompleted && (node.completed || node.inheritedCompleted)) {
        continue
      }

      // Calculate inherited end date (for passing to children)
      const inheritedEnd = node.end_date || inheritedEndDate

      // Only show tasks, projects, and events (groups rendered separately as vertical bars)
      if (node.type === 'task' || node.type === 'project' || node.type === 'event') {
        // Include nodes that have own dates OR can inherit a date OR have created_at
        const createdAtDate = node.created_at ? node.created_at.split('T')[0] : null
        const today = new Date().toISOString().split('T')[0]

        const startFallback = createdAtDate
        const displayDate = node.start_date || node.due_date || inheritedEnd || startFallback
        // Items without end_date stretch to today (due_date shown separately as marker)
        const endDisplayDate = node.end_date || today

        // Calculate due date urgency (0-1, where 1 is overdue)
        let dueUrgency = null
        if (node.due_date && !node.completed) {
          const dueDate = new Date(node.due_date)
          const todayDate = new Date(today)
          const daysUntilDue = Math.ceil((dueDate - todayDate) / (1000 * 60 * 60 * 24))
          // Urgency: 1.0 = overdue, 0.8 = due today, scales down over 14 days
          if (daysUntilDue <= 0) dueUrgency = 1.0
          else if (daysUntilDue <= 14) dueUrgency = 1 - (daysUntilDue / 14)
          else dueUrgency = 0
        }

        // Include node if we have any date to display
        if (displayDate) {
          result.push({
            ...node,
            depth,
            displayDate,
            endDisplayDate,
            inheritedDate: !hasOwnDate(node),
            dueUrgency
          })
        }
      }

      if (node.children?.length) {
        // Pass down the end date for inheritance (due_date can serve as deadline for children)
        const childInheritedEndDate = node.end_date || node.due_date || inheritedEndDate
        flatten(node.children, depth + 1, childInheritedEndDate)
      }
    }
  }

  flatten(props.nodes)

  // Preserve graph structure order (parents followed by children)
  return result
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
  const _zoom = zoomLevel.value // explicit dependency
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
  const _zoom = zoomLevel.value // explicit dependency

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
  const days = Math.round((date - start) / (1000 * 60 * 60 * 24))

  return days * zoomLevel.value
}

function getNodeWidth(node) {
  if (!node.displayDate || !node.endDisplayDate) return MIN_BAR_WIDTH

  const start = new Date(node.displayDate)
  const end = new Date(node.endDisplayDate)
  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

  return Math.max(days * zoomLevel.value, MIN_BAR_WIDTH)
}

function getTypeColor(type) {
  const colors = getTypeColors(type)
  return colors.text
}

// Collect all descendant IDs from a node tree
function getAllDescendantIds(node) {
  const ids = []
  function collect(n) {
    if (n.children?.length) {
      for (const child of n.children) {
        ids.push(child.id)
        collect(child)
      }
    }
  }
  collect(node)
  return ids
}

function getDueColor(urgency) {
  if (urgency === null || urgency === undefined) return 'transparent'
  // Interpolate from white/yellow to red based on urgency
  const r = 255
  const g = Math.round(255 * (1 - urgency))
  const b = Math.round(255 * (1 - urgency))
  return `rgb(${r}, ${g}, ${b})`
}

// Calculate floating label position for project boxes
function getProjectLabelLeft(project) {
  const boxLeft = project.left
  const boxRight = project.left + project.width
  // Keep label visible within box bounds, floating with scroll
  const visibleLeft = Math.max(boxLeft, scrollLeft.value)
  const labelLeft = Math.min(visibleLeft, boxRight - 60) // 60px min space for label
  return Math.max(boxLeft, labelLeft) - boxLeft + 4
}

function getBarStyle(node) {
  const left = getDatePosition(node.displayDate) + 'px'
  const width = getNodeWidth(node) + 'px'
  // Use node's own color only, not inherited from parent
  const nodeColor = node.color && node.color !== '#0f4c75' ? node.color : null
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

// Project box style with custom color support
function getProjectBoxStyle(project) {
  const style = {
    left: project.left + 'px',
    width: project.width + 'px',
    top: project.top + 'px',
    height: project.height + 'px'
  }
  // Use project's own color for the box background
  const projectColor = project.node?.color
  if (projectColor && projectColor !== '#0f4c75') {
    style.background = `color-mix(in srgb, ${projectColor} 40%, transparent)`
    style.borderColor = projectColor
  }
  return style
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

// Group markers - vertical bars that span their child tasks
const groupMarkers = computed(() => {
  if (!dateRange.value.start || timelineNodes.value.length === 0) return []
  const result = []
  const rowHeight = ROW_HEIGHT

  const nodeRowIndex = new Map()
  timelineNodes.value.forEach((node, idx) => {
    nodeRowIndex.set(node.id, idx)
  })

  function collectGroups(nodeList) {
    for (const node of nodeList) {
      if (node.type === 'group') {
        const descendantIds = getAllDescendantIds(node)
        const childRowIndices = descendantIds
          .filter(id => nodeRowIndex.has(id))
          .map(id => nodeRowIndex.get(id))

        if (childRowIndices.length > 0) {
          const minRow = Math.min(...childRowIndices)
          const maxRow = Math.max(...childRowIndices)
          const date = node.start_date || node.due_date || node.end_date ||
            (node.created_at ? node.created_at.split('T')[0] : null)

          if (date) {
            result.push({
              id: node.id,
              title: node.title,
              position: getDatePosition(date),
              top: minRow * rowHeight,
              height: (maxRow - minRow + 1) * rowHeight,
              date,
              node
            })
          }
        }
      }
      if (node.children?.length) {
        collectGroups(node.children)
      }
    }
  }

  collectGroups(props.nodes)
  return result
})

// Project boxes - background rectangles that contain child tasks
const projectBoxes = computed(() => {
  if (!dateRange.value.start || timelineNodes.value.length === 0) return []
  const result = []
  const rowHeight = ROW_HEIGHT

  const nodeRowIndex = new Map()
  const nodeData = new Map()
  timelineNodes.value.forEach((node, idx) => {
    nodeRowIndex.set(node.id, idx)
    nodeData.set(node.id, node)
  })

  function collectProjects(nodeList) {
    for (const node of nodeList) {
      if (node.type === 'project') {
        const childRowIndices = []

        // Include descendants if any
        if (node.children?.length) {
          const descendantIds = getAllDescendantIds(node)
          descendantIds
            .filter(id => nodeRowIndex.has(id))
            .forEach(id => childRowIndices.push(nodeRowIndex.get(id)))
        }

        // Include the project itself if it's in the timeline
        if (nodeRowIndex.has(node.id)) {
          childRowIndices.push(nodeRowIndex.get(node.id))
        }

        // Show box if project is in timeline (even without children)
        if (childRowIndices.length >= 1) {
          const minRow = Math.min(...childRowIndices)
          const maxRow = Math.max(...childRowIndices)

          // Get date range from all descendants
          const allDates = []

          if (node.children?.length) {
            const descendantIds = getAllDescendantIds(node)
            const descendantNodes = descendantIds
              .filter(id => nodeData.has(id))
              .map(id => nodeData.get(id))

            descendantNodes.forEach(n => {
              if (n.displayDate) allDates.push(n.displayDate)
              if (n.endDisplayDate) allDates.push(n.endDisplayDate)
            })
          }

          // Include project's own dates
          const projectNode = nodeData.get(node.id)
          if (projectNode) {
            if (projectNode.displayDate) allDates.push(projectNode.displayDate)
            if (projectNode.endDisplayDate) allDates.push(projectNode.endDisplayDate)
          }

          if (allDates.length > 0) {
            const minDate = allDates.reduce((a, b) => a < b ? a : b)
            const maxDate = allDates.reduce((a, b) => a > b ? a : b)

            result.push({
              id: node.id,
              title: node.title,
              left: getDatePosition(minDate),
              width: getDatePosition(maxDate) - getDatePosition(minDate) + zoomLevel.value,
              top: minRow * rowHeight,
              height: (maxRow - minRow + 1) * rowHeight,
              node
            })
          }
        }
      }
      if (node.children?.length) {
        collectProjects(node.children)
      }
    }
  }

  collectProjects(props.nodes)
  return result
})

// Refs for scrollable containers
const scrollableRef = ref(null)
const labelsRef = ref(null)
const scrollLeft = ref(0)

// Sync vertical scroll between labels and timeline
function syncScroll(source) {
  if (!scrollableRef.value || !labelsRef.value) return
  if (source === 'timeline') {
    labelsRef.value.scrollTop = scrollableRef.value.scrollTop
    scrollLeft.value = scrollableRef.value.scrollLeft
  } else {
    scrollableRef.value.scrollTop = labelsRef.value.scrollTop
  }
}

// Labels column resize handlers
function handleLabelsDragStart(e) {
  e.preventDefault()
  labelsDragState.value = { startX: e.clientX, startWidth: labelsWidth.value }
}

function handleLabelsDragMove(e) {
  if (!labelsDragState.value) return
  const delta = e.clientX - labelsDragState.value.startX
  labelsWidth.value = Math.max(MIN_LABELS_WIDTH, Math.min(MAX_LABELS_WIDTH, labelsDragState.value.startWidth + delta))
}

function handleLabelsDragEnd() {
  labelsDragState.value = null
}

// Canvas panning state
const panState = ref(null)

function handlePanStart(e) {
  // Only pan with middle mouse or when clicking empty space
  if (e.button === 1 || (e.button === 0 && e.target.classList.contains('timeline-body'))) {
    e.preventDefault()
    const container = scrollableRef.value
    if (!container) return
    panState.value = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop
    }
  }
}

function handlePanMove(e) {
  if (!panState.value) return
  const container = scrollableRef.value
  if (!container) return
  const dx = e.clientX - panState.value.startX
  const dy = e.clientY - panState.value.startY
  container.scrollLeft = panState.value.scrollLeft - dx
  container.scrollTop = panState.value.scrollTop - dy
  // Sync labels scroll
  if (labelsRef.value) {
    labelsRef.value.scrollTop = container.scrollTop
  }
}

function handlePanEnd() {
  panState.value = null
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
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
  document.addEventListener('mousemove', handleLabelsDragMove)
  document.addEventListener('mouseup', handleLabelsDragEnd)
  document.addEventListener('mousemove', handlePanMove)
  document.addEventListener('mouseup', handlePanEnd)
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
  document.removeEventListener('mousemove', handlePanMove)
  document.removeEventListener('mouseup', handlePanEnd)
  document.removeEventListener('mousemove', handleLabelsDragMove)
  document.removeEventListener('mouseup', handleLabelsDragEnd)
})

watch(() => props.nodes, () => {
  nextTick(scrollToToday)
})

// Convert pixel position to date string
function positionToDate(pixelX) {
  if (!dateRange.value.start) return null
  const days = Math.round(pixelX / zoomLevel.value)
  const start = new Date(dateRange.value.start)
  start.setDate(start.getDate() + days)
  return start.toISOString().split('T')[0]
}

// Timeline drag composable
const { dragState, handleDragStart, handleDragMove, handleDragEnd, getDragBarStyle } = useTimelineDrag({
  getDatePosition,
  positionToDate,
  scrollableRef,
  zoomLevel,
  emit,
  getBarStyle,
  minBarWidth: MIN_BAR_WIDTH
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
        <div ref="labelsRef" class="timeline-labels" :style="{ width: labelsWidth + 'px' }" @scroll="syncScroll('labels')">
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

        <!-- Draggable divider for resizing labels column -->
        <div
          class="labels-divider"
          :class="{ dragging: labelsDragState }"
          @mousedown="handleLabelsDragStart"
        ></div>

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
          <div
            class="timeline-body"
            :style="{ width: timelineWidth + 'px', cursor: panState ? 'grabbing' : 'grab' }"
            @mousedown="handlePanStart"
          >
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
              <!-- Project boxes (background rectangles containing children) -->
              <div
                v-for="project in projectBoxes"
                :key="'project-box-' + project.id"
                class="project-box"
                :style="getProjectBoxStyle(project)"
              ></div>
              <!-- Project box labels (rendered separately to control z-index) -->
              <span
                v-for="project in projectBoxes"
                :key="'project-label-' + project.id"
                class="project-box-label"
                :style="{
                  left: (project.left + getProjectLabelLeft(project)) + 'px',
                  top: (project.top + 18) + 'px'
                }"
              >{{ project.title }}</span>
              <!-- Group markers (vertical bars spanning child tasks) -->
              <div
                v-for="group in groupMarkers"
                :key="'group-' + group.id"
                class="group-marker"
                :class="{ selected: selectedId === group.id }"
                :style="{ left: group.position + 'px', top: group.top + 'px', height: group.height + 'px' }"
                @click="emit('select', group.node)"
                @mouseenter="emit('show-tooltip', $event, group.node)"
                @mouseleave="emit('hide-tooltip')"
                @contextmenu.prevent="handleContextMenu($event, group.node)"
              >
                <span class="group-label">{{ group.title }}</span>
              </div>
              <div
                v-for="node in timelineNodes"
                :key="node.id"
                class="timeline-row"
              >
                <div class="row-track">
                  <div
                    class="timeline-bar"
                    :class="{
                      selected: selectedId === node.id,
                      completed: node.completed,
                      inherited: node.inheritedDate,
                      dragging: dragState?.node.id === node.id
                    }"
                    :style="getDragBarStyle(node)"
                    @click="handleNodeClick($event, node)"
                    @dblclick="emit('enter', node)"
                    @mouseenter="!dragState && emit('show-tooltip', $event, node)"
                    @mouseleave="emit('hide-tooltip')"
                    @contextmenu.prevent="handleContextMenu($event, node)"
                  >
                    <!-- Left resize handle -->
                    <div
                      class="resize-handle resize-handle-left"
                      @mousedown="handleDragStart($event, node, 'resize-start')"
                    ></div>
                    <!-- Draggable bar content -->
                    <div
                      class="bar-content"
                      @mousedown="handleDragStart($event, node, 'move')"
                    >
                      <span v-if="node.type !== 'project'" class="bar-label">{{ node.title }}</span>
                    </div>
                    <!-- Right resize handle -->
                    <div
                      class="resize-handle resize-handle-right"
                      @mousedown="handleDragStart($event, node, 'resize-end')"
                    ></div>
                  </div>
                  <!-- Due date marker at actual date position -->
                  <div
                    v-if="node.due_date && !node.completed"
                    class="due-marker"
                    :style="{ left: getDatePosition(node.due_date) + 'px', color: getDueColor(node.dueUrgency) }"
                    :title="'Due: ' + node.due_date"
                  >&#x2717;</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped src="./TimelineView.css"></style>
