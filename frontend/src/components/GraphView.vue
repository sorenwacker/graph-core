<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import cytoscape from 'cytoscape'
import coseBilkent from 'cytoscape-cose-bilkent'
import cola from 'cytoscape-cola'
import dagre from 'cytoscape-dagre'
import nodeHtmlLabel from 'cytoscape-node-html-label'
import { marked } from 'marked'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/translucent.css'
import MarkdownRenderer from './MarkdownRenderer.vue'

// Register extensions only once (use global flag to survive HMR)
if (!window.__cytoscapeExtensionsRegistered) {
  cytoscape.use(coseBilkent)
  cytoscape.use(cola)
  cytoscape.use(dagre)
  nodeHtmlLabel(cytoscape)
  window.__cytoscapeExtensionsRegistered = true
}

// Configure marked for notes rendering
marked.setOptions({
  breaks: true,
  gfm: true
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
  hideCompleted: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'enter', 'move', 'add-child', 'insert-between', 'update', 'create', 'delete', 'wrap-with-parent'])

const container = ref(null)
const editModalEl = ref(null)
const editTitleInput = ref(null)
const dropHighlightEl = ref(null)
const layoutMode = ref(localStorage.getItem('graph-layout-mode') || 'tree')
const relaxLocked = ref(false)
let relaxClickTimeout = null
let cy = null

// Node types for dropdown
const nodeTypes = ['project', 'task', 'note', 'milestone', 'topic', 'folder', 'person']

// Node positions storage key
function getPositionsKey() {
  const parentId = props.parent?.id || 'root'
  return `graph-positions-${parentId}`
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


// Edit modal state
const editModal = ref({
  visible: false,
  node: null,
  editedNode: {}
})
const showNotesPreview = ref(false)

// Track active tippy instance for cleanup
let activeTippyInstance = null

function showEditModal(node) {
  // Hide any active tippy tooltip when showing edit modal
  if (activeTippyInstance) {
    activeTippyInstance.destroy()
    activeTippyInstance = null
  }
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
  if (confirm('Delete this node?')) {
    emit('delete', editModal.value.node.id)
    hideEditModal()
  }
}

function wrapWithParentFromModal() {
  if (!editModal.value.node) return
  const title = prompt('New parent title:')
  if (title) {
    emit('wrap-with-parent', { nodeId: editModal.value.node.id, parentTitle: title })
    hideEditModal()
  }
}

// Match old app's styling: dark backgrounds with colored borders
const typeColors = {
  project: { bg: '#0d0d0d', border: '#3498db', text: '#ffffff' },  // blue
  task: { bg: '#0d0d0d', border: '#f1c40f', text: '#ffffff' },     // yellow
  note: { bg: '#0d0d0d', border: '#2ecc71', text: '#ffffff' },     // green
  milestone: { bg: '#0d0d0d', border: '#9b59b6', text: '#ffffff' }, // purple
  topic: { bg: '#0d0d0d', border: '#00bcd4', text: '#ffffff' },    // cyan
  folder: { bg: '#0d0d0d', border: '#7f8c8d', text: '#ffffff' },   // gray
  person: { bg: '#0d0d0d', border: '#e67e22', text: '#ffffff' }    // default orange (overridden per person)
}

// Generate consistent random color for a person based on their ID
function getPersonColor(personId) {
  const hue = (personId * 137.508) % 360  // Golden angle for good distribution
  return `hsl(${hue}, 65%, 55%)`
}

function flattenNodes(nodeList, result = [], skipCompleted = false) {
  for (const node of nodeList) {
    // Skip completed nodes AND all their children
    if (skipCompleted && node.completed) continue
    result.push(node)
    if (node.children?.length) {
      flattenNodes(node.children, result, skipCompleted)
    }
  }
  return result
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

function buildElements(nodeList, parentNode, savedPositions = {}, detailThreshold = 30) {
  // Filter completed nodes and their children if hideCompleted is enabled
  const filteredList = props.hideCompleted
    ? filterCompletedNodes(nodeList)
    : nodeList
  const flat = flattenNodes(filteredList)

  // Include parent unless it's completed and we're hiding completed
  const includeParent = parentNode && !(props.hideCompleted && parentNode.completed)
  const allNodes = includeParent ? [{ ...parentNode, children: filteredList }, ...flat] : flat
  const totalNodes = allNodes.length
  const showDetails = totalNodes <= detailThreshold
  // Top-level node IDs in current view (for glow effect)
  const topLevelIds = new Set(nodeList.map(n => n.id))

  const elements = []

  // Add nodes
  allNodes.forEach((node, index) => {
    const savedPos = savedPositions[String(node.id)]
    let colors = typeColors[node.type] || typeColors.task
    // Persons get unique colors based on their ID
    if (node.type === 'person') {
      colors = { ...colors, border: getPersonColor(node.id) }
    }
    // Custom color as subtle background tint (preserves type-based border)
    let customBgTint = null
    if (node.color && node.color !== '#0f4c75') {
      customBgTint = node.color
    }
    // Root node glow: current container when drilling in, or top-level nodes in current view
    const isCurrentContainer = parentNode && node.id === parentNode.id
    const isTopLevelNode = !parentNode && topLevelIds.has(node.id)
    const shouldGlow = isCurrentContainer || isTopLevelNode
    const hasChildren = node.children?.length > 0
    const childCount = node.children?.length || 0
    const isCompleted = node.completed

    // Build clean label - title only when many nodes, add meta for fewer nodes
    let label = node.title

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
      if (totalNodes <= 5 && node.notes) {
        label += '\n\n' + cleanMarkdown(node.notes, 200)
      } else if (totalNodes <= 10 && node.notes) {
        label += '\n\n' + cleanMarkdown(node.notes, 80)
      } else if (totalNodes <= 15 && node.notes) {
        const preview = cleanMarkdown(node.notes, 30)
        if (preview) label += '\n' + preview
      }
    }

    // Build tooltip HTML with full details
    let tooltip = `<div class="tt-header">`
    tooltip += `<div class="tt-title">${node.title}</div>`
    // Add checkbox for all types except person
    if (node.type !== 'person') {
      tooltip += `<label class="tt-checkbox"><input type="checkbox" data-node-id="${node.id}" ${isCompleted ? 'checked' : ''} /><span>Done</span></label>`
    }
    tooltip += `</div>`
    tooltip += `<div class="tt-meta">`
    tooltip += `<span class="tt-type ${node.type}">${node.type}</span>`
    if (childCount > 0) tooltip += `<span class="tt-children">${childCount} items</span>`
    if (node.importance) tooltip += `<span class="tt-priority">P${node.importance}</span>`
    tooltip += `</div>`

    if (node.due_date || node.start_date || node.end_date) {
      tooltip += `<div class="tt-dates">`
      if (node.due_date) tooltip += `<span class="tt-due">Due: ${formatDate(node.due_date)}</span>`
      if (node.start_date) tooltip += `<span class="tt-start">Start: ${formatDate(node.start_date)}</span>`
      if (node.end_date) tooltip += `<span class="tt-end">End: ${formatDate(node.end_date)}</span>`
      tooltip += `</div>`
    }

    if (node.notes) {
      const notesHtml = renderMarkdownHtml(node.notes, 2000)
      tooltip += `<div class="tt-notes markdown-body">${notesHtml}</div>`
    }

    // Adjust colors for completed nodes and parent nodes
    const bgColor = isCompleted ? darkenColor(colors.bg) : colors.bg
    const textColor = isCompleted ? '#888888' : colors.text

    const element = {
      data: {
        id: String(node.id),
        label,
        tooltip,
        type: node.type,
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

  // Add edges
  if (parentNode) {
    nodeList.forEach(child => {
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

function initGraph() {
  if (!container.value) return

  const savedPositions = loadNodePositions()
  const elements = buildElements(props.nodes, props.parent, savedPositions, props.detailThreshold)
  const hasPositions = Object.keys(savedPositions).length > 0

  cy = cytoscape({
    container: container.value,
    elements,
    boxSelectionEnabled: true,
    selectionType: 'additive',
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
        selector: 'node:selected',
        style: {
          'overlay-opacity': 0
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
      const borderColor = data.borderColor || '#1a6fab'
      const customBgTint = data.customBgTint
      const showDetails = data.showDetails
      const totalNodes = data.totalNodes || 0
      const isCompleted = node.completed
      const completedClass = isCompleted ? 'completed' : ''
      const shouldGlow = data.shouldGlow
      const glowClass = shouldGlow ? "current-container" : ""

      // Only show notes based on detail threshold
      let notesHtml = ''
      if (showDetails && node.notes) {
        const maxLen = totalNodes <= 5 ? 300 : totalNodes <= 10 ? 150 : 60
        notesHtml = renderMarkdownHtml(node.notes, maxLen)
      }

      // Custom color as subtle background gradient
      const bgStyle = customBgTint
        ? `background: linear-gradient(135deg, ${customBgTint}22 0%, #0d0d0d 60%);`
        : ''

      return `
        <div class="node-html ${completedClass} ${glowClass}" style="border-color: ${borderColor}; --glow-color: ${borderColor}; ${bgStyle}">
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
      // Cmd/Ctrl+click: add child node
      const title = prompt('New child node title:')
      if (title) {
        emit('add-child', { parentId: node.id, title })
      }
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

  // Click on background to close edit modal
  cy.on('tap', (e) => {
    if (e.target === cy) {
      hideEditModal()
    }
  })

  // Double-click on background to create new node
  cy.on('dbltap', (e) => {
    if (e.target === cy) {
      const pos = e.position
      const title = prompt('New node title:')
      if (title) {
        emit('create', { title, x: pos.x, y: pos.y })
      }
    }
  })

  // Save positions after drag
  cy.on('dragfree', 'node', () => {
    saveNodePositions()
  })

  // Click on edge to insert node between
  cy.on('tap', 'edge', (e) => {
    const edge = e.target
    const sourceId = parseInt(edge.source().id())
    const targetId = parseInt(edge.target().id())
    const sourceNode = edge.source().data('nodeData')
    const targetNode = edge.target().data('nodeData')

    if (sourceNode && targetNode) {
      const title = prompt(`Insert node between "${sourceNode.title}" and "${targetNode.title}":`)
      if (title) {
        emit('insert-between', { parentId: sourceId, childId: targetId, title })
      }
    }
  })

  // Tooltip on node hover - simplified
  cy.on('mouseover', 'node', (e) => {
    if (editModal.value.visible) return
    const tooltipContent = e.target.data('tooltip')
    if (!tooltipContent) return

    // Destroy previous
    if (activeTippyInstance) {
      activeTippyInstance.destroy()
      activeTippyInstance = null
    }

    // Get the HTML label element for this node
    const nodeId = e.target.id()
    const htmlLabels = container.value?.querySelectorAll('.node-html')
    if (!htmlLabels) return

    // Find closest HTML element to the node position
    const nodePos = e.target.renderedPosition()
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
      activeTippyInstance = tippy(closestEl, {
        content: tooltipContent,
        allowHTML: true,
        interactive: true,
        interactiveBorder: 20,
        delay: [200, 400],
        duration: [200, 150],
        placement: 'right',
        appendTo: document.body,
        theme: 'graph-tooltip',
        maxWidth: 400,
        trigger: 'manual',
        onShown: (instance) => {
          // Attach event listener to checkbox in tooltip
          const checkbox = instance.popper.querySelector('input[type="checkbox"][data-node-id]')
          if (checkbox) {
            checkbox.addEventListener('change', (e) => {
              const nodeId = parseInt(e.target.dataset.nodeId)
              const completed = e.target.checked
              const node = props.nodes.flatMap(function flatten(n) {
                return [n, ...(n.children || []).flatMap(flatten)]
              }).find(n => n.id === nodeId) || (props.parent?.id === nodeId ? props.parent : null)
              if (node) {
                emit('update', { ...node, completed })
              }
            })
          }
        },
        onHidden: () => {
          if (activeTippyInstance) {
            activeTippyInstance.destroy()
            activeTippyInstance = null
          }
        }
      })
      activeTippyInstance.show()
    }
  })

  cy.on('mouseout', 'node', () => {
    // Tippy handles hide delay with interactive mode
  })

  cy.on('drag', 'node', () => {
    if (activeTippyInstance) {
      activeTippyInstance.hide()
    }
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
    } else if (dropHighlightEl.value) {
      dropHighlightEl.value.style.display = 'none'
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
        // Confirm the reparent action
        if (confirm(`Move "${sourceNode.title}" under "${targetNode.title}"?`)) {
          emit('move', { nodeId: sourceNode.id, newParentId: targetNode.id })
        } else {
          // Reset position if cancelled
          if (dragStartPos) {
            draggedNode.position(dragStartPos)
          }
        }
      }
    }

    dragStartPos = null
  })

  // Update selection styling
  if (props.selectedId) {
    cy.$(`#${props.selectedId}`).select()
  }
}

function findSmartPosition(nodeId, parentId, savedPositions) {
  // Convert parentId to string for lookup (localStorage keys are strings)
  const parentKey = String(parentId)

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

function updateGraph() {
  if (!cy) {
    initGraph()
    return
  }

  const savedPositions = loadNodePositions()

  // Get current positions from cytoscape BEFORE removing elements
  if (cy) {
    cy.nodes().forEach(node => {
      const pos = node.position()
      savedPositions[node.id()] = { x: pos.x, y: pos.y }
    })
  }

  const elements = buildElements(props.nodes, props.parent, savedPositions, props.detailThreshold)
  const hasPositions = Object.keys(savedPositions).length > 0

  // Build a map of element positions for quick lookup
  const elementPositions = {}
  elements.forEach(el => {
    if (!el.data.source && el.position) {
      elementPositions[el.data.id] = el.position
    }
  })

  // Track previous node count to detect additions
  const prevNodeCount = cy ? cy.nodes().length : 0

  // Find new nodes (no saved position) and assign smart positions
  elements.forEach(el => {
    if (!el.data.source && !el.position) {
      const nodeData = el.data.nodeData
      const parentId = nodeData?.parent_id
      // First check element positions (current graph), then savedPositions
      const allPositions = { ...savedPositions, ...elementPositions }
      el.position = findSmartPosition(el.data.id, parentId, allPositions)
    }
  })

  const newNodeCount = elements.filter(el => !el.data.source).length
  const hasNewNodes = newNodeCount > prevNodeCount

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
      const borderColor = data.borderColor || '#1a6fab'
      const customBgTint = data.customBgTint
      const showDetails = data.showDetails
      const totalNodes = data.totalNodes || 0
      const isCompleted = node.completed
      const completedClass = isCompleted ? 'completed' : ''
      const shouldGlow = data.shouldGlow
      const glowClass = shouldGlow ? "current-container" : ""

      // Only show notes based on detail threshold
      let notesHtml = ''
      if (showDetails && node.notes) {
        const maxLen = totalNodes <= 5 ? 300 : totalNodes <= 10 ? 150 : 60
        notesHtml = renderMarkdownHtml(node.notes, maxLen)
      }

      // Custom color as subtle background gradient
      const bgStyle = customBgTint
        ? `background: linear-gradient(135deg, ${customBgTint}22 0%, #0d0d0d 60%);`
        : ''

      return `
        <div class="node-html ${completedClass} ${glowClass}" style="border-color: ${borderColor}; --glow-color: ${borderColor}; ${bgStyle}">
          <div class="node-html-title">${node.title || 'Untitled'}</div>
          ${notesHtml ? `<div class="node-html-notes">${notesHtml}</div>` : ''}
        </div>
      `
    }
  }])
  if (!hasPositions) {
    cy.layout(getLayoutOptions()).run()
  } else if (hasNewNodes) {
    // Trigger relax when new nodes are added to settle layout
    setTimeout(relaxLayout, 50)
  }

  // Save positions for new nodes and auto-fit
  setTimeout(() => {
    saveNodePositions()
    cy.fit(50)
  }, 100)
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

watch(() => props.nodes, updateGraph)
watch(() => props.parent, updateGraph)
watch(() => props.detailThreshold, updateGraph)
watch(() => props.hideCompleted, () => {
  updateGraph()
  // Trigger relayout after filtering
  setTimeout(reLayout, 100)
})
watch(() => props.selectedId, (newId) => {
  if (cy && newId) {
    cy.nodes().unselect()
    cy.$(`#${newId}`).select()
  }
})

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

onMounted(() => {
  initGraph()
  window.addEventListener('graph-center-node', handleCenterNodeEvent)
})

onUnmounted(() => {
  window.removeEventListener('graph-center-node', handleCenterNodeEvent)
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
    </div>
    <div class="graph-container" ref="container">
      <div v-if="nodes.length === 0" class="graph-empty">
        No nodes to display
      </div>
    </div>
    <div ref="dropHighlightEl" class="drop-highlight"></div>

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

/* Current container - static glow using node's type color */
:global(.node-html.current-container) {
  border-width: 3px !important;
  box-shadow:
    0 0 12px var(--glow-color),
    0 0 24px var(--glow-color),
    0 0 36px rgba(255, 255, 255, 0.15);
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

<style>
/* Tippy.js custom theme for graph tooltips */
.tippy-box[data-theme~='graph-tooltip'] {
  background: #0d0d0d;
  border: 2px solid #333;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #e0e0e0;
  font-size: 15px;
  line-height: 1.5;
}

.tippy-box[data-theme~='graph-tooltip'] .tippy-content {
  padding: 0;
  max-height: 400px;
  overflow-y: auto;
}

.tippy-box[data-theme~='graph-tooltip'] .tippy-arrow {
  color: #333;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 14px 16px 10px;
  border-bottom: 1px solid #333;
  gap: 12px;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  flex: 1;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 13px;
  color: #aaa;
  white-space: nowrap;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-checkbox input {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--accent-color);
  color-scheme: dark;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-checkbox:hover {
  color: #fff;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-meta {
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  font-size: 14px;
  flex-wrap: wrap;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-type {
  padding: 3px 10px;
  border-radius: 12px;
  font-weight: 500;
  text-transform: capitalize;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-type.project { background: rgba(13, 58, 92, 0.8); color: #c0e0ff; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.task { background: rgba(74, 74, 16, 0.8); color: #f0f0a0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.note { background: rgba(26, 74, 26, 0.8); color: #a0f0a0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.milestone { background: rgba(74, 26, 74, 0.8); color: #f0a0f0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.topic { background: rgba(26, 74, 74, 0.8); color: #a0f0f0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.folder { background: rgba(58, 58, 58, 0.8); color: #d0d0d0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-type.person { background: rgba(90, 42, 10, 0.8); color: #ffb080; }

.tippy-box[data-theme~='graph-tooltip'] .tt-children { color: #888; }

.tippy-box[data-theme~='graph-tooltip'] .tt-completed {
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(34, 197, 94, 0.2);
  color: #4ade80;
  font-weight: 500;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-priority {
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  font-weight: 500;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-dates {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.02);
  font-size: 14px;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-due { color: #f87171; }
.tippy-box[data-theme~='graph-tooltip'] .tt-start { color: #4ade80; }
.tippy-box[data-theme~='graph-tooltip'] .tt-end { color: #60a5fa; }

.tippy-box[data-theme~='graph-tooltip'] .tt-notes {
  padding: 10px 14px;
  font-size: 12px;
  color: #ccc;
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid #333;
  line-height: 1.5;
}

.tippy-box[data-theme~='graph-tooltip'] .tt-notes p { margin: 0 0 8px 0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-notes p:last-child { margin-bottom: 0; }
.tippy-box[data-theme~='graph-tooltip'] .tt-notes code {
  background: #222;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 11px;
  color: #2ecc71;
}
.tippy-box[data-theme~='graph-tooltip'] .tt-notes pre {
  background: #1a1a1a;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 8px 0;
}
.tippy-box[data-theme~='graph-tooltip'] .tt-notes ul,
.tippy-box[data-theme~='graph-tooltip'] .tt-notes ol {
  margin: 6px 0;
  padding-left: 18px;
}
.tippy-box[data-theme~='graph-tooltip'] .tt-notes a {
  color: #3498db;
  text-decoration: underline;
}
</style>
