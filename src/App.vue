<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { marked } from 'marked'
import { api } from './services/api.js'
import { useNodeTooltip } from './composables/useNodeTooltip.js'
import { useDetachedWindow } from './composables/useDetachedWindow.js'
import { nodeTypes, getImportanceLabel, getTypeIcon, getTypeColors, typeConfig, personIconSvg } from './utils/constants.js'
import DetailPanel from './components/DetailPanel.vue'
import GraphView from './components/GraphView.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import PersonsView from './components/PersonsView.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import CardTitleEdit from './components/CardTitleEdit.vue'
import CardNotes from './components/CardNotes.vue'
import AddNodeModal from './components/AddNodeModal.vue'

// Click-outside directive
const vClickOutside = {
  mounted(el, binding) {
    el._clickOutside = (e) => {
      if (!el.contains(e.target)) {
        binding.value(e)
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    document.removeEventListener('click', el._clickOutside)
  }
}

// Configure marked for inline rendering with links handled by click handler
marked.use({
  breaks: true,
  gfm: true,
  renderer: {
    link({ href, title, text }) {
      const titleAttr = title ? ` title="${title}"` : ''
      return `<a href="${href}"${titleAttr} class="external-link" rel="noopener">${text}</a>`
    }
  }
})

// Global click handler for external links - opens in system browser
function handleGlobalClick(e) {
  const link = e.target.closest('a[href]')
  if (link) {
    const href = link.getAttribute('href')
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      e.preventDefault()
      e.stopPropagation()
      if (window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(href)
      } else {
        window.open(href, '_blank')
      }
    }
  }
}

// Navigation state - drill-down model
const currentContainerId = ref(null)  // null = root level
const currentContainer = ref(null)
const breadcrumbs = ref([])  // path from root to current container
const children = ref([])     // children of current container
const navigationHistory = ref([])  // Stack of previous container IDs for back navigation

// UI state - restore from localStorage
const viewMode = ref(localStorage.getItem('graphcore-viewMode') || 'tree')
const savedContainerId = localStorage.getItem('graphcore-containerId')
const loading = ref(true)
const error = ref(null)
const newNodeTitle = ref('')
const newNodeType = ref('task')
const selectedNode = ref(null)
const selectedIds = ref(new Set())
const lastSelectedNode = ref(null)  // For shift-click range selection
const showDetail = ref(false)
const fullscreenDetail = ref(false)
const detailPinned = ref(false)
const expandedIds = ref(new Set())
const transitioning = ref(false)
const transitionDirection = ref('forward')
const containerWidth = ref(800)
const containerHeight = ref(600)
const sidebarTree = ref([])  // Full tree for sidebar navigation
const sidebarExpandedIds = ref(new Set())
const recentItems = ref([])  // Recent items for sidebar
const trashedItems = ref([])  // Deleted items for trash view
const orphanedNodes = ref([])  // Orphaned nodes for lost & found
const showLostFound = ref(false)
const sidebarTreeCollapsed = ref(false)
const sidebarFavoritesCollapsed = ref(false)
const sidebarRecentCollapsed = ref(false)

// Context menu state
const contextMenu = ref({
  visible: false,
  x: 0,
  y: 0,
  node: null,
  linkedNodes: []
})

// =========================================
// WORKSPACES
// =========================================
// Workspaces provide complete data isolation. Each workspace has its own
// nodes, graphs, and views. The 'people' workspace is special - it shows
// only person nodes which can be @mentioned from any workspace.
const currentWorkspace = ref(localStorage.getItem('graphcore-workspace') || 'work')
const workspaces = ref([])  // Loaded from database

// Helper: Get workspace_id for creating new nodes
// All nodes in People workspace get NULL, others get current workspace
function getWorkspaceIdForNode(type) {
  if (currentWorkspace.value === 'people') return null  // All nodes in People workspace
  if (type === 'person' || type === 'organization') return null  // Persons and orgs always go to People workspace
  return currentWorkspace.value
}

// Random color for persons
const personColors = [
  '#e74c3c', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
  '#8bc34a', '#cddc39', '#ffc107', '#ff9800', '#ff5722',
  '#795548', '#607d8b', '#f44336', '#7c4dff', '#00e676'
]

function getRandomPersonColor() {
  return personColors[Math.floor(Math.random() * personColors.length)]
}

// Load available workspaces from database
async function loadWorkspaces() {
  try {
    workspaces.value = await api.getWorkspaces()
  } catch (e) {
    console.error('Failed to load workspaces:', e)
    workspaces.value = []
  }
}

// Favorites computed from all loaded nodes
const favoriteItems = ref([])
const sidebarPinned = ref(localStorage.getItem('graphcore-sidebarPinned') === 'true')
const sidebarHovered = ref(false)
let sidebarHideTimeout = null

function toggleSidebarPin() {
  sidebarPinned.value = !sidebarPinned.value
}

// Detail panel resize
const detailWidth = ref(parseInt(localStorage.getItem('graphcore-detailWidth')) || 400)
const isResizingDetail = ref(false)

function onDetailResizeStart(e) {
  isResizingDetail.value = true
  document.addEventListener('mousemove', onDetailResizeMove)
  document.addEventListener('mouseup', onDetailResizeEnd)
  e.preventDefault()
}

function onDetailResizeMove(e) {
  if (!isResizingDetail.value) return
  const newWidth = window.innerWidth - e.clientX
  detailWidth.value = Math.max(300, Math.min(newWidth, window.innerWidth * 0.9))
}

function onDetailResizeEnd() {
  isResizingDetail.value = false
  document.removeEventListener('mousemove', onDetailResizeMove)
  document.removeEventListener('mouseup', onDetailResizeEnd)
  localStorage.setItem('graphcore-detailWidth', detailWidth.value.toString())
}

function onSidebarEnter() {
  if (sidebarHideTimeout) {
    clearTimeout(sidebarHideTimeout)
    sidebarHideTimeout = null
  }
  sidebarHovered.value = true
}

function onSidebarLeave(event) {
  // Don't hide if pinned
  if (sidebarPinned.value) return

  // Only start hide timer if mouse is moving away from the sidebar area
  // Check mouse X position - if still near left edge, don't hide
  if (event && event.clientX < 300) {
    return
  }

  sidebarHideTimeout = setTimeout(() => {
    sidebarHovered.value = false
  }, 300)
}

function closeDetailIfNotPinned() {
  if (!detailPinned.value && showDetail.value) {
    showDetail.value = false
    selectedNode.value = null
    selectedIds.value = new Set()
  }
}

function closeDetail() {
  showDetail.value = false
  fullscreenDetail.value = false
  detailPinned.value = false
}

// Inline editing state
const editingCardId = ref(null)
const editingTitle = ref('')

// Inline notes-only editing (separate from full card editing)
const inlineNotesId = ref(null)
const inlineNotesText = ref('')
const inlineNotesRef = ref(null)
// Sensitive info visibility - restore from localStorage
const hideSensitive = ref(localStorage.getItem('graphcore-hideSensitive') === 'true')

// Setup tooltip composable - single source of truth for all tooltips
const { showTooltip, hideTooltip, forceHide: forceHideTooltip } = useNodeTooltip({
  onToggleComplete: async (nodeId) => {
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (node) await toggleComplete(node)
  },
  getHideSensitive: () => hideSensitive.value,
  shouldShowTooltip: () => !showDetail.value
})

// Setup detached window composable for cross-window sync
const {
  openDetachedWindow,
  broadcastNodeUpdate,
  broadcastNodeDelete,
  onMessage: onDetachedMessage
} = useDetachedWindow()

// Hide completed items - restore from localStorage (default: true)
const hideCompleted = ref(localStorage.getItem('graphcore-hideCompleted') !== 'false')

// Graph settings - restore from localStorage
const graphDetailThreshold = ref(parseInt(localStorage.getItem('graphcore-graphDetailThreshold')) || 30)
const graphMaxDepth = ref(parseInt(localStorage.getItem('graphcore-graphMaxDepth')) || 0) // 0 = all
const openDetailFullscreen = ref(localStorage.getItem('graphcore-openDetailFullscreen') === 'true')
const showSettings = ref(false)

// Snapshot/backup management
const availableSnapshots = ref([])
const showSnapshotList = ref(false)
const snapshotMessage = ref('')

async function loadSnapshots() {
  try {
    availableSnapshots.value = await api.listBackups()
  } catch (e) {
    console.error('Failed to load snapshots:', e)
    availableSnapshots.value = []
  }
}

async function createSnapshot() {
  try {
    const path = await api.backup('-manual')
    snapshotMessage.value = 'Snapshot created'
    setTimeout(() => snapshotMessage.value = '', 3000)
    await loadSnapshots()
  } catch (e) {
    snapshotMessage.value = 'Failed to create snapshot'
    console.error('Failed to create snapshot:', e)
  }
}

async function restoreSnapshot(backupPath) {
  if (!confirm('Restore this snapshot? Current data will be backed up first.')) return
  try {
    await api.restoreBackup(backupPath)
    snapshotMessage.value = 'Snapshot restored - reloading...'
    // Reload the app data
    await loadChildren(null)
    await loadSidebarTree()
    selectedNode.value = null
    currentContainerId.value = null
    breadcrumbs.value = []
    snapshotMessage.value = 'Snapshot restored successfully'
    setTimeout(() => snapshotMessage.value = '', 3000)
  } catch (e) {
    snapshotMessage.value = 'Failed to restore snapshot'
    console.error('Failed to restore snapshot:', e)
  }
}

async function reloadDatabase() {
  try {
    const result = await api.reload()
    snapshotMessage.value = `Database reloaded (${result.nodeCount} nodes)`
    // Reload the app data
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    if (selectedNode.value?.id) {
      selectedNode.value = await api.getNode(selectedNode.value.id)
    }
    setTimeout(() => snapshotMessage.value = '', 3000)
  } catch (e) {
    snapshotMessage.value = 'Failed to reload database'
    console.error('Failed to reload database:', e)
  }
}

function formatSnapshotDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Persist view mode changes and load data when switching views
watch(viewMode, (newMode) => {
  localStorage.setItem('graphcore-viewMode', newMode)
  if (newMode === 'trash') {
    loadTrashedItems()
  }
})

// Persist current container changes
watch(currentContainerId, (newId) => {
  if (newId === null) {
    localStorage.removeItem('graphcore-containerId')
  } else {
    localStorage.setItem('graphcore-containerId', newId)
  }
})

// Persist sensitive visibility setting
watch(hideSensitive, (newVal) => {
  localStorage.setItem('graphcore-hideSensitive', String(newVal))
})

// Persist hide completed setting
watch(hideCompleted, (newVal) => {
  localStorage.setItem('graphcore-hideCompleted', String(newVal))
})

// Persist graph detail threshold
watch(graphDetailThreshold, (newVal) => {
  localStorage.setItem('graphcore-graphDetailThreshold', String(newVal))
})

// Persist open detail fullscreen setting
watch(openDetailFullscreen, (newVal) => {
  localStorage.setItem('graphcore-openDetailFullscreen', String(newVal))
})

// Persist graph max depth
watch(graphMaxDepth, (newVal) => {
  localStorage.setItem('graphcore-graphMaxDepth', String(newVal))
})

// Persist sidebar pinned state
watch(sidebarPinned, (newVal) => {
  localStorage.setItem('graphcore-sidebarPinned', String(newVal))
})

// Close any active tooltips when detail panel opens
watch(showDetail, (isOpen) => {
  if (isOpen) {
    forceHideTooltip()
  }
})

// Watch for workspace changes - reload data when switching workspaces
watch(currentWorkspace, async (newWs) => {
  localStorage.setItem('graphcore-workspace', newWs)
  // Reset navigation when switching workspaces
  currentContainerId.value = null
  currentContainer.value = null
  breadcrumbs.value = []
  selectedNode.value = null
  selectedIds.value = new Set()
  showDetail.value = false
  // Reload data for new workspace
  await loadChildren(null)
  await loadSidebarTree()
  await loadRecentItems()
  await loadFavorites()
  // Restore expanded state for this workspace
  loadExpandedState()
})

// Computed for sidebar visibility
const sidebarVisible = computed(() => sidebarPinned.value || sidebarHovered.value)

// Search state - detached spotlight-style
const searchQuery = ref('')
const searchResults = ref([])
const showSearch = ref(false)
const searchTimeout = ref(null)
const searchInputRef = ref(null)
const graphViewRef = ref(null)
const detailPanelRef = ref(null)
const addNodeInput = ref(null)
const addChildParentId = ref(null) // Parent ID when adding via card + button

// Add node modal state
const addNodeModal = ref({
  visible: false,
  parentId: null
})

const searchMode = ref('normal') // 'normal' or 'link'
const linkSourceNodeId = ref(null)

// Global undo/redo stacks
const undoStack = ref([])
const redoStack = ref([])

function pushUndo(action) {
  undoStack.value.push(action)
  redoStack.value = []
  if (undoStack.value.length > 50) {
    undoStack.value.shift()
  }
}

async function undo() {
  if (undoStack.value.length === 0) return
  const action = undoStack.value.pop()
  try {
    if (action.type === 'move') {
      await api.moveNode(action.nodeId, action.oldParentId)
    } else if (action.type === 'create') {
      // Remove link if it was a person/org that was linked
      if (action.linkedToId) {
        await api.unlinkNodes(action.nodeId, action.linkedToId)
      }
      await api.deleteNode(action.nodeId, true)  // Hard delete since it was just created
    } else if (action.type === 'delete') {
      const restored = await api.restoreNode(action.nodeData.id)
      // Restore original parent if it was changed
      if (restored && action.nodeData.parent_id !== restored.parent_id) {
        await api.updateNode(action.nodeData.id, { parent_id: action.nodeData.parent_id })
      }
    } else if (action.type === 'delete-multiple') {
      // Restore all deleted nodes
      for (const node of action.nodes) {
        const restored = await api.restoreNode(node.id)
        if (restored && node.parent_id !== restored.parent_id) {
          await api.updateNode(node.id, { parent_id: node.parent_id })
        }
      }
    } else if (action.type === 'edit') {
      await api.updateNode(action.nodeId, action.oldValues)
    } else if (action.type === 'reorder') {
      await api.reorderNode(action.nodeId, action.oldTargetId, action.oldPosition)
    } else if (action.type === 'complete') {
      await api.updateNode(action.nodeId, { completed: action.oldCompleted })
    } else if (action.type === 'link') {
      // Undo link by unlinking
      await api.unlinkNodes(action.sourceId, action.targetId)
    } else if (action.type === 'unlink') {
      // Undo unlink by re-linking
      await api.linkNodes(action.sourceId, action.targetId)
    }
    // Push same action to redo stack (redo will re-apply the original action)
    redoStack.value.push(action)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    // Trigger relax after structure change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    console.error('Undo failed:', e, action)
    undoStack.value.push(action)
  }
}

async function redo() {
  if (redoStack.value.length === 0) return
  const action = redoStack.value.pop()
  try {
    if (action.type === 'move') {
      await api.moveNode(action.nodeId, action.newParentId)
    } else if (action.type === 'create') {
      const created = await api.createNode({ ...action.nodeData, parent_id: action.parentId })
      action.nodeId = created.id  // Update nodeId in case it changed
    } else if (action.type === 'delete') {
      await api.deleteNode(action.nodeData.id, false)
    } else if (action.type === 'delete-multiple') {
      // Delete all nodes again
      for (const node of action.nodes) {
        await api.deleteNode(node.id, false)
      }
    } else if (action.type === 'edit') {
      await api.updateNode(action.nodeId, action.newValues)
    } else if (action.type === 'reorder') {
      await api.reorderNode(action.nodeId, action.newTargetId, action.newPosition)
    } else if (action.type === 'complete') {
      await api.updateNode(action.nodeId, { completed: action.newCompleted })
    } else if (action.type === 'link') {
      // Redo link by re-linking
      await api.linkNodes(action.sourceId, action.targetId)
    } else if (action.type === 'unlink') {
      // Redo unlink by unlinking
      await api.unlinkNodes(action.sourceId, action.targetId)
    }
    // Push same action back to undo stack
    undoStack.value.push(action)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    // Trigger relax after structure change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    console.error('Redo failed:', e)
    redoStack.value.push(action)
  }
}
const selectedResultIndex = ref(0)

// Cards drag state
const cardDraggedNode = ref(null)
const cardDropTarget = ref(null)
const cardDropPosition = ref(null) // 'before', 'after', 'inside'

// Computed
const projects = computed(() => {
  if (currentContainerId.value === null) {
    return children.value.filter(n => n.type === 'project')
  }
  return []
})

const flatChildren = computed(() => {
  const result = []
  function flatten(nodeList) {
    for (const node of nodeList) {
      result.push(node)
      if (node.children?.length) {
        flatten(node.children)
      }
    }
  }
  flatten(children.value)
  return result
})

const contextTitle = computed(() => {
  if (currentContainer.value) {
    return currentContainer.value.title
  }
  return 'Root'
})

// Build inherited color map for cards (parent color flows to children)
const inheritedColorMap = computed(() => {
  const colorMap = {}
  function buildMap(nodeList, inheritedColor = null) {
    for (const node of nodeList) {
      const hasOwnColor = node.color && node.color !== '#0f4c75'
      const effectiveColor = hasOwnColor ? node.color : inheritedColor
      colorMap[node.id] = effectiveColor
      if (node.children?.length) {
        buildMap(node.children, effectiveColor)
      }
    }
  }
  // Find inherited color from ancestors (breadcrumbs)
  let ancestorColor = null
  for (const ancestor of breadcrumbs.value) {
    if (ancestor.color && ancestor.color !== '#0f4c75') {
      ancestorColor = ancestor.color
    }
  }
  // Start with container's own color, or inherited from ancestors
  const containerColor = currentContainer.value?.color && currentContainer.value.color !== '#0f4c75'
    ? currentContainer.value.color
    : ancestorColor
  buildMap(children.value, containerColor)
  return colorMap
})

function getNodeColor(node) {
  return inheritedColorMap.value[node.id] || null
}

const cardsGridStyle = computed(() => {
  const count = filteredChildren.value.length
  if (count === 0) return {}

  const w = containerWidth.value
  const h = containerHeight.value
  const gap = 10

  // Find optimal columns by minimizing difference from square cards
  // For each possible column count, calculate resulting card aspect ratio
  let bestCols = 1
  let bestScore = Infinity

  for (let cols = 1; cols <= Math.min(count, 8); cols++) {
    const rows = Math.ceil(count / cols)
    const cardWidth = (w - gap * (cols - 1)) / cols
    const cardHeight = (h - gap * (rows - 1)) / rows
    // Score: how far from square (1:1 ratio). Lower is better.
    const ratio = cardWidth / cardHeight
    const score = Math.abs(Math.log(ratio)) // log(1) = 0 for perfect square
    if (score < bestScore) {
      bestScore = score
      bestCols = cols
    }
  }

  const rows = Math.ceil(count / bestCols)

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${bestCols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: `${gap}px`,
    height: '100%'
  }
})

// Filter children for cards view when hideCompleted is true
function filterChildrenRecursive(nodeList) {
  if (!hideCompleted.value) return nodeList
  return nodeList
    .filter(node => !node.completed && !node.inheritedCompleted)
    .map(node => ({
      ...node,
      children: node.children ? filterChildrenRecursive(node.children) : []
    }))
}

const filteredChildren = computed(() => filterChildrenRecursive(children.value))

// Card size class based on grid dimensions
// xl: 1-2 cards, lg: 3-4, md: 5-9, sm: 10-16, xs: 17+
const cardSizeClass = computed(() => {
  const count = filteredChildren.value.length
  if (count <= 2) return 'card-xl'
  if (count <= 4) return 'card-lg'
  if (count <= 9) return 'card-md'
  if (count <= 16) return 'card-sm'
  return 'card-xs'
})

// Nested card size based on parent count and nesting level
function getNestedCardSize(parentChildCount, level) {
  if (level === 1) {
    // Child cards
    if (parentChildCount <= 2) return 'child-lg'
    if (parentChildCount <= 4) return 'child-md'
    if (parentChildCount <= 9) return 'child-sm'
    return 'child-xs'
  } else {
    // Grandchild cards - always compact
    return 'grandchild-xs'
  }
}

// Helper to calculate nested grid style based on count and available space
function nestedGridStyle(count, level = 1) {
  if (!count || count === 0) return {}

  const gap = level === 1 ? '4px' : '2px'

  // Use auto-fit with minmax - min() ensures cards can shrink to 100% if container is narrow
  return {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(min(300px, 100%), 1fr))`,
    gap: gap
  }
}

// Methods
async function loadSidebarTree() {
  try {
    // Filter by current workspace
    const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
    const roots = await api.getRoots(wsFilter)
    // In people workspace, show all persons. In other workspaces, exclude persons
    const filteredRoots = wsFilter === null ? roots : roots.filter(r => r.type !== 'person')
    const rootsWithChildren = await Promise.all(
      filteredRoots.map(async (root) => {
        const descendants = await api.getDescendants(root.id)
        return {
          ...root,
          children: buildChildTree(descendants, root.id)
        }
      })
    )
    sidebarTree.value = rootsWithChildren
  } catch (e) {
    console.error('Failed to load sidebar tree:', e)
  }
}

// Get workspace-specific localStorage key for recent cleared timestamp
function getRecentClearedKey() {
  const ws = currentWorkspace.value === 'people' ? 'people' : currentWorkspace.value
  return `graphcore-recentClearedAt-${ws}`
}

async function loadRecentItems() {
  try {
    const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
    const items = await api.getRecent(10, wsFilter)
    const clearedAt = localStorage.getItem(getRecentClearedKey())
    if (clearedAt) {
      // Only show items updated after the clear timestamp
      recentItems.value = items.filter(item => item.updated_at > clearedAt)
    } else {
      recentItems.value = items
    }
  } catch (e) {
    console.error('Failed to load recent items:', e)
  }
}

const previousRecentClearedAt = ref(null)

function clearRecent() {
  const key = getRecentClearedKey()
  // Store previous state for undo
  previousRecentClearedAt.value = localStorage.getItem(key)
  // Store timestamp - only show items updated after this time
  localStorage.setItem(key, new Date().toISOString())
  recentItems.value = []
}

function undoClearRecent() {
  if (previousRecentClearedAt.value !== null) {
    const key = getRecentClearedKey()
    if (previousRecentClearedAt.value) {
      localStorage.setItem(key, previousRecentClearedAt.value)
    } else {
      localStorage.removeItem(key)
    }
    previousRecentClearedAt.value = null
    loadRecentItems()
  }
}

async function loadFavorites() {
  try {
    if (api.getFavorites) {
      const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
      favoriteItems.value = await api.getFavorites(wsFilter)
    }
  } catch (e) {
    // Silently fail - favorites API may not be available until restart
    favoriteItems.value = []
  }
}

async function loadTrashedItems() {
  try {
    trashedItems.value = await api.getTrash(100)
  } catch (e) {
    console.error('Failed to load trashed items:', e)
  }
}

async function restoreFromTrash(node) {
  try {
    await api.restoreNode(node.id)
    await loadTrashedItems()
    await loadSidebarTree()
  } catch (e) {
    console.error('Failed to restore node:', e)
  }
}

async function permanentlyDelete(node) {
  if (!confirm(`Permanently delete "${node.title}"? This cannot be undone.`)) return
  try {
    await api.deleteNode(node.id, true)
    await loadTrashedItems()
  } catch (e) {
    console.error('Failed to delete node:', e)
  }
}

async function emptyAllTrash() {
  const count = trashedItems.value.length
  if (!confirm(`Permanently delete all ${count} items in trash? This cannot be undone.`)) return
  try {
    await api.emptyTrash()
    trashedItems.value = []
  } catch (e) {
    console.error('Failed to empty trash:', e)
  }
}

// Lost & Found - orphaned nodes
async function loadOrphanedNodes() {
  try {
    orphanedNodes.value = await api.getOrphanedNodes()
  } catch (e) {
    console.error('Failed to load orphaned nodes:', e)
    orphanedNodes.value = []
  }
}

async function moveToRoot(node) {
  try {
    await api.reparentToRoot(node.id)
    await loadOrphanedNodes()
    await loadSidebarTree()
  } catch (e) {
    console.error('Failed to move node to root:', e)
  }
}

async function deleteOrphanedNode(node) {
  if (!confirm(`Permanently delete "${node.title}"?`)) return
  try {
    await api.deleteNode(node.id, true)  // hard delete
    await loadOrphanedNodes()
  } catch (e) {
    console.error('Failed to delete orphaned node:', e)
  }
}

function toggleSidebarExpand(nodeId) {
  if (sidebarExpandedIds.value.has(nodeId)) {
    sidebarExpandedIds.value.delete(nodeId)
  } else {
    sidebarExpandedIds.value.add(nodeId)
  }
  sidebarExpandedIds.value = new Set(sidebarExpandedIds.value)
}

let isLoadingChildren = false
let lastLoadTime = 0
let lastLoadedContainerId = null

async function loadChildren(containerId = null) {
  const now = Date.now()
  const timeSinceLastLoad = now - lastLoadTime

  // Strict guard against re-entry
  if (isLoadingChildren) {
    return
  }

  // Debounce: skip if called within 200ms for same container
  if (timeSinceLastLoad < 200 && lastLoadedContainerId === containerId) {
    return
  }

  isLoadingChildren = true
  lastLoadedContainerId = containerId
  loading.value = true
  error.value = null
  try {
    if (containerId === null) {
      // Root level - get all root nodes with their descendants
      // Filter by current workspace (null = people workspace)
      const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
      const roots = await api.getRoots(wsFilter)
      // In people workspace, show all persons. In other workspaces, exclude persons
      const filteredRoots = wsFilter === null ? roots : roots.filter(r => r.type !== 'person')
      // Fetch descendants for each root to build nested structure
      const rootsWithChildren = await Promise.all(
        filteredRoots.map(async (root) => {
          const descendants = await api.getDescendants(root.id)
          return {
            ...root,
            children: buildChildTree(descendants, root.id)
          }
        })
      )
      children.value = rootsWithChildren
      sidebarTree.value = rootsWithChildren  // Update sidebar
      currentContainer.value = null
      breadcrumbs.value = []
    } else {
      // Get container and its children
      const [container, containerChildren] = await Promise.all([
        api.getNode(containerId),
        api.getChildren(containerId)
      ])
      currentContainer.value = container

      // Build children with nested structure for tree view
      const descendants = await api.getDescendants(containerId)
      children.value = buildTree(containerChildren, descendants)

      // Build breadcrumbs
      const ancestors = await api.getAncestors(containerId)
      // Filter out any ancestor that has same id as container (prevents duplicates)
      breadcrumbs.value = ancestors.filter(a => a.id !== container.id)
      breadcrumbs.value.push(container)

      // Expand sidebar tree to show current path
      breadcrumbs.value.forEach(crumb => {
        sidebarExpandedIds.value.add(crumb.id)
      })
      sidebarExpandedIds.value = new Set(sidebarExpandedIds.value)
    }
    currentContainerId.value = containerId
    // Keep stored expanded state from localStorage (don't reset)
  } catch (e) {
    console.error('Failed to load:', e)
    // If node not found (404), reset to root
    if (e.message?.includes('404') || e.message?.includes('Not found')) {
      currentContainerId.value = null
      localStorage.removeItem('graphcore-containerId')
      await loadChildren(null)
      return
    }
    error.value = e.message
  } finally {
    loading.value = false
    isLoadingChildren = false
    lastLoadTime = Date.now()
  }
}

function buildTree(directChildren, allDescendants, parentCompleted = false) {
  return directChildren.map(child => {
    const inheritedCompleted = parentCompleted || child.completed
    return {
      ...child,
      inheritedCompleted: parentCompleted,  // true if any ancestor is completed
      children: buildChildTree(allDescendants, child.id, inheritedCompleted)
    }
  })
}

function buildChildTree(flatNodes, parentId, parentCompleted = false) {
  const children = flatNodes.filter(n => n.parent_id === parentId)
  return children.map(child => {
    const inheritedCompleted = parentCompleted || child.completed
    return {
      ...child,
      inheritedCompleted: parentCompleted,  // true if any ancestor is completed
      children: buildChildTree(flatNodes, child.id, inheritedCompleted)
    }
  })
}

async function enterContainer(node, { skipHistory = false, direction = 'forward' } = {}) {
  // Handle both node objects and node IDs
  const nodeId = typeof node === 'object' ? node?.id : node

  // For notes with no children, open fullscreen detail view instead of navigating
  if (typeof node === 'object' && node.type === 'note' && !node.children?.length) {
    selectNode(node, { fullscreen: true })
    return
  }

  // Push current location to history before navigating (unless skipping)
  if (!skipHistory && currentContainerId.value !== nodeId) {
    navigationHistory.value.push(currentContainerId.value)
    // Limit history size
    if (navigationHistory.value.length > 50) {
      navigationHistory.value.shift()
    }
  }

  // Animate transition
  transitionDirection.value = direction
  transitioning.value = true

  await nextTick()
  setTimeout(async () => {
    await loadChildren(nodeId ?? null)
    transitioning.value = false
  }, 150)
}

// Navigate back in history (used after delete)
function navigateBack() {
  if (navigationHistory.value.length > 0) {
    const previousId = navigationHistory.value.pop()
    enterContainer(previousId, { skipHistory: true, direction: 'back' })
  } else {
    // Fallback: go to parent if no history
    goToParent()
  }
}

async function navigateToBreadcrumb(index) {
  transitionDirection.value = 'back'
  transitioning.value = true

  await nextTick()
  setTimeout(async () => {
    if (index < 0) {
      // Go to root
      await loadChildren(null)
    } else {
      await loadChildren(breadcrumbs.value[index].id)
    }
    transitioning.value = false
  }, 150)
}

function goToParent() {
  // Navigate to parent (one level up)
  if (breadcrumbs.value.length > 1) {
    // Go to parent of current container
    navigateToBreadcrumb(breadcrumbs.value.length - 2)
  } else if (breadcrumbs.value.length === 1) {
    // At first level, go to root
    navigateToBreadcrumb(-1)
  }
}

// Anchor node for shift+click range selection (like Finder)
const anchorNode = ref(null)

// Light select for hover - just updates selectedNode when detail panel is not open
function hoverSelectNode(node) {
  // Don't change selection on hover if detail panel is showing
  if (showDetail.value) return
  selectedNode.value = node
}

// Full select - opens detail panel
function selectNode(node, options = {}) {
  selectedNode.value = node
  lastSelectedNode.value = node
  anchorNode.value = node  // Set anchor for shift+click range selection
  selectedIds.value = new Set([node.id])
  showDetail.value = true
  // Open fullscreen if explicitly requested OR if setting is enabled
  if (options.fullscreen || openDetailFullscreen.value) {
    fullscreenDetail.value = true
  }
}

// Toggle detail panel visibility (for Enter key)
function toggleDetailPanel() {
  if (showDetail.value) {
    showDetail.value = false
    fullscreenDetail.value = false
  } else if (selectedNode.value) {
    showDetail.value = true
  }
}

async function navigateToNode(node) {
  // Navigate to the node's parent container and select the node
  const parentId = node.parent_id
  await loadChildren(parentId)
  selectNode(node)
}

async function selectChildById(nodeId, options = {}) {
  try {
    const node = await api.getNode(nodeId)
    selectNode(node, options)
  } catch (err) {
    console.error('Failed to select child:', err)
  }
}

async function openNodeFullscreen(nodeId) {
  try {
    const node = await api.getNode(nodeId)
    selectNode(node, { fullscreen: true })
  } catch (err) {
    console.error('Failed to open node fullscreen:', err)
  }
}

function handleMultiSelect({ node, add, range }) {
  if (add) {
    // Ctrl/Cmd+click: toggle selection
    const newSet = new Set(selectedIds.value)
    if (newSet.has(node.id)) {
      newSet.delete(node.id)
      // If we removed the anchor, set new anchor to remaining selection
      if (anchorNode.value?.id === node.id) {
        anchorNode.value = newSet.size > 0 ? flatChildren.value.find(n => newSet.has(n.id)) : null
      }
    } else {
      newSet.add(node.id)
      // First Ctrl+click sets the anchor
      if (!anchorNode.value) {
        anchorNode.value = node
      }
    }
    selectedIds.value = newSet
    selectedNode.value = node
    lastSelectedNode.value = node
  } else if (range) {
    // Shift+click: range selection from anchor (like Finder)
    const anchor = anchorNode.value || lastSelectedNode.value
    if (anchor) {
      const allNodes = flatChildren.value
      const anchorIdx = allNodes.findIndex(n => n.id === anchor.id)
      const currIdx = allNodes.findIndex(n => n.id === node.id)
      if (anchorIdx !== -1 && currIdx !== -1) {
        const start = Math.min(anchorIdx, currIdx)
        const end = Math.max(anchorIdx, currIdx)
        const rangeIds = allNodes.slice(start, end + 1).map(n => n.id)
        // Replace selection with range (Finder behavior)
        selectedIds.value = new Set(rangeIds)
      }
    } else {
      // No anchor, just select clicked node
      selectedIds.value = new Set([node.id])
      anchorNode.value = node
    }
    selectedNode.value = node
    // Don't update lastSelectedNode on shift+click to preserve anchor
  }
  showDetail.value = true
}

async function handleReorder({ nodeId, targetId, position }) {
  try {
    // Find original position for undo - look at current siblings
    const node = await api.getNode(nodeId)
    const siblings = node.parent_id
      ? (await api.getChildren(node.parent_id)).filter(n => n.id !== nodeId)
      : children.value.filter(n => n.id !== nodeId)

    // Find where this node currently sits among siblings by sort_order
    const currentNode = children.value.find(n => n.id === nodeId) ||
                        (await api.getNode(nodeId))
    const sortedSiblings = [...siblings].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))

    // Find the sibling that comes just before this node's current position
    let prevSibling = null
    for (const sib of sortedSiblings) {
      if ((sib.sort_order || 0) < (currentNode.sort_order || 0)) {
        prevSibling = sib
      } else {
        break
      }
    }

    // Store undo info
    const oldTargetId = prevSibling ? prevSibling.id : (sortedSiblings[0]?.id || null)
    const oldPosition = prevSibling ? 'after' : 'before'

    await api.reorderNode(nodeId, targetId, position)

    if (oldTargetId) {
      pushUndo({
        type: 'reorder',
        nodeId,
        oldTargetId,
        oldPosition,
        newTargetId: targetId,
        newPosition: position
      })
    }

    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

async function createNode() {
  if (!newNodeTitle.value.trim()) return

  try {
    const nodeType = newNodeType.value
    // Use addChildParentId if set (from card + button), otherwise use currentContainerId
    const targetParentId = addChildParentId.value || currentContainerId.value

    // Determine parent-child vs link behavior:
    // - Persons always link (never parent-child)
    // - Organizations can be children of other organizations, otherwise link
    let useParentChild = true
    let linkToId = null

    if (nodeType === 'person') {
      useParentChild = false
      linkToId = targetParentId
    } else if (nodeType === 'organization') {
      // Check if target parent is also an organization
      if (targetParentId) {
        const container = await api.getNode(targetParentId)
        if (container?.type === 'organization') {
          useParentChild = true  // Org inside org = parent-child
        } else {
          useParentChild = false
          linkToId = targetParentId
        }
      } else {
        useParentChild = true  // No container = root level org
      }
    }

    const nodeData = {
      title: newNodeTitle.value,
      type: nodeType,
      parent_id: useParentChild ? targetParentId : null,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    // Assign random color to persons
    if (nodeType === 'person') {
      nodeData.color = getRandomPersonColor()
    }
    const created = await api.createNode(nodeData)
    if (!created || !created.id) {
      throw new Error('Failed to create node')
    }
    // Create link instead of parent-child if needed
    if (!useParentChild && linkToId) {
      await api.linkNodes(created.id, linkToId)
    }
    pushUndo({ type: 'create', nodeId: created.id, nodeData, parentId: useParentChild ? targetParentId : null, linkedToId: linkToId })

    // If adding child via card button, expand parent and reload
    if (addChildParentId.value) {
      expandedIds.value.add(addChildParentId.value)
      await loadSidebarTree()
    }

    newNodeTitle.value = ''
    addChildParentId.value = null // Clear the child parent ID
    await loadChildren(currentContainerId.value)
  } catch (e) {
    error.value = e.message
  }
}

async function addChildNode({ parentId, title, type, x, y }) {
  try {
    const nodeType = type || 'task'

    // Determine parent-child vs link behavior:
    // - Persons always link (never parent-child)
    // - Organizations can be children of other organizations, otherwise link
    let useParentChild = true
    let linkToId = null

    if (nodeType === 'person') {
      useParentChild = false
      linkToId = parentId
    } else if (nodeType === 'organization') {
      // Check if parent is also an organization
      if (parentId) {
        const parent = await api.getNode(parentId)
        if (parent?.type === 'organization') {
          useParentChild = true  // Org inside org = parent-child
        } else {
          useParentChild = false
          linkToId = parentId
        }
      } else {
        useParentChild = true  // No parent = root level org
      }
    }

    const nodeData = {
      title,
      type: nodeType,
      parent_id: useParentChild ? parentId : null,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    if (nodeType === 'person') {
      nodeData.color = getRandomPersonColor()
    }
    const newNode = await api.createNode(nodeData)
    if (!newNode || !newNode.id) {
      throw new Error('Failed to create child node - no result returned')
    }
    // Create link instead of parent-child if needed
    if (!useParentChild && linkToId) {
      await api.linkNodes(newNode.id, linkToId)
    }
    pushUndo({ type: 'create', nodeId: newNode.id, nodeData, parentId: useParentChild ? parentId : null })
    // Save position if provided (from graph double-click)
    if (x !== undefined && y !== undefined) {
      const viewId = currentContainerId.value || 'root'
      const posKey = `graph-positions-${viewId}`
      const positions = JSON.parse(localStorage.getItem(posKey) || '{}')
      positions[newNode.id] = { x, y }
      localStorage.setItem(posKey, JSON.stringify(positions))
    }
    expandedIds.value.add(parentId)
    await loadChildren(currentContainerId.value)
    // Trigger relax on graph view after adding child
    setTimeout(() => {
      graphViewRef.value?.relaxLayout()
    }, 200)
  } catch (e) {
    error.value = e.message
  }
}

async function addChildFromDetail(payload) {
  await addChildNode(payload)
  // Reload the detail panel's children list
  detailPanelRef.value?.loadChildren()
}

function onChildUpdated() {
  // Refresh graph to reflect completed state changes
  graphViewRef.value?.updateGraph()
  // Refresh sidebar tree
  loadSidebarTree()
}

async function moveNode({ nodeId, oldParentId, newParentId }) {
  try {
    // Check if this should be a link instead of parent-child
    // Persons ALWAYS use links (never parent-child)
    // Organizations can be parent-child with OTHER organizations, but link with other types
    if (newParentId) {
      const sourceNode = await api.getNode(nodeId)
      const targetNode = await api.getNode(newParentId)

      // Persons always use links
      if (sourceNode.type === 'person' || targetNode.type === 'person') {
        await api.linkNodes(nodeId, newParentId)
        pushUndo({ type: 'link', sourceId: nodeId, targetId: newParentId })
        await loadChildren(currentContainerId.value)
        await loadSidebarTree()
        loadRecentItems()
        // Trigger relax after adding link
        setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
        return
      }

      // Organizations can only have parent-child with other organizations
      const isOrg = (t) => t === 'organization'
      if (isOrg(sourceNode.type) || isOrg(targetNode.type)) {
        // Both must be organizations for parent-child relationship
        if (!(isOrg(sourceNode.type) && isOrg(targetNode.type))) {
          // One is org, one is not - use link
          await api.linkNodes(nodeId, newParentId)
          pushUndo({ type: 'link', sourceId: nodeId, targetId: newParentId })
          await loadChildren(currentContainerId.value)
          await loadSidebarTree()
          loadRecentItems()
          // Trigger relax after adding link
          setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
          return
        }
        // Both are organizations - allow parent-child (continue to normal move)
      }
    }

    // Track for undo (only if oldParentId provided - not from undo/redo)
    if (oldParentId !== undefined) {
      pushUndo({
        type: 'move',
        nodeId,
        oldParentId,
        newParentId
      })
    }
    await api.moveNode(nodeId, newParentId)
    if (newParentId) expandedIds.value.add(newParentId)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    // Trigger relax after parent-child change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    error.value = e.message
  }
}

// Handle link events from GraphView (Option+drag)
async function linkNodesFromGraph({ sourceId, targetId }) {
  try {
    await api.linkNodes(sourceId, targetId)
    pushUndo({ type: 'link', sourceId, targetId })
    // Refresh graph to show the new link edge
    if (graphViewRef.value?.updateGraph) {
      await graphViewRef.value.updateGraph()
    }
    // Trigger relax after adding link
    setTimeout(() => {
      graphViewRef.value?.relaxLayout()
    }, 200)
    // Refresh detail panel if showing one of these nodes
    if (selectedNode.value?.id === sourceId || selectedNode.value?.id === targetId) {
      selectedNode.value = await api.getNode(selectedNode.value.id)
      // Also refresh linked items in detail panel
      detailPanelRef.value?.loadLinkedNodes()
      detailPanelRef.value?.loadLinkedOrganizations()
      detailPanelRef.value?.loadLinkedMembers()
    }
  } catch (e) {
    console.error('Failed to link nodes:', e)
    error.value = e.message
  }
}

// Handle unlink events from GraphView (context menu)
async function unlinkNodesFromGraph({ sourceId, targetId }) {
  try {
    await api.unlinkNodes(sourceId, targetId)
    pushUndo({ type: 'unlink', sourceId, targetId })
    // Refresh graph to update link edges
    if (graphViewRef.value?.updateGraph) {
      await graphViewRef.value.updateGraph()
    }
    // Refresh detail panel if showing one of these nodes
    if (selectedNode.value?.id === sourceId || selectedNode.value?.id === targetId) {
      selectedNode.value = await api.getNode(selectedNode.value.id)
      // Also refresh linked items in detail panel
      detailPanelRef.value?.loadLinkedNodes()
      detailPanelRef.value?.loadLinkedOrganizations()
      detailPanelRef.value?.loadLinkedMembers()
    }
  } catch (e) {
    console.error('Failed to unlink nodes:', e)
    error.value = e.message
  }
}

async function moveMultipleNodes({ nodeIds, newParentId }) {
  try {
    // Move all selected nodes to new parent
    for (const nodeId of nodeIds) {
      await api.moveNode(nodeId, newParentId)
    }
    if (newParentId) expandedIds.value.add(newParentId)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    // Clear multi-selection after move
    selectedIds.value.clear()
    // Trigger relax after moves
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    error.value = e.message
  }
}

async function insertBetween({ parentId, childId, title, type, isLink }) {
  try {
    const nodeType = type || 'task'
    if (isLink) {
      // For link edges: remove the link, create new node, link both to new node
      await api.unlinkNodes(parentId, childId)
      const newNode = await api.createNode({
        title,
        type: nodeType,
        parent_id: currentContainerId.value,
        workspace_id: getWorkspaceIdForNode(nodeType)
      })
      await api.linkNodes(parentId, newNode.id)
      await api.linkNodes(newNode.id, childId)
    } else {
      // For parent-child edges: create new node as child of parent
      const newNode = await api.createNode({
        title,
        type: nodeType,
        parent_id: parentId,
        workspace_id: getWorkspaceIdForNode(nodeType)
      })
      // Move the original child to be under the new node
      await api.moveNode(childId, newNode.id)
      expandedIds.value.add(parentId)
      expandedIds.value.add(newNode.id)
    }
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    // Trigger relax after structure change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    error.value = e.message
  }
}

async function createNodeAtPosition({ title, type, x, y }) {
  try {
    const nodeType = type || 'task'

    // Determine parent-child vs link behavior:
    // - Persons always link (never parent-child)
    // - Organizations can be children of other organizations, otherwise link
    let useParentChild = true
    let linkToId = null

    if (nodeType === 'person') {
      useParentChild = false
      linkToId = currentContainerId.value
    } else if (nodeType === 'organization') {
      // Check if current container is also an organization
      if (currentContainerId.value) {
        const container = await api.getNode(currentContainerId.value)
        if (container?.type === 'organization') {
          useParentChild = true  // Org inside org = parent-child
        } else {
          useParentChild = false
          linkToId = currentContainerId.value
        }
      } else {
        useParentChild = true  // No container = root level org
      }
    }

    // Double-click far from nodes creates child of current container
    const nodeData = {
      title,
      type: nodeType,
      parent_id: useParentChild ? currentContainerId.value : null,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    if (nodeType === 'person') {
      nodeData.color = getRandomPersonColor()
    }
    const newNode = await api.createNode(nodeData)
    // Create link instead of parent-child if needed
    if (!useParentChild && linkToId) {
      await api.linkNodes(newNode.id, linkToId)
    }
    // Save position for the new node in current view
    const viewId = currentContainerId.value || 'root'
    const posKey = `graph-positions-${viewId}`
    const positions = JSON.parse(localStorage.getItem(posKey) || '{}')
    positions[newNode.id] = { x, y }
    localStorage.setItem(posKey, JSON.stringify(positions))

    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    selectNode(newNode)
    // Trigger relax on graph view after adding node
    setTimeout(() => {
      graphViewRef.value?.relaxLayout()
    }, 200)
  } catch (e) {
    error.value = e.message
  }
}

async function updateNode(updatedNode, trackUndo = true) {
  try {
    // Get old values for undo
    const oldNode = trackUndo ? await api.getNode(updatedNode.id) : null
    const newValues = {
      title: updatedNode.title,
      type: updatedNode.type,
      notes: updatedNode.notes,
      notes_sensitive: updatedNode.notes_sensitive,
      completed: updatedNode.completed,
      favorite: updatedNode.favorite,
      due_date: updatedNode.due_date,
      start_date: updatedNode.start_date,
      end_date: updatedNode.end_date,
      color: updatedNode.color,
      importance: updatedNode.importance,
      location: updatedNode.location,
      email: updatedNode.email,
      phone: updatedNode.phone,
      organization: updatedNode.organization,
      role: updatedNode.role,
      website: updatedNode.website
    }
    await api.updateNode(updatedNode.id, newValues)
    // Broadcast update to detached windows
    broadcastNodeUpdate(updatedNode)
    if (trackUndo && oldNode) {
      const oldValues = {
        title: oldNode.title,
        type: oldNode.type,
        notes: oldNode.notes,
        notes_sensitive: oldNode.notes_sensitive,
        completed: oldNode.completed,
        favorite: oldNode.favorite,
        due_date: oldNode.due_date,
        start_date: oldNode.start_date,
        end_date: oldNode.end_date,
        color: oldNode.color,
        importance: oldNode.importance,
        location: oldNode.location,
        email: oldNode.email,
        phone: oldNode.phone,
        organization: oldNode.organization,
        role: oldNode.role,
        website: oldNode.website
      }
      pushUndo({ type: 'edit', nodeId: updatedNode.id, oldValues, newValues })
    }
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    loadFavorites()
    // Force graph to refresh (for hideCompleted filtering)
    graphViewRef.value?.updateGraph()
  } catch (e) {
    error.value = e.message
  }
}

// Handle detach event from DetailPanel - open node in new window
async function handleDetach(node) {
  if (!node) return
  await openDetachedWindow(node.id, node.title)
}

async function deleteNode(nodeId) {
  try {
    // Get node data for undo before deleting
    const node = await api.getNode(nodeId)

    // Check if we need to navigate back after deletion (use == for type coercion)
    const needsNavigation = currentContainerId.value == nodeId ||
      breadcrumbs.value.some(b => b.id == nodeId)

    await api.deleteNode(nodeId, false)  // Soft delete
    // Broadcast deletion to detached windows
    broadcastNodeDelete(nodeId)
    if (node) {
      pushUndo({ type: 'delete', nodeData: node, parentId: node.parent_id })
    }
    showDetail.value = false
    selectedNode.value = null

    // Navigate back if we deleted the current container or a node in the breadcrumbs
    if (needsNavigation) {
      navigateBack()
    } else {
      await loadChildren(currentContainerId.value)
    }

    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

async function deleteMultipleNodes(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return

  // Confirm deletion of multiple nodes
  if (nodeIds.length > 1) {
    if (!confirm(`Delete ${nodeIds.length} nodes? (Cmd+Z to undo)`)) return
  }

  const deletedNodes = []

  try {
    // Collect node data before deleting
    for (const id of nodeIds) {
      const node = await api.getNode(id)
      if (node) deletedNodes.push(node)
    }

    // Check if we need to navigate back after deletion (convert to strings for comparison)
    const nodeIdSet = new Set(nodeIds.map(String))
    const needsNavigation = nodeIdSet.has(String(currentContainerId.value)) ||
      breadcrumbs.value.some(b => nodeIdSet.has(String(b.id)))

    // Delete all nodes
    for (const id of nodeIds) {
      await api.deleteNode(id, false)
    }

    // Push single undo action for all deletions
    if (deletedNodes.length > 0) {
      pushUndo({ type: 'delete-multiple', nodes: deletedNodes })
    }

    showDetail.value = false
    selectedNode.value = null

    // Navigate back if we deleted the current container or a node in the breadcrumbs
    if (needsNavigation) {
      navigateBack()
    } else {
      await loadChildren(currentContainerId.value)
    }

    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    console.error('deleteMultipleNodes error:', e)
    error.value = e.message
  }
}

async function wrapWithParent({ nodeId, parentTitle }) {
  try {
    // Get the node to find its current parent
    const node = await api.getNode(nodeId)
    if (!node) {
      throw new Error('Node not found')
    }

    // Create new parent at same level as current node
    const newParent = await api.createNode({
      title: parentTitle,
      type: 'group',
      parent_id: node.parent_id,
      workspace_id: getWorkspaceIdForNode('group')
    })
    if (!newParent || !newParent.id) {
      throw new Error('Failed to create parent node')
    }

    // Move current node under new parent
    await api.moveNode(nodeId, newParent.id)

    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()

    // Refresh selected node if it was the wrapped node
    if (selectedNode.value?.id === nodeId) {
      const updatedNode = flatChildren.value.find(n => n.id === nodeId)
      if (updatedNode) {
        selectedNode.value = updatedNode
      }
    }
    // Trigger relax after structure change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    error.value = e.message
  }
}

async function moveNodeToRoot(nodeId) {
  try {
    await api.moveNode(nodeId, null)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    // Trigger relax after structure change
    setTimeout(() => graphViewRef.value?.relaxLayout(), 200)
  } catch (e) {
    error.value = e.message
  }
}

async function toggleComplete(node) {
  try {
    const oldCompleted = node.completed
    await api.updateNode(node.id, { completed: !oldCompleted })
    pushUndo({ type: 'complete', nodeId: node.id, oldCompleted, newCompleted: !oldCompleted })
    await loadChildren(currentContainerId.value)
  } catch (e) {
    error.value = e.message
  }
}

async function toggleFavorite(node) {
  try {
    await api.updateNode(node.id, { favorite: !node.favorite })
    await loadChildren(currentContainerId.value)
    await loadFavorites()
  } catch (e) {
    error.value = e.message
  }
}

// Get localStorage key for expanded state (per workspace)
function getExpandedKey() {
  return `graphcore-expanded-${currentWorkspace.value}`
}

// Save expanded IDs to localStorage
function saveExpandedState() {
  const ids = Array.from(expandedIds.value)
  localStorage.setItem(getExpandedKey(), JSON.stringify(ids))
}

// Load expanded IDs from localStorage
function loadExpandedState() {
  const stored = localStorage.getItem(getExpandedKey())
  if (stored) {
    try {
      const ids = JSON.parse(stored)
      expandedIds.value = new Set(ids)
    } catch (e) {
      expandedIds.value = new Set()
    }
  }
}

function toggleExpand(nodeId) {
  if (expandedIds.value.has(nodeId)) {
    expandedIds.value.delete(nodeId)
  } else {
    expandedIds.value.add(nodeId)
  }
  expandedIds.value = new Set(expandedIds.value)
  saveExpandedState()
}

function expandAll() {
  expandedIds.value = new Set(flatChildren.value.map(n => n.id))
  saveExpandedState()
}

function collapseAll() {
  expandedIds.value = new Set()
  saveExpandedState()
}

// Search functions - spotlight style
function openSearch() {
  showSearch.value = true
  searchQuery.value = ''
  searchResults.value = []
  selectedResultIndex.value = 0
  searchMode.value = 'normal'
  linkSourceNodeId.value = null
  nextTick(() => {
    if (searchInputRef.value) {
      searchInputRef.value.focus()
    }
  })
}

function openLinkSearch() {
  if (!selectedNode.value) return
  showSearch.value = true
  searchQuery.value = ''
  searchResults.value = []
  selectedResultIndex.value = 0
  searchMode.value = 'link'
  linkSourceNodeId.value = selectedNode.value.id
  nextTick(() => {
    if (searchInputRef.value) {
      searchInputRef.value.focus()
    }
  })
}

function closeSearch() {
  showSearch.value = false
  searchQuery.value = ''
  searchResults.value = []
  selectedResultIndex.value = 0
  searchMode.value = 'normal'
  linkSourceNodeId.value = null
}

async function fetchBreadcrumbsForResults(results) {
  // Fetch ancestors for each result in parallel to build breadcrumbs
  const resultsWithBreadcrumbs = await Promise.all(
    results.map(async (result) => {
      try {
        const ancestors = await api.getAncestors(result.id)
        // Build breadcrumb string from ancestors (root to parent)
        const breadcrumb = ancestors
          .map(a => a.title)
          .join(' / ')
        return { ...result, breadcrumb }
      } catch {
        return { ...result, breadcrumb: '' }
      }
    })
  )
  return resultsWithBreadcrumbs
}

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  try {
    // In link mode, search across all workspaces to find persons and other nodes
    // In normal mode, search within current workspace only
    let combined = []
    if (searchMode.value === 'link') {
      // Search current workspace + entire people workspace (persons, organizations, groups)
      const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
      const [wsResults, peopleResults] = await Promise.all([
        api.search(searchQuery.value, null, wsFilter),
        // Search entire People workspace (null = People workspace)
        currentWorkspace.value !== 'people' ? api.search(searchQuery.value, null, null) : Promise.resolve([])
      ])
      // Combine and dedupe results
      const seen = new Set()
      for (const r of [...wsResults, ...peopleResults]) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          combined.push(r)
        }
      }
    } else {
      // Normal search - within current workspace + people workspace for persons
      const wsFilter = currentWorkspace.value === 'people' ? null : currentWorkspace.value
      const [wsResults, peopleResults] = await Promise.all([
        api.search(searchQuery.value, null, wsFilter),
        // Also search for persons in the people workspace
        currentWorkspace.value !== 'people' ? api.search(searchQuery.value, 'person') : Promise.resolve([])
      ])
      // Combine and dedupe results
      const seen = new Set()
      for (const r of [...wsResults, ...peopleResults]) {
        if (!seen.has(r.id)) {
          seen.add(r.id)
          combined.push(r)
        }
      }
    }

    // Fetch breadcrumbs for all results
    const resultsWithBreadcrumbs = await fetchBreadcrumbsForResults(combined)
    searchResults.value = resultsWithBreadcrumbs
    selectedResultIndex.value = 0
  } catch (e) {
    console.error('Search failed:', e)
  }
}

function onSearchInput() {
  clearTimeout(searchTimeout.value)
  searchTimeout.value = setTimeout(handleSearch, 200)
}

function handleSearchKeydown(e) {
  if (e.key === 'Escape') {
    closeSearch()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (searchResults.value.length > 0) {
      selectedResultIndex.value = (selectedResultIndex.value + 1) % searchResults.value.length
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (searchResults.value.length > 0) {
      selectedResultIndex.value = selectedResultIndex.value === 0
        ? searchResults.value.length - 1
        : selectedResultIndex.value - 1
    }
  } else if (e.key === 'Enter' && searchResults.value.length > 0) {
    e.preventDefault()
    const selectedNode = searchResults.value[selectedResultIndex.value]
    if (selectedNode) {
      goToSearchResult(selectedNode)
    }
  }
}

async function goToSearchResult(node) {
  // Handle link mode - create link instead of navigating
  if (searchMode.value === 'link' && linkSourceNodeId.value) {
    const sourceId = linkSourceNodeId.value
    closeSearch()
    try {
      await api.linkNodes(sourceId, node.id)
      // Refresh the selected node to update links
      if (selectedNode.value?.id === sourceId) {
        const updatedNode = await api.getNode(sourceId)
        selectedNode.value = updatedNode
      }
    } catch (e) {
      console.error('Failed to create link:', e)
    }
    return
  }

  closeSearch()

  // Special handling for persons - switch to persons view
  if (node.type === 'person') {
    viewMode.value = 'persons'
    await nextTick()
    selectNode(node)
    // Emit event for PersonsView to scroll to person
    window.dispatchEvent(new CustomEvent('person-select', { detail: { personId: node.id } }))
    return
  }

  // Navigate to the container that holds this node
  // For root-level nodes (no parent), go to root
  // For nested nodes, go to their parent container
  const targetContainerId = node.parent_id || null

  // Only navigate if we're not already at the right container
  if (currentContainerId.value !== targetContainerId) {
    await loadChildren(targetContainerId)
  }

  // Expand tree to show the node if in tree view
  if (viewMode.value === 'tree') {
    expandAncestors(node.id)
  }

  // Select the node
  selectNode(node)

  // Wait for DOM update then perform view-specific actions
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 100))

  if (viewMode.value === 'graph') {
    window.dispatchEvent(new CustomEvent('graph-center-node', { detail: { nodeId: node.id } }))
  } else {
    scrollToNode(node.id)
  }
}

// Expand all ancestors of a node in tree view
function expandAncestors(nodeId) {
  const node = flatChildren.value.find(n => n.id === nodeId)
  if (!node || !node.path) return

  // Parse path to get ancestor IDs
  const pathParts = node.path.split('/').filter(p => p)
  pathParts.forEach(id => {
    expandedIds.value.add(parseInt(id))
  })
  expandedIds.value = new Set(expandedIds.value)
}

// Scroll to a node element in the current view
function scrollToNode(nodeId) {
  // Try to find the element by data attribute or ID
  const el = document.querySelector(`[data-node-id="${nodeId}"]`) ||
             document.querySelector(`#node-${nodeId}`) ||
             document.querySelector(`.node-card[data-id="${nodeId}"]`)
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Add temporary highlight
    el.classList.add('search-highlight')
    setTimeout(() => el.classList.remove('search-highlight'), 2000)
  }
}

// Get action label based on current view
function getSearchActionLabel(node) {
  if (viewMode.value === 'graph') {
    return node.children?.length ? 'Open in graph' : 'Show in graph'
  } else if (viewMode.value === 'cards') {
    return 'Show card'
  } else if (viewMode.value === 'timeline') {
    return 'Show in timeline'
  } else if (viewMode.value === 'persons' && node.type === 'person') {
    return 'Open person'
  }
  return 'Go to item'
}

// Card drag and drop
function onCardDragStart(e, node) {
  // Don't start drag if it originated from an input or textarea
  const target = e.target
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.closest('input, textarea')) {
    e.preventDefault()
    return
  }
  cardDraggedNode.value = node
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', node.id)
  e.target.classList.add('dragging')
}

function onCardDragEnd(e) {
  e.target.classList.remove('dragging')
  cardDraggedNode.value = null
  cardDropTarget.value = null
  cardDropPosition.value = null
}

function onCardDragOver(e, node) {
  if (!cardDraggedNode.value || cardDraggedNode.value.id === node.id) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  cardDropTarget.value = node

  // Determine drop position based on mouse position
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const width = rect.width

  // Left 25% = before, right 25% = after, middle 50% = inside
  if (x < width * 0.25) {
    cardDropPosition.value = 'before'
  } else if (x > width * 0.75) {
    cardDropPosition.value = 'after'
  } else {
    cardDropPosition.value = 'inside'
  }
}

function onCardDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    cardDropTarget.value = null
    cardDropPosition.value = null
  }
}

async function onCardDrop(e, targetNode) {
  e.preventDefault()
  if (!cardDraggedNode.value || cardDraggedNode.value.id === targetNode.id) return

  const sourceNode = cardDraggedNode.value

  if (cardDropPosition.value === 'inside') {
    // Move dragged card as child of target
    await moveNode({ nodeId: sourceNode.id, newParentId: targetNode.id })
  } else {
    // Reorder: move before or after target (same parent)
    await handleReorder({
      nodeId: sourceNode.id,
      targetId: targetNode.id,
      position: cardDropPosition.value
    })
  }

  cardDraggedNode.value = null
  cardDropTarget.value = null
  cardDropPosition.value = null
}

function getCardDropClass(node) {
  if (!cardDropTarget.value || cardDropTarget.value.id !== node.id) return {}
  return {
    'drop-before': cardDropPosition.value === 'before',
    'drop-after': cardDropPosition.value === 'after',
    'drop-inside': cardDropPosition.value === 'inside'
  }
}

function handleCardClick(e, node) {
  if (e.ctrlKey || e.metaKey) {
    // Toggle selection
    handleMultiSelect({ node, add: true })
  } else if (e.shiftKey) {
    // Range selection
    handleMultiSelect({ node, range: true })
  } else {
    // Normal click - select and open detail panel
    selectNode(node)
  }
}

function handleChildCardClick(e, node) {
  // Same as handleCardClick - supports Ctrl/Cmd+click and Shift+click
  if (e.ctrlKey || e.metaKey) {
    handleMultiSelect({ node, add: true })
  } else if (e.shiftKey) {
    handleMultiSelect({ node, range: true })
  } else {
    // Normal click - select and open detail panel
    selectNode(node)
  }
}

function isCardSelected(nodeId) {
  return selectedIds.value.has(nodeId) || selectedNode.value?.id === nodeId
}

// Context menu functions
async function showContextMenu(e, node) {
  e.preventDefault()
  e.stopPropagation()

  // Load linked nodes for the menu
  let links = []
  try {
    links = await api.getLinkedNodes(node.id)
  } catch (err) {
    console.error('Failed to load links:', err)
  }

  contextMenu.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    node: node,
    linkedNodes: links
  }
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleContextMenuViewDetails(node) {
  selectNode(node)
  closeContextMenu()
}

function handleContextMenuEnter(node) {
  enterContainer(node)
  closeContextMenu()
}

function handleContextMenuAddChild(node) {
  closeContextMenu()
  showAddNodeModal(node.id)
}

function handleContextMenuToggleComplete(node) {
  toggleComplete(node)
  closeContextMenu()
}

function handleContextMenuToggleFavorite(node) {
  toggleFavorite(node)
  closeContextMenu()
}

function handleContextMenuOpenLinkSearch(node) {
  openLinkSearch(node)
  closeContextMenu()
}

async function handleContextMenuUnlink({ source, target }) {
  try {
    await api.unlinkNodes(source.id, target.id)
    contextMenu.value.linkedNodes = contextMenu.value.linkedNodes.filter(n => n.id !== target.id)
    if (showDetail.value && selectedNode.value?.id === source.id) {
      const updated = await api.getNode(source.id)
      if (updated) selectedNode.value = updated
    }
  } catch (err) {
    console.error('Failed to unlink nodes:', err)
  }
}

async function handleContextMenuMoveToWorkspace({ node, workspaceId }) {
  try {
    await api.updateNode(node.id, { workspace_id: workspaceId === 'people' ? null : workspaceId })
    await loadChildren()
  } catch (err) {
    console.error('Failed to move to workspace:', err)
  }
  closeContextMenu()
}

function handleContextMenuDelete(node) {
  deleteNode(node.id)
  closeContextMenu()
}

async function handleViewContextMenu({ event, node }) {
  await showContextMenu(event, node)
}

// Inline editing functions
function startEditing(node, e) {
  e?.stopPropagation()
  editingCardId.value = node.id
  editingTitle.value = node.title
}

async function saveEditing() {
  if (!editingCardId.value) return

  const nodeId = editingCardId.value
  const originalNode = flatChildren.value.find(n => n.id === nodeId)
  if (!originalNode) {
    editingCardId.value = null
    return
  }

  // Only update if title changed
  if (editingTitle.value !== originalNode.title) {
    try {
      await api.updateNode(nodeId, { title: editingTitle.value })
      await loadChildren(currentContainerId.value)
    } catch (e) {
      error.value = e.message
    }
  }

  editingCardId.value = null
}

function cancelEditing() {
  editingCardId.value = null
  editingTitle.value = ''
}

function handleEditKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelEditing()
  } else if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    saveEditing()
  }
}

// Inline notes-only editing functions
async function startInlineNotes(node, e) {
  e?.stopPropagation()
  inlineNotesId.value = node.id
  inlineNotesText.value = node.notes || ''
  await nextTick()
  // Handle both single ref and array of refs (when multiple textareas exist)
  const ref = inlineNotesRef.value
  if (Array.isArray(ref)) {
    ref[0]?.focus()
  } else {
    ref?.focus()
  }
}

async function saveInlineNotes() {
  if (!inlineNotesId.value) return

  const nodeId = inlineNotesId.value
  const originalNode = flatChildren.value.find(n => n.id === nodeId)
  if (!originalNode) {
    inlineNotesId.value = null
    return
  }

  if (inlineNotesText.value !== (originalNode.notes || '')) {
    try {
      await api.updateNode(nodeId, { notes: inlineNotesText.value })
      // Reload to get fresh data
      await loadChildren(currentContainerId.value)
    } catch (e) {
      error.value = e.message
    }
  }

  inlineNotesId.value = null
}

function renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text)
}

function cancelInlineNotes() {
  inlineNotesId.value = null
  inlineNotesText.value = ''
}

function handleInlineNotesKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelInlineNotes()
  } else if (e.key === 'Enter' && e.metaKey) {
    e.preventDefault()
    saveInlineNotes()
  }
}

// Wrapper functions for tooltip - use composable
function showCardTooltip(event, node) {
  // Don't show tooltip if editing
  if (editingCardId.value || inlineNotesId.value) return
  showTooltip(event, node)
}

function hideCardTooltip() {
  hideTooltip()
}

// Add item modal functions
function showAddNodeModal(parentId = null) {
  addNodeModal.value = {
    visible: true,
    parentId
  }
}

function hideAddNodeModal() {
  addNodeModal.value.visible = false
}

async function handleAddNodeCreate({ title, type, parentId }) {
  await addChildNode({ parentId, title, type })
}

function addChildToCard(parentId, e) {
  e?.stopPropagation()
  hideCardTooltip()
  showAddNodeModal(parentId)
}

function toggleCompletedVisibility() {
  hideCompleted.value = !hideCompleted.value
}

function toggleSensitiveVisibility() {
  hideSensitive.value = !hideSensitive.value
  localStorage.setItem('graphcore-hideSensitive', hideSensitive.value.toString())
}

// Check if a node has sensitive content
function isSensitiveNode(node) {
  return node.notes_sensitive || false
}

function hasNotes(node) {
  return node.notes && node.notes.trim().length > 0
}

// Calculate due date status
function getDueDateStatus(dueDate) {
  if (!dueDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)

  const diffTime = due - today
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    const absDays = Math.abs(diffDays)
    return { type: 'overdue', days: absDays, text: `${absDays}d late` }
  } else if (diffDays === 0) {
    return { type: 'today', days: 0, text: 'Today' }
  } else if (diffDays === 1) {
    return { type: 'soon', days: 1, text: 'Tomorrow' }
  } else if (diffDays <= 3) {
    return { type: 'soon', days: diffDays, text: `${diffDays}d to go` }
  } else if (diffDays <= 7) {
    return { type: 'upcoming', days: diffDays, text: `${diffDays}d` }
  } else {
    return { type: 'future', days: diffDays, text: `${diffDays}d` }
  }
}

// Calculate countdown to start or end date
function getDateCountdown(node) {
  if (!node || node.completed) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Check start date first - if in future, show "N days to start"
  if (node.start_date) {
    const start = new Date(node.start_date)
    start.setHours(0, 0, 0, 0)
    const diffDays = Math.round((start - today) / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return { type: 'to-start', days: diffDays, text: `${diffDays}d to start` }
    }
  }

  // Check due_date or end_date for "N days to end"
  const endDate = node.due_date || node.end_date
  if (endDate) {
    const end = new Date(endDate)
    end.setHours(0, 0, 0, 0)
    const diffDays = Math.round((end - today) / (1000 * 60 * 60 * 24))

    if (diffDays > 0) {
      return { type: 'to-end', days: diffDays, text: `${diffDays}d left` }
    } else if (diffDays === 0) {
      return { type: 'ends-today', days: 0, text: 'Ends today' }
    }
  }

  return null
}

// Convert importance number to readable label

// Removed isCardDropTarget - now using getCardDropClass

let resizeObserver = null

/**
 * Keyboard Shortcuts:
 *
 * Global (work anywhere):
 * - Cmd/Ctrl + K: Open spotlight search
 * - Cmd/Ctrl + Z: Undo
 * - Cmd/Ctrl + Shift + Z: Redo
 *
 * When not in input fields:
 * - Cmd/Ctrl + Delete/Backspace: Delete selected items
 * - Cmd/Ctrl + A: Select all visible items
 * - Escape: Exit fullscreen or clear selection
 *
 * Note: Plain Delete/Backspace without Cmd/Ctrl does NOT delete items
 * to prevent accidental deletions.
 */
function handleKeydown(e) {
  // Cmd/Ctrl+K - open spotlight search (works anywhere)
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    openSearch()
    return
  }

  // Cmd/Ctrl+Z - Undo (works globally except in inputs)
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    const target = e.target
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
      e.preventDefault()
      undo()
      return
    }
  }

  // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y - Redo (works globally except in inputs)
  if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
    const target = e.target
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) {
      e.preventDefault()
      redo()
      return
    }
  }

  // Cmd/Ctrl+Enter - add child to selected node (cards/table view)
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    if (viewMode.value === 'cards' || viewMode.value === 'table') {
      e.preventDefault()
      const parentId = selectedNode.value?.id || currentContainerId.value
      showAddNodeModal(parentId)
      return
    }
  }

  // Don't trigger other shortcuts if typing in an editable element
  const target = e.target
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
  if (target.isContentEditable) return

  // Cmd/Ctrl + Delete/Backspace - delete selected items
  const isDeleteKey = e.key === 'Delete' || e.key === 'Backspace'
  if ((e.metaKey || e.ctrlKey) && isDeleteKey) {
    e.preventDefault()
    e.stopPropagation()
    if (selectedIds.value.size > 0) {
      deleteSelectedNodes()
    } else if (selectedNode.value) {
      deleteNode(selectedNode.value.id)
    }
  }

  // Escape - exit fullscreen or clear selection (respects pin)
  if (e.key === 'Escape') {
    if (fullscreenDetail.value) {
      fullscreenDetail.value = false
    } else if (!detailPinned.value) {
      selectedIds.value = new Set()
      selectedNode.value = null
      showDetail.value = false
    }
  }

  // Enter - toggle detail panel
  if (e.key === 'Enter') {
    e.preventDefault()
    toggleDetailPanel()
  }

  // Ctrl/Cmd+A - select all visible
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault()
    selectedIds.value = new Set(flatChildren.value.map(n => n.id))
  }
}

async function deleteSelectedNodes() {
  if (selectedIds.value.size === 0) return

  const idsToDelete = [...selectedIds.value]
  const deletedNodes = []

  // Collect node data before deleting
  for (const id of idsToDelete) {
    const node = await api.getNode(id)
    if (node) deletedNodes.push(node)
  }

  // Delete all nodes
  for (const id of idsToDelete) {
    await api.deleteNode(id, false)
  }

  // Push single undo action for all deletions
  if (deletedNodes.length > 0) {
    pushUndo({ type: 'delete-multiple', nodes: deletedNodes })
  }

  selectedIds.value = new Set()
  selectedNode.value = null
  showDetail.value = false
  await loadChildren(currentContainerId.value)
  await loadSidebarTree()
  loadRecentItems()
}

onMounted(async () => {
  // Load available workspaces first
  await loadWorkspaces()

  // Restore last container or start at root
  const initialContainerId = savedContainerId ? parseInt(savedContainerId, 10) : null
  try {
    await loadChildren(initialContainerId)
  } catch (e) {
    // If saved container no longer exists, fall back to root
    console.warn('Saved container not found, loading root')
    await loadChildren(null)
  }

  // Restore expanded state from localStorage
  loadExpandedState()

  // Load recent items and favorites for sidebar
  loadRecentItems()
  loadFavorites()

  // Track container dimensions for responsive grid
  const updateDimensions = () => {
    const el = document.querySelector('.content-body')
    if (el) {
      containerWidth.value = el.clientWidth
      containerHeight.value = el.clientHeight
    }
  }

  updateDimensions()
  window.addEventListener('resize', updateDimensions)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('open-link-search', handleOpenLinkSearchEvent)
  document.addEventListener('click', handleGlobalClick, true)
  resizeObserver = new ResizeObserver(updateDimensions)
  const contentBody = document.querySelector('.content-body')
  if (contentBody) resizeObserver.observe(contentBody)

  // Listen for updates from detached windows
  onDetachedMessage(async (data) => {
    if (data.type === 'node-updated' && data.node) {
      // Refresh the view if the updated node is visible
      await loadChildren(currentContainerId.value)
      await loadSidebarTree()
      loadFavorites()
      // Update selectedNode if it's the one that was updated
      if (selectedNode.value?.id === data.node.id) {
        selectedNode.value = { ...data.node }
      }
    } else if (data.type === 'node-deleted' && data.nodeId) {
      // Handle node deleted from detached window
      if (selectedNode.value?.id === data.nodeId) {
        showDetail.value = false
        selectedNode.value = null
      }
      await loadChildren(currentContainerId.value)
      await loadSidebarTree()
    }
  })
})

// Handle custom open-link-search event from GraphView context menu
function handleOpenLinkSearchEvent(e) {
  const nodeId = e.detail?.nodeId
  if (nodeId && selectedNode.value?.id === nodeId) {
    openLinkSearch()
  }
}

onUnmounted(() => {
  window.removeEventListener('resize', () => {})
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('open-link-search', handleOpenLinkSearchEvent)
  document.removeEventListener('click', handleGlobalClick, true)
  if (resizeObserver) resizeObserver.disconnect()
})
</script>

<template>
  <div class="app" :class="{ 'is-resizing': isResizingDetail }">
    <!-- Sidebar hover trigger when collapsed -->
    <div
      v-if="!sidebarPinned"
      class="sidebar-trigger"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    ></div>

    <!-- Sidebar -->
    <aside
      class="sidebar"
      :class="{ collapsed: !sidebarVisible && sidebarPinned, pinned: sidebarPinned, show: sidebarHovered }"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    >
      <div class="sidebar-header" @mouseenter="onSidebarEnter">
        <div class="sidebar-header-row" @mouseenter="onSidebarEnter">
          <h2 @mouseenter="onSidebarEnter">Graph Core</h2>
          <button
            class="sidebar-pin-btn"
            :class="{ active: sidebarPinned }"
            @click.stop="toggleSidebarPin"
            @mouseenter="onSidebarEnter"
            :title="sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'"
          >
            <span v-html="sidebarPinned ? '&#128205;' : '&#128204;'"></span>
          </button>
        </div>
      </div>
      <div class="sidebar-content">
        <!-- Root -->
        <div class="sidebar-section">
          <div
            class="sidebar-item"
            :class="{ active: currentContainerId === null }"
            @click="navigateToBreadcrumb(-1)"
          >
            <span class="icon">~</span>
            <span class="label">Root</span>
          </div>
        </div>

        <!-- Global Tree -->
        <div class="sidebar-section collapsible-section">
          <div class="sidebar-section-header" @click="sidebarTreeCollapsed = !sidebarTreeCollapsed">
            <span class="collapse-btn">{{ sidebarTreeCollapsed ? '+' : '-' }}</span>
            <span>Tree</span>
          </div>
          <div v-show="!sidebarTreeCollapsed" class="sidebar-tree">
            <template v-for="node in sidebarTree" :key="node.id">
              <div
                class="sidebar-tree-item"
                :class="{ active: currentContainerId === node.id }"
              >
                <button
                  v-if="node.children?.length"
                  class="tree-expand-btn"
                  @click.stop="toggleSidebarExpand(node.id)"
                >{{ sidebarExpandedIds.has(node.id) ? '−' : '+' }}</button>
                <span v-else class="tree-spacer"></span>
                <span class="type-icon" :class="node.type"><span v-html="getTypeIcon(node.type)"></span></span>
                <span class="label" @click="enterContainer(node)">{{ node.title }}</span>
              </div>
              <!-- Level 1 children -->
              <template v-if="sidebarExpandedIds.has(node.id) && node.children?.length">
                <template v-for="child in node.children" :key="child.id">
                  <div
                    class="sidebar-tree-item level-1"
                    :class="{ active: currentContainerId === child.id }"
                  >
                    <button
                      v-if="child.children?.length"
                      class="tree-expand-btn"
                      @click.stop="toggleSidebarExpand(child.id)"
                    >{{ sidebarExpandedIds.has(child.id) ? '−' : '+' }}</button>
                    <span v-else class="tree-spacer"></span>
                    <span class="type-icon" :class="child.type"><span v-html="getTypeIcon(child.type)"></span></span>
                    <span class="label" @click="enterContainer(child)">{{ child.title }}</span>
                  </div>
                  <!-- Level 2 children -->
                  <template v-if="sidebarExpandedIds.has(child.id) && child.children?.length">
                    <div
                      v-for="grandchild in child.children"
                      :key="grandchild.id"
                      class="sidebar-tree-item level-2"
                      :class="{ active: currentContainerId === grandchild.id }"
                      @click="enterContainer(grandchild)"
                    >
                      <span class="tree-spacer"></span>
                      <span class="type-icon" :class="grandchild.type"><span v-html="getTypeIcon(grandchild.type)"></span></span>
                      <span class="label">{{ grandchild.title }}</span>
                    </div>
                  </template>
                </template>
              </template>
            </template>
          </div>
        </div>

        <!-- Favorites -->
        <div v-if="favoriteItems.length > 0" class="sidebar-section collapsible-section">
          <div class="sidebar-section-header" @click="sidebarFavoritesCollapsed = !sidebarFavoritesCollapsed">
            <span class="collapse-btn">{{ sidebarFavoritesCollapsed ? '+' : '-' }}</span>
            <span>Favorites</span>
            <span class="section-count">{{ favoriteItems.length }}</span>
          </div>
          <div v-show="!sidebarFavoritesCollapsed">
            <div
              v-for="item in favoriteItems"
              :key="'fav-' + item.id"
              class="sidebar-item favorite-item"
              :class="{ active: selectedNode?.id === item.id }"
              @click="enterContainer(item)"
            >
              <span class="favorite-star">&#9733;</span>
              <span class="type-icon" :class="item.type"><span v-html="getTypeIcon(item.type)"></span></span>
              <span class="label">{{ item.title }}</span>
            </div>
          </div>
        </div>

        <!-- Recent Items -->
        <div v-if="recentItems.length > 0" class="sidebar-section collapsible-section">
          <div class="sidebar-section-header" @click="sidebarRecentCollapsed = !sidebarRecentCollapsed">
            <span class="collapse-btn">{{ sidebarRecentCollapsed ? '+' : '-' }}</span>
            <span>Recent</span>
            <span class="section-count">{{ recentItems.length }}</span>
            <span class="clear-btn" @click.stop="clearRecent" title="Clear recent">x</span>
            <span v-if="previousRecentClearedAt !== null" class="undo-btn" @click.stop="undoClearRecent" title="Undo clear">undo</span>
          </div>
          <div v-show="!sidebarRecentCollapsed">
            <div
              v-for="item in recentItems"
              :key="'recent-' + item.id"
              class="sidebar-item recent-item"
              :class="{ active: selectedNode?.id === item.id }"
              @click="navigateToNode(item)"
            >
              <span class="type-icon" :class="item.type"><span v-html="getTypeIcon(item.type)"></span></span>
              <span class="label">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend (fixed at bottom, outside scrollable content) -->
      <div class="sidebar-legend">
        <div class="legend-title">Node Types</div>
        <div class="legend-items">
          <div v-for="t in nodeTypes" :key="t" class="legend-item">
            <span
              class="legend-badge"
              :style="{ background: typeConfig[t]?.bg, color: typeConfig[t]?.text }"
              v-html="getTypeIcon(t)"
            ></span>
            {{ typeConfig[t]?.label || t }}
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Header with breadcrumbs -->
      <div class="content-header">
        <div class="header-row">
          <!-- Workspace Selector -->
          <div class="workspace-selector">
            <select v-model="currentWorkspace" class="workspace-dropdown" title="Switch workspace">
              <option value="people">People/Organisations</option>
              <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
                {{ ws.name }}
              </option>
            </select>
          </div>

          <div class="toolbar">
          <button :class="{ primary: viewMode === 'graph' }" @click="viewMode = 'graph'">Graph</button>
          <button :class="{ primary: viewMode === 'cards' }" @click="viewMode = 'cards'">Cards</button>
          <button :class="{ primary: viewMode === 'tree' }" @click="viewMode = 'tree'">Table</button>
          <button :class="{ primary: viewMode === 'timeline' }" @click="viewMode = 'timeline'">Timeline</button>
          <button v-if="currentWorkspace === 'people'" :class="{ primary: viewMode === 'persons' }" @click="viewMode = 'persons'">Cards</button>
          <button :class="{ primary: viewMode === 'trash' }" @click="viewMode = 'trash'">Trash</button>
          <span class="toolbar-separator"></span>
          <button
            class="icon-btn"
            :class="{ active: hideCompleted }"
            @click="toggleCompletedVisibility"
            title="Toggle completed items visibility"
          >
            <svg v-if="!hideCompleted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
          <span class="toolbar-separator"></span>
          <button
            class="icon-btn"
            :disabled="undoStack.length === 0"
            @click="undo"
            title="Undo (Cmd+Z)"
          >
            &#x21A9;
          </button>
          <button
            class="icon-btn"
            :disabled="redoStack.length === 0"
            @click="redo"
            title="Redo (Cmd+Shift+Z)"
          >
            &#x21AA;
          </button>
          <div class="settings-dropdown" v-click-outside="() => showSettings = false">
            <button class="settings-btn" @click="showSettings = !showSettings" title="Settings">
              <span>...</span>
            </button>
            <div v-if="showSettings" class="settings-panel" @click.stop>
              <div class="settings-item">
                <label>Graph detail threshold</label>
                <input type="number" v-model.number="graphDetailThreshold" min="5" max="100" />
                <span class="settings-hint">Show details when &le; {{ graphDetailThreshold }} nodes</span>
              </div>
              <div class="settings-item">
                <label>Graph max depth</label>
                <select v-model.number="graphMaxDepth">
                  <option v-for="n in 20" :key="n" :value="n">{{ n }}</option>
                  <option :value="0">All</option>
                </select>
                <span class="settings-hint">{{ graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels` }}</span>
              </div>
              <div class="settings-item">
                <label>
                  <input type="checkbox" v-model="openDetailFullscreen" />
                  Open details fullscreen
                </label>
                <span class="settings-hint">Open detail panel in fullscreen mode by default</span>
              </div>
              <div class="settings-divider"></div>
              <div class="settings-item">
                <label>Database Snapshots</label>
                <div class="snapshot-actions">
                  <button class="snapshot-btn" @click="createSnapshot">Create Snapshot</button>
                  <button class="snapshot-btn" @click="showSnapshotList = !showSnapshotList; loadSnapshots()">
                    {{ showSnapshotList ? 'Hide' : 'Show' }} Snapshots
                  </button>
                </div>
                <span v-if="snapshotMessage" class="settings-hint snapshot-message">{{ snapshotMessage }}</span>
              </div>
              <div v-if="showSnapshotList && availableSnapshots.length > 0" class="snapshot-list">
                <div
                  v-for="snapshot in availableSnapshots.slice(0, 10)"
                  :key="snapshot.path"
                  class="snapshot-item"
                >
                  <span class="snapshot-date">{{ formatSnapshotDate(snapshot.created) }}</span>
                  <button class="snapshot-restore-btn" @click="restoreSnapshot(snapshot.path)">Restore</button>
                </div>
              </div>
              <div v-else-if="showSnapshotList" class="settings-hint">No snapshots available</div>
              <div class="settings-item" style="margin-top: 8px;">
                <button class="snapshot-btn" @click="reloadDatabase" style="background: #e67e22;">
                  Reload Database
                </button>
                <span class="settings-hint">Reload from disk (picks up external changes)</span>
              </div>
              <div class="settings-divider"></div>
              <div class="settings-item">
                <label>Lost & Found</label>
                <div class="snapshot-actions">
                  <button class="snapshot-btn" @click="loadOrphanedNodes(); showLostFound = !showLostFound">
                    {{ showLostFound ? 'Hide' : 'Show' }} ({{ orphanedNodes.length }})
                  </button>
                </div>
              </div>
              <div v-if="showLostFound && orphanedNodes.length > 0" class="snapshot-list">
                <div
                  v-for="node in orphanedNodes"
                  :key="node.id"
                  class="snapshot-item"
                >
                  <span class="snapshot-date">{{ node.title }} <span class="orphan-type">({{ node.type }})</span></span>
                  <div class="lost-actions">
                    <button class="snapshot-restore-btn" @click="moveToRoot(node)" title="Move to root">Root</button>
                    <button class="snapshot-restore-btn danger" @click="deleteOrphanedNode(node)" title="Delete permanently">Del</button>
                  </div>
                </div>
              </div>
              <div v-else-if="showLostFound" class="settings-hint">No orphaned nodes</div>
            </div>
          </div>
        </div>
      </div>
      </div>

      <!-- Add Node Input -->
      <div class="add-node-bar">
        <select v-model="newNodeType" class="type-select">
          <option v-for="t in nodeTypes" :key="t" :value="t">{{ t.charAt(0).toUpperCase() + t.slice(1) }}</option>
        </select>
        <input
          ref="addNodeInput"
          v-model="newNodeTitle"
          placeholder="Add new..."
          @keyup.enter="createNode"
        />
        <button class="primary" @click="createNode">Add</button>
      </div>

      <!-- Content wrapper (breadcrumbs + body + detail panel) -->
      <div class="content-wrapper">
        <!-- Main content area (breadcrumbs + body) -->
        <div class="content-main">
          <!-- Breadcrumbs / Path -->
          <nav class="header-breadcrumbs">
            <span class="crumb" @click="navigateToBreadcrumb(-1)">~</span>
            <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
              <span class="crumb-sep">/</span>
              <span
                class="crumb"
                :class="{ current: index === breadcrumbs.length - 1 }"
                @click="index < breadcrumbs.length - 1 ? navigateToBreadcrumb(index) : null"
              >
                {{ crumb.title }}
              </span>
            </template>
          </nav>
        <!-- Content with transition -->
        <div
          class="content-body"
          :class="{
            'transitioning': transitioning,
            'transition-forward': transitionDirection === 'forward',
            'transition-back': transitionDirection === 'back'
          }"
        >
          <!-- Loading -->
        <div v-if="loading" class="loading">Loading...</div>

        <!-- Error -->
        <div v-else-if="error" class="error">{{ error }}</div>

        <!-- Table View -->
        <TableView
          v-else-if="viewMode === 'tree'"
          :nodes="children"
          :selected-id="selectedNode?.id"
          :selected-ids="selectedIds"
          :expanded-ids="expandedIds"
          :hide-completed="hideCompleted"
          :hide-sensitive="hideSensitive"
          :show-detail="showDetail"
          :current-parent-id="currentContainerId"
          :current-container="currentContainer"
          :color-map="inheritedColorMap"
          @hover="hoverSelectNode"
          @select="selectNode"
          @select-multiple="handleMultiSelect"
          @enter="enterContainer"
          @toggle-complete="toggleComplete"
          @toggle-expand="toggleExpand"
          @expand-all="expandAll"
          @collapse-all="collapseAll"
          @delete="deleteNode"
          @move="moveNode"
          @move-multiple="moveMultipleNodes"
          @reorder="handleReorder"
          @go-parent="goToParent"
          @open-fullscreen="openNodeFullscreen"
          @context-menu="handleViewContextMenu"
        />

        <!-- Cards View -->
        <div v-else-if="viewMode === 'cards'" class="node-cards" :style="cardsGridStyle">
          <div
            v-for="node in filteredChildren"
            :key="node.id"
            class="node-card"
            :class="[cardSizeClass, `type-${node.type}`, { selected: isCardSelected(node.id) }, getCardDropClass(node)]"
            :style="getNodeColor(node) ? { background: `linear-gradient(135deg, ${getNodeColor(node)}33 0%, var(--bg-primary) 80%)` } : {}"
            :draggable="editingCardId !== node.id && inlineNotesId !== node.id"
            @click="handleCardClick($event, node)"
            @dblclick="enterContainer(node)"
            @dragstart="onCardDragStart($event, node)"
            @dragend="onCardDragEnd"
            @dragover="onCardDragOver($event, node)"
            @dragleave="onCardDragLeave"
            @drop="onCardDrop($event, node)"
            @mouseenter="showCardTooltip($event, node)"
            @mouseleave="hideCardTooltip"
            @contextmenu.prevent="showContextMenu($event, node)"
          >
            <!-- Header - always visible but adapts -->
            <div class="node-card-header">
              <span v-if="node.favorite" class="card-favorite-star" title="Favorite">&#9733;</span>
              <span v-if="cardSizeClass !== 'card-xs'" class="drag-handle card-drag" title="Drag to reorder">::</span>
              <span class="node-card-type" :class="node.type" :title="'Type: ' + node.type">
                {{ cardSizeClass === 'card-xs' ? node.type[0].toUpperCase() : node.type.toUpperCase() }}
              </span>
              <span v-if="node.importance" class="card-importance" :class="'imp-' + node.importance" :title="getImportanceLabel(node.importance)">
                {{ cardSizeClass === 'card-xs' ? node.importance : getImportanceLabel(node.importance) }}
              </span>
              <span v-if="node.children?.length && cardSizeClass !== 'card-xs'" class="node-card-children" :title="node.children.length + ' children'">
                {{ node.children.length }}
              </span>
              <!-- Date countdown (days to start or days left) -->
              <span
                v-if="getDateCountdown(node)"
                class="date-countdown"
                :class="getDateCountdown(node).type"
                :title="node.start_date ? 'Start: ' + node.start_date : 'Due: ' + (node.due_date || node.end_date)"
              >{{ getDateCountdown(node).text }}</span>
              <!-- Due date warning (overdue/today) -->
              <span
                v-if="getDueDateStatus(node.due_date) && !node.completed && getDueDateStatus(node.due_date).type === 'overdue'"
                class="due-warning"
                :class="getDueDateStatus(node.due_date).type"
                :title="'Due: ' + node.due_date"
              >{{ getDueDateStatus(node.due_date).text }}</span>
              <button class="card-add-btn" @click.stop="addChildToCard(node.id, $event)" title="Add child item">+</button>
              <button class="card-delete-btn" @click.stop="deleteNode(node.id)" title="Delete">×</button>
            </div>
            <!-- Title row with checkbox -->
            <div class="node-card-title-row">
              <input
                v-if="node.type === 'task'"
                type="checkbox"
                class="card-checkbox"
                :checked="node.completed"
                @click.stop
                @change.stop="toggleComplete(node)"
                title="Mark as complete"
              />
              <CardTitleEdit
                :title="node.title"
                v-model="editingTitle"
                :is-editing="editingCardId === node.id"
                :completed="node.completed"
                size="normal"
                @start-edit="startEditing(node, $event)"
                @save="saveEditing"
                @cancel="cancelEditing"
              />
            </div>

            <!-- Interactive notes area -->
            <CardNotes
              :notes="node.notes"
              v-model="inlineNotesText"
              :is-editing="inlineNotesId === node.id"
              :sensitive="isSensitiveNode(node)"
              size="normal"
              @start-edit="startInlineNotes(node, $event)"
              @save="saveInlineNotes"
              @cancel="cancelInlineNotes"
            />

            <!-- Metadata - xl/lg only -->
            <div v-if="(cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg') && (node.due_date || node.start_date)" class="node-card-meta">
              <span v-if="node.due_date" class="meta-item due">
                <span class="meta-icon">D</span>{{ node.due_date }}
              </span>
              <span v-if="node.start_date && cardSizeClass === 'card-xl'" class="meta-item start">
                <span class="meta-icon">S</span>{{ node.start_date }}
              </span>
            </div>

            <!-- Nested children cards - always show if children exist -->
            <div
              v-if="node.children?.length"
              class="node-card-children-grid"
              :class="{ compact: cardSizeClass === 'card-sm' || cardSizeClass === 'card-xs' }"
              :style="nestedGridStyle(node.children.length, 1)"
              @click.stop
            >
              <div
                v-for="child in node.children"
                :key="child.id"
                class="child-card"
                :class="[child.type, getNestedCardSize(node.children.length, 1), { selected: isCardSelected(child.id) }, getCardDropClass(child)]"
                :style="getNodeColor(child) ? { background: `linear-gradient(135deg, ${getNodeColor(child)}33 0%, var(--bg-secondary) 80%)` } : {}"
                :draggable="editingCardId !== child.id && inlineNotesId !== child.id"
                @click.stop="handleChildCardClick($event, child)"
                @dblclick.stop="enterContainer(child)"
                @dragstart.stop="onCardDragStart($event, child)"
                @dragend="onCardDragEnd"
                @dragover.stop="onCardDragOver($event, child)"
                @dragleave="onCardDragLeave"
                @drop.stop="onCardDrop($event, child)"
                @mouseenter="showCardTooltip($event, child)"
                @mouseleave="hideCardTooltip"
                @contextmenu.prevent="showContextMenu($event, child)"
              >
                <div class="child-card-header">
                  <input
                    v-if="child.type === 'task'"
                    type="checkbox"
                    class="child-card-checkbox"
                    :checked="child.completed"
                    @click.stop
                    @change.stop="toggleComplete(child)"
                  />
                  <CardTitleEdit
                    :title="child.title"
                    v-model="editingTitle"
                    :is-editing="editingCardId === child.id"
                    :completed="child.completed"
                    size="child"
                    @start-edit="startEditing(child, $event)"
                    @save="saveEditing"
                    @cancel="cancelEditing"
                  />
                  <button class="child-add-btn" @click.stop="addChildToCard(child.id, $event)" title="Add child">+</button>
                  <button class="child-delete-btn" @click.stop="deleteNode(child.id)" title="Delete">×</button>
                </div>
                <!-- Interactive notes for child cards -->
                <CardNotes
                  :notes="child.notes"
                  v-model="inlineNotesText"
                  :is-editing="inlineNotesId === child.id"
                  :sensitive="isSensitiveNode(child)"
                  size="child"
                  @start-edit="startInlineNotes(child, $event)"
                  @save="saveInlineNotes"
                  @cancel="cancelInlineNotes"
                />
                <!-- Grandchildren - row layout for better title readability -->
                <div
                  v-if="child.children?.length && (cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg')"
                  class="grandchild-row"
                  @click.stop
                >
                  <div
                    v-for="grandchild in child.children"
                    :key="grandchild.id"
                    class="grandchild-card"
                    :class="[grandchild.type, { selected: isCardSelected(grandchild.id), completed: grandchild.completed }, getCardDropClass(grandchild)]"
                    :style="getNodeColor(grandchild) ? { background: `linear-gradient(135deg, ${getNodeColor(grandchild)}33 0%, var(--bg-primary) 80%)` } : {}"
                    :draggable="editingCardId !== grandchild.id && inlineNotesId !== grandchild.id"
                    @click.stop="handleChildCardClick($event, grandchild)"
                    @dblclick.stop="enterContainer(grandchild)"
                    @dragstart.stop="onCardDragStart($event, grandchild)"
                    @dragend="onCardDragEnd"
                    @dragover.stop="onCardDragOver($event, grandchild)"
                    @dragleave="onCardDragLeave"
                    @drop.stop="onCardDrop($event, grandchild)"
                    @mouseenter="showCardTooltip($event, grandchild)"
                    @mouseleave="hideCardTooltip"
                    @contextmenu.prevent="showContextMenu($event, grandchild)"
                  >
                    <div class="grandchild-header">
                      <input
                        v-if="grandchild.type === 'task'"
                        type="checkbox"
                        class="grandchild-checkbox"
                        :checked="grandchild.completed"
                        @click.stop
                        @change.stop="toggleComplete(grandchild)"
                      />
                      <CardTitleEdit
                        :title="grandchild.title"
                        v-model="editingTitle"
                        :is-editing="editingCardId === grandchild.id"
                        :completed="grandchild.completed"
                        size="grandchild"
                        @start-edit="startEditing(grandchild, $event)"
                        @save="saveEditing"
                        @cancel="cancelEditing"
                      />
                      <!-- Notes indicator for grandchild -->
                      <span v-if="isSensitiveNode(grandchild)" class="grandchild-notes-indicator lock">&#128274;</span>
                      <span v-else-if="hasNotes(grandchild)" class="grandchild-notes-indicator has-notes" @click.stop="startInlineNotes(grandchild, $event)">&#128221;</span>
                      <button class="grandchild-delete-btn" @click.stop="deleteNode(grandchild.id)" title="Delete">×</button>
                    </div>
                    <!-- Great-grandchildren - only for xl cards -->
                    <div
                      v-if="grandchild.children?.length && cardSizeClass === 'card-xl'"
                      class="great-grandchild-row"
                    >
                      <div
                        v-for="ggchild in grandchild.children"
                        :key="ggchild.id"
                        class="great-grandchild-item"
                        :class="[ggchild.type, { completed: ggchild.completed }]"
                        @click.stop="selectNode(ggchild)"
                        @dblclick.stop="enterContainer(ggchild)"
                        @contextmenu.prevent="showContextMenu($event, ggchild)"
                      >
                        <input
                          v-if="ggchild.type === 'task'"
                          type="checkbox"
                          class="great-grandchild-checkbox"
                          :checked="ggchild.completed"
                          @click.stop
                          @change.stop="toggleComplete(ggchild)"
                        />
                        <span class="great-grandchild-title" :class="{ completed: ggchild.completed }">{{ ggchild.title }}</span>
                        <button class="great-grandchild-delete-btn" @click.stop="deleteNode(ggchild.id)" title="Delete">×</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer metadata for smaller cards -->
            <div v-if="(cardSizeClass === 'card-md' || cardSizeClass === 'card-sm' || cardSizeClass === 'card-xs') && (node.importance || node.children?.length || getDateCountdown(node))" class="node-card-footer">
              <span v-if="node.importance" class="card-importance" :class="'imp-' + node.importance">{{ node.importance }}</span>
              <span v-if="node.children?.length" class="node-card-children">{{ node.children.length }}</span>
              <span v-if="getDateCountdown(node)" class="date-countdown" :class="getDateCountdown(node).type">{{ getDateCountdown(node).text }}</span>
            </div>

          </div>
          <div v-if="filteredChildren.length === 0" class="empty-state">
            <h3>Empty</h3>
            <p>Add a {{ currentContainerId ? 'child node' : 'project' }} to get started</p>
          </div>
        </div>

        <!-- Graph View - shows current context subgraph -->
        <GraphView
          v-else-if="viewMode === 'graph'"
          ref="graphViewRef"
          :nodes="children"
          :parent="currentContainer"
          :selected-id="selectedNode?.id"
          :detail-threshold="graphDetailThreshold"
          :max-depth="graphMaxDepth"
          :hide-completed="hideCompleted"
          :hide-sensitive="hideSensitive"
          :workspace="currentWorkspace"
          :workspaces="workspaces"
          :show-detail="showDetail"
          :fullscreen-detail-open="fullscreenDetail"
          @select="selectNode"
          @enter="enterContainer"
          @move="moveNode"
          @link="linkNodesFromGraph"
          @unlink="unlinkNodesFromGraph"
          @add-child="addChildNode"
          @insert-between="insertBetween"
          @update="updateNode"
          @create="createNodeAtPosition"
          @delete="deleteNode"
          @delete-multiple="deleteMultipleNodes"
          @wrap-with-parent="wrapWithParent"
          @open-fullscreen="openNodeFullscreen"
          @context-menu="handleViewContextMenu"
        />

        <!-- Timeline View -->
        <TimelineView
          v-else-if="viewMode === 'timeline'"
          :nodes="children"
          :selected-id="selectedNode?.id"
          :hide-completed="hideCompleted"
          :color-map="inheritedColorMap"
          @select="selectNode"
          @enter="enterContainer"
          @show-tooltip="showCardTooltip"
          @hide-tooltip="hideCardTooltip"
          @context-menu="handleViewContextMenu"
        />

        <!-- Persons View -->
        <PersonsView
          v-else-if="viewMode === 'persons'"
          :selected-id="selectedNode?.id"
          :hide-completed="hideCompleted"
          @select="selectNode"
          @delete="deleteNode"
          @context-menu="handleViewContextMenu"
        />

        <!-- Trash View -->
        <div v-else-if="viewMode === 'trash'" class="trash-view">
          <div class="trash-header">
            <h2>Trash ({{ trashedItems.length }} items)</h2>
            <button v-if="trashedItems.length > 0" class="danger" @click="emptyAllTrash">Empty Trash</button>
          </div>
          <div v-if="trashedItems.length === 0" class="trash-empty">
            Trash is empty
          </div>
          <table v-else class="trash-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Deleted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in trashedItems" :key="item.id">
                <td>{{ item.title }}</td>
                <td>{{ item.type }}</td>
                <td>{{ item.deleted_at?.split('T')[0] }}</td>
                <td class="trash-actions">
                  <button class="small" @click="restoreFromTrash(item)">Restore</button>
                  <button class="small danger" @click="permanentlyDelete(item)">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        </div>
        </div>
        <!-- Detail Panel (inside content-wrapper) -->
        <DetailPanel
          v-if="showDetail && selectedNode"
          ref="detailPanelRef"
          :node="selectedNode"
          :width="detailWidth"
          :fullscreen="fullscreenDetail"
          :hide-completed="hideCompleted"
          :pinned="detailPinned"
          :workspaces="workspaces"
          @update="updateNode"
          @delete="deleteNode"
          @wrap-with-parent="wrapWithParent"
          @move-to-root="moveNodeToRoot"
          @select-child="selectChildById"
          @resize-start="onDetailResizeStart"
          @toggle-fullscreen="fullscreenDetail = !fullscreenDetail"
          @toggle-pin="detailPinned = !detailPinned"
          @close="closeDetail"
          @open-link-search="openLinkSearch"
          @add-child="addChildFromDetail"
          @child-updated="onChildUpdated"
          @detach="handleDetach"
        />
      </div>
    </main>

    <!-- Add Node Modal -->
    <AddNodeModal
      :visible="addNodeModal.visible"
      :parent-id="addNodeModal.parentId"
      @close="hideAddNodeModal"
      @create="handleAddNodeCreate"
    />

    <!-- Node Context Menu -->
    <NodeContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :node="contextMenu.node"
      :linked-nodes="contextMenu.linkedNodes"
      :workspaces="workspaces"
      @close="closeContextMenu"
      @view-details="handleContextMenuViewDetails"
      @enter="handleContextMenuEnter"
      @add-child="handleContextMenuAddChild"
      @toggle-complete="handleContextMenuToggleComplete"
      @toggle-favorite="handleContextMenuToggleFavorite"
      @open-link-search="handleContextMenuOpenLinkSearch"
      @unlink="handleContextMenuUnlink"
      @move-to-workspace="handleContextMenuMoveToWorkspace"
      @delete="handleContextMenuDelete"
      @open-in-window="handleDetach"
    />

    <!-- Spotlight Search Modal -->
    <Teleport to="body">
      <div v-if="showSearch" class="spotlight-overlay" @click.self="closeSearch">
        <div class="spotlight-modal">
          <div class="spotlight-header">
            <input
              ref="searchInputRef"
              v-model="searchQuery"
              type="text"
              :placeholder="searchMode === 'link' ? 'Search to link...' : 'Search nodes...'"
              class="spotlight-input"
              @input="onSearchInput"
              @keydown="handleSearchKeydown"
            />
            <span class="spotlight-hint">
              <span class="key">esc</span> close
              <span class="key">up</span><span class="key">down</span> navigate
              <span class="key">enter</span> select
            </span>
          </div>

          <div class="spotlight-results" v-if="searchResults.length > 0">
            <div class="spotlight-results-header">
              <span v-if="searchMode === 'link'" class="link-mode-badge">Link mode</span>
              {{ searchResults.length }} result{{ searchResults.length !== 1 ? 's' : '' }}
              <span class="current-view-badge">{{ viewMode }}</span>
            </div>
            <div
              v-for="(result, index) in searchResults"
              :key="result.id"
              class="spotlight-result"
              :class="{ selected: index === selectedResultIndex, completed: result.completed }"
              @click="goToSearchResult(result)"
              @mouseenter="selectedResultIndex = index"
            >
              <div class="result-type-badge" :class="result.type">
                <span v-html="getTypeIcon(result.type)"></span>
              </div>
              <div class="result-body">
                <div class="result-title">{{ result.title }}</div>
                <div class="result-breadcrumb" v-if="result.breadcrumb">{{ result.breadcrumb }}</div>
                <div class="result-meta" v-if="result.due_date || result.importance">
                  <span v-if="result.due_date" class="result-due">Due: {{ result.due_date.split('T')[0] }}</span>
                  <span v-if="result.importance" class="result-priority">{{ getImportanceLabel(result.importance) }}</span>
                </div>
                <div v-if="result.notes" class="result-notes">{{ result.notes.substring(0, 80) }}{{ result.notes.length > 80 ? '...' : '' }}</div>
              </div>
              <div class="result-action">
                {{ getSearchActionLabel(result) }}
                <span class="action-arrow">-></span>
              </div>
            </div>
          </div>

          <div class="spotlight-empty" v-else-if="searchQuery && searchQuery.length > 0">
            <div class="empty-text">No results for "{{ searchQuery }}"</div>
            <div class="empty-hint">Try different keywords</div>
          </div>

          <div class="spotlight-hint-footer" v-else>
            <div class="hint-text">Type to search all nodes</div>
            <div class="hint-examples">
              <span>Titles</span>
              <span>Notes</span>
              <span>Projects</span>
              <span>Tasks</span>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Resize state */
.app.is-resizing {
  cursor: ew-resize;
  user-select: none;
}

.app.is-resizing * {
  cursor: ew-resize !important;
}

/*
 * Window drag region fix (2026-01-19):
 * The content-header must NOT have app-region:drag directly, because native
 * Electron drag regions don't respect CSS z-index. This caused the sidebar
 * pin button to be unclickable when the fixed-position sidebar overlaid this area.
 * Solution: Use a ::before pseudo-element with z-index:-1 for the drag region,
 * so the sidebar (z-index:9000) remains interactive.
 */
.content-header {
  padding-top: 35px;
  background: var(--bg-primary);
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 1;
}

.content-header::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 35px;
  -webkit-app-region: drag;
  z-index: -1;
}

.header-row {
  height: 52px;
  box-sizing: border-box;
  padding: 0 var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1.1rem;
  padding: var(--spacing-lg) var(--spacing-lg) 0 var(--spacing-lg);
  background: var(--bg-primary);
}

.crumb {
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s;
}

.crumb:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.crumb.current {
  color: var(--text-primary);
  font-weight: 600;
  cursor: default;
}

.crumb.current:hover {
  background: transparent;
}

.crumb-sep {
  color: var(--text-tertiary);
}

.add-node-bar {
  height: 60px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: 0 var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.add-node-bar input {
  flex: 1;
}

.type-select {
  width: 100px;
}

.error {
  color: #e07d7d;
  padding: var(--spacing-lg);
  text-align: center;
}

/* Transition animations */
.content-body {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.content-body.transitioning {
  opacity: 0;
}

.content-body.transitioning.transition-forward {
  transform: translateX(20px);
}

.content-body.transitioning.transition-back {
  transform: translateX(-20px);
}

/* Card children indicator */
.node-card-children {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  background: var(--bg-primary);
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.node-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-favorite-star {
  color: #ffd700;
  font-size: 14px;
  text-shadow: 0 0 6px rgba(255, 215, 0, 0.8);
}

.card-edit-btn,
.card-add-btn,
.card-delete-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 11px;
  border-radius: 50%;
  opacity: 0.4;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}

.card-add-btn {
  font-size: 14px;
  font-weight: bold;
}

.card-delete-btn {
  font-size: 16px;
  font-weight: bold;
  position: absolute;
  top: 8px;
  right: 8px;
}

.card-edit-btn:hover,
.card-add-btn:hover {
  opacity: 1;
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.card-delete-btn:hover {
  opacity: 1;
  background: #e74c3c;
  border-color: #e74c3c;
  color: white;
}

/* Inline editing styles */
.node-card-title-input {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.02em;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 8px;
  outline: none;
  width: calc(100% - 32px);
  padding: 8px 12px;
  margin: 12px 16px 8px 16px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.child-card-title-input {
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 4px;
  outline: none;
  flex: 1;
  padding: 4px 8px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.grandchild-title-input {
  font-size: 11px;
  font-weight: 500;
  color: #fff;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--accent-color);
  border-radius: 3px;
  outline: none;
  flex: 1;
  padding: 2px 6px;
  user-select: text;
  -webkit-user-select: text;
  -webkit-user-drag: none;
}

.node-card-notes-input {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.6;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  width: calc(100% - 32px);
  min-height: 60px;
  padding: 8px 12px;
  margin: 0 16px 8px 16px;
  resize: vertical;
  font-family: inherit;
}

.node-card-notes-input:focus {
  border-color: var(--accent-color);
}

/* Inline notes area */
.node-card-notes-area {
  margin: 8px 16px 16px 16px;
  width: calc(100% - 32px);
}

.node-card-notes-area.no-children {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.node-card-notes-area.no-children .inline-notes-display {
  flex: 1;
  max-height: none;
}

/* Compact notes for sm/xs cards */
.node-card-notes-area.compact {
  margin: 4px 8px 8px 8px;
  width: calc(100% - 16px);
}

.node-card-notes-area.compact .inline-notes-display {
  font-size: 10px;
  line-height: 1.3;
  max-height: 40px;
  padding: 2px 4px;
}

/* Notes expand when no children, even in compact mode */
.node-card-notes-area.compact.no-children {
  flex: 1;
}

.node-card-notes-area.compact.no-children .inline-notes-display {
  flex: 1;
  max-height: none;
}

.inline-notes-display {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-secondary);
  cursor: text;
  padding: 4px 8px 4px 16px;
  border-radius: 4px;
  transition: background 0.15s;
  max-height: 150px;
  overflow-y: auto;
}

/* Larger max-height for bigger cards */
.node-card.card-xl .inline-notes-display { max-height: 250px; }
.node-card.card-lg .inline-notes-display { max-height: 180px; }

/* Scale notes font size with card size */
.node-card.card-xl .inline-notes-display { font-size: 15px; }
.node-card.card-lg .inline-notes-display { font-size: 14px; }
.node-card.card-md .inline-notes-display { font-size: 12px; }

.inline-notes-display:hover {
  background: rgba(255, 255, 255, 0.05);
}

.inline-notes-display.empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.inline-notes-display.sensitive {
  color: var(--text-tertiary);
  font-style: normal;
  display: flex;
  align-items: center;
  justify-content: center;
}

.lock-icon-display {
  font-size: 18px;
  opacity: 0.5;
}

.inline-notes-textarea {
  width: 100%;
  min-height: 1.6em;
  max-height: 120px;
  font-size: 13px;
  font-family: inherit;
  line-height: 1.5;
  background: rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  resize: vertical;
  field-sizing: content;
}

.inline-notes-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* Markdown content in notes */
.markdown-content {
  font-size: inherit;
  line-height: 1.5;
}

.markdown-content p {
  margin: 0 0 0.5em 0;
}

.markdown-content p:last-child {
  margin-bottom: 0;
}

.markdown-content ul, .markdown-content ol {
  margin: 0.25em 0;
  padding-left: 1.5em;
}

.markdown-content li {
  margin: 0.1em 0;
}

.markdown-content code {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.1em 0.3em;
  border-radius: 3px;
  font-size: 0.9em;
}

.markdown-content pre {
  background: rgba(0, 0, 0, 0.3);
  padding: 0.5em;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.5em 0;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

.markdown-content a {
  color: var(--accent-color);
}

.markdown-content strong {
  color: var(--text-primary);
}

.markdown-content h1, .markdown-content h2, .markdown-content h3,
.markdown-content h4, .markdown-content h5, .markdown-content h6 {
  margin: 0.5em 0 0.25em 0;
  color: var(--text-primary);
  font-weight: 600;
}

.markdown-content h1 { font-size: 1.3em; }
.markdown-content h2 { font-size: 1.2em; }
.markdown-content h3 { font-size: 1.1em; }

.markdown-content blockquote {
  margin: 0.5em 0;
  padding-left: 1em;
  border-left: 3px solid var(--border-color);
  color: var(--text-tertiary);
}

.markdown-content hr {
  border: none;
  border-top: 1px solid var(--border-color);
  margin: 0.5em 0;
}

.markdown-content img {
  max-width: 100%;
  border-radius: 4px;
}

.card-edit-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px 16px;
}

.card-save-btn,
.card-cancel-btn {
  padding: 6px 12px;
  font-size: 12px;
  border-radius: 6px;
}

.card-save-btn {
  background: var(--accent-color);
  border-color: var(--accent-color);
}

.card-save-btn:hover {
  background: var(--accent-hover);
}

.card-cancel-btn {
  background: var(--bg-tertiary);
}

/* Sensitive notes styling */
.notes-sensitive {
  filter: blur(6px);
  user-select: none;
  cursor: pointer;
  transition: filter 0.2s;
}

.notes-sensitive:hover {
  filter: blur(3px);
}

/* Adaptive card sizes */
.node-card.card-xl {
  padding: 0;
}

.node-card.card-xl .node-card-title {
  font-size: 22px;
}

.node-card.card-xl .node-card-notes {
  font-size: 15px;
  padding: 0 20px 16px 20px;
  max-height: none;
}

.node-card.card-lg .node-card-title {
  font-size: 18px;
}

.node-card.card-md .node-card-title {
  font-size: 16px;
}

.node-card.card-md .node-card-notes {
  font-size: 13px;
  padding: 0 14px 12px 14px;
}

.node-card.card-sm {
  padding: 0;
}

.node-card.card-sm .node-card-header {
  padding: 8px 10px 0 10px;
}

.node-card.card-sm .node-card-title {
  font-size: 14px;
}

.node-card.card-xs {
  padding: 0;
}

.node-card.card-xs .node-card-header {
  padding: 6px 8px 0 8px;
  gap: 4px;
}

.node-card.card-xs .node-card-type {
  font-size: 8px;
  padding: 2px 6px;
}

.node-card.card-xs .node-card-title {
  font-size: 12px;
  line-height: 1.2;
}

/* Truncated text */
.title-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-truncate {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-height: 3em;
}

/* Card metadata */
.node-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px 12px 16px;
  font-size: 11px;
}

.meta-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-secondary);
}

.meta-icon {
  font-weight: 600;
  font-size: 9px;
  opacity: 0.7;
}

.meta-item.due {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.meta-item.start {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.meta-item.importance {
  background: rgba(168, 85, 247, 0.15);
  color: #c084fc;
}

.meta-item.imp-1 { background: rgba(239, 68, 68, 0.2); color: #f87171; }
.meta-item.imp-2 { background: rgba(249, 115, 22, 0.2); color: #fb923c; }
.meta-item.imp-3 { background: rgba(234, 179, 8, 0.2); color: #fbbf24; }

/* Inline date editing */
.card-dates-inline {
  display: flex;
  gap: 12px;
  padding: 0 16px 12px 16px;
}

.card-date-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-date-field label {
  font-size: 10px;
  text-transform: uppercase;
  color: var(--text-tertiary);
  font-weight: 600;
}

.card-date-field input[type="date"] {
  padding: 6px 8px;
  font-size: 12px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

/* Compact children indicator */
.node-card-children-compact {
  position: absolute;
  bottom: 6px;
  right: 6px;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  background: var(--accent-subtle);
  color: var(--accent-color);
}

/* Child card sizes */
.child-card.child-lg {
  padding: 10px 12px;
}

.child-card.child-lg .child-card-title {
  font-size: 13px;
  white-space: normal;
}

.child-card.child-md {
  padding: 8px 10px;
}

.child-card.child-sm {
  padding: 6px 8px;
}

.child-card.child-sm .child-card-title {
  font-size: 11px;
}

.child-card.child-xs {
  padding: 4px 6px;
}

.child-card.child-xs .child-card-title {
  font-size: 10px;
}

.child-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.child-card-header :deep(.card-title),
.child-card-header :deep(.card-title-input) {
  flex: 1;
  min-width: 0;
}

.child-card-checkbox {
  width: 12px;
  height: 12px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--accent-color);
}

.child-add-btn {
  margin-left: auto;
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 12px;
  font-weight: bold;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
}

.child-card:hover .child-add-btn {
  opacity: 0.5;
}

.child-add-btn:hover {
  opacity: 1 !important;
  color: var(--accent-color);
}

.child-delete-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  font-size: 12px;
  font-weight: bold;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
}

.child-card:hover .child-delete-btn {
  opacity: 0.5;
}

.child-delete-btn:hover {
  opacity: 1 !important;
  color: #e74c3c;
}

.child-card-notes {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Card title row with checkbox */
.node-card-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.node-card.card-xl .node-card-title-row {
  padding: 16px 20px 10px 20px;
}

.node-card.card-lg .node-card-title-row {
  padding: 14px 16px 8px 16px;
}

.node-card.card-md .node-card-title-row {
  padding: 10px 14px 6px 14px;
}

.node-card.card-sm .node-card-title-row {
  padding: 6px 10px;
}

.node-card.card-xs .node-card-title-row {
  padding: 4px 8px;
}

/* Card checkbox */
.card-checkbox {
  width: 14px;
  height: 14px;
  cursor: pointer;
  flex-shrink: 0;
  accent-color: var(--accent-color);
}

.node-card.card-sm .card-checkbox,
.node-card.card-xs .card-checkbox {
  width: 12px;
  height: 12px;
}

/* Importance badge inline in header */
.card-importance {
  font-size: 9px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 8px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.card-importance.imp-1 {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
}

.card-importance.imp-2 {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.card-importance.imp-3 {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}

.card-importance.imp-4 {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.card-importance.imp-5 {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

.node-card.card-sm .card-importance,
.node-card.card-xs .card-importance {
  font-size: 8px;
  padding: 1px 4px;
}

/* Hide header metadata on smaller cards - shown in footer instead */
.node-card.card-md .node-card-header .card-importance,
.node-card.card-md .node-card-header .node-card-children,
.node-card.card-md .node-card-header .date-countdown,
.node-card.card-sm .node-card-header .card-importance,
.node-card.card-sm .node-card-header .node-card-children,
.node-card.card-sm .node-card-header .date-countdown,
.node-card.card-xs .node-card-header .card-importance,
.node-card.card-xs .node-card-header .node-card-children,
.node-card.card-xs .node-card-header .date-countdown {
  display: none;
}

/* Footer for small cards */
.node-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-top: auto;
  border-top: 1px solid var(--border-subtle);
  font-size: 10px;
}

/* Completed card styling */
.node-card:has(.card-checkbox:checked) {
  opacity: 0.6;
}

.node-card:has(.card-checkbox:checked) .node-card-title,
.node-card-title.completed {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

/* Due date warning */
.due-warning {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.due-warning.overdue {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  animation: pulse-warning 2s ease-in-out infinite;
}

.due-warning.today {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

.due-warning.soon {
  background: rgba(234, 179, 8, 0.2);
  color: #fbbf24;
}

.due-warning.upcoming {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.due-warning.future {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
}

@keyframes pulse-warning {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Date countdown badges */
.date-countdown {
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 10px;
  white-space: nowrap;
}

.date-countdown.to-start {
  background: rgba(139, 92, 246, 0.2);
  color: #a78bfa;
}

.date-countdown.to-end {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.date-countdown.ends-today {
  background: rgba(249, 115, 22, 0.2);
  color: #fb923c;
}

/* Card drag and drop */
.node-card.dragging {
  opacity: 0.5;
  transform: scale(0.98);
}

.node-card.drop-inside {
  outline: 2px solid #4a9eff;
  background: rgba(74, 158, 255, 0.15);
  box-shadow: 0 0 0 4px rgba(74, 158, 255, 0.2);
}

.node-card.drop-before {
  box-shadow: -4px 0 0 0 #4a9eff, 0 2px 4px rgba(0,0,0,0.2);
}

.node-card.drop-after {
  box-shadow: 4px 0 0 0 #4a9eff, 0 2px 4px rgba(0,0,0,0.2);
}

.card-drag {
  cursor: grab;
  color: var(--text-tertiary);
  font-weight: bold;
  opacity: 0.3;
  user-select: none;
  margin-right: 4px;
  font-size: 0.9rem;
  transition: opacity 0.15s;
}

.node-card:hover .card-drag {
  opacity: 0.7;
}

.card-drag:hover {
  opacity: 1;
  color: var(--text-primary);
}

.node-card.dragging .card-drag {
  cursor: grabbing;
}

/* Sidebar Legend */
.sidebar-legend {
  padding: var(--spacing-lg);
  border-top: 1px solid #333;
  background: #151515;
  flex-shrink: 0;
}

.legend-title {
  font-size: 10px;
  text-transform: uppercase;
  color: #888;
  margin-bottom: 10px;
  font-weight: 600;
  letter-spacing: 1px;
}

.legend-items {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #ccc;
}

.legend-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  font-size: 9px;
  font-weight: 600;
}

/* SVG icons in legend */
.legend-badge :deep(svg) { width: 12px; height: 12px; }

/* Search */
.search-container {
  position: relative;
  flex: 1;
  max-width: 320px;
  margin: 0 var(--spacing-xl);
}

.search-input {
  width: 100%;
  padding-right: 36px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
}

.search-clear {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.search-results {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  background: #0a0a0a;
  border: 2px solid #333;
  border-radius: 12px;
  max-height: 500px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
}

.search-results-header {
  padding: 10px 16px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #222;
  background: #111;
}

.search-result-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid #1a1a1a;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: #1a1a1a;
}

.search-result-item.completed {
  opacity: 0.6;
}

.result-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.result-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

.result-type.project { background: var(--type-project-bg); color: var(--type-project-text); }
.result-type.task { background: var(--type-task-bg); color: var(--type-task-text); }
.result-type.note { background: var(--type-note-bg); color: var(--type-note-text); }
.result-type.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.result-type.group { background: var(--type-group-bg); color: var(--type-group-text); }
.result-type.event { background: var(--type-event-bg); color: var(--type-event-text); }
.result-type.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.result-type.person { background: var(--type-person-bg); color: var(--type-person-text); }
.result-type.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }

.result-check {
  color: #4ade80;
  font-size: 12px;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.search-result-item.completed .result-title {
  text-decoration: line-through;
  color: #888;
}

.result-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #888;
  margin-bottom: 6px;
}

.result-path {
  color: #666;
}

.result-due {
  color: #f59e0b;
}

.result-importance {
  color: #f472b6;
}

.result-notes {
  font-size: 13px;
  color: #aaa;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.search-no-results {
  padding: 24px;
  text-align: center;
  color: #666;
  font-size: 14px;
}

/* Toolbar separator and icon button */
.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 4px;
}

/* Workspace Selector */
.workspace-selector {
  display: flex;
  align-items: center;
}

.workspace-dropdown {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  min-width: 100px;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.workspace-dropdown:hover {
  border-color: var(--accent-color);
}

.workspace-dropdown:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 2px rgba(74, 158, 255, 0.2);
}

.workspace-dropdown option {
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 8px;
}

.icon-btn {
  padding: 6px 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
  border-radius: 4px;
}

.icon-btn:hover {
  background: var(--bg-elevated);
  color: var(--text-primary);
}

.icon-btn.active {
  background: #1a3a5a;
  border-color: #4a9eff;
  color: #4a9eff;
}

.icon-btn svg {
  display: block;
}

/* Settings dropdown */
.settings-dropdown {
  position: relative;
}

.settings-btn {
  padding: 6px 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-btn:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.settings-panel {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  min-width: 250px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.settings-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-item label {
  font-size: 12px;
  color: var(--text-secondary);
}

.settings-item input[type="number"] {
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  width: 80px;
}

.settings-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}

.settings-divider {
  border-top: 1px solid var(--border-color);
  margin: 8px 0;
}

.snapshot-actions {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.snapshot-btn {
  padding: 4px 8px;
  font-size: 11px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-primary);
}

.snapshot-btn:hover {
  background: var(--bg-hover);
}

.snapshot-message {
  color: var(--accent-color);
  margin-top: 4px;
}

.snapshot-list {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.snapshot-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 11px;
}

.snapshot-item:last-child {
  border-bottom: none;
}

.snapshot-date {
  color: var(--text-secondary);
}

.snapshot-restore-btn {
  padding: 2px 6px;
  font-size: 10px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 3px;
  cursor: pointer;
  color: var(--text-primary);
}

.snapshot-restore-btn:hover {
  background: var(--accent-color);
  color: white;
}

.snapshot-restore-btn.danger:hover {
  background: #e74c3c;
}

.lost-actions {
  display: flex;
  gap: 4px;
}

.orphan-type {
  color: var(--text-tertiary);
  font-size: 10px;
}

/* Search trigger button */
.search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin: 0 var(--spacing-lg);
}

.search-trigger:hover {
  background: var(--bg-tertiary);
  border-color: var(--text-tertiary);
}

.search-icon {
  font-size: 14px;
  color: var(--text-tertiary);
}

.search-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.search-shortcut {
  font-size: 10px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}
</style>

<style>
/* Spotlight Search Modal - global styles for Teleport */
.spotlight-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 15vh;
  z-index: 9999;
  backdrop-filter: blur(4px);
}

.spotlight-modal {
  width: 90%;
  max-width: 640px;
  background: #0a0a0a;
  border: 2px solid #333;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  animation: spotlight-appear 0.15s ease-out;
}

@keyframes spotlight-appear {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.spotlight-header {
  padding: 16px 20px;
  border-bottom: 1px solid #222;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.spotlight-input {
  width: 100%;
  padding: 14px 18px;
  font-size: 20px;
  background: #111;
  border: 2px solid #333;
  border-radius: 12px;
  color: #fff;
  outline: none;
  transition: border-color 0.15s;
}

.spotlight-input:focus {
  border-color: #4a9eff;
}

.spotlight-input::placeholder {
  color: #666;
}

.spotlight-hint {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #666;
  justify-content: flex-end;
}

.spotlight-hint .key {
  background: #222;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  color: #888;
  margin-right: 4px;
}

.spotlight-results {
  max-height: 400px;
  overflow-y: auto;
}

.spotlight-results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  font-size: 12px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #111;
  border-bottom: 1px solid #222;
}

.current-view-badge {
  font-size: 10px;
  padding: 3px 8px;
  background: rgba(74, 158, 255, 0.15);
  color: #4a9eff;
  border-radius: 10px;
  text-transform: capitalize;
}

.link-mode-badge {
  font-size: 10px;
  padding: 3px 8px;
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  border-radius: 10px;
  margin-right: 8px;
}

.spotlight-result {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 20px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid #1a1a1a;
}

.spotlight-result:last-child {
  border-bottom: none;
}

.spotlight-result:hover,
.spotlight-result.selected {
  background: #1a1a1a;
}

.spotlight-result.selected {
  background: linear-gradient(90deg, rgba(74, 158, 255, 0.1) 0%, #1a1a1a 100%);
  border-left: 3px solid #4a9eff;
  padding-left: 17px;
}

.spotlight-result.completed {
  opacity: 0.6;
}

.spotlight-result.completed .result-title {
  text-decoration: line-through;
  color: #888;
}

.result-type-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 700;
  flex-shrink: 0;
}

.result-type-badge.project { background: var(--type-project-bg); color: var(--type-project-text); }
.result-type-badge.task { background: var(--type-task-bg); color: var(--type-task-text); }
.result-type-badge.note { background: var(--type-note-bg); color: var(--type-note-text); }
.result-type-badge.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.result-type-badge.group { background: var(--type-group-bg); color: var(--type-group-text); }
.result-type-badge.event { background: var(--type-event-bg); color: var(--type-event-text); }
.result-type-badge.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.result-type-badge.person { background: var(--type-person-bg); color: var(--type-person-text); }
.result-type-badge.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }

.result-body {
  flex: 1;
  min-width: 0;
}

.spotlight-result .result-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 2px;
}

.spotlight-result .result-breadcrumb {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotlight-result .result-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.spotlight-result .result-path {
  color: #666;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.spotlight-result .result-due {
  color: #f59e0b;
}

.spotlight-result .result-priority {
  color: #c084fc;
  font-weight: 600;
}

.spotlight-result .result-notes {
  font-size: 13px;
  color: #777;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-action {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 6px;
}

.spotlight-result.selected .result-action {
  color: #4a9eff;
}

.action-arrow {
  font-family: monospace;
  font-size: 14px;
}

.spotlight-empty {
  padding: 40px 20px;
  text-align: center;
}

.spotlight-empty .empty-text {
  font-size: 16px;
  color: #888;
  margin-bottom: 8px;
}

.spotlight-empty .empty-hint {
  font-size: 13px;
  color: #555;
}

.spotlight-hint-footer {
  padding: 30px 20px;
  text-align: center;
}

.spotlight-hint-footer .hint-text {
  font-size: 15px;
  color: #666;
  margin-bottom: 12px;
}

.spotlight-hint-footer .hint-examples {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.spotlight-hint-footer .hint-examples span {
  font-size: 11px;
  padding: 4px 10px;
  background: #1a1a1a;
  color: #888;
  border-radius: 12px;
}

/* Trash View */
.trash-view {
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.trash-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.trash-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 500;
}

.trash-empty {
  color: #666;
  text-align: center;
  padding: 48px;
}

.trash-table {
  width: 100%;
  border-collapse: collapse;
}

.trash-table th,
.trash-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid #333;
}

.trash-table th {
  color: #888;
  font-weight: 500;
}

.trash-actions {
  display: flex;
  gap: 8px;
}

.orphan-parent {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-tertiary);
}

button.small {
  padding: 4px 8px;
  font-size: 12px;
}

button.danger {
  background: #7f1d1d;
  color: #fca5a5;
}

button.danger:hover {
  background: #991b1b;
}
</style>
