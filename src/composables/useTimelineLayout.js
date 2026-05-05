/**
 * Composable for timeline layout calculations.
 * Handles positioning, zoom, and node layout.
 */

import { computed, ref, nextTick } from 'vue'
import { getTypeColors } from '../utils/constants.js'
import {
  parseLocalDate,
  formatLocalDate,
  getTodayString,
  calculateDateRange,
  generateYearMarkers,
  generateMonthMarkers,
  generateWeekMarkers,
  generateDayMarkers,
  generateWeekendRanges,
  calculateDueUrgency,
} from './useTimelineDates.js'

// Layout constants
const ROW_HEIGHT = 36
const MIN_BAR_WIDTH = 20
const DEFAULT_ZOOM = 20
const MIN_ZOOM = 5
const MAX_ZOOM = 100
const ZOOM_THROTTLE_MS = 50
const MIN_ZOOM_FOR_WEEKS = 10
const MIN_ZOOM_FOR_DAYS = 8

/**
 * Create timeline layout manager.
 * @param {Object} options
 * @param {Function} options.getNodes - Function returning nodes array
 * @param {Function} options.getHideCompleted - Function returning hideCompleted state
 * @param {Function} options.getColorMap - Function returning color map
 * @param {Ref} options.scrollableRef - Reference to scrollable container
 * @returns {Object} Layout state and functions
 */
export function useTimelineLayout({ getNodes, getHideCompleted, getColorMap, scrollableRef }) {
  // Zoom level: pixels per day (higher = more zoomed in)
  const zoomLevel = ref(DEFAULT_ZOOM)
  const scrollLeft = ref(0)

  // Throttle zoom to reduce sensitivity
  let lastZoomTime = 0
  let pendingScrollUpdate = null

  /**
   * Check if a node has its own date (not inherited).
   */
  function hasOwnDate(node) {
    return !!(node.start_date || node.end_date || node.due_date)
  }

  /**
   * Collect all descendant IDs from a node tree.
   */
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

  /**
   * Flatten nodes for timeline display, filtering those with dates.
   */
  const timelineNodes = computed(() => {
    const result = []
    const hideCompleted = getHideCompleted()
    const today = getTodayString()

    function flatten(nodeList, depth = 0, inheritedEndDate = null) {
      for (const node of nodeList) {
        // Skip completed items if hideCompleted is true
        if (hideCompleted && (node.completed || node.inheritedCompleted)) {
          continue
        }

        // Calculate inherited end date (for passing to children)
        const inheritedEnd = node.end_date || inheritedEndDate

        // Only show tasks, projects, and events
        if (node.type === 'task' || node.type === 'project' || node.type === 'event') {
          const createdAtDate = node.created_at ? node.created_at.split('T')[0] : null
          const startFallback = createdAtDate
          const displayDate = node.start_date || node.due_date || inheritedEnd || startFallback
          // Items without end_date stretch to today
          const endDisplayDate = node.end_date || today

          // Calculate due date urgency
          const dueUrgency = calculateDueUrgency(node.due_date, node.completed)

          // Include node if we have any date to display
          if (displayDate) {
            result.push({
              ...node,
              depth,
              displayDate,
              endDisplayDate,
              inheritedDate: !hasOwnDate(node),
              dueUrgency,
            })
          }
        }

        if (node.children?.length) {
          const childInheritedEndDate = node.end_date || node.due_date || inheritedEndDate
          flatten(node.children, depth + 1, childInheritedEndDate)
        }
      }
    }

    flatten(getNodes())
    return result
  })

  /**
   * Get date range for the timeline.
   */
  const dateRange = computed(() => {
    return calculateDateRange(timelineNodes.value)
  })

  /**
   * Calculate timeline width based on zoom.
   */
  const timelineWidth = computed(() => {
    return dateRange.value.days * zoomLevel.value
  })

  /**
   * Convert date string to pixel position.
   */
  function getDatePosition(dateStr) {
    if (!dateRange.value.start || !dateStr) return 0

    const start = parseLocalDate(dateRange.value.start)
    const date = parseLocalDate(dateStr)
    const days = Math.round((date - start) / (1000 * 60 * 60 * 24))

    return days * zoomLevel.value
  }

  /**
   * Convert pixel position to date string.
   */
  function positionToDate(pixelX) {
    if (!dateRange.value.start) return null
    const days = Math.round(pixelX / zoomLevel.value)
    const start = parseLocalDate(dateRange.value.start)
    start.setDate(start.getDate() + days)
    return formatLocalDate(start)
  }

  /**
   * Calculate node bar width.
   */
  function getNodeWidth(node) {
    if (!node.displayDate || !node.endDisplayDate) return MIN_BAR_WIDTH

    const start = parseLocalDate(node.displayDate)
    const end = parseLocalDate(node.endDisplayDate)
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1

    return Math.max(days * zoomLevel.value, MIN_BAR_WIDTH)
  }

  /**
   * Get type color from constants.
   */
  function getTypeColor(type) {
    const colors = getTypeColors(type)
    return colors.text
  }

  /**
   * Get bar style for a node.
   */
  function getBarStyle(node) {
    const left = getDatePosition(node.displayDate) + 'px'
    const width = getNodeWidth(node) + 'px'
    const nodeColor = node.color && node.color !== '#0f4c75' ? node.color : null
    const typeColor = getTypeColor(node.type)

    if (nodeColor) {
      return {
        left,
        width,
        background: `linear-gradient(135deg, ${nodeColor}cc 0%, ${nodeColor}88 100%)`,
        borderLeft: `3px solid ${typeColor}`,
      }
    }

    return {
      left,
      width,
      background: `linear-gradient(135deg, ${typeColor}aa 0%, ${typeColor}77 100%)`,
      borderLeft: `3px solid ${typeColor}`,
    }
  }

  /**
   * Get project box style.
   */
  function getProjectBoxStyle(project, colorMap) {
    const style = {
      left: project.left + 'px',
      width: project.width + 'px',
      top: project.top + 'px',
      height: project.height + 'px',
    }
    const projectColor = colorMap[project.id] || project.node?.color
    if (projectColor && projectColor !== '#0f4c75') {
      style.background = `linear-gradient(180deg, ${projectColor}15 0%, ${projectColor}08 100%)`
      style.borderColor = projectColor
    }
    return style
  }

  /**
   * Calculate floating label position for project boxes.
   */
  function getProjectLabelLeft(project) {
    const boxLeft = project.left
    const boxRight = project.left + project.width
    const visibleLeft = Math.max(boxLeft, scrollLeft.value)
    const labelLeft = Math.min(visibleLeft, boxRight - 60)
    return Math.max(boxLeft, labelLeft) - boxLeft + 4
  }

  // Year markers
  const years = computed(() => {
    const _zoom = zoomLevel.value // explicit dependency
    return generateYearMarkers(dateRange.value.start, dateRange.value.end, getDatePosition)
  })

  // Month markers
  const months = computed(() => {
    const _zoom = zoomLevel.value // explicit dependency
    return generateMonthMarkers(dateRange.value.start, dateRange.value.end, getDatePosition)
  })

  // Week markers
  const weeks = computed(() => {
    return generateWeekMarkers(
      dateRange.value.start,
      dateRange.value.end,
      getDatePosition,
      MIN_ZOOM_FOR_WEEKS,
      zoomLevel.value
    )
  })

  // Day markers
  const days = computed(() => {
    return generateDayMarkers(
      dateRange.value.start,
      dateRange.value.end,
      getDatePosition,
      MIN_ZOOM_FOR_DAYS,
      zoomLevel.value
    )
  })

  // Weekend ranges
  const weekends = computed(() => {
    return generateWeekendRanges(
      dateRange.value.start,
      dateRange.value.end,
      getDatePosition,
      zoomLevel.value,
      MIN_ZOOM_FOR_DAYS
    )
  })

  // Today marker position
  const todayPosition = computed(() => {
    if (!dateRange.value.start) return null
    const today = getTodayString()
    const pos = getDatePosition(today)
    if (pos < 0 || pos > timelineWidth.value) return null
    return pos
  })

  // Group markers
  const groupMarkers = computed(() => {
    if (!dateRange.value.start || timelineNodes.value.length === 0) return []
    const result = []
    const rowHeight = ROW_HEIGHT

    const nodeRowIndex = new Map()
    const nodeData = new Map()
    timelineNodes.value.forEach((node, idx) => {
      nodeRowIndex.set(node.id, idx)
      nodeData.set(node.id, node)
    })

    function collectGroups(nodeList) {
      for (const node of nodeList) {
        if (node.type === 'group') {
          const descendantIds = getAllDescendantIds(node)
          const childRowIndices = descendantIds.filter(id => nodeRowIndex.has(id)).map(id => nodeRowIndex.get(id))

          if (childRowIndices.length > 0) {
            const minRow = Math.min(...childRowIndices)
            const maxRow = Math.max(...childRowIndices)

            const childDates = descendantIds
              .filter(id => nodeData.has(id))
              .map(id => nodeData.get(id).displayDate)
              .filter(Boolean)

            const earliestDate = childDates.length > 0 ? childDates.reduce((a, b) => (a < b ? a : b)) : null

            if (earliestDate) {
              result.push({
                id: node.id,
                title: node.title,
                position: getDatePosition(earliestDate),
                top: minRow * rowHeight,
                height: (maxRow - minRow + 1) * rowHeight,
                date: earliestDate,
                node,
              })
            }
          }
        }
        if (node.children?.length) {
          collectGroups(node.children)
        }
      }
    }

    collectGroups(getNodes())
    return result
  })

  // Project boxes
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

          if (node.children?.length) {
            const descendantIds = getAllDescendantIds(node)
            descendantIds.filter(id => nodeRowIndex.has(id)).forEach(id => childRowIndices.push(nodeRowIndex.get(id)))
          }

          if (nodeRowIndex.has(node.id)) {
            childRowIndices.push(nodeRowIndex.get(node.id))
          }

          if (childRowIndices.length >= 1) {
            const minRow = Math.min(...childRowIndices)
            const maxRow = Math.max(...childRowIndices)

            const allDates = []

            if (node.children?.length) {
              const descendantIds = getAllDescendantIds(node)
              const descendantNodes = descendantIds.filter(id => nodeData.has(id)).map(id => nodeData.get(id))

              descendantNodes.forEach(n => {
                if (n.displayDate) allDates.push(n.displayDate)
                if (n.endDisplayDate) allDates.push(n.endDisplayDate)
              })
            }

            const projectNode = nodeData.get(node.id)
            if (projectNode) {
              if (projectNode.displayDate) allDates.push(projectNode.displayDate)
              if (projectNode.endDisplayDate) allDates.push(projectNode.endDisplayDate)
            }

            if (allDates.length > 0) {
              const minDate = allDates.reduce((a, b) => (a < b ? a : b))
              const maxDate = allDates.reduce((a, b) => (a > b ? a : b))

              result.push({
                id: node.id,
                title: node.title,
                left: getDatePosition(minDate),
                width: getDatePosition(maxDate) - getDatePosition(minDate) + zoomLevel.value,
                top: minRow * rowHeight,
                height: (maxRow - minRow + 1) * rowHeight,
                node,
              })
            }
          }
        }
        if (node.children?.length) {
          collectProjects(node.children)
        }
      }
    }

    collectProjects(getNodes())
    return result
  })

  /**
   * Zoom in by a factor.
   */
  function zoomIn() {
    const now = Date.now()
    if (now - lastZoomTime < ZOOM_THROTTLE_MS) return
    lastZoomTime = now
    zoomLevel.value = Math.min(MAX_ZOOM, zoomLevel.value * 1.25)
  }

  /**
   * Zoom out by a factor.
   */
  function zoomOut() {
    const now = Date.now()
    if (now - lastZoomTime < ZOOM_THROTTLE_MS) return
    lastZoomTime = now
    zoomLevel.value = Math.max(MIN_ZOOM, zoomLevel.value / 1.25)
  }

  /**
   * Handle wheel zoom with mouse position tracking.
   */
  function handleWheelZoom(e) {
    if (!(e.ctrlKey || e.metaKey)) return false
    e.preventDefault()

    const now = Date.now()
    if (now - lastZoomTime < ZOOM_THROTTLE_MS) return true
    lastZoomTime = now

    const container = scrollableRef.value
    if (!container) return true

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left + container.scrollLeft

    const oldWidth = timelineWidth.value
    const positionRatio = oldWidth > 0 ? mouseX / oldWidth : 0

    const oldZoom = zoomLevel.value
    let newZoom
    if (e.deltaY < 0) {
      newZoom = Math.min(MAX_ZOOM, oldZoom * 1.08)
    } else {
      newZoom = Math.max(MIN_ZOOM, oldZoom / 1.08)
    }

    if (newZoom === oldZoom) return true

    if (pendingScrollUpdate) {
      cancelAnimationFrame(pendingScrollUpdate)
    }

    zoomLevel.value = newZoom

    pendingScrollUpdate = requestAnimationFrame(() => {
      const newWidth = dateRange.value.days * newZoom
      const newMouseX = positionRatio * newWidth
      const newScrollLeft = newMouseX - (e.clientX - rect.left)
      container.scrollLeft = Math.max(0, newScrollLeft)
      pendingScrollUpdate = null
    })

    return true
  }

  /**
   * Scroll to today position.
   */
  function scrollToToday() {
    if (todayPosition.value !== null && scrollableRef.value) {
      nextTick(() => {
        const container = scrollableRef.value
        if (container) {
          const newScrollLeft = todayPosition.value - container.clientWidth / 3
          container.scrollLeft = Math.max(0, newScrollLeft)
        }
      })
    }
  }

  /**
   * Update scroll position tracking.
   */
  function updateScrollLeft(value) {
    scrollLeft.value = value
  }

  return {
    // Constants
    ROW_HEIGHT,
    MIN_BAR_WIDTH,

    // State
    zoomLevel,
    scrollLeft,

    // Computed
    timelineNodes,
    dateRange,
    timelineWidth,
    years,
    months,
    weeks,
    days,
    weekends,
    todayPosition,
    groupMarkers,
    projectBoxes,

    // Functions
    getDatePosition,
    positionToDate,
    getNodeWidth,
    getBarStyle,
    getProjectBoxStyle,
    getProjectLabelLeft,
    zoomIn,
    zoomOut,
    handleWheelZoom,
    scrollToToday,
    updateScrollLeft,
  }
}
