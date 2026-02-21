<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { marked } from 'marked'
import { api } from './services/api.js'
import { useNodeTooltip } from './composables/useNodeTooltip.js'
import { useDetachedWindow } from './composables/useDetachedWindow.js'
import { useSelection } from './composables/useSelection.js'
import { useCardDrag } from './composables/useCardDrag.js'
// useSearch available but not currently used
// import { useSearch } from './composables/useSearch.js'
import { useInlineEdit } from './composables/useInlineEdit.js'
import { useSnapshots } from './composables/useSnapshots.js'
import { useContextMenu } from './composables/useContextMenu.js'
import { useDetailResize } from './composables/useDetailResize.js'
import { useUndoRedo } from './composables/useUndoRedo.js'
import { useSettings } from './composables/useSettings.js'
import { useWorkspace } from './composables/useWorkspace.js'
import { useSidebar } from './composables/useSidebar.js'
import { useNodeOperations } from './composables/useNodeOperations.js'
// useNavigation available but not currently used
// import { useNavigation } from './composables/useNavigation.js'
import {
  CreateCommand,
  LinkCommand,
  UnlinkCommand,
  ReorderCommand
} from './commands/index.js'
import { nodeTypes, getImportanceLabel, getTypeIcon, typeConfig } from './utils/constants.js'
import { decodeHtmlEntities as decodeHtml } from './utils/html.js'
import { MAX_HISTORY_SIZE, SIDEBAR_HIDE_DELAY_MS } from './utils/uiConstants.js'
import DetailPanel from './components/DetailPanel.vue'
import GraphView from './components/GraphView.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import PersonsView from './components/PersonsView.vue'
import TasksView from './components/TasksView.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import CardTitleEdit from './components/CardTitleEdit.vue'
import CardNotes from './components/CardNotes.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ToastContainer from './components/ToastContainer.vue'
import { showToast } from './composables/useToast.js'

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

// UI state - managed by useSettings composable
const {
  viewMode,
  containerId: savedContainerId,
  hideCompleted,
  hideSensitive,
  graphDetailThreshold,
  graphMaxDepth,
  graphRootMaxDepth,
  openDetailFullscreen,
  hoverPreviewEnabled,
  sidebarPinned
} = useSettings()

const loading = ref(true)
const error = ref(null)
const newNodeTitle = ref('')
const newNodeType = ref('task')
// Selection state is managed by useSelection composable (initialized after flatChildren)
// These refs are passed to the composable and also used for UI state
const showDetail = ref(false)
const fullscreenDetail = ref(false)
const detailPinned = ref(false)
const expandedIds = ref(new Set())
const transitioning = ref(false)
const transitionDirection = ref('forward')
const containerWidth = ref(800)
const containerHeight = ref(600)
const sidebarTree = ref([])  // Full tree for sidebar navigation
const recentItems = ref([])  // Recent items for sidebar
const trashedItems = ref([])  // Deleted items for trash view
const orphanedNodes = ref([])  // Orphaned nodes for lost & found
const showLostFound = ref(false)

// Sidebar UI state via composable
const {
  hovered: sidebarHovered,
  expandedIds: sidebarExpandedIds,
  treeCollapsed: sidebarTreeCollapsed,
  favoritesCollapsed: sidebarFavoritesCollapsed,
  recentCollapsed: _sidebarRecentCollapsed,
  tagsCollapsed: sidebarTagsCollapsed,
  visible: sidebarVisible,
  onEnter: onSidebarEnter,
  onLeave: onSidebarLeave,
  toggleExpand: toggleSidebarExpand,
  expandToPath: expandSidebarToPath
} = useSidebar({ pinned: sidebarPinned })

// Context menu state is managed by useContextMenu composable (initialized after functions it needs)

// =========================================
// WORKSPACES
// =========================================
// Workspace management via composable
const {
  currentWorkspace,
  workspaces,
  showNewWorkspaceInput,
  newWorkspaceName,
  loadWorkspaces,
  openNewWorkspaceDialog: _openNewWorkspaceDialog,
  createWorkspace: createNewWorkspace,
  deleteCurrentWorkspace: _deleteCurrentWorkspace,
  getWorkspaceIdForNode
} = useWorkspace({ api })

// Wrap openNewWorkspaceDialog to focus input
function openNewWorkspaceDialog() {
  _openNewWorkspaceDialog()
  nextTick(() => newWorkspaceInputRef.value?.focus())
}

// Wrap deleteCurrentWorkspace to add confirmation dialog
async function deleteCurrentWorkspace() {
  const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
  if (!ws) return

  const confirmed = confirm(`Delete workspace "${ws.name}"?`)
  if (!confirmed) return

  await _deleteCurrentWorkspace()
}

// Favorites computed from all loaded nodes
const favoriteItems = ref([])

// Tags for sidebar
const allTags = ref([])

function toggleSidebarPin() {
  sidebarPinned.value = !sidebarPinned.value
}

// Detail panel resize - managed by useDetailResize composable
const {
  detailWidth,
  isResizing: isResizingDetail,
  onResizeStart: onDetailResizeStart
} = useDetailResize()

function _closeDetailIfNotPinned() {
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

// Inline editing state is managed by useInlineEdit composable (initialized after flatChildren)

// Setup tooltip composable - single source of truth for all tooltips
const { showTooltip, hideTooltip, forceHide: forceHideTooltip } = useNodeTooltip({
  onToggleComplete: async (nodeId) => {
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (node) await toggleComplete(node)
  },
  getHideSensitive: () => hideSensitive.value,
  shouldShowTooltip: () => hoverPreviewEnabled.value && !showDetail.value
})

// Setup detached window composable for cross-window sync
const {
  openDetachedWindow,
  broadcastNodeUpdate,
  broadcastNodeDelete,
  onMessage: onDetachedMessage
} = useDetachedWindow()

// Additional UI state
const showSettings = ref(false)
const sortAlphabetically = ref(false)

// Snapshot/backup management - using composable
// Note: callbacks reference functions defined below (works due to closure)
const {
  availableSnapshots,
  showSnapshotList,
  snapshotMessage,
  loadSnapshots,
  createSnapshot,
  restoreSnapshot,
  reloadDatabase,
  formatSnapshotDate
} = useSnapshots({
  onListBackups: () => api.listBackups(),
  onCreateBackup: (suffix) => api.backup(suffix),
  onRestoreBackup: (path) => api.restoreBackup(path),
  onReload: () => api.reload(),
  onAfterRestore: async () => {
    await loadChildren(null)
    await loadSidebarTree()
    selectedNode.value = null
    currentContainerId.value = null
    breadcrumbs.value = []
  },
  onAfterReload: async () => {
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
    if (selectedNode.value?.id) {
      selectedNode.value = await api.getNode(selectedNode.value.id)
    }
  }
})

// Load trash items when switching to trash view
// Note: Persistence is handled by useSettings composable
watch(viewMode, (newMode) => {
  if (newMode === 'trash') {
    loadTrashedItems()
  }
})

// Close any active tooltips when detail panel opens
watch(showDetail, (isOpen) => {
  if (isOpen) {
    forceHideTooltip()
  }
})

// Search state - detached spotlight-style
const searchQuery = ref('')
const searchResults = ref([])
const showSearch = ref(false)
const searchTimeout = ref(null)
const searchInputRef = ref(null)
const graphViewRef = ref(null)
const tasksViewRef = ref(null)
const detailPanelRef = ref(null)
const newWorkspaceInputRef = ref(null)
const addNodeInput = ref(null)
const addChildParentId = ref(null) // Parent ID when adding via card + button

// Add node modal state
const addNodeModal = ref({
  visible: false,
  parentId: null
})

const searchMode = ref('normal') // 'normal' or 'link'
const linkSourceNodeId = ref(null)

// Undo/redo using Command pattern
const {
  undoStack,
  redoStack,
  canUndo: _canUndo,
  canRedo: _canRedo,
  pushCommand,
  undo: undoAction,
  redo: redoAction
} = useUndoRedo({
  api,
  onSuccess: async () => {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
  }
})

// Wrapper functions that show toast notifications
async function undo() {
  const result = await undoAction()
  if (result) showToast(`Undo: ${result.description}`)
}

async function redo() {
  const result = await redoAction()
  if (result) showToast(`Redo: ${result.description}`)
}

// Node operations composable - handles CRUD with undo/redo support
const nodeOps = useNodeOperations({
  api,
  pushCommand,
  getWorkspaceIdForNode,
  onError: (e) => { error.value = e.message },
  broadcastUpdate: broadcastNodeUpdate,
  broadcastDelete: broadcastNodeDelete
})

const selectedResultIndex = ref(0)

// Cards drag state - using composable
// Note: callbacks reference functions defined below (works due to closure/hoisting)
const {
  draggedNode: _cardDraggedNode,
  dropTarget: _cardDropTarget,
  dropPosition: _cardDropPosition,
  onDragStart: onCardDragStart,
  onDragEnd: onCardDragEnd,
  onDragOver: onCardDragOver,
  onDragLeave: onCardDragLeave,
  onDrop: onCardDrop,
  getDropClass: getCardDropClass
} = useCardDrag({
  onMove: async (sourceNode, targetNode) => {
    await moveNode({ nodeId: sourceNode.id, newParentId: targetNode.id })
  },
  onReorder: async (sourceNode, targetNode, position) => {
    await handleReorder({
      nodeId: sourceNode.id,
      targetId: targetNode.id,
      position
    })
  }
})

// Computed
const _projects = computed(() => {
  if (currentContainerId.value === null) {
    return children.value.filter(n => n && n.type === 'project')
  }
  return []
})

// Use root depth setting when at root level, otherwise use regular max depth
const effectiveGraphMaxDepth = computed(() => {
  return currentContainerId.value === null ? graphRootMaxDepth.value : graphMaxDepth.value
})

const flatChildren = computed(() => {
  const result = []
  function flatten(nodeList) {
    if (!nodeList) return
    for (const node of nodeList) {
      if (!node) continue
      result.push(node)
      if (node.children?.length) {
        flatten(node.children)
      }
    }
  }
  flatten(children.value)
  return result
})

// Initialize selection composable with dependencies
const {
  selectedNode,
  selectedIds,
  lastSelectedNode: _lastSelectedNode,
  anchorNode: _anchorNode,
  hasSelection: _hasSelection,
  selectionCount: _selectionCount,
  isSelected: isNodeSelected,
  clearSelection: _clearSelection,
  hoverSelectNode,
  selectNode: _selectNode,
  cancelDetailOpen,
  handleMultiSelect,
  updateSelectedNode: _updateSelectedNode,
  removeFromSelection: _removeFromSelection
} = useSelection({
  showDetail,
  fullscreenDetail,
  openDetailFullscreen,
  flatChildren
})

// Wrap selectNode to respect pin state - don't deselect when pinned
function selectNode(node, options = {}) {
  // If trying to deselect (node is null) but detail is pinned, ignore
  if (!node && detailPinned.value) {
    return
  }
  _selectNode(node, options)
}

// Close detail panel when node is deselected (if not pinned)
watch(selectedNode, (node) => {
  if (!node && !detailPinned.value) {
    showDetail.value = false
  }
})

// Watch for workspace changes - reload data when switching workspaces
watch(currentWorkspace, async () => {
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
  await loadTags()
  // Restore expanded state for this workspace
  loadExpandedState()
})

// Initialize inline editing composable
const {
  editingCardId,
  editingTitle,
  inlineNotesId,
  inlineNotesText,
  inlineNotesRef: _inlineNotesRef,
  startEditing,
  saveEditing,
  cancelEditing,
  handleEditKeydown: _handleEditKeydown,
  startInlineNotes,
  saveInlineNotes,
  cancelInlineNotes,
  handleInlineNotesKeydown: _handleInlineNotesKeydown
} = useInlineEdit({
  findNode: (nodeId) => flatChildren.value.find(n => n.id === nodeId),
  onSaveTitle: async (nodeId, newTitle) => {
    await api.updateNode(nodeId, { title: newTitle })
    await loadChildren(currentContainerId.value)
  },
  onSaveNotes: async (nodeId, newNotes, { autoSave }) => {
    await api.updateNode(nodeId, { notes: newNotes })
    if (!autoSave) {
      await loadChildren(currentContainerId.value)
    }
  }
})

const _contextTitle = computed(() => {
  if (currentContainer.value) {
    return currentContainer.value.title
  }
  return 'Root'
})

// Build inherited color map for cards (parent color flows to children)
const inheritedColorMap = computed(() => {
  const colorMap = {}
  function buildMap(nodeList, inheritedColor = null) {
    if (!nodeList) return
    for (const node of nodeList) {
      if (!node || !node.id) continue
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
    if (ancestor && ancestor.color && ancestor.color !== '#0f4c75') {
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
  if (!nodeList) return []
  if (!hideCompleted.value) return nodeList.filter(Boolean)
  return nodeList
    .filter(node => node && !node.completed && !node.inheritedCompleted)
    .map(node => ({
      ...node,
      children: node.children ? filterChildrenRecursive(node.children) : []
    }))
}

const filteredChildren = computed(() => {
  let result = filterChildrenRecursive(children.value)
  if (sortAlphabetically.value) {
    result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
  }
  return result
})

// Sorted children for graph/timeline views
const sortedChildren = computed(() => {
  if (!sortAlphabetically.value) return children.value
  return [...children.value].sort((a, b) => (a.title || '').localeCompare(b.title || ''))
})

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
    // Child cards - big or small only
    if (parentChildCount <= 2) return 'child-lg'
    return 'child-sm'
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
    const ws = currentWorkspace.value
    // Filter by current workspace
    const roots = await api.getRoots(ws)
    // Filter out any null/undefined entries AND verify workspace match
    // For 'people' workspace (null), match nodes with null workspace_id
    // For other workspaces, match nodes with that workspace_id
    const filteredRoots = (roots || []).filter(root => {
      if (!root) return false
      if (ws === null || ws === 'null') {
        return root.workspace_id === null
      }
      return root.workspace_id === ws
    })
    const rootsWithChildren = await Promise.all(
      filteredRoots.map(async (root) => {
        if (!root || !root.id) return null
        const descendants = await api.getDescendants(root.id)
        // Also filter descendants by workspace for safety
        const filteredDescendants = (descendants || []).filter(d => {
          if (!d) return false
          if (ws === null || ws === 'null') {
            return d.workspace_id === null
          }
          return d.workspace_id === ws
        })
        return {
          ...root,
          children: buildChildTree(filteredDescendants, root.id)
        }
      })
    )
    sidebarTree.value = rootsWithChildren.filter(Boolean)
  } catch (e) {
    console.error('Failed to load sidebar tree:', e)
  }
}

// Get workspace-specific localStorage key for recent cleared timestamp
function getRecentClearedKey() {
  const ws = currentWorkspace.value
  return `graphcore-recentClearedAt-${ws}`
}

async function loadRecentItems() {
  try {
    const items = await api.getRecent(10, currentWorkspace.value)
    const clearedAt = localStorage.getItem(getRecentClearedKey())
    const validItems = (items || []).filter(Boolean)
    if (clearedAt) {
      // Only show items updated after the clear timestamp
      recentItems.value = validItems.filter(item => item && item.updated_at > clearedAt)
    } else {
      recentItems.value = validItems
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

function _undoClearRecent() {
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
      const items = await api.getFavorites(currentWorkspace.value)
      favoriteItems.value = (items || []).filter(Boolean)
    }
  } catch {
    // Silently fail - favorites API may not be available until restart
    favoriteItems.value = []
  }
}

async function loadTags() {
  try {
    const tags = await api.getAllTags(currentWorkspace.value)
    allTags.value = tags || []
  } catch {
    allTags.value = []
  }
}

async function selectTag(tag) {
  // Search for nodes with this tag and show results
  try {
    const results = await api.getNodesByTag(tag, currentWorkspace.value)
    const resultsWithBreadcrumbs = await fetchBreadcrumbsForResults(results)
    searchResults.value = resultsWithBreadcrumbs
    searchQuery.value = `#${tag}`
    showSearch.value = true
    selectedResultIndex.value = 0
  } catch (e) {
    console.error('Failed to search by tag:', e)
  }
}

async function loadTrashedItems() {
  try {
    const items = await api.getTrash(100)
    trashedItems.value = (items || []).filter(Boolean)
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
    const nodes = await api.getOrphanedNodes()
    orphanedNodes.value = (nodes || []).filter(Boolean)
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

let isLoadingChildren = false
let lastLoadTime = 0
let lastLoadedContainerId = null

async function loadChildren(containerId = null, options = {}) {
  const { silent = false } = options
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
  // Only show loading state if not silent (silent mode preserves mounted components)
  const showLoading = !silent
  if (showLoading) {
    loading.value = true
  }
  error.value = null
  try {
    if (containerId === null) {
      // Root level - get all root nodes with their descendants
      const roots = await api.getRoots(currentWorkspace.value)
      // Filter out any null/undefined entries
      const filteredRoots = (roots || []).filter(Boolean)
      // Fetch descendants for each root to build nested structure
      const rootsWithChildren = await Promise.all(
        filteredRoots.map(async (root) => {
          if (!root || !root.id) return null
          const descendants = await api.getDescendants(root.id)
          return {
            ...root,
            children: buildChildTree(descendants, root.id)
          }
        })
      )
      const validRoots = rootsWithChildren.filter(Boolean)
      children.value = validRoots
      sidebarTree.value = validRoots  // Update sidebar
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
      // Filter out any null entries and any ancestor that has same id as container (prevents duplicates)
      breadcrumbs.value = (ancestors || []).filter(a => a && a.id !== container.id)
      if (container) breadcrumbs.value.push(container)

      // Expand sidebar tree to show current path
      expandSidebarToPath(breadcrumbs.value)
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
    if (showLoading) {
      loading.value = false
    }
    isLoadingChildren = false
    lastLoadTime = Date.now()
  }
}

function buildTree(directChildren, allDescendants, parentCompleted = false) {
  if (!directChildren) return []
  return directChildren.filter(Boolean).map(child => {
    if (!child || !child.id) return null
    const inheritedCompleted = parentCompleted || child.completed
    return {
      ...child,
      inheritedCompleted: parentCompleted,  // true if any ancestor is completed
      children: buildChildTree(allDescendants, child.id, inheritedCompleted)
    }
  }).filter(Boolean)
}

function buildChildTree(flatNodes, parentId, parentCompleted = false) {
  if (!flatNodes) return []
  const children = flatNodes.filter(n => n && n.parent_id === parentId)
  return children.map(child => {
    if (!child || !child.id) return null
    const inheritedCompleted = parentCompleted || child.completed
    return {
      ...child,
      inheritedCompleted: parentCompleted,  // true if any ancestor is completed
      children: buildChildTree(flatNodes, child.id, inheritedCompleted)
    }
  }).filter(Boolean)
}

async function enterContainer(node, { skipHistory = false, direction = 'forward' } = {}) {
  // Cancel pending detail panel open (user double-clicked to navigate)
  cancelDetailOpen()

  // Handle both node objects and node IDs
  const nodeId = typeof node === 'object' ? node?.id : node

  // Push current location to history before navigating (unless skipping)
  if (!skipHistory && currentContainerId.value !== nodeId) {
    navigationHistory.value.push(currentContainerId.value)
    // Limit history size
    if (navigationHistory.value.length > MAX_HISTORY_SIZE) {
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
  }, SIDEBAR_HIDE_DELAY_MS)
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

function goToFirstChild() {
  // Navigate to the first child of the current container
  if (children.value.length > 0) {
    enterContainer(children.value[0])
  }
}

async function goToPrevSibling() {
  // Navigate to previous sibling of current container
  if (!currentContainer.value) return // At root, no siblings

  const parentId = currentContainer.value.parent_id
  const siblings = parentId
    ? await api.getChildren(parentId)
    : await api.getRoots(currentWorkspace.value)

  const currentIndex = siblings.findIndex(s => s.id === currentContainer.value.id)
  if (currentIndex > 0) {
    enterContainer(siblings[currentIndex - 1])
  }
}

async function goToNextSibling() {
  // Navigate to next sibling of current container
  if (!currentContainer.value) return // At root, no siblings

  const parentId = currentContainer.value.parent_id
  const siblings = parentId
    ? await api.getChildren(parentId)
    : await api.getRoots(currentWorkspace.value)

  const currentIndex = siblings.findIndex(s => s.id === currentContainer.value.id)
  if (currentIndex >= 0 && currentIndex < siblings.length - 1) {
    enterContainer(siblings[currentIndex + 1])
  }
}

// Selection functions (hoverSelectNode, selectNode, handleMultiSelect) are now in useSelection composable

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
      pushCommand(new ReorderCommand({
        nodeId,
        oldTargetId,
        oldPosition,
        newTargetId: targetId,
        newPosition: position
      }))
    }

    await loadChildren(currentContainerId.value, { silent: true })
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

    // Persons and organizations are treated like ordinary nodes - use parent-child
    const nodeData = {
      title: newNodeTitle.value,
      type: nodeType,
      parent_id: targetParentId,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    // Persons default to neutral color (can inherit from parent)
    const created = await api.createNode(nodeData)
    if (!created || !created.id) {
      throw new Error('Failed to create node')
    }
    pushCommand(new CreateCommand({ nodeId: created.id, nodeData, parentId: targetParentId }))

    // If adding child via card button, expand parent and reload
    if (addChildParentId.value) {
      expandedIds.value.add(addChildParentId.value)
      await loadSidebarTree()
    }

    newNodeTitle.value = ''
    addChildParentId.value = null // Clear the child parent ID
    await loadChildren(currentContainerId.value, { silent: true })
  } catch (e) {
    error.value = e.message
  }
}

async function addChildNode({ parentId, title, type, x, y }) {
  try {
    const nodeType = type || 'task'

    // Persons and organizations are treated like ordinary nodes - use parent-child
    const nodeData = {
      title,
      type: nodeType,
      parent_id: parentId,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    const newNode = await api.createNode(nodeData)
    if (!newNode || !newNode.id) {
      throw new Error('Failed to create child node - no result returned')
    }
    pushCommand(new CreateCommand({ nodeId: newNode.id, nodeData, parentId }))
    // Save position if provided (from graph double-click)
    if (x !== undefined && y !== undefined) {
      const viewId = currentContainerId.value || 'root'
      const ws = currentWorkspace.value || 'work'
      const posKey = `graph-positions-${ws}-${viewId}`
      const positions = JSON.parse(localStorage.getItem(posKey) || '{}')
      positions[newNode.id] = { x, y }
      localStorage.setItem(posKey, JSON.stringify(positions))
    }
    expandedIds.value.add(parentId)
    await loadChildren(currentContainerId.value, { silent: true })
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

// Single place for graph refresh after structure changes (links or parent-child)
// Set reloadData=true for parent-child changes that affect tree structure
async function refreshGraphAfterStructureChange(reloadData = false) {
  if (reloadData) {
    // Load new tree structure without showing loading state (prevents graph remount)
    await loadChildren(currentContainerId.value, { silent: true })
    // Wait for Vue reactivity and graph update to settle
    await nextTick()
    // Don't auto-relax - preserve node positions, user can manually relax if needed
  } else if (graphViewRef.value?.updateGraph) {
    // Just refresh the graph (links don't change tree structure)
    // No relax needed - preserves current view
    await graphViewRef.value.updateGraph()
  }
}

async function moveNode({ nodeId, oldParentId, newParentId }) {
  const success = await nodeOps.moveNode({ nodeId, oldParentId, newParentId })
  if (success) {
    if (newParentId) expandedIds.value.add(newParentId)
    // Use same refresh as links (reloadData=true for parent-child changes)
    await refreshGraphAfterStructureChange(true)
    await loadSidebarTree()
    loadRecentItems()
  }
}

// Handle link events from GraphView (Option+drag)
async function linkNodesFromGraph({ sourceId, targetId }) {
  try {
    await api.linkNodes(sourceId, targetId)
    pushCommand(new LinkCommand({ sourceId, targetId }))
    await refreshGraphAfterStructureChange()
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
    pushCommand(new UnlinkCommand({ sourceId, targetId }))
    // Use same refresh as links
    await refreshGraphAfterStructureChange()
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
  const success = await nodeOps.moveMultipleNodes({ nodeIds, newParentId })
  if (success) {
    if (newParentId) expandedIds.value.add(newParentId)
    // Use same refresh as single moves
    await refreshGraphAfterStructureChange(true)
    await loadSidebarTree()
    loadRecentItems()
    // Clear multi-selection after move
    selectedIds.value.clear()
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
    // Use same refresh for both link and parent-child structure changes
    await refreshGraphAfterStructureChange(true)
    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

async function createNodeAtPosition({ title, type, x, y }) {
  try {
    const nodeType = type || 'task'

    // Persons and organizations are treated like ordinary nodes - use parent-child
    // Double-click far from nodes creates child of current container
    const nodeData = {
      title,
      type: nodeType,
      parent_id: currentContainerId.value,
      workspace_id: getWorkspaceIdForNode(nodeType)
    }
    const newNode = await api.createNode(nodeData)
    // Save position for the new node in current view
    const viewId = currentContainerId.value || 'root'
    const ws = currentWorkspace.value || 'work'
    const posKey = `graph-positions-${ws}-${viewId}`
    const positions = JSON.parse(localStorage.getItem(posKey) || '{}')
    positions[newNode.id] = { x, y }
    localStorage.setItem(posKey, JSON.stringify(positions))

    // Use silent mode to preserve GraphView mount state (and thus zoom/pan)
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()
    selectNode(newNode)
  } catch (e) {
    error.value = e.message
  }
}

async function updateNode(updatedNode, trackUndo = true) {
  const success = await nodeOps.updateNode(updatedNode, { trackUndo })
  if (success) {
    // Use silent mode to avoid triggering full re-render
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()
    loadFavorites()
    loadTags()
  }
}

// Handle detach event from DetailPanel - open node in new window
async function handleDetach(node) {
  if (!node) return
  await openDetachedWindow(node.id, node.title)
}

async function deleteNode(nodeId) {
  // Check navigation needs before deletion
  const node = await api.getNode(nodeId)
  if (!node) return

  const descendants = await api.getDescendants(nodeId) || []
  const allIds = new Set([node, ...descendants].map(n => String(n.id)))
  const needsNavigation = allIds.has(String(currentContainerId.value)) ||
    breadcrumbs.value.some(b => allIds.has(String(b.id)))

  const result = await nodeOps.deleteNode(nodeId)
  if (result.success) {
    showDetail.value = false
    selectedNode.value = null

    // Navigate to parent if we deleted the current container or a node in the breadcrumbs
    if (needsNavigation) {
      if (node.parent_id) {
        await enterContainer({ id: node.parent_id })
      } else {
        // Deleted a root node - go to workspace root
        currentContainerId.value = null
        breadcrumbs.value = []
        await loadChildren(null, { silent: true })
      }
    } else {
      await loadChildren(currentContainerId.value, { silent: true })
    }

    await loadSidebarTree()
    loadRecentItems()
  }
}

async function deleteMultipleNodes(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return

  // Confirm deletion of multiple nodes
  if (nodeIds.length > 1) {
    if (!confirm(`Delete ${nodeIds.length} nodes? (Cmd+Z to undo)`)) return
  }

  // Check if we need to navigate back after deletion (convert to strings for comparison)
  const nodeIdSet = new Set(nodeIds.map(String))
  const needsNavigation = nodeIdSet.has(String(currentContainerId.value)) ||
    breadcrumbs.value.some(b => nodeIdSet.has(String(b.id)))

  const result = await nodeOps.deleteMultipleNodes(nodeIds)
  if (result.success) {
    showDetail.value = false
    selectedNode.value = null

    // Navigate back if we deleted the current container or a node in the breadcrumbs
    if (needsNavigation) {
      navigateBack()
    } else {
      await loadChildren(currentContainerId.value, { silent: true })
    }

    await loadSidebarTree()
    loadRecentItems()
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

    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()

    // Refresh selected node if it was the wrapped node
    if (selectedNode.value?.id === nodeId) {
      const updatedNode = flatChildren.value.find(n => n.id === nodeId)
      if (updatedNode) {
        selectedNode.value = updatedNode
      }
    }
  } catch (e) {
    error.value = e.message
  }
}

async function moveNodeToRoot(nodeId) {
  const success = await nodeOps.moveNodeToRoot(nodeId)
  if (success) {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()
  }
}

async function toggleComplete(node) {
  const success = await nodeOps.toggleComplete(node)
  if (success) {
    await loadChildren(currentContainerId.value, { silent: true })
    tasksViewRef.value?.loadTasks()
  }
}

async function toggleFavorite(node) {
  const success = await nodeOps.toggleFavorite(node)
  if (success) {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadFavorites()
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
    } catch {
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
  const query = searchQuery.value.trim()
  if (!query) {
    searchResults.value = []
    return
  }

  try {
    let results
    const searchOptions = { hideCompleted: hideCompleted.value }
    // Check for tag search: #tagname
    if (query.startsWith('#') && query.length > 1) {
      const tagName = query.slice(1)
      results = await api.getNodesByTag(tagName, currentWorkspace.value, searchOptions)
    } else {
      // Regular search within current workspace
      results = await api.search(query, null, currentWorkspace.value, searchOptions)
    }

    // Fetch breadcrumbs for all results
    const resultsWithBreadcrumbs = await fetchBreadcrumbsForResults(results)
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
      pushCommand(new LinkCommand({ sourceId, targetId: node.id }))
      // Refresh graph to show new link (without relayout)
      await refreshGraphAfterStructureChange()
      // Refresh the selected node to update links
      if (selectedNode.value?.id === sourceId) {
        const updatedNode = await api.getNode(sourceId)
        selectedNode.value = updatedNode
        detailPanelRef.value?.loadLinkedNodes()
      }
    } catch (e) {
      console.error('Failed to create link:', e)
    }
    return
  }

  closeSearch()

  // Check if node is visible in current graph view (as child, descendant, or linked node)
  const isVisibleInCurrentView = viewMode.value === 'graph' &&
    graphViewRef.value?.isNodeVisible?.(node.id)

  if (isVisibleInCurrentView) {
    // Node is already visible - just select and center on it
    selectNode(node)
    await nextTick()
    window.dispatchEvent(new CustomEvent('graph-center-node', { detail: { nodeId: node.id } }))
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

// Card drag functions (onCardDragStart, onCardDragEnd, onCardDragOver, onCardDragLeave, onCardDrop, getCardDropClass)
// are now provided by useCardDrag composable initialized above

function handleCardClick(e, node) {
  const hasCmd = e.ctrlKey || e.metaKey
  const hasAlt = e.altKey

  if (hasCmd && hasAlt) {
    // Option+Cmd+click: delete the node
    deleteNode(node.id)
  } else if (hasCmd) {
    // Cmd+click: add child node
    addChildToCard(node.id, e)
  } else if (e.shiftKey) {
    // Range selection
    handleMultiSelect({ node, range: true })
  } else {
    // Normal click - select and open detail panel
    selectNode(node)
  }
}

function handleChildCardClick(e, node) {
  const hasCmd = e.ctrlKey || e.metaKey
  const hasAlt = e.altKey

  if (hasCmd && hasAlt) {
    // Option+Cmd+click: delete the node
    deleteNode(node.id)
  } else if (hasCmd) {
    // Cmd+click: add child node
    addChildToCard(node.id, e)
  } else if (e.shiftKey) {
    // Range selection
    handleMultiSelect({ node, range: true })
  } else {
    // Normal click - select and open detail panel
    selectNode(node)
  }
}

function isCardSelected(nodeId) {
  return isNodeSelected(nodeId)
}

// Context menu - using composable
const {
  contextMenu,
  showContextMenu,
  closeContextMenu,
  handleViewDetails: handleContextMenuViewDetails,
  handleEnter: handleContextMenuEnter,
  handleAddChild: handleContextMenuAddChild,
  handleToggleComplete: handleContextMenuToggleComplete,
  handleToggleFavorite: handleContextMenuToggleFavorite,
  handleOpenLinkSearch: handleContextMenuOpenLinkSearch,
  handleUnlink: handleContextMenuUnlink,
  handleMoveToWorkspace: handleContextMenuMoveToWorkspace,
  handleDelete: handleContextMenuDelete,
  handleViewContextMenu
} = useContextMenu({
  onLoadLinks: (nodeId) => api.getLinkedNodes(nodeId),
  onViewDetails: (node) => selectNode(node),
  onEnter: (node) => enterContainer(node),
  onAddChild: (node) => showAddNodeModal(node.id),
  onToggleComplete: (node) => toggleComplete(node),
  onToggleFavorite: (node) => toggleFavorite(node),
  onOpenLinkSearch: (node) => openLinkSearch(node),
  onUnlink: (sourceId, targetId) => api.unlinkNodes(sourceId, targetId),
  onMoveToWorkspace: async (nodeId, workspaceId) => {
    await api.updateNode(nodeId, { workspace_id: workspaceId })
    await loadChildren()
  },
  onDelete: (nodeId) => deleteNode(nodeId),
  onRefreshSelectedNode: async (sourceId) => {
    if (showDetail.value && selectedNode.value?.id === sourceId) {
      const updated = await api.getNode(sourceId)
      if (updated) selectedNode.value = updated
    }
  }
})

// Inline editing functions (startEditing, saveEditing, cancelEditing, handleEditKeydown,
// startInlineNotes, saveInlineNotes, cancelInlineNotes, handleInlineNotesKeydown)
// are now provided by useInlineEdit composable initialized above

function _renderMarkdown(text) {
  if (!text) return ''
  return marked.parse(text)
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
  // Close detail panel to focus on creating new node
  showDetail.value = false
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

function _toggleSensitiveVisibility() {
  hideSensitive.value = !hideSensitive.value
  localStorage.setItem('graphcore-hideSensitive', hideSensitive.value.toString())
}

// Check if a node has sensitive content
function isSensitiveNode(node) {
  return !!node.notes_sensitive
}

function _hasNotes(node) {
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
 * - Cmd/Ctrl + ArrowUp: Navigate to parent container
 * - Cmd/Ctrl + ArrowDown: Navigate to first child
 * - Cmd/Ctrl + ArrowLeft: Navigate to previous sibling
 * - Cmd/Ctrl + ArrowRight: Navigate to next sibling
 * - Escape: Exit fullscreen or clear selection
 *
 * Click modifiers (all views):
 * - Cmd/Ctrl + Click: Add child to clicked item
 * - Option + Cmd/Ctrl + Click: Delete clicked item
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

  // Cmd/Ctrl + Arrow keys - navigation (works in all views)
  if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
    e.preventDefault()
    goToParent()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
    e.preventDefault()
    goToFirstChild()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
    e.preventDefault()
    goToPrevSibling()
    return
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
    e.preventDefault()
    goToNextSibling()
    return
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

  // n - create new node (add to current container or selected node)
  if (e.key === 'n') {
    e.preventDefault()
    const parentId = selectedNode.value?.id || currentContainerId.value
    showAddNodeModal(parentId)
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
  const result = await nodeOps.deleteMultipleNodes(idsToDelete)
  if (result.success) {
    selectedIds.value = new Set()
    selectedNode.value = null
    showDetail.value = false
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
    loadRecentItems()
  }
}

onMounted(async () => {
  // Load available workspaces first
  await loadWorkspaces()

  // Restore last container or start at root
  const initialContainerId = savedContainerId.value ? parseInt(savedContainerId.value, 10) : null
  try {
    await loadChildren(initialContainerId)
  } catch {
    // If saved container no longer exists, fall back to root
    console.warn('Saved container not found, loading root')
    await loadChildren(null)
  }

  // Restore expanded state from localStorage
  loadExpandedState()

  // Load recent items, favorites, and tags for sidebar
  loadRecentItems()
  loadFavorites()
  loadTags()

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
      await loadChildren(currentContainerId.value, { silent: true })
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
      await loadChildren(currentContainerId.value, { silent: true })
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
                @contextmenu.prevent="showContextMenu($event, node)"
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
                    @contextmenu.prevent="showContextMenu($event, child)"
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
                      @contextmenu.prevent="showContextMenu($event, grandchild)"
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

        <!-- Tags -->
        <div v-if="allTags.length > 0" class="sidebar-section collapsible-section">
          <div class="sidebar-section-header" @click="sidebarTagsCollapsed = !sidebarTagsCollapsed">
            <span class="collapse-btn">{{ sidebarTagsCollapsed ? '+' : '-' }}</span>
            <span>Tags</span>
            <span class="section-count">{{ allTags.length }}</span>
          </div>
          <div v-show="!sidebarTagsCollapsed" class="sidebar-tags">
            <div
              v-for="tag in allTags"
              :key="'tag-' + tag"
              class="sidebar-item tag-item"
              @click="selectTag(tag)"
            >
              <span class="tag-hash">#</span>
              <span class="label">{{ tag }}</span>
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
              <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
                {{ ws.name }}
              </option>
            </select>
            <button v-if="!showNewWorkspaceInput" class="workspace-add-btn" @click="openNewWorkspaceDialog" title="Create new workspace">+</button>
            <button
              v-if="!showNewWorkspaceInput && workspaces.length > 1"
              class="workspace-delete-btn"
              @click="deleteCurrentWorkspace"
              title="Delete current workspace"
            >-</button>
            <div v-if="showNewWorkspaceInput" class="workspace-input-wrapper">
              <input
                v-model="newWorkspaceName"
                class="workspace-input"
                placeholder="Workspace name"
                @keyup.enter="createNewWorkspace"
                @keyup.escape="showNewWorkspaceInput = false"
                ref="newWorkspaceInputRef"
              />
              <button class="workspace-add-btn" @click="createNewWorkspace">OK</button>
              <button class="workspace-add-btn" @click="showNewWorkspaceInput = false">X</button>
            </div>
          </div>

          <div class="toolbar">
          <button class="icon-btn" :class="{ primary: viewMode === 'graph' }" @click="viewMode = 'graph'" title="Graph">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="18" r="3"/>
              <line x1="8.5" y1="7.5" x2="10.5" y2="16"/><line x1="15.5" y1="7.5" x2="13.5" y2="16"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'cards' }" @click="viewMode = 'cards'" title="Cards">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'tree' }" @click="viewMode = 'tree'" title="Table">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'tasks' }" @click="viewMode = 'tasks'" title="Tasks">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="5" width="4" height="4" rx="1"/><line x1="10" y1="7" x2="21" y2="7"/>
              <rect x="3" y="15" width="4" height="4" rx="1"/><line x1="10" y1="17" x2="21" y2="17"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'timeline' }" @click="viewMode = 'timeline'" title="Timeline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'persons' }" @click="viewMode = 'persons'" title="People">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/>
              <circle cx="17" cy="7" r="3"/><path d="M21 21v-2a3 3 0 0 0-2-2.8"/>
            </svg>
          </button>
          <button class="icon-btn" :class="{ primary: viewMode === 'trash' }" @click="viewMode = 'trash'" title="Trash">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
          <span class="toolbar-separator"></span>
          <button
            :class="{ active: sortAlphabetically }"
            @click="sortAlphabetically = !sortAlphabetically"
            title="Sort current level A-Z"
          >
            A-Z
          </button>
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
          <div class="settings-dropdown" v-click-outside="(e) => { if (!e.target.closest('.settings-panel')) showSettings = false }">
            <button class="settings-btn" @click="showSettings = !showSettings" title="Settings">
              <span>...</span>
            </button>
            <Teleport to="body">
              <div v-if="showSettings" class="settings-panel" @click.stop>
              <div class="settings-item">
                <label>Graph detail threshold</label>
                <input type="number" v-model.number="graphDetailThreshold" min="5" max="100" @change="window.localStorage.setItem('graphcore-graphDetailThreshold', String(graphDetailThreshold))" />
                <span class="settings-hint">Show details when &le; {{ graphDetailThreshold }} nodes</span>
              </div>
              <div class="settings-item">
                <label>Graph max depth <span class="slider-value">{{ graphMaxDepth === 0 ? 'All' : graphMaxDepth }}</span></label>
                <input type="range" v-model.number="graphMaxDepth" min="0" max="20" step="1" class="settings-slider" />
                <span class="settings-hint">{{ graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels` }}</span>
              </div>
              <div class="settings-item">
                <label>Root graph depth <span class="slider-value">{{ graphRootMaxDepth === 0 ? 'All' : graphRootMaxDepth }}</span></label>
                <input type="range" v-model.number="graphRootMaxDepth" min="0" max="10" step="1" class="settings-slider" />
                <span class="settings-hint">{{ graphRootMaxDepth === 0 ? 'Show all levels at root' : `Show ${graphRootMaxDepth} levels at root` }}</span>
              </div>
              <div class="settings-item">
                <label>
                  <input type="checkbox" v-model="openDetailFullscreen" />
                  Open details fullscreen
                </label>
                <span class="settings-hint">Open detail panel in fullscreen mode by default</span>
              </div>
              <div class="settings-item">
                <label>
                  <input type="checkbox" v-model="hoverPreviewEnabled" @change="window.localStorage.setItem('graphcore-hoverPreview', hoverPreviewEnabled)" />
                  Hover preview
                </label>
                <span class="settings-hint">Show preview tooltip when hovering over nodes</span>
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
            </Teleport>
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
            <div class="breadcrumb-path">
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
            </div>
            <div id="view-controls-target"></div>
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
          :nodes="sortedChildren"
          :selected-id="selectedNode?.id"
          :selected-ids="selectedIds"
          :expanded-ids="expandedIds"
          :hide-completed="hideCompleted"
          :hide-sensitive="hideSensitive"
          :show-detail="showDetail"
          :current-parent-id="currentContainerId"
          :current-container="currentContainer"
          :color-map="inheritedColorMap"
          :hover-preview-enabled="hoverPreviewEnabled"
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
        <div v-else-if="viewMode === 'cards'" class="node-cards" :style="cardsGridStyle" @click.self="selectNode(null)">
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
                <!-- Notes for big child cards (not sensitive) -->
                <div v-if="child.notes && !child.notes_sensitive" class="child-card-notes">{{ decodeHtml(child.notes) }}</div>
                <!-- Grandchildren - compact single-line list -->
                <div
                  v-if="child.children?.length"
                  class="grandchild-list"
                  @click.stop
                >
                  <div
                    v-for="grandchild in child.children"
                    :key="grandchild.id"
                    class="grandchild-item"
                    :class="[grandchild.type, { selected: isCardSelected(grandchild.id), completed: grandchild.completed }]"
                    @click.stop="selectNode(grandchild)"
                    @dblclick.stop="enterContainer(grandchild)"
                    @contextmenu.prevent="showContextMenu($event, grandchild)"
                  >
                    <input
                      v-if="grandchild.type === 'task'"
                      type="checkbox"
                      class="grandchild-check"
                      :checked="grandchild.completed"
                      @click.stop
                      @change.stop="toggleComplete(grandchild)"
                    />
                    <span class="grandchild-title" :class="{ completed: grandchild.completed }">{{ grandchild.title }}</span>
                    <span v-if="grandchild.notes && !grandchild.notes_sensitive" class="grandchild-notes">{{ decodeHtml(grandchild.notes) }}</span>
                    <span v-if="grandchild.children?.length" class="grandchild-count">{{ grandchild.children.length }}</span>
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
          :nodes="sortedChildren"
          :parent="currentContainer"
          :selected-id="selectedNode?.id"
          :selected-ids="[...selectedIds]"
          :detail-threshold="graphDetailThreshold"
          :max-depth="effectiveGraphMaxDepth"
          :hide-completed="hideCompleted"
          :hide-sensitive="hideSensitive"
          :workspace="currentWorkspace"
          :workspaces="workspaces"
          :show-detail="showDetail"
          :fullscreen-detail-open="fullscreenDetail"
          :hover-preview-enabled="hoverPreviewEnabled"
          :sort-alphabetically="sortAlphabetically"
          @select="selectNode"
          @select-multiple="handleMultiSelect"
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
          @go-parent="goToParent"
          @go-first-child="goToFirstChild"
          @go-prev-sibling="goToPrevSibling"
          @go-next-sibling="goToNextSibling"
        />

        <!-- Timeline View -->
        <TimelineView
          v-else-if="viewMode === 'timeline'"
          :nodes="sortedChildren"
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
          :workspace-id="currentWorkspace"
          @select="selectNode"
          @delete="deleteNode"
          @context-menu="handleViewContextMenu"
        />

        <!-- Tasks View -->
        <TasksView
          v-else-if="viewMode === 'tasks'"
          ref="tasksViewRef"
          :workspace-id="currentWorkspace"
          :hide-sensitive="hideSensitive"
          :container-id="currentContainerId"
          :container-title="currentContainer?.title"
          @navigate="navigateToNode"
          @toggle-complete="toggleComplete"
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
        <Transition name="detail-panel">
        <DetailPanel
          v-if="showDetail && selectedNode"
          ref="detailPanelRef"
          @click.stop
          :node="selectedNode"
          :width="detailWidth"
          :fullscreen="fullscreenDetail"
          :hide-completed="hideCompleted"
          :pinned="detailPinned"
          :workspaces="workspaces"
          :current-workspace="currentWorkspace"
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
        </Transition>
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
                <div v-if="result.notes" class="result-notes">{{ decodeHtml(result.notes).substring(0, 80) }}{{ result.notes.length > 80 ? '...' : '' }}</div>
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

          <div class="spotlight-recents" v-else-if="recentItems.length > 0">
            <div class="spotlight-results-header">
              Recent
              <span class="clear-recents" @click="clearRecent">clear</span>
            </div>
            <div
              v-for="(item, index) in recentItems.slice(0, 10)"
              :key="'recent-' + item.id"
              class="spotlight-result"
              :class="{ selected: index === selectedResultIndex }"
              @click="goToSearchResult(item)"
              @mouseenter="selectedResultIndex = index"
            >
              <div class="result-type-badge" :class="item.type">
                <span v-html="getTypeIcon(item.type)"></span>
              </div>
              <div class="result-body">
                <div class="result-title">{{ item.title }}</div>
              </div>
            </div>
          </div>

          <div class="spotlight-hint-footer" v-else>
            <div class="hint-text">Type to search all nodes</div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Toast notifications -->
    <ToastContainer />
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
  flex-direction: column;
  gap: 8px;
  font-size: 1.1rem;
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--bg-primary);
}

@container (min-width: 900px) {
  .header-breadcrumbs {
    flex-direction: row;
    align-items: center;
  }
}

.breadcrumb-path {
  display: flex;
  align-items: center;
  gap: 6px;
}

#view-controls-target:empty {
  display: none;
}

#view-controls-target {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-left: auto;
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
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.node-card-notes-area.no-children .inline-notes-display {
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
.node-card-notes-area.compact.no-children .inline-notes-display {
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
.node-card.card-xl .inline-notes-display { font-size: 12px; }
.node-card.card-lg .inline-notes-display { font-size: 11px; }
.node-card.card-md .inline-notes-display { font-size: 10px; }

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
  color: #ffffff !important;
}

.node-card a,
.child-card a,
.node-cards a {
  color: #ffffff !important;
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
  padding: 3px 6px;
  min-height: 24px;
}

.child-card.child-sm .child-card-title {
  font-size: 10px;
}

.child-card.child-sm .child-card-header {
  gap: 4px;
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
.result-type.component { background: var(--type-component-bg); color: var(--type-component-text); }

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

/* Toolbar separator */
.toolbar-separator {
  width: 1px;
  height: 18px;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(255, 255, 255, 0.1) 30%,
    rgba(255, 255, 255, 0.1) 70%,
    transparent 100%
  );
  margin: 0 6px;
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

.workspace-add-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-left: 6px;
  transition: all 0.15s;
}

.workspace-add-btn:hover {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.workspace-delete-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  margin-left: 2px;
  transition: all 0.15s;
}

.workspace-delete-btn:hover {
  background: #c53030;
  border-color: #c53030;
  color: white;
}

.workspace-input-wrapper {
  display: flex;
  gap: 4px;
  align-items: center;
}

.workspace-input {
  background: var(--bg-secondary);
  border: 1px solid var(--accent-color);
  color: var(--text-primary);
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 13px;
  width: 150px;
  outline: none;
}

/* View mode icon buttons */
.icon-btn {
  padding: 7px 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: 6px;
  position: relative;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.icon-btn:active {
  transform: scale(0.95);
}

.icon-btn.primary {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.icon-btn.primary svg {
  filter: drop-shadow(0 0 4px var(--accent-color));
}

.icon-btn.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.icon-btn svg {
  display: block;
  stroke-linecap: round;
  stroke-linejoin: round;
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
  position: fixed;
  top: 50px;
  right: 10px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  min-width: 250px;
  max-height: calc(100vh - 70px);
  overflow-y: auto;
  z-index: 10000;
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

.settings-slider {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--border-color);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}

.settings-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
}

.settings-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--accent-color);
  border-radius: 50%;
  border: none;
  cursor: pointer;
}

.slider-value {
  color: var(--accent-color);
  font-weight: 600;
  margin-left: 4px;
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

.clear-recents {
  font-size: 10px;
  color: #666;
  cursor: pointer;
  text-transform: lowercase;
}

.clear-recents:hover {
  color: #e74c3c;
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
.result-type-badge.component { background: var(--type-component-bg); color: var(--type-component-text); }

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
