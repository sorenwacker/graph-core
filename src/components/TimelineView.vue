<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { getTypeIcon, personIconSvg } from '../utils/constants.js'
import { useTimelineDrag } from '../composables/useTimelineDrag.js'
import { useTimelineLayout } from '../composables/useTimelineLayout.js'
import { useTimelineInteractions } from '../composables/useTimelineInteractions.js'
import { getDueColor } from '../composables/useTimelineDates.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false },
  colorMap: { type: Object, default: () => ({}) },
})

const emit = defineEmits([
  'select',
  'enter',
  'show-tooltip',
  'hide-tooltip',
  'context-menu',
  'add-child',
  'delete',
  'update',
])

// Refs for scrollable containers
const scrollableRef = ref(null)
const labelsRef = ref(null)

// Timeline layout composable
const layout = useTimelineLayout({
  getNodes: () => props.nodes,
  getHideCompleted: () => props.hideCompleted,
  _getColorMap: () => props.colorMap,
  scrollableRef,
})

// Timeline interactions composable
const interactions = useTimelineInteractions({
  emit,
  scrollableRef,
  labelsRef,
  onScroll: scrollLeftValue => layout.updateScrollLeft(scrollLeftValue),
})

// Timeline drag composable
const { dragState, handleDragStart, handleDragMove, handleDragEnd, getDragBarStyle } = useTimelineDrag({
  getDatePosition: layout.getDatePosition,
  positionToDate: layout.positionToDate,
  scrollableRef,
  zoomLevel: layout.zoomLevel,
  emit,
  getBarStyle: layout.getBarStyle,
  minBarWidth: layout.MIN_BAR_WIDTH,
})

// Handle wheel events for zoom
function handleWheel(e) {
  if (layout.handleWheelZoom(e)) {
    // Zoom was handled
    return
  }
  // Normal scroll - let it pass through
}

// Get project box style with color map
function getProjectBoxStyle(project) {
  return layout.getProjectBoxStyle(project, props.colorMap)
}

// Scroll to today on mount
onMounted(() => {
  layout.scrollToToday()
  document.addEventListener('mousemove', handleDragMove)
  document.addEventListener('mouseup', handleDragEnd)
  interactions.setupListeners()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', handleDragMove)
  document.removeEventListener('mouseup', handleDragEnd)
  interactions.cleanupListeners()
})
</script>

<template>
  <div class="timeline-view" @wheel="handleWheel">
    <div v-if="layout.timelineNodes.value.length === 0" class="empty-state">
      <p>No items with dates</p>
      <p class="hint">Add start_date, end_date, or due_date to nodes to see them on the timeline</p>
    </div>

    <template v-else>
      <!-- Zoom controls -->
      <div class="timeline-controls">
        <button class="zoom-btn" @click="layout.zoomOut" title="Zoom out">-</button>
        <span class="zoom-label">{{ Math.round(layout.zoomLevel.value) }}px/day</span>
        <button class="zoom-btn" @click="layout.zoomIn" title="Zoom in">+</button>
        <span class="zoom-hint">Ctrl+scroll to zoom</span>
      </div>

      <!-- Scrollable timeline container -->
      <div class="timeline-scroll-container">
        <!-- Fixed row labels column -->
        <div
          ref="labelsRef"
          class="timeline-labels"
          :style="{ width: interactions.labelsWidth.value + 'px' }"
          @scroll="interactions.syncScroll('labels')"
        >
          <div class="label-header">Items</div>
          <div class="labels-body">
            <div
              v-for="node in layout.timelineNodes.value"
              :key="'label-' + node.id"
              class="row-label"
              :class="{ selected: selectedId === node.id }"
              @click="interactions.handleNodeClick($event, node)"
              @mouseenter="emit('show-tooltip', $event, node)"
              @mouseleave="emit('hide-tooltip')"
              @contextmenu.prevent="interactions.handleContextMenu($event, node)"
            >
              <span class="tree-indent" :style="{ width: node.depth * 5 + 'px' }"></span>
              <span v-if="node.type === 'person'" class="type-badge person" v-html="personIconSvg"></span>
              <span v-else class="type-badge" :class="node.type" v-html="getTypeIcon(node.type)"></span>
              <span class="node-title">{{ node.title }}</span>
            </div>
          </div>
        </div>

        <!-- Draggable divider for resizing labels column -->
        <div
          class="labels-divider"
          :class="{ dragging: interactions.labelsDragState.value }"
          @mousedown="interactions.handleLabelsDragStart"
        ></div>

        <!-- Scrollable timeline area -->
        <div ref="scrollableRef" class="timeline-scrollable" @scroll="interactions.syncScroll('timeline')">
          <!-- Time scale header -->
          <div class="timeline-header" :style="{ width: layout.timelineWidth.value + 'px' }">
            <!-- Year markers -->
            <div
              v-for="year in layout.years.value"
              :key="'year-' + year.label"
              class="year-marker"
              :style="{ left: year.position + 'px' }"
            >
              {{ year.label }}
            </div>
            <!-- Month markers -->
            <div
              v-for="(month, idx) in layout.months.value"
              :key="'month-' + idx"
              class="month-marker"
              :style="{ left: month.position + 'px' }"
            >
              {{ month.label }}
            </div>
            <!-- Day markers (when zoomed in) -->
            <div
              v-for="(day, idx) in layout.days.value"
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
            :style="{
              width: layout.timelineWidth.value + 'px',
              cursor: interactions.panState.value ? 'grabbing' : 'grab',
            }"
            @mousedown="interactions.handlePanStart"
          >
            <div class="timeline-grid">
              <!-- Weekend shading -->
              <div
                v-for="(weekend, idx) in layout.weekends.value"
                :key="'weekend-' + idx"
                class="weekend-shade"
                :style="{ left: weekend.position + 'px', width: weekend.width + 'px' }"
              ></div>
              <!-- Year lines -->
              <div
                v-for="year in layout.years.value"
                :key="'yeargrid-' + year.label"
                class="grid-line year-line"
                :style="{ left: year.position + 'px' }"
              ></div>
              <!-- Month lines -->
              <div
                v-for="(month, idx) in layout.months.value"
                :key="'monthgrid-' + idx"
                class="grid-line month-line"
                :style="{ left: month.position + 'px' }"
              ></div>
              <!-- Week lines -->
              <div
                v-for="(week, idx) in layout.weeks.value"
                :key="'weekgrid-' + idx"
                class="grid-line week-line"
                :style="{ left: week.position + 'px' }"
              ></div>
              <!-- Day lines -->
              <div
                v-for="(day, idx) in layout.days.value"
                :key="'daygrid-' + idx"
                class="grid-line day-line"
                :class="{ weekend: day.isWeekend }"
                :style="{ left: day.position + 'px' }"
              ></div>
              <!-- Today marker -->
              <div
                v-if="layout.todayPosition.value !== null"
                class="today-marker"
                :style="{ left: layout.todayPosition.value + 'px' }"
              >
                <span class="today-label">Today</span>
              </div>
            </div>

            <div class="rows-body">
              <!-- Project boxes (background rectangles containing children) -->
              <div
                v-for="project in layout.projectBoxes.value"
                :key="'project-box-' + project.id"
                class="project-box"
                :style="getProjectBoxStyle(project)"
              ></div>
              <!-- Project box labels (rendered separately to control z-index) -->
              <span
                v-for="project in layout.projectBoxes.value"
                :key="'project-label-' + project.id"
                class="project-box-label"
                :style="{
                  left: project.left + layout.getProjectLabelLeft(project) + 'px',
                  top: project.top + 18 + 'px',
                }"
                >{{ project.title }}</span
              >
              <!-- Group markers (vertical bars spanning child tasks) -->
              <div
                v-for="group in layout.groupMarkers.value"
                :key="'group-' + group.id"
                class="group-marker"
                :class="{ selected: selectedId === group.id }"
                :style="{ left: group.position + 'px', top: group.top + 'px', height: group.height + 'px' }"
                @click="emit('select', group.node)"
                @mouseenter="emit('show-tooltip', $event, group.node)"
                @mouseleave="emit('hide-tooltip')"
                @contextmenu.prevent="interactions.handleContextMenu($event, group.node)"
              ></div>
              <!-- Group labels (rendered separately to control z-index) -->
              <span
                v-for="group in layout.groupMarkers.value"
                :key="'group-label-' + group.id"
                class="group-label"
                :style="{ left: group.position + 6 + 'px', top: group.top + 'px' }"
                >{{ group.title }}</span
              >
              <div v-for="node in layout.timelineNodes.value" :key="node.id" class="timeline-row">
                <div class="row-track">
                  <div
                    class="timeline-bar"
                    :class="{
                      selected: selectedId === node.id,
                      completed: node.completed,
                      inherited: node.inheritedDate,
                      dragging: dragState?.node.id === node.id,
                    }"
                    :style="getDragBarStyle(node)"
                    @click="interactions.handleNodeClick($event, node)"
                    @dblclick="emit('enter', node)"
                    @mouseenter="!dragState && emit('show-tooltip', $event, node)"
                    @mouseleave="emit('hide-tooltip')"
                    @contextmenu.prevent="interactions.handleContextMenu($event, node)"
                  >
                    <!-- Left resize handle -->
                    <div
                      class="resize-handle resize-handle-left"
                      @mousedown="handleDragStart($event, node, 'resize-start')"
                    ></div>
                    <!-- Draggable bar content -->
                    <div class="bar-content" @mousedown="handleDragStart($event, node, 'move')">
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
                    :style="{ left: layout.getDatePosition(node.due_date) + 'px', color: getDueColor(node.dueUrgency) }"
                    :title="'Due: ' + node.due_date"
                  >
                    &#x2717;
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

<style scoped src="./TimelineView.css"></style>
