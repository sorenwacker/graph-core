<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import tippy from 'tippy.js'
import { api } from '../services/api'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { useGraphSettings, ALL_NODE_TYPES } from '../composables/useGraphSettings.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { useGraphModals } from '../composables/useGraphModals.js'
import { useGraphLayout } from '../composables/useGraphLayout.js'
import { useGraphEvents } from '../composables/useGraphEvents.js'
import { updateHtmlLabelSelectionFromIds, centerOnNode, isNodeVisible } from '../composables/useGraphSelection.js'
import { buildElements, addLinkEdges, fetchLinkedNodes } from '../composables/useGraphElements.js'
import { getPositionsKey, loadNodePositions, saveNodePositions, findSmartPosition } from '../composables/useNodePositions.js'
import { nodeTypes, typeConfig } from '../utils/constants.js'
import { getContrastColor } from '../utils/formatting.js'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import d3Force from 'cytoscape-d3-force'
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { marked } from 'marked'
import MarkdownRenderer from './MarkdownRenderer.vue'
import AddNodeModal from './AddNodeModal.vue'

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
marked.use({ breaks: true, gfm: true, renderer: {
  link({ href, title, text }) {
    return `<a href="${href}"${title ? ` title="${title}"` : ''} target="_blank" rel="noopener">${text}</a>`
  }
}})

function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  if (text.length <= maxLen) return marked.parse(text)
  let truncated = text.substring(0, maxLen)
  const lastOpen = truncated.lastIndexOf('['), lastClose = truncated.lastIndexOf(')')
  if (lastOpen > lastClose) {
    const end = text.indexOf(')', lastOpen)
    truncated = end !== -1 && end < maxLen + 300 ? text.substring(0, end + 1) : text.substring(0, lastOpen).trimEnd()
  }
  return marked.parse(truncated + '...')
}

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  parent: { type: Object, default: null },
  selectedId: Number,
  selectedIds: { type: Array, default: () => [] },
  detailThreshold: { type: Number, default: 30 },
  maxDepth: { type: Number, default: 0 },
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  workspace: { type: String, default: 'work' },
  workspaces: { type: Array, default: () => [] },
  showDetail: { type: Boolean, default: false },
  fullscreenDetailOpen: { type: Boolean, default: false },
  hoverPreviewEnabled: { type: Boolean, default: true },
  sortAlphabetically: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'select-multiple', 'enter', 'move', 'add-child', 'insert-between', 'update', 'create', 'delete', 'delete-multiple', 'wrap-with-parent', 'open-fullscreen', 'link', 'unlink', 'context-menu', 'toggle-complete', 'toggle-favorite', 'open-link-search', 'go-parent', 'go-first-child', 'go-prev-sibling', 'go-next-sibling'])

const container = ref(null), dropHighlightEl = ref(null), graphControlsRef = ref(null)
let graphControlTippyInstances = [], cy = null, isInitializing = false, lastKnownParentId = props.parent?.id, updateDebounceTimer = null

// Link/box select mode
const linkModeActive = ref(false), boxSelectModeActive = ref(false)
const isInsideEditor = (t) => !t ? false : ['input', 'textarea'].includes(t.tagName?.toLowerCase()) || t.contentEditable === 'true' || t.closest('.cm-editor')

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (isInsideEditor(e.target)) return
    if (e.key === 'Alt' || e.altKey) linkModeActive.value = true
    if (['Shift', 'Meta', 'Control'].includes(e.key)) boxSelectModeActive.value = true
  })
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') linkModeActive.value = false
    if (['Shift', 'Meta', 'Control'].includes(e.key)) boxSelectModeActive.value = false
  })
  document.addEventListener('mousemove', (e) => {
    if (isInsideEditor(e.target)) return
    linkModeActive.value = e.altKey
    boxSelectModeActive.value = e.shiftKey || e.metaKey || e.ctrlKey
  })
}

// Graph settings
const { layoutMode: _layoutMode, relaxLocked, fitLocked, showExternalLinks: _showExternalLinks, showRootNode: _showRootNode, visibleTypes, radialSettings } = useGraphSettings()
const layoutMode = ref(props.parent?.graph_layout || _layoutMode.value)
const showRootNode = ref(props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value)
const showExternalLinks = ref(props.parent?.show_external_links != null ? Boolean(props.parent.show_external_links) : _showExternalLinks.value)
const showTypeFilter = ref(false), showHotkeyHelp = ref(false), showLayoutSettings = ref(false)

const { handleError } = useErrorHandler()

const { showTooltip, hideTooltip, forceHide: forceHideTooltip } = useNodeTooltip({
  onToggleComplete: (id) => {
    const node = props.nodes.flatMap(function f(n) { return [n, ...(n.children || []).flatMap(f)] }).find(n => n.id === id) || (props.parent?.id === id ? props.parent : null)
    if (node) emit('update', { ...node, completed: !node.completed })
  },
  onOpenDetail: (id) => emit('open-fullscreen', id),
  getHideSensitive: () => props.hideSensitive,
  shouldShowTooltip: () => props.hoverPreviewEnabled && !props.showDetail && !props.fullscreenDetailOpen && !editModal.value.visible
})

const { editModal, showNotesPreview, editTitleInput, editModalEl, hideEditModal, saveEditModal, handleEditModalKeydown, goToParentFromModal, wrapWithParentFromModal, promptModal, promptInputRef, submitPrompt, cancelPrompt, handlePromptKeydown, addNodeModal, showAddNodeModal, hideAddNodeModal, handleAddNodeCreate, isAnyModalVisible } = useGraphModals({ emit, forceHideTooltip })

// Position helpers
const _getKey = () => getPositionsKey(props.workspace, props.parent?.id)
const _loadPos = () => loadNodePositions(_getKey())
const _savePos = () => saveNodePositions(cy, _getKey())
const _clearPos = () => localStorage.removeItem(_getKey())

// Layout composable
const layout = useGraphLayout({ getCy: () => cy, getLayoutMode: () => layoutMode.value, setLayoutMode: (m) => { layoutMode.value = m }, getRadialSettings: () => radialSettings, savePositions: _savePos, clearPositions: _clearPos })
const getLayoutOptions = () => layout.getLayoutOptions(layoutMode.value)

// Events composable
const events = useGraphEvents({ getCy: () => cy, getContainer: () => container.value, getDropHighlight: () => dropHighlightEl.value, getLinkModeActive: () => linkModeActive.value, getParent: () => props.parent, emit, showAddNodeModal, hideEditModal, showTooltip, hideTooltip, forceHideTooltip, savePositions: _savePos })

const debounce = (fn, d) => (...a) => { if (updateDebounceTimer) clearTimeout(updateDebounceTimer); updateDebounceTimer = setTimeout(() => fn(...a), d) }
const debouncedUpdateGraph = debounce(() => updateGraph(), 50)

// Sync settings
watch(layoutMode, (m) => { _layoutMode.value = m; if (props.parent?.id) api.updateNode(props.parent.id, { graph_layout: m }).catch(() => {}) })
watch(showRootNode, (v) => { _showRootNode.value = v; if (props.parent?.id) api.updateNode(props.parent.id, { show_root_node: v ? 1 : 0 }).catch(() => {}) })
watch(showExternalLinks, (v) => { _showExternalLinks.value = v; if (props.parent?.id) api.updateNode(props.parent.id, { show_external_links: v ? 1 : 0 }).catch(() => {}) })

watch(() => props.parent?.id, (n, o) => {
  const expected = [props.parent?.graph_layout || _layoutMode.value, props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value, props.parent?.show_external_links != null ? Boolean(props.parent.show_external_links) : _showExternalLinks.value]
  if (o === undefined && layoutMode.value === expected[0] && showRootNode.value === expected[1] && showExternalLinks.value === expected[2]) { lastKnownParentId = n; return }
  if (n !== lastKnownParentId) {
    lastKnownParentId = n
    layoutMode.value = props.parent?.graph_layout || localStorage.getItem('graph-layout-mode') || 'tree'
    showRootNode.value = props.parent?.show_root_node != null ? Boolean(props.parent.show_root_node) : _showRootNode.value
    showExternalLinks.value = props.parent?.show_external_links != null ? Boolean(props.parent.show_external_links) : _showExternalLinks.value
  }
}, { immediate: true })

watch(showExternalLinks, () => { if (cy) { cy.destroy(); cy = null }; initGraph() })
watch(showRootNode, () => { if (cy) { cy.destroy(); cy = null }; initGraph() })
watch(visibleTypes, () => { if (cy) { cy.destroy(); cy = null }; initGraph() }, { deep: true })
watch(radialSettings, () => { if (relaxLocked.value) layout.restartContinuousRelax() }, { deep: true })
watch(() => props.showDetail, (o) => { if (o) forceHideTooltip() })

const toggleTypeFilter = (t) => { const i = visibleTypes.value.indexOf(t); i >= 0 ? visibleTypes.value.splice(i, 1) : visibleTypes.value.push(t) }
const selectAllTypes = () => { visibleTypes.value = [...ALL_NODE_TYPES] }
const selectNoTypes = () => { visibleTypes.value = [] }

function handleGlobalKeydown(e) {
  const inModal = isAnyModalVisible()
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !inModal) { e.preventDefault(); showAddNodeModal() }
  if ((e.metaKey || e.ctrlKey) && ['Delete', 'Backspace'].includes(e.key) && !inModal && !['INPUT', 'TEXTAREA'].includes(e.target.tagName) && cy) {
    const sel = cy.$('node:selected')
    if (sel.length > 0) { e.preventDefault(); const ids = []; sel.forEach(n => { const id = parseInt(n.id()); if (!isNaN(id)) ids.push(id) }); ids.length === 1 ? emit('delete', ids[0]) : ids.length > 1 && emit('delete-multiple', ids) }
  }
  if ((e.metaKey || e.ctrlKey) && !inModal && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
    if (e.key === 'ArrowUp') { e.preventDefault(); emit('go-parent') }
    if (e.key === 'ArrowDown') { e.preventDefault(); emit('go-first-child') }
    if (e.key === 'ArrowLeft') { e.preventDefault(); emit('go-prev-sibling') }
    if (e.key === 'ArrowRight') { e.preventDefault(); emit('go-next-sibling') }
  }
}

async function initGraph() {
  if (!container.value) return
  isInitializing = true
  const savedPos = _loadPos()
  const elements = buildElements({ nodeList: props.nodes, parentNode: props.parent, savedPositions: savedPos, detailThreshold: props.detailThreshold, maxDepth: props.maxDepth, hideCompleted: props.hideCompleted, hideSensitive: props.hideSensitive, sortAlphabetically: props.sortAlphabetically, visibleTypes: visibleTypes.value, showRootNode: showRootNode.value, selectedIds: props.selectedIds, selectedId: props.selectedId })

  if (showExternalLinks.value) {
    try {
      const ids = elements.filter(e => !e.data.source).map(e => parseInt(e.data.id))
      if (ids.length > 0) { const links = await api.getAllLinks(ids); await fetchLinkedNodes({ elements, links, savedPositions: savedPos, hideCompleted: props.hideCompleted, selectedIds: props.selectedIds, selectedId: props.selectedId, handleError }); addLinkEdges(elements, links) }
    } catch (e) { handleError(e, { context: 'Loading links', silent: true }) }
  }

  const hasPos = Object.keys(savedPos).length > 0
  cy = cytoscape({ container: container.value, elements, boxSelectionEnabled: true, selectionType: 'additive', style: [
    { selector: 'node', style: { 'background-color': 'transparent', 'background-opacity': 0, 'border-width': 0, 'label': '', 'width': 180, 'height': 80, 'shape': 'rectangle', 'overlay-opacity': 0 } },
    { selector: 'node[?isParent]', style: { 'width': 200, 'height': 100 } },
    { selector: 'node[?isPerson]', style: { 'width': 120, 'height': 40, 'shape': 'round-rectangle' } },
    { selector: 'node:selected', style: { 'border-width': 3, 'border-color': '#4a9eff', 'border-style': 'solid' } },
    { selector: 'edge', style: { 'width': 2, 'line-color': '#999', 'target-arrow-color': '#999', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 1.2 } },
    { selector: 'edge:selected', style: { 'width': 3, 'line-color': '#f39c12', 'target-arrow-color': '#f39c12' } },
    { selector: 'edge[isLink]', style: { 'line-style': 'dashed', 'line-color': '#9b59b6', 'target-arrow-color': '#9b59b6', 'target-arrow-shape': 'none', 'opacity': 0.7 } }
  ], layout: hasPos ? { name: 'preset' } : getLayoutOptions() })

  cy.nodes().grabify()
  cy.nodeHtmlLabel([{ query: 'node', halign: 'center', valign: 'center', halignBox: 'center', valignBox: 'center', tpl: (d) => {
    const n = d.nodeData; if (!n) return ''
    if (n.type === 'person') { const c = (n.color && n.color !== '#0f4c75') ? n.color : (d.customBgTint || '#6b7280'); return `<div class="node-person" data-node-id="${n.id}" data-selected="${d.isSelected}" style="background-color:${c};color:${getContrastColor(c)}"><span class="person-name">${n.title || 'Untitled'}</span></div>` }
    const bc = d.borderColor || typeConfig.task.text, bg = d.customBgTint ? `background:linear-gradient(135deg,${d.customBgTint}99 0%,${d.customBgTint}44 50%,transparent 100%),var(--bg-secondary);` : ''
    let notes = ''; if (d.showDetails && n.notes) { notes = (n.notes_sensitive || props.hideSensitive) ? '<span style="opacity:0.5"></span>' : renderMarkdownHtml(n.notes, d.totalNodes <= 5 ? 500 : d.totalNodes <= 10 ? 300 : 150) }
    return `<div class="node-html ${n.completed ? 'completed' : ''} ${d.shouldGlow ? 'current-container' : ''} ${n.favorite ? 'favorite' : ''}" data-node-id="${n.id}" data-selected="${d.isSelected}" style="border-color:${bc};--glow-color:${bc};${bg}"><div class="node-html-title">${n.title || 'Untitled'}${n.notes && !d.showDetails ? '<span class="notes-indicator"></span>' : ''}</div>${notes ? `<div class="node-html-notes">${notes}</div>` : ''}</div>`
  }}])

  events.setupEvents()
  if (props.selectedIds?.size > 0) props.selectedIds.forEach(id => cy.$(`#${id}`).select())
  else if (props.selectedId) cy.$(`#${props.selectedId}`).select()

  if (!hasPos && cy.nodes().length > 0) { setTimeout(() => { cy.layout(getLayoutOptions()).run(); setTimeout(() => { cy.fit(50); _savePos(); isInitializing = false; if (relaxLocked.value) layout.startContinuousRelax(); if (fitLocked.value) layout.startContinuousFit() }, 500) }, 100) }
  else { isInitializing = false; if (relaxLocked.value) layout.startContinuousRelax(); if (fitLocked.value) layout.startContinuousFit() }
}

async function updateGraph() {
  if (isInitializing) return
  if (!cy) { await initGraph(); return }

  const savedZoom = cy.zoom(), savedPan = { ...cy.pan() }, savedPos = _loadPos()
  const existingIds = new Set()
  cy.nodes().forEach(n => { existingIds.add(n.id()); const p = n.position(); if (p.x !== 0 || p.y !== 0) savedPos[n.id()] = { x: p.x, y: p.y } })

  const elements = buildElements({ nodeList: props.nodes, parentNode: props.parent, savedPositions: savedPos, detailThreshold: props.detailThreshold, maxDepth: props.maxDepth, hideCompleted: props.hideCompleted, hideSensitive: props.hideSensitive, sortAlphabetically: props.sortAlphabetically, visibleTypes: visibleTypes.value, showRootNode: showRootNode.value, selectedIds: props.selectedIds, selectedId: props.selectedId })

  if (showExternalLinks.value) {
    try {
      const ids = elements.filter(e => !e.data.source).map(e => parseInt(e.data.id))
      if (ids.length > 0) { const links = await api.getAllLinks(ids); await fetchLinkedNodes({ elements, links, savedPositions: savedPos, hideCompleted: props.hideCompleted, selectedIds: props.selectedIds, selectedId: props.selectedId, handleError }); addLinkEdges(elements, links) }
    } catch (e) { handleError(e, { context: 'Loading links', silent: true }) }
  }

  const hasPos = Object.keys(savedPos).length > 0, elemPos = {}
  elements.forEach(e => { if (!e.data.source && e.position) elemPos[e.data.id] = e.position })

  let hasNew = false, hasEdge = false; const newIds = new Set(), newEdges = new Set(), newNodeIds = [], extNeedRelax = []
  const existEdges = new Set(); cy.edges().forEach(e => existEdges.add(`${e.source().id()}-${e.target().id()}`))

  elements.forEach(e => {
    if (e.data.source) { const k = `${e.data.source}-${e.data.target}`; newEdges.add(k); if (!existEdges.has(k)) hasEdge = true }
    else { newIds.add(e.data.id); const isNew = !existingIds.has(e.data.id), isExt = e.data.isLinkedExternal
      if (isNew && !isExt) { hasNew = true; newNodeIds.push(e.data.id) }
      if (isExt && !e.position) extNeedRelax.push(e.data.id)
      if (!e.position) { const nd = e.data.nodeData; e.position = findSmartPosition(e.data.id, nd?.parent_id, { ...savedPos, ...elemPos }, nd?.children?.map(c => c.id) || [], cy) }
    }
  })

  if (!hasEdge) for (const x of existEdges) if (!newEdges.has(x)) { hasEdge = true; break }
  let hasRemoved = false; for (const x of existingIds) if (!newIds.has(x)) { hasRemoved = true; break }

  if (!hasNew && !hasRemoved && !hasEdge && hasPos) {
    const map = new Map(); elements.forEach(e => { if (!e.data.source) map.set(e.data.id, e) })
    cy.batch(() => { cy.nodes().forEach(n => { const el = map.get(n.id()); if (el) n.data(el.data) }) })
    _savePos(); return
  }

  cy.batch(() => { cy.elements().remove(); cy.add(elements); cy.nodes().grabify() })
  cy.viewport({ zoom: savedZoom, pan: savedPan })

  const allNeed = [...newNodeIds, ...extNeedRelax]
  if (!hasPos) { cy.layout(getLayoutOptions()).run(); setTimeout(_savePos, 600) }
  else if (allNeed.length > 0) setTimeout(() => layout.autoRelaxNewNodes(allNeed), 100)
  else requestAnimationFrame(() => { cy.viewport({ zoom: savedZoom, pan: savedPan }); _savePos() })
}

const setLayout = (m) => { if (relaxLocked.value) { relaxLocked.value = false; layout.stopContinuousRelax() }; if (fitLocked.value) { fitLocked.value = false; layout.stopContinuousFit() }; layoutMode.value = m; reLayout() }
const reLayout = () => { if (cy) { _clearPos(); cy.layout(getLayoutOptions()).run(); setTimeout(_savePos, 800) } }

watch(() => props.nodes, debouncedUpdateGraph, { deep: true })
watch(() => props.parent, debouncedUpdateGraph, { deep: true })
watch(() => props.detailThreshold, debouncedUpdateGraph)
watch(() => props.workspace, () => { if (cy) { cy.destroy(); cy = null }; initGraph() })
watch(() => props.maxDepth, updateGraph)
watch(() => props.hideCompleted, updateGraph)
watch(() => props.selectedIds, (ids) => {
  if (!cy) return; const set = new Set(ids || [])
  cy.nodes().forEach(n => { const id = parseInt(n.id()); if (n.data('isSelected') !== set.has(id)) n.data('isSelected', set.has(id)) })
  const cur = new Set(); cy.$(':selected').forEach(n => cur.add(parseInt(n.id())))
  if (cur.size !== set.size || ![...cur].every(id => set.has(id))) { cy.nodes().unselect(); set.forEach(id => cy.$(`#${id}`).select()) }
  updateHtmlLabelSelectionFromIds(set)
}, { deep: true })
watch(() => props.selectedId, (id) => {
  if (props.selectedIds?.length > 0) return; if (!cy) return
  cy.nodes().forEach(n => { const nid = parseInt(n.id()); if (n.data('isSelected') !== (nid === id)) n.data('isSelected', nid === id) })
  if (id) { cy.nodes().unselect(); cy.$(`#${id}`).select() }
  updateHtmlLabelSelectionFromIds(id ? new Set([id]) : new Set())
})

const _centerOn = (id) => centerOnNode(cy, id)
const handleCenterEvent = (e) => { if (e.detail?.nodeId) _centerOn(e.detail.nodeId) }
const _isVisible = (id) => isNodeVisible(cy, id)
const handleClickOutside = (e) => { if (showTypeFilter.value && !e.target.closest('.type-filter-wrapper')) showTypeFilter.value = false }

defineExpose({ relaxLayout: () => layout.relaxLayout(), localRelax: (id) => layout.localRelax(id), fitView: () => layout.fitView(), saveNodePositions: _savePos, updateGraph, isNodeVisible: _isVisible })

onMounted(() => {
  initGraph()
  window.addEventListener('graph-center-node', handleCenterEvent)
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('click', handleClickOutside)
  nextTick(() => { if (graphControlsRef.value) graphControlsRef.value.querySelectorAll('button[title]').forEach(b => { const c = b.getAttribute('title'); if (c) { graphControlTippyInstances.push(tippy(b, { content: c, placement: 'bottom', delay: [200, 0], theme: 'toolbar' })); b.removeAttribute('title') } }) })
})

onUnmounted(() => {
  window.removeEventListener('graph-center-node', handleCenterEvent)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('click', handleClickOutside)
  if (updateDebounceTimer) clearTimeout(updateDebounceTimer)
  layout.cleanup()
  if (cy) { cy.destroy(); cy = null }
  graphControlTippyInstances.forEach(i => i.destroy()); graphControlTippyInstances = []
})
</script>

<template>
  <div class="graph-wrapper">
    <Teleport to="#view-controls-target">
    <div ref="graphControlsRef" class="graph-controls">
      <button class="icon-btn" @click="setLayout('tree')" :class="{ active: layoutMode === 'tree' }" title="Vertical layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg></button>
      <button class="icon-btn" @click="setLayout('horizontal')" :class="{ active: layoutMode === 'horizontal' }" title="Horizontal layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>
      <button class="icon-btn" @click="setLayout('radial')" :class="{ active: layoutMode === 'radial' }" title="Radial layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg></button>
      <button class="icon-btn" @click="setLayout('grid')" :class="{ active: layoutMode === 'grid' }" title="Grid layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg></button>
      <button class="icon-btn" @click="setLayout('circle')" :class="{ active: layoutMode === 'circle' }" title="Circle layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg></button>
      <span class="controls-separator"></span>
      <button class="icon-btn" @click="layout.handleRelaxClick()" :class="{ 'relax-locked': relaxLocked }" title="Relax layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12c0-2 2-4 4-2s4-2 4-2 2-2 4 0 4 2 4 2"/><path d="M4 18c0-2 2-4 4-2s4-2 4-2 2-2 4 0 4 2 4 2"/></svg></button>
      <button class="icon-btn" @click="layout.handleFitClick()" :class="{ 'fit-locked': fitLocked }" title="Fit to view"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>
      <button class="icon-btn" @click="layout.resetLayout()" title="Reset layout"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
      <span class="controls-separator"></span>
      <button class="icon-btn" @click="showExternalLinks = !showExternalLinks" :class="{ active: showExternalLinks }" title="Show external links"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></button>
      <button v-if="parent" class="icon-btn" @click="showRootNode = !showRootNode" :class="{ active: showRootNode }" title="Show root node"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></button>
      <span class="controls-separator"></span>
      <div class="type-filter-wrapper">
        <button class="icon-btn" @click="showTypeFilter = !showTypeFilter" :class="{ active: visibleTypes.length < ALL_NODE_TYPES.length }" title="Filter node types"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg></button>
        <div v-if="showTypeFilter" class="type-filter-dropdown">
          <div class="type-filter-actions"><button @click="selectAllTypes">All</button><button @click="selectNoTypes">None</button></div>
          <label v-for="t in ALL_NODE_TYPES" :key="t" class="type-filter-item"><input type="checkbox" :checked="visibleTypes.includes(t)" @change="toggleTypeFilter(t)"/><span>{{ t }}</span></label>
        </div>
      </div>
      <div class="layout-settings-wrapper">
        <button class="icon-btn" @click="showLayoutSettings = !showLayoutSettings" title="Layout settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></button>
        <div v-if="showLayoutSettings" class="layout-settings-dropdown">
          <div class="layout-setting"><label>Node Repulsion: {{ radialSettings.nodeRepulsion }}</label><input type="range" v-model.number="radialSettings.nodeRepulsion" min="100" max="10000" step="100"/></div>
          <div class="layout-setting"><label>Edge Length: {{ radialSettings.edgeLength }}</label><input type="range" v-model.number="radialSettings.edgeLength" min="20" max="200" step="10"/></div>
          <div class="layout-setting"><label>Elasticity: {{ radialSettings.elasticity.toFixed(2) }}</label><input type="range" v-model.number="radialSettings.elasticity" min="0.1" max="1.5" step="0.05"/></div>
          <div class="layout-setting"><label>Gravity: {{ radialSettings.gravity }}</label><input type="range" v-model.number="radialSettings.gravity" min="0" max="50000" step="1000"/></div>
          <div class="layout-setting"><label>Iterations: {{ radialSettings.iterations }}</label><input type="range" v-model.number="radialSettings.iterations" min="1000" max="500000" step="1000"/></div>
          <button class="apply-btn" @click="layout.applyRadialSettings()">Apply</button>
        </div>
      </div>
      <span class="controls-separator"></span>
      <button class="icon-btn" @click="showHotkeyHelp = !showHotkeyHelp" title="Keyboard shortcuts"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></button>
    </div>
    </Teleport>
    <div class="graph-container" :class="{ 'box-select-mode': boxSelectModeActive }" ref="container"><div v-if="nodes.length === 0" class="graph-empty">No nodes to display</div></div>
    <div ref="dropHighlightEl" class="drop-highlight"></div>
    <div v-if="linkModeActive" class="link-mode-indicator">Link Mode</div>

    <div v-if="showHotkeyHelp" class="hotkey-help-overlay" @click.self="showHotkeyHelp = false">
      <div class="hotkey-help-modal">
        <h3>Keyboard Shortcuts</h3>
        <div class="hotkey-list">
          <div class="hotkey-section"><h4>Selection</h4><div class="hotkey-item"><kbd>Click</kbd> Select node</div><div class="hotkey-item"><kbd>Shift</kbd>+<kbd>Click</kbd> Multi-select</div><div class="hotkey-item"><kbd>Shift</kbd>+<kbd>Drag</kbd> Lasso select</div></div>
          <div class="hotkey-section"><h4>Actions</h4><div class="hotkey-item"><kbd>Cmd</kbd>+<kbd>Click</kbd> Add child</div><div class="hotkey-item"><kbd>Double-click</kbd> Enter node</div><div class="hotkey-item"><kbd>Opt</kbd>+<kbd>Cmd</kbd>+<kbd>Click</kbd> Delete</div></div>
          <div class="hotkey-section"><h4>Navigation</h4><div class="hotkey-item"><kbd>Cmd</kbd>+<kbd>Up</kbd> Go to parent</div><div class="hotkey-item"><kbd>Cmd</kbd>+<kbd>Down</kbd> First child</div><div class="hotkey-item"><kbd>Cmd</kbd>+<kbd>Left/Right</kbd> Siblings</div></div>
          <div class="hotkey-section"><h4>Links</h4><div class="hotkey-item"><kbd>Option</kbd> Hold for link mode</div><div class="hotkey-item"><kbd>Option</kbd>+<kbd>Drag</kbd> Create link</div></div>
        </div>
        <button class="hotkey-close" @click="showHotkeyHelp = false">Close</button>
      </div>
    </div>

    <div v-if="editModal.visible" class="edit-modal-overlay" @click.self="hideEditModal">
      <div ref="editModalEl" class="edit-modal" @keydown="handleEditModalKeydown">
        <div class="edit-modal-header"><h2>Edit Node</h2><button class="modal-close" @click="hideEditModal">X</button></div>
        <div class="edit-modal-content">
          <div class="edit-field"><label>Title</label><input ref="editTitleInput" v-model="editModal.editedNode.title" class="edit-input" placeholder="Title"/></div>
          <div class="edit-field"><label>Type</label><select v-model="editModal.editedNode.type" class="edit-select"><option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option></select></div>
          <div v-if="editModal.editedNode.type !== 'person'" class="edit-field checkbox-field"><label><input type="checkbox" v-model="editModal.editedNode.completed"/> Completed</label></div>
          <div class="edit-field notes-field">
            <div class="notes-header"><label>Notes</label><button class="preview-toggle" :class="{ active: showNotesPreview }" @click="showNotesPreview = !showNotesPreview">{{ showNotesPreview ? 'Edit' : 'Preview' }}</button></div>
            <textarea v-if="!showNotesPreview" v-model="editModal.editedNode.notes" class="edit-textarea" placeholder="Add notes..." rows="6"></textarea>
            <div v-else class="notes-preview"><MarkdownRenderer :content="editModal.editedNode.notes"/></div>
          </div>
          <div class="edit-field checkbox-field"><label><input type="checkbox" v-model="editModal.editedNode.notes_sensitive"/> Sensitive content</label><span class="field-hint">Hide notes in sensitive mode</span></div>
          <div class="edit-field-row">
            <div class="edit-field"><label>Due Date</label><input type="date" v-model="editModal.editedNode.due_date" class="edit-input"/></div>
            <div class="edit-field"><label>Start Date</label><input type="date" v-model="editModal.editedNode.start_date" class="edit-input"/></div>
            <div class="edit-field"><label>End Date</label><input type="date" v-model="editModal.editedNode.end_date" class="edit-input"/></div>
          </div>
          <div class="edit-field-row">
            <div class="edit-field"><label>Color</label><input type="color" v-model="editModal.editedNode.color" class="edit-color"/></div>
            <div class="edit-field"><label>Importance (1-5)</label><input type="number" v-model.number="editModal.editedNode.importance" min="1" max="5" class="edit-input importance-input"/></div>
          </div>
          <div class="edit-meta"><span>ID: {{ editModal.node?.id }}</span><span>Depth: {{ editModal.node?.depth }}</span><span>Path: {{ editModal.node?.path || '-' }}</span></div>
        </div>
        <div class="edit-modal-footer">
          <div class="footer-left"><button class="btn-secondary" @click="wrapWithParentFromModal">Wrap with Parent</button><button class="btn-secondary" @click="goToParentFromModal">Go to Parent</button></div>
          <div class="footer-right"><button class="btn-secondary" @click="hideEditModal">Cancel</button><button class="btn-primary" @click="saveEditModal">Save</button></div>
        </div>
      </div>
    </div>

    <div v-if="promptModal.visible" class="prompt-modal-overlay" @click.self="cancelPrompt">
      <div class="prompt-modal">
        <div class="prompt-modal-header"><h3>{{ promptModal.title }}</h3></div>
        <div class="prompt-modal-content"><input ref="promptInputRef" v-model="promptModal.value" :placeholder="promptModal.placeholder" class="prompt-input" @keydown="handlePromptKeydown"/></div>
        <div class="prompt-modal-footer"><button class="btn-secondary" @click="cancelPrompt">Cancel</button><button class="btn-primary" @click="submitPrompt">Create</button></div>
      </div>
    </div>

    <AddNodeModal :visible="addNodeModal.visible" :title="addNodeModal.insertBetween ? 'Insert Between' : 'Add Node'" :parent-id="addNodeModal.parentId" :position="addNodeModal.position" :insert-between="addNodeModal.insertBetween" @close="hideAddNodeModal" @create="handleAddNodeCreate"/>
  </div>
</template>

<style scoped src="./GraphView.css"></style>
