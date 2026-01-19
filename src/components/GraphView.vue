<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { api } from '../services/api'
import { buildTooltipHTML } from '../utils/tooltip.js'
import { useNodeTooltip } from '../composables/useNodeTooltip.js'
import { nodeTypes, getTypeIcon, typeConfig, getGraphColors } from '../utils/constants.js'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { marked } from 'marked'
import MarkdownRenderer from './MarkdownRenderer.vue'
import AddNodeModal from './AddNodeModal.vue'

// Register extensions only once (use global flag to survive HMR)
if (!window.__cytoscapeExtensionsRegistered) {
  cytoscape.use(coseBilkent)
  cytoscape.use(cola)
  cytoscape.use(dagre)
  nodeHtmlLabel(cytoscape)
  window.__cytoscapeExtensionsRegistered = true
}

// Configure marked for notes rendering with links opening in new tab
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener">${text}</a>`
    }
  }
})

// Render markdown to HTML for tooltips
function renderMarkdownHtml(text, maxLen = 500) {
  if (!text) return ''
  const truncated = text.length > maxLen ? text.substring(0, maxLen) + '...' : text
  return marked.parse(truncated)
}

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  parent: { type: Object, default: null },
  selectedId: Number,
  detailThreshold: { type: Number, default: 30 },
  maxDepth: { type: Number, default: 0 }, // 0 = all levels
  hideCompleted: { type: Boolean, default: false },
  hideSensitive: { type: Boolean, default: false },
  workspace: { type: String, default: 'work' },
  workspaces: { type: Array, default: () => [] },
  showDetail: { type: Boolean, default: false },
  fullscreenDetailOpen: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'enter', 'move', 'add-child', 'insert-between', 'update', 'create', 'delete', 'delete-multiple', 'wrap-with-parent', 'open-fullscreen', 'link', 'unlink', 'context-menu', 'toggle-complete', 'toggle-favorite', 'open-link-search'])

const container = ref(null)
const editModalEl = ref(null)
const editTitleInput = ref(null)
const dropHighlightEl = ref(null)

// Link mode toggle - can be activated by Option key or button
const linkModeActive = ref(false)

// Track Alt/Option key to temporarily enable link mode
// Only activate link mode when not inside text editors
function isInsideEditor(target) {
  if (!target) return false
  const tagName = target.tagName?.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea') return true
  if (target.contentEditable === 'true') return true
  // Check for CodeMirror editor
  if (target.closest('.cm-editor')) return true
  return false
}

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    // Don't activate link mode when inside editors (for multi-cursor shortcuts)
    if (isInsideEditor(e.target)) return
    if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight' || e.altKey) {
      linkModeActive.value = true
    }
  })
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt' || e.code === 'AltLeft' || e.code === 'AltRight') {
      linkModeActive.value = false
    }
  })
  // Track via mouse events - if altKey is held during mouse movement
  // Don't activate when inside editors
  document.addEventListener('mousemove', (e) => {
    if (e.altKey && !isInsideEditor(e.target)) linkModeActive.value = true
  })
}


const layoutMode = ref(localStorage.getItem('graph-layout-mode') || 'tree')
const relaxLocked = ref(localStorage.getItem('graph-relax-locked') === 'true')
const showExternalLinks = ref(localStorage.getItem('graph-show-external-links') !== 'false') // default true
let relaxClickTimeout = null
let cy = null
let isInitializing = false

// Node positions storage key - includes workspace and parent for proper isolation
function getPositionsKey() {
  const parentId = props.parent?.id || 'root'
  const ws = props.workspace || 'work'
  return `graph-positions-${ws}-${parentId}`
}

// Load saved positions
function loadNodePositions() {
  try {
    const saved = localStorage.getItem(getPositionsKey())
    return saved ? JSON.parse(saved) : {}
  } catch {
    return {}
  }
}

// Save positions
function saveNodePositions() {
  if (!cy) return
  const positions = {}
  cy.nodes().forEach(node => {
    const pos = node.position()
    positions[node.id()] = { x: pos.x, y: pos.y }
  })
  localStorage.setItem(getPositionsKey(), JSON.stringify(positions))
}

// Persist layout mode
watch(layoutMode, (mode) => {
  localStorage.setItem('graph-layout-mode', mode)
})

// Persist relax locked state
watch(relaxLocked, (locked) => {
  localStorage.setItem('graph-relax-locked', locked ? 'true' : 'false')
})

// Persist show external links setting
watch(showExternalLinks, (show) => {
  localStorage.setItem('graph-show-external-links', show ? 'true' : 'false')
  // Reinitialize graph when toggled to properly add/remove external nodes
  if (cy) {
    cy.destroy()
    cy = null
  }
  initGraph()
})

// Close tooltip when detail panel opens (handled by composable via shouldShowTooltip)
watch(() => props.showDetail, (isOpen) => {
  if (isOpen) {
    forceHideTooltip()
  }
})


// Edit modal state
const editModal = ref({
  visible: false,
  node: null,
  editedNode: {}
})
const showNotesPreview = ref(false)

// Prompt modal state (replaces native prompt())
const promptModal = ref({
  visible: false,
  title: '',
  placeholder: '',
  value: '',
  resolve: null
})
const promptInputRef = ref(null)

// Add node modal state (Cmd+Enter or Cmd+click)
const addNodeModal = ref({
  visible: false,
  parentId: null,  // null = current container, otherwise specific parent
  position: null,  // { x, y } for graph position
  insertBetween: null  // { parentId, childId, isLink } for insert-between mode
})

function showPrompt(title, placeholder = '') {
  return new Promise((resolve) => {
    promptModal.value = {
      visible: true,
      title,
      placeholder,
      value: '',
      resolve
    }
    nextTick(() => {
      promptInputRef.value?.focus()
    })
  })
}

function submitPrompt() {
  const value = promptModal.value.value.trim()
  promptModal.value.resolve(value || null)
  promptModal.value.visible = false
}

function cancelPrompt() {
  promptModal.value.resolve(null)
  promptModal.value.visible = false
}

function handlePromptKeydown(e) {
  if (e.key === 'Enter') {
    e.preventDefault()
    submitPrompt()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelPrompt()
  }
}

// Add node modal functions
function showAddNodeModal(parentId = null, position = null, insertBetween = null) {
  addNodeModal.value = {
    visible: true,
    parentId,
    position,
    insertBetween
  }
}

function hideAddNodeModal() {
  addNodeModal.value.visible = false
  addNodeModal.value.insertBetween = null
}

function handleAddNodeCreate({ title, type, parentId, position, insertBetween }) {
  if (insertBetween) {
    // Insert between two nodes (edge click)
    emit('insert-between', {
      parentId: insertBetween.parentId,
      childId: insertBetween.childId,
      title,
      type,
      isLink: insertBetween.isLink
    })
  } else if (parentId) {
    // Add as child of specific node
    emit('add-child', { parentId, title, type, x: position?.x, y: position?.y })
  } else {
    // Add to current container
    emit('create', { title, type, x: position?.x, y: position?.y })
  }
}

// Global keyboard shortcut handler
function handleGlobalKeydown(e) {
  // Don't handle shortcuts if in a modal or input
  const inModal = editModal.value.visible || promptModal.value.visible || addNodeModal.value.visible

  // Cmd/Ctrl+Enter to open add node modal
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (inModal) return
    e.preventDefault()
    showAddNodeModal()
  }

  // Cmd+Delete/Backspace to delete selected nodes
  if ((e.metaKey || e.ctrlKey) && (e.key === 'Delete' || e.key === 'Backspace') && !inModal) {
    // Don't trigger if focus is in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

    if (cy) {
      const selectedNodes = cy.$('node:selected')
      if (selectedNodes.length > 0) {
        e.preventDefault()
        const nodeIds = []
        selectedNodes.forEach(node => {
          const nodeId = parseInt(node.id())
          if (!isNaN(nodeId)) nodeIds.push(nodeId)
        })
        if (nodeIds.length === 1) {
          emit('delete', nodeIds[0])
        } else if (nodeIds.length > 1) {
          emit('delete-multiple', nodeIds)
        }
      }
    }
  }
}

// Setup tooltip composable - single source of truth for all tooltips
const { showTooltip, hideTooltip, forceHide: forceHideTooltip } = useNodeTooltip({
  onToggleComplete: (nodeId) => {
    // Find node in our data and emit update
    const node = props.nodes.flatMap(function flatten(n) {
      return [n, ...(n.children || []).flatMap(flatten)]
    }).find(n => n.id === nodeId) || (props.parent?.id === nodeId ? props.parent : null)
    if (node) {
      emit('update', { ...node, completed: !node.completed })
    }
  },
  onOpenDetail: (nodeId) => {
    emit('open-fullscreen', nodeId)
  },
  getHideSensitive: () => props.hideSensitive,
  shouldShowTooltip: () => !props.showDetail && !props.fullscreenDetailOpen && !editModal.value.visible
})

function showEditModal(node) {
  // Hide any active tooltip when showing edit modal
  forceHideTooltip()
  editModal.value = {
    visible: true,
    node,
    editedNode: { ...node }
  }
  showNotesPreview.value = false
  nextTick(() => {
    if (editTitleInput.value) {
      editTitleInput.value.focus()
      editTitleInput.value.select()
    }
  })
}

function hideEditModal() {
  editModal.value.visible = false
}

function saveEditModal() {
  if (!editModal.value.node) return
  emit('update', editModal.value.editedNode)
  hideEditModal()
}

function handleEditModalKeydown(e) {
  if (e.key === 'Escape') {
    hideEditModal()
  } else if (e.key === 'Enter' && e.metaKey) {
    // Cmd/Ctrl+Enter to save
    saveEditModal()
  }
}

function deleteNodeFromModal() {
  if (!editModal.value.node) return
  emit('delete', editModal.value.node.id)
  hideEditModal()
}

async function wrapWithParentFromModal() {
  if (!editModal.value.node) return
  const title = await showPrompt('New parent title', 'Enter title...')
  if (title) {
    emit('wrap-with-parent', { nodeId: editModal.value.node.id, parentTitle: title })
    hideEditModal()
  }
}


// Get type-specific styles from constants.js
function getTypeStyle(type) {
  const config = typeConfig[type]
  if (!config) return {}
  return {
    background: `${config.bg}33`,
    color: config.text
  }
}


function flattenNodes(nodeList, result = [], skipCompleted = false, maxDepth = 0, currentDepth = 1) {
  for (const node of nodeList) {
    // Skip completed nodes AND all their children
    if (skipCompleted && node.completed) continue
    result.push(node)
    // Only recurse if within depth limit (0 = unlimited)
    if (node.children?.length && (maxDepth === 0 || currentDepth < maxDepth)) {
      flattenNodes(node.children, result, skipCompleted, maxDepth, currentDepth + 1)
    }
  }
  return result
}

// Filter nodes recursively by max depth
function filterByDepth(nodeList, maxDepth, currentDepth = 1) {
  if (maxDepth === 0) return nodeList // 0 = unlimited
  return nodeList.map(n => ({
    ...n,
    children: currentDepth < maxDepth && n.children?.length
      ? filterByDepth(n.children, maxDepth, currentDepth + 1)
      : []
  }))
}

// Filter nodes recursively, removing completed nodes and their children
function filterCompletedNodes(nodeList) {
  return nodeList
    .filter(n => !n.completed)
    .map(n => ({
      ...n,
      children: n.children ? filterCompletedNodes(n.children) : []
    }))
}

// Build inherited color map - parent colors flow to children unless overridden
function buildInheritedColorMap(nodeList, inheritedColor = null, colorMap = {}) {
  for (const node of nodeList) {
    // Node's effective color: own color if set, otherwise inherited
    const hasOwnColor = node.color && node.color !== '#0f4c75'
    const effectiveColor = hasOwnColor ? node.color : inheritedColor
    colorMap[node.id] = effectiveColor

    // Pass effective color to children
    if (node.children?.length) {
      buildInheritedColorMap(node.children, effectiveColor, colorMap)
    }
  }
  return colorMap
}

// Decode HTML entities for plain text display
function decodeHtmlEntities(text) {
  if (!text) return ''
  return text
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

// Strip markdown and clean up text for display
function cleanMarkdown(text, maxLen = 150) {
  if (!text) return ''
  let result = text.substring(0, maxLen)
  if (text.length > maxLen) result += '...'

  // Remove markdown syntax
  result = result.replace(/\*\*(.+?)\*\*/g, '$1')  // **bold**
  result = result.replace(/\*(.+?)\*/g, '$1')      // *italic*
  result = result.replace(/_(.+?)_/g, '$1')        // _italic_
  result = result.replace(/`(.+?)`/g, '$1')        // `code`
  result = result.replace(/^#+\s*/gm, '')          // # headers
  result = result.replace(/^[-*]\s+/gm, '- ')      // bullet points
  result = result.replace(/\[(.+?)\]\(.+?\)/g, '$1') // links

  // Decode HTML entities for plain text display
  result = decodeHtmlEntities(result)

  return result.trim()
}

// Darken a hex color
function darkenColor(hex) {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 30)
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 30)
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 30)
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

// Format date compactly
function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = Math.floor((date - now) / (1000 * 60 * 60 * 24))

  const month = date.toLocaleString('en', { month: 'short' })
  const day = date.getDate()

  if (diff < -1) return `${Math.abs(diff)}d ago`
  if (diff === -1) return 'Yesterday'
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff <= 7) return `in ${diff}d`
  return `${month} ${day}`
}

function buildElements(nodeList, parentNode, savedPositions = {}, detailThreshold = 30, maxDepth = 0) {
  // Apply depth filter first
  const depthFiltered = filterByDepth(nodeList, maxDepth)
  // Filter completed nodes and their children if hideCompleted is enabled
  const filteredList = props.hideCompleted
    ? filterCompletedNodes(depthFiltered)
    : depthFiltered
  const flat = flattenNodes(filteredList, [], false, maxDepth)

  // Include parent unless it's completed and we're hiding completed
  const includeParent = parentNode && !(props.hideCompleted && parentNode.completed)
  const allNodes = includeParent ? [{ ...parentNode, children: filteredList }, ...flat] : flat
  const totalNodes = allNodes.length
  const showDetails = totalNodes <= detailThreshold
  // Top-level node IDs in current view (for glow effect)
  const topLevelIds = new Set(nodeList.map(n => n.id))

  // Build inherited color map - parent colors flow to children
  const parentColor = parentNode?.color && parentNode.color !== '#0f4c75' ? parentNode.color : null
  const inheritedColorMap = buildInheritedColorMap(filteredList, parentColor)
  // Also add parent to the map if included
  if (includeParent && parentNode) {
    inheritedColorMap[parentNode.id] = parentColor
  }

  const elements = []

  // Add nodes
  allNodes.forEach((node, index) => {
    const savedPos = savedPositions[String(node.id)]
    // Get colors from centralized config (handles person unique colors automatically)
    const colors = getGraphColors(node.type, node.id)
    // Custom color as background tint - uses inherited color from parent if no own color
    const customBgTint = inheritedColorMap[node.id] || null
    // Root node glow: current container when drilling in, or top-level nodes in current view
    const isCurrentContainer = parentNode && node.id === parentNode.id
    const isTopLevelNode = !parentNode && topLevelIds.has(node.id)
    const shouldGlow = isCurrentContainer || isTopLevelNode
    const hasChildren = node.children?.length > 0
    const childCount = node.children?.length || 0
    const isCompleted = node.completed

    // Build clean label - title only when many nodes, add meta for fewer nodes
    let label = decodeHtmlEntities(node.title)

    // Only show meta and notes when not too crowded
    if (totalNodes <= detailThreshold) {
      // Compact meta line - only due date and importance
      const meta = []
      if (node.due_date) meta.push(formatDate(node.due_date))
      if (node.importance) meta.push(`P${node.importance}`)

      if (meta.length > 0) {
        label += '\n' + meta.join(' · ')
      }

      // Notes preview (adaptive) - cleaner separator
      const isSensitive = node.notes_sensitive || props.hideSensitive
      if (isSensitive && node.notes) {
        label += '\n\n🔒'
      } else if (totalNodes <= 5 && node.notes) {
        label += '\n\n' + cleanMarkdown(node.notes, 200)
      } else if (totalNodes <= 10 && node.notes) {
        label += '\n\n' + cleanMarkdown(node.notes, 80)
      } else if (totalNodes <= 15 && node.notes) {
        const preview = cleanMarkdown(node.notes, 30)
        if (preview) label += '\n' + preview
      }
    }

    // Build tooltip HTML using shared utility
    const tooltip = buildTooltipHTML(node, {
      showCheckbox: node.type !== 'person',
      hideSensitive: props.hideSensitive || node.notes_sensitive
    })

    // Adjust colors for completed nodes and parent nodes
    const bgColor = isCompleted ? darkenColor(colors.bg) : colors.bg
    const textColor = isCompleted ? '#888888' : colors.text

    const element = {
      data: {
        id: String(node.id),
        label,
        tooltip,
        type: node.type,
        isPerson: node.type === 'person',
        bgColor,
        borderColor: colors.border,
        textColor,
        customBgTint,
        hasChildren,
        isCurrentContainer,
        shouldGlow,
        isCompleted,
        showDetails,
        totalNodes,
        nodeData: node
      }
    }
    // Apply saved position if available
    if (savedPos) {
      element.position = { x: savedPos.x, y: savedPos.y }
    }
    elements.push(element)
  })

  // Add edges - use filteredList to avoid edges to non-existent nodes
  if (parentNode && includeParent) {
    filteredList.forEach(child => {
      elements.push({
        data: {
          id: `e-${parentNode.id}-${child.id}`,
          source: String(parentNode.id),
          target: String(child.id)
        }
      })
    })
  }

  flat.forEach(node => {
    if (node.children) {
      node.children.forEach(child => {
        elements.push({
          data: {
            id: `e-${node.id}-${child.id}`,
            source: String(node.id),
            target: String(child.id)
          }
        })
      })
    }
  })

  return elements
}

// Add link edges (many-to-many relationships) to elements
function addLinkEdges(elements, links) {
  const nodeIds = new Set(elements.filter(el => !el.data.source).map(el => el.data.id))

  links.forEach(link => {
    // Database returns source_id and target_id
    const sourceId = String(link.source_id)
    const targetId = String(link.target_id)
    // Only add if both nodes are in the graph
    if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
      elements.push({
        data: {
          id: `link-${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          isLink: true
        }
      })
    }
  })
}

// Fetch and add linked nodes that are not already in the graph
// These are nodes connected via links but outside the current hierarchy
async function fetchLinkedNodes(elements, links, savedPositions) {
  const existingNodeIds = new Set(elements.filter(el => !el.data.source).map(el => el.data.id))
  const linkedNodeIds = new Set()

  // Find all node IDs referenced in links that aren't in the graph yet
  links.forEach(link => {
    const sourceId = String(link.source_id)
    const targetId = String(link.target_id)
    if (!existingNodeIds.has(sourceId)) linkedNodeIds.add(link.source_id)
    if (!existingNodeIds.has(targetId)) linkedNodeIds.add(link.target_id)
  })

  // Fetch each linked node and add it to the graph (without parents)
  for (const nodeId of linkedNodeIds) {
    try {
      const node = await api.getNode(nodeId)
      if (node && !node.deleted_at) {
        const savedPos = savedPositions[node.id]
        elements.push({
          data: {
            id: String(node.id),
            nodeData: node,
            isPerson: node.type === 'person',
            isLinkedExternal: true  // Mark as externally linked (not a descendant)
          },
          position: savedPos ? { x: savedPos.x, y: savedPos.y } : undefined
        })
      }
    } catch (err) {
      console.error(`Failed to fetch linked node ${nodeId}:`, err)
    }
  }
}

// ===========================================
// LAYOUT CONFIGURATIONS
// ===========================================

const LAYOUTS = {
  // Tree mode: Dagre - hierarchical with minimal edge crossings
  tree: {
    name: 'dagre',
    animate: true,
    animationDuration: 600,
    rankDir: 'TB',
    nodeSep: 80,
    rankSep: 120,
    edgeSep: 30,
    ranker: 'network-simplex',
    fit: true,
    padding: 50
  },

  // Horizontal: dagre left-to-right
  horizontal: {
    name: 'dagre',
    animate: true,
    animationDuration: 500,
    fit: true,
    padding: 50,
    rankDir: 'LR',
    nodeSep: 60,
    rankSep: 100,
    edgeSep: 20,
    ranker: 'network-simplex'
  },

  // Radial: cose-bilkent tuned
  radial: {
    name: 'cose-bilkent',
    animate: 'end',
    animationDuration: 400,
    fit: true,
    padding: 50,
    randomize: false,
    nodeRepulsion: 12000,
    idealEdgeLength: 70,
    edgeElasticity: 0.5,
    nestingFactor: 0.1,
    gravity: 0.4,
    gravityRange: 1.5,
    numIter: 2000,
    tile: false
  },

  // Relax (single click): Dagre - clean up edge crossings
  relax: {
    name: 'dagre',
    animate: true,
    animationDuration: 500,
    rankDir: 'TB',
    nodeSep: 80,
    rankSep: 120,
    edgeSep: 30,
    ranker: 'network-simplex',
    fit: true,
    padding: 50
  },

  // Continuous relax (double click): cola infinite
  continuous: {
    name: 'cola',
    animate: true,
    infinite: true,
    fit: false,
    nodeSpacing: 60,
    edgeLength: 180,
    avoidOverlap: true,
    handleDisconnected: true,
    convergenceThreshold: 0.001,
    maxSimulationTime: 0,
    ungrabifyWhileSimulating: false
  }
}

function getLayoutOptions() {
  return LAYOUTS[layoutMode.value] || LAYOUTS.tree
}

async function initGraph() {
  if (!container.value) return

  isInitializing = true
  const savedPositions = loadNodePositions()
  const elements = buildElements(props.nodes, props.parent, savedPositions, props.detailThreshold, props.maxDepth)

  // Fetch links and include linked nodes that are outside the hierarchy
  try {
    const nodeIds = elements.filter(el => !el.data.source).map(el => parseInt(el.data.id))
    if (nodeIds.length > 0) {
      const links = await api.getAllLinks(nodeIds)
      // Fetch external linked nodes if in subgraph OR if showExternalLinks is enabled
      if (props.parent || showExternalLinks.value) {
        await fetchLinkedNodes(elements, links, savedPositions)
      }
      // Add link edges (for nodes already in the graph)
      addLinkEdges(elements, links)
    }
  } catch (err) {
    console.error('Failed to load links:', err)
  }

  const hasPositions = Object.keys(savedPositions).length > 0

  cy = cytoscape({
    container: container.value,
    elements,
    boxSelectionEnabled: true,
    selectionType: 'additive',
    activeSelectionCriteria: 'center',
    style: [
      {
        selector: 'node',
        style: {
          'background-color': 'transparent',
          'background-opacity': 0,
          'border-width': 0,
          'border-opacity': 0,
          'label': '',
          'width': 180,
          'height': 80,
          'shape': 'rectangle',
          'overlay-opacity': 0
        }
      },
      {
        selector: 'node[?isParent]',
        style: {
          'width': 200,
          'height': 100
        }
      },
      {
        selector: 'node[?isPerson]',
        style: {
          'width': 120,
          'height': 40,
          'shape': 'round-rectangle'
        }
      },
      {
        selector: 'node:selected',
        style: {
          'underlay-opacity': 0
        }
      },
      {
        selector: 'node[?isCompleted]',
        style: {
          'opacity': 1
        }
      },
      {
        selector: 'edge',
        style: {
          'width': 2,
          'line-color': '#999',
          'target-arrow-color': '#999',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.2,
          'opacity': 1
        }
      },
      {
        selector: 'edge:selected',
        style: {
          'width': 3,
          'line-color': '#f39c12',
          'target-arrow-color': '#f39c12',
          'opacity': 1
        }
      },
      {
        selector: 'edge:active',
        style: {
          'width': 4,
          'line-color': '#3498db',
          'target-arrow-color': '#3498db',
          'overlay-opacity': 0
        }
      },
      {
        selector: 'edge[isLink]',
        style: {
          'line-style': 'dashed',
          'line-color': '#9b59b6',
          'target-arrow-color': '#9b59b6',
          'target-arrow-shape': 'none',
          'curve-style': 'bezier',
          'opacity': 0.7
        }
      }
    ],
    layout: hasPositions ? { name: 'preset' } : getLayoutOptions()
  })

  // Enable node dragging
  cy.nodes().grabify()

  // Add HTML labels like the old app
  cy.nodeHtmlLabel([{
    query: 'node',
    halign: 'center',
    valign: 'center',
    halignBox: 'center',
    valignBox: 'center',
    tpl: (data) => {
      const node = data.nodeData
      if (!node) return ''

      // Person nodes render as compact circular badges with full name
      if (node.type === 'person') {
        const bgColor = node.color || typeConfig.person.text
        return `
          <div class="node-person" style="background-color: ${bgColor};">
            <span class="person-name">${node.title || 'Untitled'}</span>
          </div>
        `
      }

      const borderColor = data.borderColor || typeConfig.task.text
      const customBgTint = data.customBgTint
      const showDetails = data.showDetails
      const totalNodes = data.totalNodes || 0
      const isCompleted = node.completed
      const completedClass = isCompleted ? 'completed' : ''
      const shouldGlow = data.shouldGlow
      const glowClass = shouldGlow ? "current-container" : ""
      const favoriteClass = node.favorite ? "favorite" : ""

      // Only show notes based on detail threshold
      let notesHtml = ''
      if (showDetails && node.notes) {
        if (node.notes_sensitive || props.hideSensitive) {
          notesHtml = '<span style="opacity: 0.5">🔒</span>'
        } else {
          const maxLen = totalNodes <= 5 ? 300 : totalNodes <= 10 ? 150 : 60
          notesHtml = renderMarkdownHtml(node.notes, maxLen)
        }
      }

      // Custom color as subtle background gradient
      const bgStyle = customBgTint
        ? `background: linear-gradient(135deg, ${customBgTint}99 0%, ${customBgTint}44 50%, transparent 100%), #0d0d0d;`
        : ''

      return `
        <div class="node-html ${completedClass} ${glowClass} ${favoriteClass}" style="border-color: ${borderColor}; --glow-color: ${borderColor}; ${bgStyle}">
          <div class="node-html-title">${node.title || 'Untitled'}</div>
          ${notesHtml ? `<div class="node-html-notes">${notesHtml}</div>` : ''}
        </div>
      `
    }
  }])

  // Click to select, Cmd/Ctrl+click to add child
  cy.on('tap', 'node', (e) => {
    const node = e.target.data('nodeData')
    if (!node) return

    if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
      // Cmd/Ctrl+click: open add dialog for child node
      const pos = e.target.position()
      showAddNodeModal(node.id, { x: pos.x + 50, y: pos.y + 80 })
    } else {
      // Just select the node (sidebar detail will show)
      emit('select', node)
    }
  })

  // Double-click on node to enter/drill into it
  cy.on('dbltap', 'node', (e) => {
    const node = e.target.data('nodeData')
    if (node) {
      hideEditModal()
      emit('enter', node)
    }
  })

  // Click on background to close edit modal, Cmd+click to add node
  cy.on('tap', (e) => {
    if (e.target === cy) {
      if (e.originalEvent.metaKey || e.originalEvent.ctrlKey) {
        // Cmd/Ctrl+click on background: open add dialog
        const pos = e.position
        showAddNodeModal(null, { x: pos.x, y: pos.y })
      } else {
        hideEditModal()
      }
    }
  })

  // Double-click on background to create new node connected to nearest node
  cy.on('dbltap', (e) => {
    if (e.target === cy) {
      const pos = e.position

      // Find nearest node within threshold
      let nearestNode = null
      let nearestDist = Infinity
      const threshold = 200

      cy.nodes().forEach(n => {
        const nPos = n.position()
        const dist = Math.sqrt(Math.pow(pos.x - nPos.x, 2) + Math.pow(pos.y - nPos.y, 2))
        if (dist < threshold && dist < nearestDist) {
          nearestDist = dist
          nearestNode = n
        }
      })

      if (nearestNode) {
        // Create as child of nearest node
        const parentData = nearestNode.data('nodeData')
        showAddNodeModal(parentData.id, { x: pos.x, y: pos.y })
      } else {
        // No nearby node - create child of current container
        showAddNodeModal(null, { x: pos.x, y: pos.y })
      }
    }
  })

  // Save positions after drag
  cy.on('dragfree', 'node', () => {
    saveNodePositions()
  })

  // Click on edge to insert node between
  cy.on('tap', 'edge', async (e) => {
    const edge = e.target
    const sourceId = parseInt(edge.source().id())
    const targetId = parseInt(edge.target().id())
    const sourceNode = edge.source().data('nodeData')
    const targetNode = edge.target().data('nodeData')
    const isLinkEdge = edge.data('isLink')
    const isCmdClick = e.originalEvent?.metaKey || e.originalEvent?.ctrlKey

    if (sourceNode && targetNode) {
      if (isCmdClick) {
        // Cmd+click - delete/remove the edge
        if (isLinkEdge) {
          emit('unlink', { sourceId, targetId })
        } else {
          emit('move', { nodeId: targetId, oldParentId: sourceId, newParentId: null })
        }
      } else {
        // Normal click - show add node modal for insert between
        const midPos = {
          x: (edge.source().position().x + edge.target().position().x) / 2,
          y: (edge.source().position().y + edge.target().position().y) / 2
        }
        showAddNodeModal(null, midPos, {
          parentId: sourceId,
          childId: targetId,
          isLink: isLinkEdge
        })
      }
    }
  })

  // Tooltip on node hover - uses shared composable
  cy.on('mouseover', 'node', (e) => {
    const nodeData = e.target.data('nodeData')
    if (!nodeData) return
    // Use composable's showTooltip - it handles all the logic
    showTooltip(null, nodeData)
  })

  cy.on('mouseout', 'node', () => {
    // Use composable's hideTooltip
    hideTooltip()
  })

  // Handle clicks on HTML card overlays (for Cmd+click support)
  container.value?.addEventListener('click', (e) => {
    const htmlLabel = e.target.closest('.node-html')
    if (!htmlLabel) return

    // Find the corresponding cytoscape node
    const rect = htmlLabel.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    // Convert to cytoscape coordinates
    const containerRect = container.value.getBoundingClientRect()
    const relX = centerX - containerRect.left
    const relY = centerY - containerRect.top

    // Find node at this position
    const pan = cy.pan()
    const zoom = cy.zoom()
    const cyX = (relX - pan.x) / zoom
    const cyY = (relY - pan.y) / zoom

    let closestNode = null
    let closestDist = Infinity
    cy.nodes().forEach(n => {
      const pos = n.position()
      const dist = Math.sqrt(Math.pow(pos.x - cyX, 2) + Math.pow(pos.y - cyY, 2))
      if (dist < closestDist) {
        closestDist = dist
        closestNode = n
      }
    })

    if (closestNode && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      e.stopPropagation()
      const node = closestNode.data('nodeData')
      const pos = closestNode.position()
      showAddNodeModal(node.id, { x: pos.x + 50, y: pos.y + 80 })
    }
  })

  cy.on('drag', 'node', () => {
    // Hide tooltip while dragging
    forceHideTooltip()
  })

  // Right-click on node to show context menu
  cy.on('cxttap', 'node', (e) => {
    e.preventDefault()
    const node = e.target.data('nodeData')
    if (!node) return

    // Get rendered position for menu placement
    const renderedPos = e.target.renderedPosition()
    const containerRect = container.value.getBoundingClientRect()

    // Create a synthetic event with the correct screen coordinates
    const syntheticEvent = {
      clientX: containerRect.left + renderedPos.x,
      clientY: containerRect.top + renderedPos.y,
      preventDefault: () => {},
      stopPropagation: () => {}
    }

    emit('context-menu', { event: syntheticEvent, node })
  })

  // Drag node onto another to reparent
  let dragStartPos = null
  let highlightedNode = null

  cy.on('grab', 'node', (e) => {
    const node = e.target
    dragStartPos = { ...node.position() }
  })

  // Highlight potential drop target while dragging
  cy.on('drag', 'node', (e) => {
    const draggedNode = e.target
    const pos = draggedNode.position()
    const dropThreshold = 100

    // Clear previous highlight
    if (highlightedNode) {
      highlightedNode.removeClass('drop-target')
      highlightedNode = null
    }

    // Find closest node
    let closestNode = null
    let closestDist = Infinity
    cy.nodes().forEach(n => {
      if (n.id() === draggedNode.id()) return
      const nPos = n.position()
      const distance = Math.sqrt(
        Math.pow(pos.x - nPos.x, 2) +
        Math.pow(pos.y - nPos.y, 2)
      )
      if (distance < dropThreshold && distance < closestDist) {
        closestDist = distance
        closestNode = n
      }
    })

    // Highlight closest node with visual indicator
    if (closestNode && dropHighlightEl.value) {
      closestNode.addClass('drop-target')
      highlightedNode = closestNode
      const renderedPos = closestNode.renderedPosition()
      dropHighlightEl.value.style.display = 'block'
      dropHighlightEl.value.style.left = (renderedPos.x - 80) + 'px'
      dropHighlightEl.value.style.top = (renderedPos.y - 35) + 'px'
      // Add link-mode class when Option/Alt is held
      if (linkModeActive.value) {
        dropHighlightEl.value.classList.add('link-mode')
      } else {
        dropHighlightEl.value.classList.remove('link-mode')
      }
    } else if (dropHighlightEl.value) {
      dropHighlightEl.value.style.display = 'none'
      dropHighlightEl.value.classList.remove('link-mode')
    }
  })

  cy.on('free', 'node', (e) => {
    // Clear highlight
    if (highlightedNode) {
      highlightedNode.removeClass('drop-target')
      highlightedNode = null
    }
    if (dropHighlightEl.value) {
      dropHighlightEl.value.style.display = 'none'
    }
    const draggedNode = e.target
    const pos = draggedNode.position()

    // Check if node was actually dragged (not just clicked)
    if (dragStartPos) {
      const dist = Math.sqrt(
        Math.pow(pos.x - dragStartPos.x, 2) +
        Math.pow(pos.y - dragStartPos.y, 2)
      )
      if (dist < 20) {
        dragStartPos = null
        return // Not a real drag
      }
    }

    // Find closest node within drop threshold (100px)
    const dropThreshold = 100
    let closestNode = null
    let closestDist = Infinity

    cy.nodes().forEach(n => {
      if (n.id() === draggedNode.id()) return
      const nPos = n.position()
      const distance = Math.sqrt(
        Math.pow(pos.x - nPos.x, 2) +
        Math.pow(pos.y - nPos.y, 2)
      )
      if (distance < dropThreshold && distance < closestDist) {
        closestDist = distance
        closestNode = n
      }
    })

    if (closestNode) {
      const targetNode = closestNode.data('nodeData')
      const sourceNode = draggedNode.data('nodeData')
      if (targetNode && sourceNode) {
        // Safety check: prevent moving to self
        if (sourceNode.id === targetNode.id) {
          if (dragStartPos) draggedNode.position(dragStartPos)
          dragStartPos = null
          return
        }

        // Check if this is a link operation (Option/Alt held)
        if (linkModeActive.value) {
          // Link mode: create a link between nodes instead of moving
          emit('link', { sourceId: sourceNode.id, targetId: targetNode.id })
          // Reset position (don't actually move the node)
          if (dragStartPos) draggedNode.position(dragStartPos)
          dragStartPos = null
          return
        }

        // Any relationship involving a person should ALWAYS be a link, never parent-child
        // Persons are independent entities that connect via links only
        const involvesPersons = sourceNode.type === 'person' || targetNode.type === 'person'
        if (involvesPersons) {
          emit('link', { sourceId: sourceNode.id, targetId: targetNode.id })
          if (dragStartPos) draggedNode.position(dragStartPos)
          dragStartPos = null
          return
        }

        // Safety check: prevent moving to own descendant (would create cycle)
        const isDescendant = (parent, childId) => {
          if (!parent.children) return false
          for (const child of parent.children) {
            if (child.id === childId) return true
            if (isDescendant(child, childId)) return true
          }
          return false
        }
        if (isDescendant(sourceNode, targetNode.id)) {
          alert('Cannot move a node under its own descendant')
          if (dragStartPos) draggedNode.position(dragStartPos)
          dragStartPos = null
          return
        }

        // Move the node (undo tracking handled by parent)
        emit('move', { nodeId: sourceNode.id, oldParentId: sourceNode.parent_id, newParentId: targetNode.id })
      }
    }

    dragStartPos = null
  })

  // Update selection styling
  if (props.selectedId) {
    cy.$(`#${props.selectedId}`).select()
  }

  // Auto-relax if no saved positions - run layout then fit
  if (!hasPositions && cy.nodes().length > 0) {
    setTimeout(() => {
      cy.layout(getLayoutOptions()).run()
      setTimeout(() => {
        cy.fit(50)
        saveNodePositions()
        isInitializing = false
        // Start continuous relax if it was locked from previous session
        if (relaxLocked.value) {
          startContinuousRelax()
        }
      }, 500)
    }, 100)
  } else {
    isInitializing = false
    // Start continuous relax if it was locked from previous session
    if (relaxLocked.value) {
      startContinuousRelax()
    }
  }
}

function findSmartPosition(nodeId, parentId, savedPositions, childIds = []) {
  // Convert parentId to string for lookup (localStorage keys are strings)
  const parentKey = String(parentId)

  // First priority: if this node has children with positions, position near them
  // This handles wrap-with-parent where the new parent should be near its child
  if (childIds.length > 0) {
    const childPositions = childIds
      .map(id => savedPositions[String(id)])
      .filter(pos => pos)
    if (childPositions.length > 0) {
      const avgX = childPositions.reduce((sum, p) => sum + p.x, 0) / childPositions.length
      const avgY = childPositions.reduce((sum, p) => sum + p.y, 0) / childPositions.length
      // Place slightly above/offset from children
      return {
        x: avgX + (Math.random() - 0.5) * 30,
        y: avgY - 40 - Math.random() * 20
      }
    }
  }

  // If parent has a position, place close to parent
  if (parentId && savedPositions[parentKey]) {
    const parentPos = savedPositions[parentKey]
    // Place close to parent
    const angle = Math.random() * Math.PI * 2
    const distance = 20 + Math.random() * 20
    return {
      x: parentPos.x + Math.cos(angle) * distance,
      y: parentPos.y + Math.sin(angle) * distance
    }
  }

  // Try to get parent position from current cytoscape instance
  if (parentId && cy) {
    const parentNode = cy.$(`#${parentId}`)
    if (parentNode.length > 0) {
      const parentPos = parentNode.position()
      const angle = Math.random() * Math.PI * 2
      const distance = 20 + Math.random() * 20
      return {
        x: parentPos.x + Math.cos(angle) * distance,
        y: parentPos.y + Math.sin(angle) * distance
      }
    }
  }

  // Otherwise, find center of existing nodes and place nearby
  const positions = Object.values(savedPositions)
  if (positions.length > 0) {
    const centerX = positions.reduce((sum, p) => sum + p.x, 0) / positions.length
    const centerY = positions.reduce((sum, p) => sum + p.y, 0) / positions.length
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 30
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance
    }
  }

  // Try to get center from current cytoscape nodes
  if (cy && cy.nodes().length > 0) {
    const bb = cy.nodes().boundingBox()
    const centerX = (bb.x1 + bb.x2) / 2
    const centerY = (bb.y1 + bb.y2) / 2
    const angle = Math.random() * Math.PI * 2
    const distance = 30 + Math.random() * 30
    return {
      x: centerX + Math.cos(angle) * distance,
      y: centerY + Math.sin(angle) * distance
    }
  }

  // Default center position
  return { x: 400, y: 300 }
}

async function updateGraph() {
  // Skip if currently initializing to prevent race conditions
  if (isInitializing) return

  if (!cy) {
    await initGraph()
    return
  }

  const savedPositions = loadNodePositions()

  // Get current node IDs from cytoscape BEFORE removing elements
  // Only update positions for nodes that have been explicitly positioned (not at origin)
  const existingNodeIds = new Set()
  if (cy) {
    cy.nodes().forEach(node => {
      existingNodeIds.add(node.id())
      const pos = node.position()
      // Only save position if it looks valid (not at origin or default position)
      // and the node has actually been positioned in the graph
      if (pos.x !== 0 || pos.y !== 0) {
        savedPositions[node.id()] = { x: pos.x, y: pos.y }
      }
    })
  }

  const elements = buildElements(props.nodes, props.parent, savedPositions, props.detailThreshold, props.maxDepth)

  // Fetch links and include linked nodes that are outside the hierarchy
  try {
    const nodeIds = elements.filter(el => !el.data.source).map(el => parseInt(el.data.id))
    if (nodeIds.length > 0) {
      const links = await api.getAllLinks(nodeIds)
      // Fetch external linked nodes if in subgraph OR if showExternalLinks is enabled
      if (props.parent || showExternalLinks.value) {
        await fetchLinkedNodes(elements, links, savedPositions)
      }
      // Add link edges (for nodes already in the graph)
      addLinkEdges(elements, links)
    }
  } catch (err) {
    console.error('Failed to load links:', err)
  }
  const hasPositions = Object.keys(savedPositions).length > 0

  // Build a map of element positions for quick lookup
  const elementPositions = {}
  elements.forEach(el => {
    if (!el.data.source && el.position) {
      elementPositions[el.data.id] = el.position
    }
  })

  // Detect new nodes and edge changes
  let hasNewNodes = false
  let hasEdgeChanges = false
  const newElementIds = new Set()
  const newEdges = new Set()

  // Collect existing edges for comparison
  const existingEdges = new Set()
  if (cy) {
    cy.edges().forEach(edge => {
      existingEdges.add(`${edge.source().id()}-${edge.target().id()}`)
    })
  }

  // Find new nodes and edges
  elements.forEach(el => {
    if (el.data.source) {
      // It's an edge
      const edgeKey = `${el.data.source}-${el.data.target}`
      newEdges.add(edgeKey)
      if (!existingEdges.has(edgeKey)) {
        hasEdgeChanges = true
      }
    } else {
      // It's a node
      newElementIds.add(el.data.id)
      // Check if this is a truly new node (not in existing set)
      if (!existingNodeIds.has(el.data.id)) {
        hasNewNodes = true
      }
      if (!el.position) {
        const nodeData = el.data.nodeData
        const parentId = nodeData?.parent_id
        // Get child IDs for this node (for positioning new parents near their children)
        const childIds = nodeData?.children?.map(c => c.id) || []
        // First check element positions (current graph), then savedPositions
        const allPositions = { ...savedPositions, ...elementPositions }
        el.position = findSmartPosition(el.data.id, parentId, allPositions, childIds)
      }
    }
  })

  // Also check for removed edges (structural changes like parent-child reassignment)
  if (!hasEdgeChanges) {
    for (const existingEdge of existingEdges) {
      if (!newEdges.has(existingEdge)) {
        hasEdgeChanges = true
        break
      }
    }
  }

  cy.elements().remove()
  cy.add(elements)
  cy.nodes().grabify()
  // Update HTML labels
  cy.nodeHtmlLabel([{
    query: 'node',
    halign: 'center',
    valign: 'center',
    halignBox: 'center',
    valignBox: 'center',
    tpl: (data) => {
      const node = data.nodeData
      if (!node) return ''

      // Person nodes render as compact circular badges with full name
      if (node.type === 'person') {
        const bgColor = node.color || typeConfig.person.text
        return `
          <div class="node-person" style="background-color: ${bgColor};">
            <span class="person-name">${node.title || 'Untitled'}</span>
          </div>
        `
      }

      const borderColor = data.borderColor || typeConfig.task.text
      const customBgTint = data.customBgTint
      const showDetails = data.showDetails
      const totalNodes = data.totalNodes || 0
      const isCompleted = node.completed
      const completedClass = isCompleted ? 'completed' : ''
      const shouldGlow = data.shouldGlow
      const glowClass = shouldGlow ? "current-container" : ""
      const favoriteClass = node.favorite ? "favorite" : ""

      // Only show notes based on detail threshold
      let notesHtml = ''
      if (showDetails && node.notes) {
        if (node.notes_sensitive || props.hideSensitive) {
          notesHtml = '<span style="opacity: 0.5">🔒</span>'
        } else {
          const maxLen = totalNodes <= 5 ? 300 : totalNodes <= 10 ? 150 : 60
          notesHtml = renderMarkdownHtml(node.notes, maxLen)
        }
      }

      // Custom color as subtle background gradient
      const bgStyle = customBgTint
        ? `background: linear-gradient(135deg, ${customBgTint}99 0%, ${customBgTint}44 50%, transparent 100%), #0d0d0d;`
        : ''

      return `
        <div class="node-html ${completedClass} ${glowClass} ${favoriteClass}" style="border-color: ${borderColor}; --glow-color: ${borderColor}; ${bgStyle}">
          <div class="node-html-title">${node.title || 'Untitled'}</div>
          ${notesHtml ? `<div class="node-html-notes">${notesHtml}</div>` : ''}
        </div>
      `
    }
  }])
  // Check if element count changed
  const prevNodeCount = existingNodeIds.size
  const newNodeCount = newElementIds.size
  const nodeCountChanged = prevNodeCount !== newNodeCount
  const elementsChanged = hasNewNodes || hasEdgeChanges || nodeCountChanged

  const structureChanged = hasNewNodes || hasEdgeChanges || nodeCountChanged
  if (!hasPositions) {
    // No saved positions - run full layout
    cy.layout(getLayoutOptions()).run()
    setTimeout(saveNodePositions, 600)
  } else if (hasNewNodes) {
    // Only run layout if there are truly new nodes that need positioning
    // Lock existing nodes in place so they don't move
    cy.nodes().forEach(node => {
      if (savedPositions[node.id()]) {
        node.lock()
      }
    })
    cy.layout(getLayoutOptions()).run()
    // Unlock all nodes after layout
    cy.nodes().unlock()
    setTimeout(saveNodePositions, 600)
  } else {
    // No new nodes - preserve existing positions
    setTimeout(saveNodePositions, 100)
  }
}

function setLayout(mode) {
  if (layoutMode.value === mode) return

  // Stop relax when switching layouts
  if (relaxLocked.value) {
    relaxLocked.value = false
    stopContinuousRelax()
  }

  layoutMode.value = mode
  reLayout()
}

function reLayout() {
  if (cy) {
    // Clear saved positions
    localStorage.removeItem(getPositionsKey())
    cy.layout(getLayoutOptions()).run()
    // Save new positions after layout
    setTimeout(saveNodePositions, 800)
  }
}

function relaxLayout() {
  if (cy) {
    // Use current layout mode for relax, not always dagre
    const layout = getLayoutOptions()
    cy.layout(layout).run()
    setTimeout(saveNodePositions, 600)
  }
}

// Continuous simulation layout
let continuousLayout = null

function startContinuousRelax() {
  if (!cy) return

  // Stop any existing layout
  stopContinuousRelax()

  // Start cola layout with infinite simulation
  continuousLayout = cy.layout(LAYOUTS.continuous)
  continuousLayout.run()
}

function stopContinuousRelax() {
  if (continuousLayout) {
    continuousLayout.stop()
    continuousLayout = null
  }
  saveNodePositions()
}

let relaxClickCount = 0

function handleRelaxClick() {
  relaxClickCount++

  if (relaxClickCount === 1) {
    // Wait to see if it's a double click
    relaxClickTimeout = setTimeout(() => {
      if (relaxClickCount === 1) {
        // Single click - run relax once (unless locked)
        if (!relaxLocked.value) {
          relaxLayout()
        }
      }
      relaxClickCount = 0
    }, 300)
  } else if (relaxClickCount === 2) {
    // Double click - toggle lock
    clearTimeout(relaxClickTimeout)
    relaxClickCount = 0

    relaxLocked.value = !relaxLocked.value

    if (relaxLocked.value) {
      startContinuousRelax()
    } else {
      stopContinuousRelax()
    }
  }
}

function fitView() {
  if (cy) {
    cy.fit(50)
  }
}

function toggleExternalLinks() {
  showExternalLinks.value = !showExternalLinks.value
}

watch(() => props.nodes, updateGraph, { deep: true })
watch(() => props.parent, updateGraph, { deep: true })
watch(() => props.detailThreshold, updateGraph)
watch(() => props.workspace, () => {
  // Workspace changed - reinitialize graph to load correct positions
  if (cy) {
    cy.destroy()
    cy = null
  }
  initGraph()
})
watch(() => props.maxDepth, () => {
  updateGraph()
})
watch(() => props.hideCompleted, () => {
  updateGraph()
})
watch(() => props.selectedId, (newId) => {
  if (cy && newId) {
    cy.nodes().unselect()
    cy.$(`#${newId}`).select()
  }
  // Update HTML label selection styling
  updateHtmlLabelSelection(newId)
})

function updateHtmlLabelSelection(selectedId) {
  if (!container.value) return
  // Remove selected class from all labels
  container.value.querySelectorAll('.node-html.selected').forEach(el => {
    el.classList.remove('selected')
  })
  // Add selected class to the selected node's label
  if (selectedId && cy) {
    const node = cy.$(`#${selectedId}`)
    if (node.length > 0) {
      const nodePos = node.renderedPosition()
      const htmlLabels = container.value.querySelectorAll('.node-html')
      let closestEl = null
      let closestDist = Infinity
      htmlLabels.forEach(el => {
        const rect = el.getBoundingClientRect()
        const containerRect = container.value.getBoundingClientRect()
        const elCenterX = rect.left + rect.width / 2 - containerRect.left
        const elCenterY = rect.top + rect.height / 2 - containerRect.top
        const dist = Math.sqrt(Math.pow(elCenterX - nodePos.x, 2) + Math.pow(elCenterY - nodePos.y, 2))
        if (dist < closestDist) {
          closestDist = dist
          closestEl = el
        }
      })
      if (closestEl) {
        closestEl.classList.add('selected')
      }
    }
  }
}

// Center on a specific node (triggered by search)
function centerOnNode(nodeId) {
  if (!cy) return
  const node = cy.$(`#${nodeId}`)
  if (node.length > 0) {
    // Animate to center the node with a zoom
    cy.animate({
      center: { eles: node },
      zoom: 1.5,
      duration: 400,
      easing: 'ease-out'
    })
    // Flash highlight effect
    node.addClass('search-highlight')
    setTimeout(() => {
      node.removeClass('search-highlight')
    }, 2000)
  }
}

// Listen for center-node events from search
function handleCenterNodeEvent(e) {
  const { nodeId } = e.detail
  if (nodeId) {
    centerOnNode(nodeId)
  }
}

// Expose methods for parent to call
defineExpose({
  relaxLayout,
  fitView,
  saveNodePositions,
  updateGraph
})

onMounted(() => {
  initGraph()
  window.addEventListener('graph-center-node', handleCenterNodeEvent)
  window.addEventListener('keydown', handleGlobalKeydown)
})

onUnmounted(() => {
  window.removeEventListener('graph-center-node', handleCenterNodeEvent)
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (cy) {
    cy.destroy()
    cy = null
  }
})
</script>

<template>
  <div class="graph-wrapper">
    <div class="graph-controls">
      <button
        @click="setLayout('tree')"
        :class="{ active: layoutMode === 'tree' }"
        title="Top-to-bottom hierarchy"
      >
        Vertical
      </button>
      <button
        @click="setLayout('horizontal')"
        :class="{ active: layoutMode === 'horizontal' }"
        title="Left-to-right hierarchy"
      >
        Horizontal
      </button>
      <button
        @click="setLayout('radial')"
        :class="{ active: layoutMode === 'radial' }"
        title="Organic radial spread"
      >
        Radial
      </button>
      <span class="controls-separator"></span>
      <button
        @click="handleRelaxClick"
        :class="{ 'relax-locked': relaxLocked }"
        title="Click to relax, double-click to lock"
      >
        {{ relaxLocked ? 'Relax [ON]' : 'Relax' }}
      </button>
      <button @click="fitView" title="Fit to view">Fit</button>
      <template v-if="!parent">
        <span class="controls-separator"></span>
        <button
          @click="toggleExternalLinks"
          :class="{ active: showExternalLinks }"
          title="Show linked persons/orgs from other workspaces at root level"
        >
          {{ showExternalLinks ? 'Links [ON]' : 'Links' }}
        </button>
      </template>
    </div>
    <div class="graph-container" ref="container">
      <div v-if="nodes.length === 0" class="graph-empty">
        No nodes to display
      </div>
    </div>
    <div ref="dropHighlightEl" class="drop-highlight"></div>

    <!-- Link mode indicator (shows when Option/Alt is held) -->
    <div v-if="linkModeActive" class="link-mode-indicator">Link Mode</div>

    <!-- Full Edit Modal -->
    <div v-if="editModal.visible" class="edit-modal-overlay" @click.self="hideEditModal">
      <div ref="editModalEl" class="edit-modal" @keydown="handleEditModalKeydown">
        <div class="edit-modal-header">
          <h2>Edit Node</h2>
          <button class="modal-close" @click="hideEditModal">X</button>
        </div>

        <div class="edit-modal-content">
          <!-- Title -->
          <div class="edit-field">
            <label>Title</label>
            <input
              ref="editTitleInput"
              v-model="editModal.editedNode.title"
              class="edit-input"
              placeholder="Title"
            />
          </div>

          <!-- Type -->
          <div class="edit-field">
            <label>Type</label>
            <select v-model="editModal.editedNode.type" class="edit-select">
              <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <!-- Completed (all types except person) -->
          <div v-if="editModal.editedNode.type !== 'person'" class="edit-field checkbox-field">
            <label>
              <input type="checkbox" v-model="editModal.editedNode.completed" />
              Completed
            </label>
          </div>

          <!-- Notes with preview toggle -->
          <div class="edit-field notes-field">
            <div class="notes-header">
              <label>Notes</label>
              <button
                class="preview-toggle"
                :class="{ active: showNotesPreview }"
                @click="showNotesPreview = !showNotesPreview"
              >
                {{ showNotesPreview ? 'Edit' : 'Preview' }}
              </button>
            </div>
            <textarea
              v-if="!showNotesPreview"
              v-model="editModal.editedNode.notes"
              class="edit-textarea"
              placeholder="Add notes... (supports markdown)"
              rows="6"
            ></textarea>
            <div v-else class="notes-preview">
              <MarkdownRenderer :content="editModal.editedNode.notes" />
            </div>
          </div>

          <!-- Sensitive content -->
          <div class="edit-field checkbox-field">
            <label>
              <input type="checkbox" v-model="editModal.editedNode.notes_sensitive" />
              Sensitive content
            </label>
            <span class="field-hint">Hide notes when sensitive mode is enabled</span>
          </div>

          <!-- Dates row -->
          <div class="edit-field-row">
            <div class="edit-field">
              <label>Due Date</label>
              <input type="date" v-model="editModal.editedNode.due_date" class="edit-input" />
            </div>
            <div class="edit-field">
              <label>Start Date</label>
              <input type="date" v-model="editModal.editedNode.start_date" class="edit-input" />
            </div>
            <div class="edit-field">
              <label>End Date</label>
              <input type="date" v-model="editModal.editedNode.end_date" class="edit-input" />
            </div>
          </div>

          <!-- Color and Importance row -->
          <div class="edit-field-row">
            <div class="edit-field">
              <label>Color</label>
              <input type="color" v-model="editModal.editedNode.color" class="edit-color" />
            </div>
            <div class="edit-field">
              <label>Importance (1-5)</label>
              <input
                type="number"
                v-model.number="editModal.editedNode.importance"
                min="1"
                max="5"
                class="edit-input importance-input"
              />
            </div>
          </div>

          <!-- Metadata -->
          <div class="edit-meta">
            <span>ID: {{ editModal.node?.id }}</span>
            <span>Depth: {{ editModal.node?.depth }}</span>
            <span>Path: {{ editModal.node?.path || '-' }}</span>
          </div>
        </div>

        <div class="edit-modal-footer">
          <div class="footer-left">
            <button class="btn-secondary" @click="wrapWithParentFromModal">Wrap with Parent</button>
            <button class="btn-danger" @click="deleteNodeFromModal">Delete</button>
          </div>
          <div class="footer-right">
            <button class="btn-secondary" @click="hideEditModal">Cancel</button>
            <button class="btn-primary" @click="saveEditModal">Save</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Prompt Modal (styled replacement for native prompt()) -->
    <div v-if="promptModal.visible" class="prompt-modal-overlay" @click.self="cancelPrompt">
      <div class="prompt-modal">
        <div class="prompt-modal-header">
          <h3>{{ promptModal.title }}</h3>
        </div>
        <div class="prompt-modal-content">
          <input
            ref="promptInputRef"
            v-model="promptModal.value"
            :placeholder="promptModal.placeholder"
            class="prompt-input"
            @keydown="handlePromptKeydown"
          />
        </div>
        <div class="prompt-modal-footer">
          <button class="btn-secondary" @click="cancelPrompt">Cancel</button>
          <button class="btn-primary" @click="submitPrompt">Create</button>
        </div>
      </div>
    </div>

    <!-- Add Node Modal (Cmd+Enter or edge click) -->
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

<style scoped>
.graph-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 500px;
  position: relative;
  flex: 1;
}

.graph-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  display: flex;
  gap: 6px;
  align-items: center;
}

.controls-separator {
  width: 1px;
  height: 20px;
  background: #444;
  margin: 0 4px;
}

.graph-controls button {
  padding: 6px 12px;
  font-size: 0.8rem;
}

.graph-controls button.active {
  background: #1a3a5a;
  border-color: #4a9eff;
  color: #4a9eff;
}

.graph-controls button.icon-btn {
  padding: 6px 10px;
  font-size: 1rem;
}

.graph-controls button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.graph-controls button.relax-locked {
  background: #1a4a1a !important;
  border-color: #4a9a4a !important;
  color: #4f4 !important;
  box-shadow: 0 0 10px rgba(0, 255, 0, 0.3);
  animation: pulse-relax 1s ease-in-out infinite;
}

@keyframes pulse-relax {
  0%, 100% {
    box-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
  }
  50% {
    box-shadow: 0 0 15px rgba(0, 255, 0, 0.6);
  }
}

.graph-container {
  flex: 1;
  min-height: 400px;
  height: 100%;
  width: 100%;
  background: var(--bg-primary);
}

.graph-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: 14px;
}

.drop-highlight {
  display: none;
  position: absolute;
  width: 160px;
  height: 70px;
  border: 2px dashed #4a9eff;
  border-radius: 8px;
  background: rgba(74, 158, 255, 0.08);
  pointer-events: none;
  z-index: 50;
  animation: drop-pulse 1s ease-in-out infinite;
}

@keyframes drop-pulse {
  0%, 100% {
    border-color: #4a9eff;
    box-shadow: 0 0 20px rgba(74, 158, 255, 0.3);
  }
  50% {
    border-color: #7db8ff;
    box-shadow: 0 0 30px rgba(74, 158, 255, 0.5);
  }
}

/* Link mode - green/teal color to indicate linking instead of moving */
.drop-highlight.link-mode {
  border-color: #00c9a7;
  background: rgba(0, 201, 167, 0.1);
  animation: link-pulse 0.8s ease-in-out infinite;
}

.drop-highlight.link-mode::after {
  content: 'Link (Option)';
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  background: #00c9a7;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
  letter-spacing: 0.3px;
}

@keyframes link-pulse {
  0%, 100% {
    border-color: #00c9a7;
    box-shadow: 0 0 20px rgba(0, 201, 167, 0.3);
  }
  50% {
    border-color: #00e6be;
    box-shadow: 0 0 30px rgba(0, 201, 167, 0.5);
  }
}

/* Link mode indicator */
.link-mode-indicator {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  background: #00c9a7;
  color: white;
  padding: 6px 14px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: none;
}

/* Edit Modal - full featured */
.edit-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.edit-modal {
  background: #0d0d0d;
  border: 2px solid #333;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #333;
  background: #111;
}

.edit-modal-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}

.modal-close {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 18px;
  padding: 4px 10px;
  border-radius: 4px;
  transition: all 0.15s;
}

.modal-close:hover {
  background: #333;
  color: #fff;
}

.edit-modal-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.edit-field {
  margin-bottom: 16px;
}

.edit-field label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.edit-input,
.edit-select,
.edit-textarea {
  width: 100%;
  padding: 10px 12px;
  font-size: 14px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #fff;
  transition: border-color 0.15s;
  box-sizing: border-box;
}

.edit-input:focus,
.edit-select:focus,
.edit-textarea:focus {
  outline: none;
  border-color: #4a9eff;
}

.edit-textarea {
  min-height: 120px;
  resize: vertical;
  font-family: inherit;
  line-height: 1.5;
}

.edit-select {
  cursor: pointer;
}

.edit-color {
  width: 60px;
  height: 36px;
  padding: 2px;
  border: 1px solid #333;
  border-radius: 6px;
  cursor: pointer;
  background: #1a1a1a;
}

.importance-input {
  width: 80px;
}

.checkbox-field label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  text-transform: none;
  color: #e0e0e0;
}

.checkbox-field input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--accent-color);
  color-scheme: dark;
}

.field-hint {
  display: block;
  font-size: 11px;
  color: #666;
  margin-top: 4px;
  margin-left: 26px;
}

.edit-field-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.edit-field-row .edit-field {
  flex: 1;
  margin-bottom: 0;
}

.notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.preview-toggle {
  padding: 4px 12px;
  font-size: 11px;
  background: #222;
  border: 1px solid #444;
  color: #aaa;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.preview-toggle:hover {
  background: #333;
  color: #fff;
}

.preview-toggle.active {
  background: #4a9eff;
  border-color: #4a9eff;
  color: #fff;
}

.notes-preview {
  min-height: 120px;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 6px;
  color: #e0e0e0;
}

.notes-field {
  flex: 1;
}

.edit-meta {
  display: flex;
  gap: 20px;
  padding: 12px 0;
  border-top: 1px solid #222;
  margin-top: 8px;
  font-size: 12px;
  color: #666;
}

.edit-modal-footer {
  display: flex;
  justify-content: space-between;
  padding: 16px 20px;
  border-top: 1px solid #333;
  background: #111;
}

.footer-left,
.footer-right {
  display: flex;
  gap: 10px;
}

.btn-primary,
.btn-secondary,
.btn-danger {
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-primary {
  background: #4a9eff;
  border: none;
  color: #fff;
}

.btn-primary:hover {
  background: #3a8eef;
}

.btn-secondary {
  background: #222;
  border: 1px solid #444;
  color: #ccc;
}

.btn-secondary:hover {
  background: #333;
  color: #fff;
}

.btn-danger {
  background: #4a1a1a;
  border: 1px solid #7a2a2a;
  color: #ff6b6b;
}

.btn-danger:hover {
  background: #5a2a2a;
}

/* Prompt Modal */
.prompt-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001;
  backdrop-filter: blur(4px);
}

.prompt-modal {
  background: #0d0d0d;
  border: 2px solid #333;
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}

.prompt-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid #333;
}

.prompt-modal-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.prompt-modal-content {
  padding: 20px;
}

.prompt-input {
  width: 100%;
  padding: 12px 14px;
  font-size: 15px;
  background: #1a1a1a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  box-sizing: border-box;
}

.prompt-input:focus {
  outline: none;
  border-color: #4a9eff;
}

.prompt-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #333;
}

/* Person node - compact pill badge */
:global(.node-person) {
  padding: 8px 14px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s, box-shadow 0.15s;
  max-width: 120px;
}

:global(.node-person:hover) {
  transform: scale(1.05);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

:global(.node-person.selected) {
  outline: 2px solid var(--accent-color, #4a9eff);
  outline-offset: 2px;
}

:global(.person-name) {
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* HTML Node styling - like old app */
:global(.node-html) {
  background: #0d0d0d;
  border: 3px solid #1a6fab;
  border-radius: 8px;
  padding: 10px 12px;
  min-width: 120px;
  max-width: 250px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  color: #e0e0e0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  cursor: pointer;
  transition: box-shadow 0.15s, filter 0.15s;
}

:global(.node-html:hover) {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  filter: brightness(1.1);
}

/* Selected node - cyan outline matching node shape */
:global(.node-html.selected) {
  outline: 2px solid var(--accent-color, #4a9eff);
  outline-offset: 2px;
}

/* Current container - static glow using node's type color */
:global(.node-html.current-container) {
  border-width: 3px !important;
  box-shadow:
    0 0 12px var(--glow-color),
    0 0 24px var(--glow-color),
    0 0 36px rgba(255, 255, 255, 0.15);
}

/* Favorite - golden glow (keeps original border color, stronger than root) */
:global(.node-html.favorite) {
  box-shadow:
    0 0 6px rgba(255, 215, 0, 1),
    0 0 14px rgba(255, 215, 0, 0.9),
    0 0 24px rgba(255, 215, 0, 0.8),
    0 0 36px rgba(255, 215, 0, 0.6),
    0 0 50px rgba(255, 215, 0, 0.4),
    0 0 70px rgba(255, 215, 0, 0.2);
}

:global(.node-html.favorite.current-container) {
  box-shadow:
    0 0 12px var(--glow-color),
    0 0 24px var(--glow-color),
    0 0 6px rgba(255, 215, 0, 1),
    0 0 14px rgba(255, 215, 0, 0.9),
    0 0 24px rgba(255, 215, 0, 0.8),
    0 0 36px rgba(255, 215, 0, 0.6),
    0 0 50px rgba(255, 215, 0, 0.4);
}

:global(.node-html.completed) {
  opacity: 0.6;
  filter: brightness(0.7);
}

:global(.node-html.completed .node-html-title) {
  text-decoration: line-through;
}

:global(.node-html-title) {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  line-height: 1.3;
  margin-bottom: 6px;
  word-wrap: break-word;
  max-height: 40px;
  overflow: hidden;
}

:global(.node-html-notes) {
  font-size: 12px;
  line-height: 1.4;
  color: #bbb;
  max-height: 100px;
  overflow: hidden;
}

:global(.node-html-notes p) {
  margin: 0 0 6px 0;
}

:global(.node-html-notes p:last-child) {
  margin-bottom: 0;
}

:global(.node-html-notes code) {
  background: #222;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
  color: #2ecc71;
}

:global(.node-html-notes pre) {
  background: #1a1a1a;
  padding: 6px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 6px 0;
  font-size: 11px;
}

:global(.node-html-notes ul),
:global(.node-html-notes ol) {
  margin: 4px 0;
  padding-left: 16px;
}

:global(.node-html-notes li) {
  margin: 2px 0;
}

:global(.node-html-notes a) {
  color: #3498db;
  text-decoration: underline;
}

:global(.node-html-notes blockquote) {
  border-left: 2px solid #3498db;
  margin: 6px 0;
  padding-left: 8px;
  color: #888;
}

:global(.node-html-notes table) {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  margin: 6px 0;
}

:global(.node-html-notes th),
:global(.node-html-notes td) {
  border: 1px solid #333;
  padding: 3px 6px;
}

:global(.node-html-notes th) {
  background: #1a1a1a;
}

/* Search highlight animation */
:global(.node-html.search-highlight) {
  animation: search-pulse 0.5s ease-out 3;
}

@keyframes search-pulse {
  0%, 100% {
    box-shadow: 0 0 0 4px rgba(74, 158, 255, 0.8);
  }
  50% {
    box-shadow: 0 0 0 12px rgba(74, 158, 255, 0.3);
  }
}
</style>
