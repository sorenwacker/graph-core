<script setup>
import { ref, toRef, onMounted, onUnmounted, watch, nextTick } from 'vue'
import tippy from 'tippy.js'
import { api } from '../services/api'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { useGraphSettings, ALL_NODE_TYPES } from '../composables/useGraphSettings'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { useGraphModals } from '../composables/useGraphModals.js'
import { useGraphLayout } from '../composables/useGraphLayout.js'
import { useGraphEvents } from '../composables/useGraphEvents.js'
import { updateHtmlLabelSelectionFromIds, centerOnNode, isNodeVisible } from '../composables/useGraphSelection.js'
import { buildElements, addLinkEdges, fetchLinkedNodes } from '../composables/useGraphElements.js'
import {
  getPositionsKey,
  loadNodePositions,
  saveNodePositions,
  findSmartPosition,
} from '../composables/useNodePositions.js'
import { typeConfig } from '../utils/constants.js'
import { getContrastColor } from '../utils/formatting.js'
import {
  DEBOUNCE_DELAY_MS,
  LAYOUT_SETTLE_DELAY_MS,
  LAYOUT_SAVE_DELAY_MS,
  LAYOUT_RELAYOUT_DELAY_MS,
  NODE_POSITION_SETTLE_DELAY_MS,
} from '../utils/settingsConstants'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import d3Force from 'cytoscape-d3-force'
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { marked } from 'marked'
import AddNodeModal from './AddNodeModal.vue'
import GraphControls from './GraphControls.vue'
import GraphEditModal from './GraphEditModal.vue'
import GraphPromptModal from './GraphPromptModal.vue'
import HotkeyHelpModal from './HotkeyHelpModal.vue'

// Register cytoscape extensions once
if (!window.__cytoscapeExtensionsRegistered) {
  cytoscape.use(coseBilkent)
  cytoscape.use(cola)
  cytoscape.use(dagre)
  cytoscape.use(d3Force)
  nodeHtmlLabel(cytoscape)
  window.__cytoscapeExtensionsRegistered = true
}

// Configure marked for notes
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      return `<a href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noopener">${text}</a>`
    },
  },
})

function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  // Get first paragraph (split by double newline or single newline)
  const paragraphs = text.split(/\n\n|\n/)
  let firstPara = paragraphs[0].trim()

  // Also apply character limit
  if (firstPara.length > maxLen) {
    firstPara = firstPara.substring(0, maxLen)
    // Don't cut in middle of a markdown link
    const lastOpen = firstPara.lastIndexOf('['),
      lastClose = firstPara.lastIndexOf(')')
    if (lastOpen > lastClose) {
      firstPara = firstPara.substring(0, lastOpen).trimEnd()
    }
  }

  return marked.parse(firstPara)
}

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
  const ws = props.workspaces.find(w => w.id === props.workspace)
  return ws?.show_external_links != null ? Boolean(ws.show_external_links) : _showExternalLinks.value
}
const showExternalLinks = ref(
  props.parent?.show_external_links != null
    ? Boolean(props.parent.show_external_links)
    : getWorkspaceShowExternalLinks()
)
const maxDepth = ref(props.parent?.graph_max_depth ?? _maxDepth.value)
const visibleTypes = ref(
  Array.isArray(props.parent?.graph_type_filter) ? [...props.parent.graph_type_filter] : [..._visibleTypes.value]
)
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
  shouldShowTooltip: () =>
    props.hoverPreviewEnabled && !props.showDetail && !props.fullscreenDetailOpen && !editModal.value.visible,
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
  savePositions: _savePos,
  onToggleCollapse: toggleNodeCollapse,
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
      maxDepth.value = props.parent?.graph_max_depth ?? _maxDepth.value
      visibleTypes.value = Array.isArray(props.parent?.graph_type_filter)
        ? [...props.parent.graph_type_filter]
        : [..._visibleTypes.value]
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
      visibleTypes.value = [..._visibleTypes.value]
      relaxLocked.value = _relaxLocked.value
      fitLocked.value = _fitLocked.value
      radialSettings.value = { ..._radialSettings }
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
    if (o) forceHideTooltip()
  }
)

const toggleTypeFilter = t => {
  const i = visibleTypes.value.indexOf(t)
  i >= 0 ? visibleTypes.value.splice(i, 1) : visibleTypes.value.push(t)
}
const selectAllTypes = () => {
  visibleTypes.value = [...ALL_NODE_TYPES]
}
const selectNoTypes = () => {
  visibleTypes.value = []
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
 * Create the cytoscape instance with configuration.
 */
function createCytoscapeInstance(elements, hasPos) {
  return cytoscape({
    container: container.value,
    elements,
    boxSelectionEnabled: true,
    selectionType: 'additive',
    userZoomingEnabled: false, // Disable default wheel zoom - we handle it custom
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'transparent',
          'background-opacity': 0,
          'border-width': 0,
          label: '',
          width: 180,
          height: 80,
          shape: 'rectangle',
          'overlay-opacity': 0,
        },
      },
      { selector: 'node[?isParent]', style: { width: 200, height: 100 } },
      { selector: 'node[?isPerson]', style: { width: 120, height: 40, shape: 'round-rectangle' } },
      { selector: 'node:selected', style: { 'border-width': 0 } },
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.2,
        },
      },
      { selector: 'edge:selected', style: { width: 3, 'line-color': '#f39c12', 'target-arrow-color': '#f39c12' } },
      {
        selector: 'edge[isLink]',
        style: {
          'line-style': 'dashed',
          'line-color': '#9b59b6',
          'target-arrow-color': '#9b59b6',
          'target-arrow-shape': 'none',
          opacity: 0.7,
        },
      },
    ],
    layout: hasPos ? { name: 'preset' } : getLayoutOptions(),
  })
}

/**
 * Configure the node HTML label plugin for rendering custom node templates.
 */
function setupHtmlLabels() {
  cy.nodeHtmlLabel(
    [
      {
        query: 'node',
        halign: 'center',
        valign: 'center',
        halignBox: 'center',
        valignBox: 'center',
        tpl: d => {
          const n = d.nodeData
          if (!n) return ''
          if (n.type === 'person') {
            const c = n.color && n.color !== '#0f4c75' ? n.color : d.customBgTint || '#6b7280'
            return `<div class="node-person" data-node-id="${n.id}" data-selected="${d.isSelected}" style="background-color:${c};color:${getContrastColor(c)}"><span class="person-name">${n.title || 'Untitled'}</span></div>`
          }
          const bc = d.borderColor || typeConfig.task.text,
            bg = d.customBgTint
              ? `background:linear-gradient(135deg,${d.customBgTint}99 0%,${d.customBgTint}44 50%,var(--bg-secondary) 100%),var(--bg-secondary);`
              : ''
          let notes = ''
          if (d.showDetails && n.notes) {
            notes =
              n.notes_sensitive || props.hideSensitive
                ? '<span style="opacity:0.5"></span>'
                : renderMarkdownHtml(n.notes, props.notesPreviewLength)
          }
          const childBadge = d.childCount > 0 ? `<span class="child-count-badge">${d.childCount}</span>` : ''
          const collapseBtn = d.hasChildren
            ? `<button class="collapse-btn" data-collapse-node="${n.id}" title="${d.isCollapsed ? 'Expand children' : 'Collapse children'}">${d.isCollapsed ? '+' : '-'}</button>`
            : ''
          return `<div class="node-html ${n.completed ? 'completed' : ''} ${d.shouldGlow ? 'current-container' : ''} ${n.favorite ? 'favorite' : ''} ${d.isCollapsed ? 'collapsed-node' : ''}" data-node-id="${n.id}" data-selected="${d.isSelected}" style="border-color:${bc};--glow-color:${bc};${bg}">${collapseBtn}${childBadge}<div class="node-html-title">${n.title || 'Untitled'}${n.notes && !d.showDetails ? '<span class="notes-indicator"></span>' : ''}</div>${notes ? `<div class="node-html-notes">${notes}</div>` : ''}</div>`
        },
      },
    ],
    { enablePointerEvents: true }
  )
}

/**
 * Run layout and save positions for initial graph setup.
 */
function applyInitialLayout(hasPos) {
  if (props.selectedIds?.size > 0) props.selectedIds.forEach(id => cy.$(`#${id}`).select())
  else if (props.selectedId) cy.$(`#${props.selectedId}`).select()

  if (!hasPos && cy.nodes().length > 0) {
    setTimeout(() => {
      cy.layout(getLayoutOptions()).run()
      setTimeout(() => {
        cy.fit(50)
        _savePos()
        isInitializing = false
        if (relaxLocked.value) layout.startContinuousRelax()
        if (fitLocked.value) layout.startContinuousFit()
      }, LAYOUT_SETTLE_DELAY_MS)
    }, NODE_POSITION_SETTLE_DELAY_MS)
  } else {
    isInitializing = false
    if (relaxLocked.value) layout.startContinuousRelax()
    if (fitLocked.value) layout.startContinuousFit()
  }
}

/**
 * Build graph elements and optionally fetch external links.
 */
async function buildElementsWithLinks(savedPos) {
  const elements = buildElements({
    nodeList: props.nodes,
    parentNode: props.parent,
    savedPositions: savedPos,
    detailThreshold: props.detailThreshold,
    maxDepth: maxDepth.value,
    hideCompleted: props.hideCompleted,
    hideSensitive: props.hideSensitive,
    sortAlphabetically: props.sortAlphabetically,
    visibleTypes: visibleTypes.value,
    showRootNode: showRootNode.value,
    selectedIds: props.selectedIds,
    selectedId: props.selectedId,
    ancestorColor: props.ancestorColor,
    inheritColors: props.inheritColors,
  })

  if (showExternalLinks.value) {
    try {
      // Capture hierarchy node IDs before fetching external nodes
      const hierarchyNodeIds = new Set(
        elements.filter(e => !e.data.source && !e.data.isLinkedExternal).map(e => e.data.id)
      )
      const ids = elements.filter(e => !e.data.source).map(e => parseInt(e.data.id))
      if (ids.length > 0) {
        const links = await api.getAllLinks(ids)
        await fetchLinkedNodes({
          elements,
          links,
          savedPositions: savedPos,
          hideCompleted: props.hideCompleted,
          selectedIds: props.selectedIds,
          selectedId: props.selectedId,
          handleError,
        })
        // Pass hierarchyNodeIds to filter out links between external nodes
        addLinkEdges(elements, links, hierarchyNodeIds)
      }
    } catch (e) {
      handleError(e, { context: 'Loading links', silent: true })
    }
  }

  return elements
}

// Trackpad zoom/pan state
let wheelCleanup = null

/**
 * Set up custom wheel handling for trackpad zoom modes.
 * Mode 'scroll': Two-finger vertical scroll zooms (like Google Maps)
 * Mode 'pinch': Only pinch zooms, scroll pans (scroll-friendly)
 */
function setupWheelHandler() {
  if (!container.value || !cy) return

  // Clean up previous handler
  if (wheelCleanup) {
    wheelCleanup()
    wheelCleanup = null
  }

  const el = container.value

  function handleWheel(e) {
    e.preventDefault()

    const rect = el.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Determine if this should zoom or pan based on mode
    const isHorizontalPan = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.3
    const isPinch = e.ctrlKey // Browser synthesizes ctrlKey for pinch gestures

    let shouldZoom
    if (trackpadZoomMode.value === 'pinch') {
      // Pinch mode: only pinch gesture zooms
      shouldZoom = isPinch
    } else {
      // Scroll mode (default): vertical scroll zooms, horizontal pans
      shouldZoom = !isHorizontalPan || isPinch
    }

    if (shouldZoom) {
      // Zoom centered on mouse position
      const intensity = isPinch ? 0.008 : 0.003
      const multiplier = Math.exp(-e.deltaY * intensity)
      const currentZoom = cy.zoom()
      const newZoom = Math.min(Math.max(currentZoom * multiplier, 0.1), 3)

      // Convert mouse position to model coordinates
      const pan = cy.pan()
      const modelX = (mouseX - pan.x) / currentZoom
      const modelY = (mouseY - pan.y) / currentZoom

      // Apply zoom centered on mouse
      cy.zoom({ level: newZoom, renderedPosition: { x: mouseX, y: mouseY } })
    } else {
      // Pan
      const pan = cy.pan()
      cy.pan({ x: pan.x - e.deltaX, y: pan.y - e.deltaY })
    }
  }

  el.addEventListener('wheel', handleWheel, { passive: false })
  wheelCleanup = () => el.removeEventListener('wheel', handleWheel)
}

/**
 * Initialize the graph with nodes and edges.
 */
async function initGraph() {
  if (!container.value) return
  isInitializing = true

  const savedPos = _loadPos()
  const elements = await buildElementsWithLinks(savedPos)
  const hasPos = Object.keys(savedPos).length > 0

  cy = createCytoscapeInstance(elements, hasPos)
  cy.nodes().grabify()
  setupHtmlLabels()
  setupWheelHandler()
  events.setupEvents()
  applyInitialLayout(hasPos)
  setTimeout(() => attachCollapseHandlers(), 300)
}

/**
 * Save current zoom, pan, and node positions from the graph.
 */
function collectCurrentState() {
  const savedZoom = cy.zoom()
  const savedPan = { ...cy.pan() }
  const savedPos = _loadPos()
  const existingIds = new Set()
  cy.nodes().forEach(n => {
    existingIds.add(n.id())
    const p = n.position()
    if (p.x !== 0 || p.y !== 0) savedPos[n.id()] = { x: p.x, y: p.y }
  })
  return { savedZoom, savedPan, savedPos, existingIds }
}

/**
 * Determine what changed and apply updates. Returns diff info or null if only data updates needed.
 */
function diffAndApply(elements, existingIds, savedPos) {
  const hasPos = Object.keys(savedPos).length > 0
  const elemPos = {}
  elements.forEach(e => {
    if (!e.data.source && e.position) elemPos[e.data.id] = e.position
  })

  let hasNew = false
  let hasEdge = false
  const newIds = new Set()
  const newEdges = new Set()
  const newNodeIds = []
  const extNeedRelax = []
  const existEdges = new Set()
  cy.edges().forEach(e => existEdges.add(`${e.source().id()}-${e.target().id()}`))

  elements.forEach(e => {
    if (e.data.source) {
      const k = `${e.data.source}-${e.data.target}`
      newEdges.add(k)
      if (!existEdges.has(k)) hasEdge = true
    } else {
      newIds.add(e.data.id)
      const isNew = !existingIds.has(e.data.id)
      const isExt = e.data.isLinkedExternal
      if (isNew && !isExt) {
        hasNew = true
        if (!e.position) newNodeIds.push(e.data.id)
      }
      if (isExt && !e.position) extNeedRelax.push(e.data.id)
      if (!e.position) {
        const nd = e.data.nodeData
        e.position = findSmartPosition(
          e.data.id,
          nd?.parent_id,
          { ...savedPos, ...elemPos },
          nd?.children?.map(c => c.id) || [],
          cy
        )
      }
    }
  })

  if (!hasEdge)
    for (const x of existEdges)
      if (!newEdges.has(x)) {
        hasEdge = true
        break
      }
  let hasRemoved = false
  for (const x of existingIds)
    if (!newIds.has(x)) {
      hasRemoved = true
      break
    }

  // If only data changed (no structural changes), update in place
  if (!hasNew && !hasRemoved && !hasEdge && hasPos) {
    const map = new Map()
    elements.forEach(e => {
      if (!e.data.source) map.set(e.data.id, e)
    })
    cy.batch(() => {
      cy.nodes().forEach(n => {
        const el = map.get(n.id())
        if (el) n.data(el.data)
      })
    })
    _savePos()
    return null // Signal that we're done
  }

  return { hasPos, newNodeIds, extNeedRelax }
}

/**
 * Position and relax new nodes after graph update.
 */
function handleNewNodes(diffResult, savedZoom, savedPan) {
  const { hasPos, newNodeIds, extNeedRelax } = diffResult
  const allNeed = [...newNodeIds, ...extNeedRelax]

  if (!hasPos) {
    cy.layout(getLayoutOptions()).run()
    setTimeout(_savePos, LAYOUT_SAVE_DELAY_MS)
  } else if (allNeed.length > 0) {
    setTimeout(() => layout.autoRelaxNewNodes(allNeed), NODE_POSITION_SETTLE_DELAY_MS)
  } else {
    requestAnimationFrame(() => {
      cy.viewport({ zoom: savedZoom, pan: savedPan })
      _savePos()
    })
  }
}

async function updateGraph() {
  if (isInitializing) return
  if (!cy) {
    await initGraph()
    return
  }

  const { savedZoom, savedPan, savedPos, existingIds } = collectCurrentState()
  const elements = await buildElementsWithLinks(savedPos)
  const diffResult = diffAndApply(elements, existingIds, savedPos)

  // If diffAndApply returned null, only data updates were needed
  if (diffResult === null) return

  // Apply structural changes
  cy.batch(() => {
    cy.elements().remove()
    cy.add(elements)
    cy.nodes().grabify()
  })
  cy.viewport({ zoom: savedZoom, pan: savedPan })

  handleNewNodes(diffResult, savedZoom, savedPan)
  setTimeout(attachCollapseHandlers, 100)
}

const setLayout = m => {
  if (relaxLocked.value) {
    relaxLocked.value = false
    layout.stopContinuousRelax()
  }
  if (fitLocked.value) {
    fitLocked.value = false
    layout.stopContinuousFit()
  }
  layoutMode.value = m
  reLayout()
}
const reLayout = () => {
  if (cy) {
    _clearPos()
    cy.layout(getLayoutOptions()).run()
    setTimeout(_savePos, LAYOUT_RELAYOUT_DELAY_MS)
  }
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
watch(_maxDepth, v => {
  if (!props.parent?.id) {
    maxDepth.value = v
  }
})
watch(maxDepth, updateGraph)
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
  if (wheelCleanup) {
    wheelCleanup()
    wheelCleanup = null
  }
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
