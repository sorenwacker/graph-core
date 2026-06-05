<script setup>
import { ref, toRef, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import tippy from 'tippy.js'
import { api } from '../services/api'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { useGraphSettings, ALL_NODE_TYPES } from '../composables/useGraphSettings'
import { useFiltersStore } from '../stores/filters.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { useGraphModals } from '../composables/useGraphModals.js'
import { useGraphLayout } from '../composables/useGraphLayout.js'
import { useGraphEvents } from '../composables/useGraphEvents.js'
import { useGraphInit } from '../composables/useGraphInit.js'
import { useGraphUpdate } from '../composables/useGraphUpdate.js'
import { useGraphWheel } from '../composables/useGraphWheel.js'
import { updateHtmlLabelSelectionFromIds, centerOnNode, isNodeVisible } from '../composables/useGraphSelection.js'
import { getPositionsKey, loadNodePositions, saveNodePositions } from '../composables/useNodePositions.js'
import { DEBOUNCE_DELAY_MS, LAYOUT_RELAYOUT_DELAY_MS } from '../utils/settingsConstants'
import AddNodeModal from './AddNodeModal.vue'
import GraphControls from './GraphControls.vue'
import GraphEditModal from './GraphEditModal.vue'
import GraphPromptModal from './GraphPromptModal.vue'
import HotkeyHelpModal from './HotkeyHelpModal.vue'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  parent: { type: Object, default: null },
  selectedId: Number,
  selectedIds: { type: Array, default: () => [] },
  detailThreshold: { type: Number, default: 30 },
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  workspace: { type: String, default: 'work' },
  workspaces: { type: Array, default: () => [] },
  showDetail: { type: Boolean, default: false },
  fullscreenDetailOpen: { type: Boolean, default: false },
  hoverPreviewEnabled: { type: Boolean, default: true },
  sidebarVisible: { type: Boolean, default: false },
  sortAlphabetically: { type: Boolean, default: false },
  notesPreviewLength: { type: Number, default: 200 },
  ancestorColor: { type: String, default: null },
  inheritColors: { type: Boolean, default: true },
})

const emit = defineEmits([
  'select',
  'select-multiple',
  'enter',
  'move',
  'move-multiple',
  'add-child',
  'insert-between',
  'update',
  'create',
  'delete',
  'delete-multiple',
  'wrap-with-parent',
  'open-fullscreen',
  'link',
  'unlink',
  'context-menu',
  'toggle-complete',
  'toggle-favorite',
  'open-link-search',
  'go-parent',
  'go-first-child',
  'go-prev-sibling',
  'go-next-sibling',
])

const container = ref(null),
  dropHighlightEl = ref(null),
  graphControlsRef = ref(null)
let graphControlTippyInstances = [],
  cy = null,
  isInitializing = false,
  lastKnownParentId = props.parent?.id,
  updateDebounceTimer = null

// Link/box select mode
const linkModeActive = ref(false),
  boxSelectModeActive = ref(false)
const isInsideEditor = t =>
  !t
    ? false
    : ['input', 'textarea'].includes(t.tagName?.toLowerCase()) ||
      t.contentEditable === 'true' ||
      t.closest('.cm-editor')

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', e => {
    if (isInsideEditor(e.target)) return
    if (e.key === 'Alt' || e.altKey) linkModeActive.value = true
    if (['Shift', 'Meta', 'Control'].includes(e.key)) boxSelectModeActive.value = true
  })
  document.addEventListener('keyup', e => {
    if (e.key === 'Alt') linkModeActive.value = false
    if (['Shift', 'Meta', 'Control'].includes(e.key)) boxSelectModeActive.value = false
  })
  document.addEventListener('mousemove', e => {
    if (isInsideEditor(e.target)) return
    linkModeActive.value = e.altKey
    boxSelectModeActive.value = e.shiftKey || e.metaKey || e.ctrlKey
  })
}

// Graph settings - pass workspace for workspace-specific localStorage keys
const workspaceRef = toRef(props, 'workspace')
const {
  layoutMode: _layoutMode,
  relaxLocked: _relaxLocked,
  fitLocked: _fitLocked,
  showExternalLinks: _showExternalLinks,
  showRootNode: _showRootNode,
  visibleTypes: _visibleTypes,
  radialSettings: _radialSettings,
  trackpadZoomMode,
  maxDepth: _maxDepth,
} = useGraphSettings({ workspace: workspaceRef })
const layoutMode = ref(props.parent?.graph_layout || _layoutMode.value)
const showRootNode = ref(
  props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value
)
const getWorkspaceShowExternalLinks = () => {
  // Compare with == to handle string/number mismatch (props.workspace is a string, w.id is a number)
  const ws = props.workspaces.find(w => w.id == props.workspace)
  return ws?.show_external_links != null ? Boolean(ws.show_external_links) : _showExternalLinks.value
}
const showExternalLinks = ref(
  props.parent?.show_external_links != null
    ? Boolean(props.parent.show_external_links)
    : getWorkspaceShowExternalLinks()
)
// Use filter store for shared filtering across views
const filtersStore = useFiltersStore()
const visibleTypes = computed({
  get: () => filtersStore.visibleTypes,
  set: val => filtersStore.setVisibleTypes(val),
})
const maxDepth = computed({
  get: () => filtersStore.maxDepth,
  set: val => filtersStore.setMaxDepth(val),
})

// Per-node physics settings with fallback to workspace defaults
const relaxLocked = ref(
  props.parent?.graph_relax_locked != null ? Boolean(props.parent.graph_relax_locked) : _relaxLocked.value
)
const fitLocked = ref(
  props.parent?.graph_fit_locked != null ? Boolean(props.parent.graph_fit_locked) : _fitLocked.value
)
const radialSettings = ref(
  props.parent?.graph_physics ? { ..._radialSettings, ...props.parent.graph_physics } : { ..._radialSettings }
)
const showHotkeyHelp = ref(false)

const { handleError } = useErrorHandler()

const {
  showTooltip,
  hideTooltip,
  forceHide: forceHideTooltip,
  toggleLock: toggleTooltipLock,
  isLocked: isTooltipLocked,
} = useNodeTooltip({
  onToggleComplete: id => {
    const node =
      props.nodes
        .flatMap(function f(n) {
          return [n, ...(n.children || []).flatMap(f)]
        })
        .find(n => n.id === id) || (props.parent?.id === id ? props.parent : null)
    if (node) emit('update', { ...node, completed: !node.completed })
  },
  onOpenDetail: id => emit('open-fullscreen', id),
  getHideSensitive: () => props.hideSensitive,
  shouldShowTooltip: node => {
    // Don't show tooltip for sensitive nodes when hideSensitive is enabled
    if (props.hideSensitive && node?.notes_sensitive) {
      return false
    }
    return (
      props.hoverPreviewEnabled &&
      !props.showDetail &&
      !props.fullscreenDetailOpen &&
      !editModal.value.visible &&
      !props.sidebarVisible
    )
  },
})

const {
  editModal,
  hideEditModal,
  saveEditModal,
  goToParentFromModal,
  wrapWithParentFromModal,
  promptModal,
  submitPrompt,
  cancelPrompt,
  addNodeModal,
  showAddNodeModal,
  hideAddNodeModal,
  handleAddNodeCreate,
  isAnyModalVisible,
} = useGraphModals({ emit, forceHideTooltip })

// Position helpers
const _getKey = () => getPositionsKey(props.workspace, props.parent?.id)
const _loadPos = () => loadNodePositions(_getKey())
const _savePos = () => saveNodePositions(cy, _getKey())
const _clearPos = () => localStorage.removeItem(_getKey())

// Layout composable
const layout = useGraphLayout({
  getCy: () => cy,
  getLayoutMode: () => layoutMode.value,
  setLayoutMode: m => {
    layoutMode.value = m
  },
  getRadialSettings: () => radialSettings.value,
  getSortAlphabetically: () => props.sortAlphabetically,
  savePositions: _savePos,
  clearPositions: _clearPos,
  relaxLocked,
  fitLocked,
})
const getLayoutOptions = () => layout.getLayoutOptions(layoutMode.value)

// Toggle collapsed state for a node
function toggleNodeCollapse(nodeId) {
  const cyNode = cy?.$(`#${nodeId}`)
  if (!cyNode || cyNode.length === 0) return
  const nodeData = cyNode.data('nodeData')
  if (!nodeData) return
  // Only emit serializable data to avoid cloning errors
  emit('update', { id: nodeData.id, collapsed: !nodeData.collapsed })
}

// Attach click handlers directly to collapse buttons
let globalCollapseHandlerAttached = false
function attachCollapseHandlers() {
  // Use document-level handler with capture
  if (!globalCollapseHandlerAttached) {
    globalCollapseHandlerAttached = true
    document.addEventListener(
      'mousedown',
      e => {
        const btn = e.target.closest('.collapse-btn')
        if (btn) {
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          const nodeId = parseInt(btn.dataset.collapseNode)
          if (!isNaN(nodeId)) {
            toggleNodeCollapse(nodeId)
          }
        }
      },
      true
    )
  }
}

// Events composable
const events = useGraphEvents({
  getCy: () => cy,
  getContainer: () => container.value,
  getDropHighlight: () => dropHighlightEl.value,
  getLinkModeActive: () => linkModeActive.value,
  getParent: () => props.parent,
  getSelectedIds: () => props.selectedIds,
  emit,
  showAddNodeModal,
  hideEditModal,
  showTooltip,
  hideTooltip,
  forceHideTooltip,
  toggleTooltipLock,
  savePositions: _savePos,
  onToggleCollapse: toggleNodeCollapse,
})

// Graph init composable
const graphInit = useGraphInit({
  getContainer: () => container.value,
  getLayoutOptions,
  getProps: () => props,
  savePositions: _savePos,
  relaxLocked,
  fitLocked,
  layout,
})

// Graph update composable
const graphUpdate = useGraphUpdate({
  getCy: () => cy,
  getProps: () => props,
  getSettings: () => ({
    maxDepth: maxDepth.value,
    visibleTypes: visibleTypes.value,
    showRootNode: showRootNode.value,
    showExternalLinks: showExternalLinks.value,
  }),
  loadPositions: _loadPos,
  savePositions: _savePos,
  getLayoutOptions,
  handleError,
  layout,
})

// Wheel handler composable
const wheel = useGraphWheel({
  getContainer: () => container.value,
  getCy: () => cy,
  trackpadZoomMode,
})

const debounce =
  (fn, d) =>
  (...a) => {
    if (updateDebounceTimer) clearTimeout(updateDebounceTimer)
    updateDebounceTimer = setTimeout(() => fn(...a), d)
  }
const debouncedUpdateGraph = debounce(() => updateGraph(), DEBOUNCE_DELAY_MS)

// Helper for saving node settings with consistent error handling
function saveNodeSetting(nodeId, field, value, errorContext) {
  if (!nodeId) return
  api
    .updateNode(nodeId, { [field]: value })
    .catch(e => handleError(e, { context: `Saving ${errorContext}`, silent: true }))
}

// Sync settings - save to workspace defaults and node-specific database
watch(layoutMode, m => {
  _layoutMode.value = m
  saveNodeSetting(props.parent?.id, 'graph_layout', m, 'layout mode')
})
watch(showRootNode, v => {
  _showRootNode.value = v
  saveNodeSetting(props.parent?.id, 'show_root_node', v ? 1 : 0, 'show root node')
})
watch(showExternalLinks, v => {
  _showExternalLinks.value = v
  if (props.parent?.id) saveNodeSetting(props.parent.id, 'show_external_links', v ? 1 : 0, 'show external links')
  else if (props.workspace)
    api
      .updateWorkspace(props.workspace, { show_external_links: v ? 1 : 0 })
      .catch(e => handleError(e, { context: 'Saving show external links to workspace', silent: true }))
})
watch(maxDepth, v => {
  if (props.parent?.id) {
    saveNodeSetting(props.parent.id, 'graph_max_depth', v, 'max depth')
  } else {
    // At root level, save to workspace localStorage settings
    _maxDepth.value = v
  }
})
watch(
  visibleTypes,
  v => {
    _visibleTypes.value = v
    saveNodeSetting(props.parent?.id, 'graph_type_filter', JSON.stringify(v), 'type filter')
  },
  { deep: true }
)
watch(relaxLocked, v => {
  _relaxLocked.value = v
  saveNodeSetting(props.parent?.id, 'graph_relax_locked', v ? 1 : 0, 'relax locked')
})
watch(fitLocked, v => {
  _fitLocked.value = v
  saveNodeSetting(props.parent?.id, 'graph_fit_locked', v ? 1 : 0, 'fit locked')
})
watch(
  radialSettings,
  v => {
    Object.assign(_radialSettings, v)
    saveNodeSetting(props.parent?.id, 'graph_physics', JSON.stringify(v), 'physics settings')
  },
  { deep: true }
)

watch(
  () => props.parent?.id,
  (n, o) => {
    const expectedMaxDepth = props.parent?.graph_max_depth ?? _maxDepth.value
    const expectedVisibleTypes = Array.isArray(props.parent?.graph_type_filter)
      ? props.parent.graph_type_filter
      : _visibleTypes.value
    const expected = [
      props.parent?.graph_layout || _layoutMode.value,
      props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value,
      props.parent?.show_external_links != null ? Boolean(props.parent.show_external_links) : _showExternalLinks.value,
      expectedMaxDepth,
      expectedVisibleTypes,
    ]
    if (
      o === undefined &&
      layoutMode.value === expected[0] &&
      showRootNode.value === expected[1] &&
      showExternalLinks.value === expected[2] &&
      maxDepth.value === expected[3] &&
      JSON.stringify(visibleTypes.value) === JSON.stringify(expected[4])
    ) {
      lastKnownParentId = n
      return
    }
    if (n !== lastKnownParentId) {
      lastKnownParentId = n
      layoutMode.value = props.parent?.graph_layout || _layoutMode.value
      showRootNode.value =
        props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value
      showExternalLinks.value =
        props.parent?.show_external_links != null ? Boolean(props.parent.show_external_links) : _showExternalLinks.value
      // maxDepth and visibleTypes are managed by the shared filter store (synced in App.vue)
      relaxLocked.value =
        props.parent?.graph_relax_locked != null ? Boolean(props.parent.graph_relax_locked) : _relaxLocked.value
      fitLocked.value =
        props.parent?.graph_fit_locked != null ? Boolean(props.parent.graph_fit_locked) : _fitLocked.value
      radialSettings.value = props.parent?.graph_physics
        ? { ..._radialSettings, ...props.parent.graph_physics }
        : { ..._radialSettings }
    }
  },
  { immediate: true }
)

// Reset to workspace defaults when workspace changes (at root level)
watch(
  () => props.workspace,
  () => {
    if (!props.parent) {
      layoutMode.value = _layoutMode.value
      showRootNode.value = _showRootNode.value
      showExternalLinks.value = getWorkspaceShowExternalLinks()
      // visibleTypes is managed by the shared filter store
      relaxLocked.value = _relaxLocked.value
      fitLocked.value = _fitLocked.value
      radialSettings.value = { ..._radialSettings }
    }
  }
)

// Update settings when workspaces load (workspace data may have settings overrides)
watch(
  () => props.workspaces,
  () => {
    if (!props.parent && props.workspaces.length > 0) {
      const wsShowExtLinks = getWorkspaceShowExternalLinks()
      if (showExternalLinks.value !== wsShowExtLinks) {
        showExternalLinks.value = wsShowExtLinks
      }
    }
  }
)

watch(showExternalLinks, () => {
  if (cy) {
    _savePos()
    cy.destroy()
    cy = null
  }
  initGraph()
})
watch(showRootNode, () => {
  if (cy) {
    _savePos()
    cy.destroy()
    cy = null
  }
  initGraph()
})
watch(
  visibleTypes,
  () => {
    if (cy) {
      _savePos()
      cy.destroy()
      cy = null
    }
    initGraph()
  },
  { deep: true }
)
watch(
  radialSettings,
  () => {
    if (relaxLocked.value) layout.restartContinuousRelax()
  },
  { deep: true }
)
watch(
  () => props.showDetail,
  o => {
    // Only force hide tooltip if it's not locked (locked tooltip should stay visible)
    if (o && !isTooltipLocked()) forceHideTooltip()
  }
)

const toggleTypeFilter = t => {
  filtersStore.toggleType(t)
}
const selectAllTypes = () => {
  filtersStore.showAllTypes()
}
const selectNoTypes = () => {
  filtersStore.setVisibleTypes([])
}

function handleGlobalKeydown(e) {
  const inModal = isAnyModalVisible()
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !inModal) {
    e.preventDefault()
    showAddNodeModal()
  }
  if (
    (e.metaKey || e.ctrlKey) &&
    ['Delete', 'Backspace'].includes(e.key) &&
    !inModal &&
    !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
    cy
  ) {
    const sel = cy.$('node:selected')
    if (sel.length > 0) {
      e.preventDefault()
      const ids = []
      sel.forEach(n => {
        const id = parseInt(n.id())
        if (!isNaN(id)) ids.push(id)
      })
      ids.length === 1 ? emit('delete', ids[0]) : ids.length > 1 && emit('delete-multiple', ids)
    }
  }
  // Space or Escape key dismisses locked tooltip
  if (
    (e.key === ' ' || e.key === 'Escape') &&
    !inModal &&
    !['INPUT', 'TEXTAREA'].includes(e.target.tagName) &&
    isTooltipLocked()
  ) {
    e.preventDefault()
    forceHideTooltip()
  }
  if ((e.metaKey || e.ctrlKey) && !inModal && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      emit('go-parent')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      emit('go-first-child')
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      emit('go-prev-sibling')
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      emit('go-next-sibling')
    }
  }
}

/**
 * Initialize the graph with nodes and edges.
 */
async function initGraph() {
  if (!container.value) return
  isInitializing = true

  const savedPos = _loadPos()
  const elements = await graphUpdate.buildElementsWithLinks(savedPos)
  const hasPos = Object.keys(savedPos).length > 0

  cy = graphInit.createCytoscapeInstance(elements, hasPos)
  if (!cy) {
    isInitializing = false
    return
  }
  cy.nodes().grabify()
  graphInit.setupHtmlLabels(cy)
  wheel.setupWheelHandler()
  events.setupEvents()
  graphInit.applyInitialLayout(cy, hasPos, () => {
    isInitializing = false
  })
  setTimeout(() => attachCollapseHandlers(), 300)
}

/**
 * Update the graph with current data.
 */
async function updateGraph() {
  await graphUpdate.updateGraph(cy, isInitializing, initGraph, attachCollapseHandlers)
}

const setLayout = m => {
  layout.setLayout(m)
}
const reLayout = () => {
  layout.reLayout()
}

watch(() => props.nodes, debouncedUpdateGraph, { deep: true })
watch(() => props.parent, debouncedUpdateGraph, { deep: true })
watch(() => props.detailThreshold, debouncedUpdateGraph)
watch(() => props.notesPreviewLength, debouncedUpdateGraph)
watch(() => props.ancestorColor, debouncedUpdateGraph)
watch(
  () => props.workspace,
  () => {
    if (cy) {
      cy.destroy()
      cy = null
    }
    initGraph()
  }
)
// maxDepth sync is handled by filter store in App.vue
watch(() => filtersStore.maxDepth, updateGraph)
watch(() => props.hideCompleted, updateGraph)
watch(
  () => props.selectedIds,
  ids => {
    if (!cy) return
    const set = new Set(ids || [])
    cy.nodes().forEach(n => {
      const id = parseInt(n.id())
      if (n.data('isSelected') !== set.has(id)) n.data('isSelected', set.has(id))
    })
    const cur = new Set()
    cy.$(':selected').forEach(n => cur.add(parseInt(n.id())))
    if (cur.size !== set.size || ![...cur].every(id => set.has(id))) {
      cy.nodes().unselect()
      set.forEach(id => cy.$(`#${id}`).select())
    }
    updateHtmlLabelSelectionFromIds(set)
  },
  { deep: true }
)
watch(
  () => props.selectedId,
  id => {
    if (props.selectedIds?.length > 0) return
    if (!cy) return
    cy.nodes().forEach(n => {
      const nid = parseInt(n.id())
      if (n.data('isSelected') !== (nid === id)) n.data('isSelected', nid === id)
    })
    if (id) {
      cy.nodes().unselect()
      cy.$(`#${id}`).select()
    }
    updateHtmlLabelSelectionFromIds(id ? new Set([id]) : new Set())
  }
)

const _centerOn = id => centerOnNode(cy, id)
const handleCenterEvent = e => {
  if (e.detail?.nodeId) _centerOn(e.detail.nodeId)
}
const _isVisible = id => isNodeVisible(cy, id)

defineExpose({
  relaxLayout: () => layout.relaxLayout(),
  localRelax: id => layout.localRelax(id),
  fitView: () => layout.fitView(),
  saveNodePositions: _savePos,
  updateGraph,
  isNodeVisible: _isVisible,
  maxDepth,
  visibleTypes,
})

onMounted(() => {
  initGraph()
  window.addEventListener('graph-center-node', handleCenterEvent)
  window.addEventListener('keydown', handleGlobalKeydown)
  nextTick(() => {
    if (graphControlsRef.value?.$el)
      graphControlsRef.value.$el.querySelectorAll('button[title]').forEach(b => {
        const c = b.getAttribute('title')
        if (c) {
          graphControlTippyInstances.push(
            tippy(b, { content: c, placement: 'bottom', delay: [200, 0], theme: 'toolbar' })
          )
          b.removeAttribute('title')
        }
      })
  })
})

onUnmounted(() => {
  window.removeEventListener('graph-center-node', handleCenterEvent)
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (updateDebounceTimer) clearTimeout(updateDebounceTimer)
  wheel.cleanup()
  layout.cleanup()
  if (cy) {
    cy.destroy()
    cy = null
  }
  graphControlTippyInstances.forEach(i => i.destroy())
  graphControlTippyInstances = []
})
</script>

<template>
  <div class="graph-wrapper">
    <Teleport to="#view-controls-target" defer>
      <GraphControls
        ref="graphControlsRef"
        :layout-mode="layoutMode"
        :relax-locked="relaxLocked"
        :fit-locked="fitLocked"
        :show-external-links="showExternalLinks"
        :show-root-node="showRootNode"
        :max-depth="maxDepth"
        :visible-types="visibleTypes"
        :radial-settings="radialSettings"
        :has-parent="!!parent"
        @set-layout="setLayout"
        @relax-click="layout.handleRelaxClick()"
        @fit-click="layout.handleFitClick()"
        @reset-layout="layout.resetLayout()"
        @update:show-external-links="showExternalLinks = $event"
        @update:show-root-node="showRootNode = $event"
        @update:max-depth="maxDepth = $event"
        @toggle-type="toggleTypeFilter"
        @select-all-types="selectAllTypes"
        @select-no-types="selectNoTypes"
        @apply-radial-settings="layout.applyRadialSettings()"
        @update:radial-settings="radialSettings = $event"
        @show-hotkey-help="showHotkeyHelp = true"
      />
    </Teleport>
    <div class="graph-container" :class="{ 'box-select-mode': boxSelectModeActive }" ref="container">
      <div v-if="nodes.length === 0" class="graph-empty">No nodes to display</div>
    </div>
    <div ref="dropHighlightEl" class="drop-highlight"></div>
    <div v-if="linkModeActive" class="link-mode-indicator">Link Mode</div>

    <HotkeyHelpModal :visible="showHotkeyHelp" @close="showHotkeyHelp = false" />

    <GraphEditModal
      :visible="editModal.visible"
      :node="editModal.node"
      :edited-node="editModal.editedNode"
      @update:edited-node="Object.assign(editModal.editedNode, $event)"
      @close="hideEditModal"
      @save="saveEditModal"
      @go-to-parent="goToParentFromModal"
      @wrap-with-parent="wrapWithParentFromModal"
    />

    <GraphPromptModal
      :visible="promptModal.visible"
      :title="promptModal.title"
      :placeholder="promptModal.placeholder"
      :value="promptModal.value"
      @update:value="promptModal.value = $event"
      @close="cancelPrompt"
      @submit="submitPrompt"
    />

    <AddNodeModal
      :visible="addNodeModal.visible"
      :title="addNodeModal.insertBetween ? 'Insert Between' : 'Add Node'"
      :parent-id="addNodeModal.parentId"
      :position="addNodeModal.position"
      :insert-between="addNodeModal.insertBetween"
      @close="hideAddNodeModal"
      @create="handleAddNodeCreate"
    />
  </div>
</template>

<style scoped src="./GraphView.css"></style>
