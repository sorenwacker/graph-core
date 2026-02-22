<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { api } from './services/api.js'
import { handleExternalLinkClick } from './utils/markdown.js'
import { scrollToNode } from './utils/dom.js'
import { useNodeTooltip } from './composables/useNodeTooltip.js'
import { useDetachedWindow } from './composables/useDetachedWindow.js'
import { useSelection } from './composables/useSelection.js'
import { useCardDrag } from './composables/useCardDrag.js'
import { useSearch } from './composables/useSearch.js'
import { useInlineEdit } from './composables/useInlineEdit.js'
import { useSnapshots } from './composables/useSnapshots.js'
import { useContextMenu } from './composables/useContextMenu.js'
import { useDetailResize } from './composables/useDetailResize.js'
import { useUndoRedo } from './composables/useUndoRedo.js'
import { useSettings } from './composables/useSettings.js'
import { useWorkspace } from './composables/useWorkspace.js'
import { useSidebar } from './composables/useSidebar.js'
import { useNodeOperations } from './composables/useNodeOperations.js'
import { useDataLoading } from './composables/useDataLoading.js'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'
import { useTreeExpand } from './composables/useTreeExpand.js'
import { useCardsLayout } from './composables/useCardsLayout.js'
import {
  CreateCommand,
  LinkCommand,
  UnlinkCommand,
  ReorderCommand
} from './commands/index.js'
import { MAX_HISTORY_SIZE, SIDEBAR_HIDE_DELAY_MS } from './utils/uiConstants.js'
import DetailPanel from './components/DetailPanel.vue'
import GraphView from './components/GraphView.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import CalendarView from './components/CalendarView.vue'
import PersonsView from './components/PersonsView.vue'
import TasksView from './components/TasksView.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ToastContainer from './components/ToastContainer.vue'
import CardsView from './components/CardsView.vue'
import AppSidebar from './components/AppSidebar.vue'
import WorkspaceSelector from './components/WorkspaceSelector.vue'
import AddNodeBar from './components/AddNodeBar.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import MainToolbar from './components/MainToolbar.vue'
import TrashView from './components/TrashView.vue'
import SpotlightSearch from './components/SpotlightSearch.vue'
import { showToast } from './composables/useToast.js'

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
const transitioning = ref(false)
const transitionDirection = ref('forward')
const containerWidth = ref(800)
const containerHeight = ref(600)

// Sidebar UI state via composable
const {
  hovered: sidebarHovered,
  expandedIds: sidebarExpandedIds,
  visible: sidebarVisible,
  onEnter: onSidebarEnter,
  onLeave: onSidebarLeave,
  toggleExpand: toggleSidebarExpand,
  expandToPath: expandSidebarToPath
} = useSidebar({ pinned: sidebarPinned })

// Context menu state is managed by useContextMenu composable (initialized after functions it needs)

// Workspace management
const {
  currentWorkspace,
  workspaces,
  loadWorkspaces,
  createWorkspace: createNewWorkspace,
  deleteCurrentWorkspace: _deleteCurrentWorkspace,
  getWorkspaceIdForNode
} = useWorkspace({ api })

// Wrap deleteCurrentWorkspace to add confirmation dialog
async function deleteCurrentWorkspace() {
  const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
  if (!ws) return

  const confirmed = confirm(`Delete workspace "${ws.name}"?`)
  if (!confirmed) return

  await _deleteCurrentWorkspace()
}

// Data loading via composable (sidebar tree, recent, favorites, tags, trash, orphans)
const {
  sidebarTree,
  recentItems,
  favoriteItems,
  allTags,
  trashedItems,
  orphanedNodes,
  showLostFound,
  buildChildTree,
  loadSidebarTree,
  loadRecentItems,
  loadFavorites,
  loadTags,
  loadTrashedItems,
  loadOrphanedNodes,
  clearRecent,
  restoreFromTrash,
  permanentlyDelete,
  emptyAllTrash,
  moveToRoot,
  deleteOrphanedNode
} = useDataLoading(currentWorkspace)

async function selectTag(tag) {
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

// Detail panel resize - managed by useDetailResize composable
const {
  detailWidth,
  isResizing: isResizingDetail,
  onResizeStart: onDetailResizeStart
} = useDetailResize()

const closeDetail = () => { showDetail.value = false; fullscreenDetail.value = false; detailPinned.value = false }

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

// Cards layout - filtering, grid computation, and color inheritance
const {
  filteredChildren,
  sortedChildren,
  cardSizeClass,
  cardsGridStyle,
  inheritedColorMap
} = useCardsLayout({
  children,
  hideCompleted,
  sortAlphabetically,
  containerWidth,
  containerHeight,
  breadcrumbs,
  currentContainer
})

// Snapshot/backup management - using composable
// Note: callbacks reference functions defined below (works due to closure)
const {
  availableSnapshots,
  showSnapshotList,
  snapshotMessage,
  loadSnapshots,
  createSnapshot,
  restoreSnapshot,
  reloadDatabase
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

// Component refs
const graphViewRef = ref(null)
const tasksViewRef = ref(null)
const detailPanelRef = ref(null)
const addChildParentId = ref(null) // Parent ID when adding via card + button

// Add node modal state
const addNodeModal = ref({
  visible: false,
  parentId: null
})

// Undo/redo using Command pattern
const {
  undoStack,
  redoStack,
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

// Cards drag state - using composable
const {
  dropTarget,
  dropPosition,
  onDragStart: onCardDragStart,
  onDragEnd: onCardDragEnd,
  onDragOver: onCardDragOver,
  onDragLeave: onCardDragLeave,
  onDrop: onCardDrop
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

// Tree expand/collapse state via composable
const {
  expandedIds,
  toggleExpand,
  expandAll,
  collapseAll,
  expandAncestors,
  loadExpandedState
} = useTreeExpand({
  workspace: currentWorkspace,
  flatChildren
})

// Initialize selection composable with dependencies
const {
  selectedNode,
  selectedIds,
  hoverSelectNode,
  selectNode: _selectNode,
  cancelDetailOpen,
  handleMultiSelect
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

// Search composable - handles spotlight search state and navigation
const {
  searchQuery,
  searchResults,
  showSearch,
  selectedResultIndex,
  searchMode,
  openSearch,
  openLinkSearch,
  closeSearch,
  onSearchInput: _onSearchInput,
  handleSearchKeydown,
  goToSearchResult: _goToSearchResult
} = useSearch({
  selectedNode,
  onSearch: async (query, mode, workspaceId) => {
    const searchOptions = { hideCompleted: hideCompleted.value }
    if (query.startsWith('#') && query.length > 1) {
      const tagName = query.slice(1)
      return await api.getNodesByTag(tagName, workspaceId, searchOptions)
    } else {
      return await api.search(query, null, workspaceId, searchOptions)
    }
  },
  onSelect: async (node, mode, sourceId) => {
    // Handle link mode - create link instead of navigating
    if (mode === 'link' && sourceId) {
      try {
        await api.linkNodes(sourceId, node.id)
        pushCommand(new LinkCommand({ sourceId, targetId: node.id }))
        await refreshGraphAfterStructureChange()
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

    // Check if node is visible in current graph view
    const isVisibleInCurrentView = viewMode.value === 'graph' &&
      graphViewRef.value?.isNodeVisible?.(node.id)

    if (isVisibleInCurrentView) {
      selectNode(node)
      await nextTick()
      window.dispatchEvent(new CustomEvent('graph-center-node', { detail: { nodeId: node.id } }))
      return
    }

    // Navigate to the container that holds this node
    const targetContainerId = node.parent_id || null
    if (currentContainerId.value !== targetContainerId) {
      await loadChildren(targetContainerId)
    }

    // Expand tree to show the node if in tree view
    if (viewMode.value === 'tree') {
      expandAncestors(node.id)
    }

    selectNode(node)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))

    if (viewMode.value === 'graph') {
      window.dispatchEvent(new CustomEvent('graph-center-node', { detail: { nodeId: node.id } }))
    } else {
      scrollToNode(node.id)
    }
  },
  onFetchBreadcrumbs: fetchBreadcrumbsForResults
})

// Wrap search input to pass current workspace
function onSearchInput() {
  _onSearchInput(currentWorkspace.value)
}

// Close detail panel when node is deselected (if not pinned)
watch(selectedNode, (node) => {
  if (!node && !detailPinned.value) {
    showDetail.value = false
  }
})

// Reset and reload when switching workspaces
watch(currentWorkspace, async () => {
  currentContainerId.value = null
  currentContainer.value = null
  breadcrumbs.value = []
  selectedNode.value = null
  selectedIds.value = new Set()
  showDetail.value = false
  await loadChildren(null)
  await loadSidebarTree()
  await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])
  loadExpandedState()
})

// Initialize inline editing composable
const {
  editingCardId,
  editingTitle,
  inlineNotesId,
  inlineNotesText,
  startEditing,
  saveEditing,
  cancelEditing,
  startInlineNotes,
  saveInlineNotes,
  cancelInlineNotes
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

async function goToSibling(direction) {
  if (!currentContainer.value) return
  const parentId = currentContainer.value.parent_id
  const siblings = parentId
    ? await api.getChildren(parentId)
    : await api.getRoots(currentWorkspace.value)
  const currentIndex = siblings.findIndex(s => s.id === currentContainer.value.id)
  const targetIndex = currentIndex + direction
  if (targetIndex >= 0 && targetIndex < siblings.length) {
    enterContainer(siblings[targetIndex])
  }
}

const goToPrevSibling = () => goToSibling(-1)
const goToNextSibling = () => goToSibling(1)

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

    await refreshAfterChange()
  } catch (e) {
    error.value = e.message
  }
}

// Helper to save node position for graph view
function saveNodePosition(nodeId, x, y) {
  if (x === undefined || y === undefined) return
  const viewId = currentContainerId.value || 'root'
  const ws = currentWorkspace.value || 'work'
  const posKey = `graph-positions-${ws}-${viewId}`
  const positions = JSON.parse(localStorage.getItem(posKey) || '{}')
  positions[nodeId] = { x, y }
  localStorage.setItem(posKey, JSON.stringify(positions))
}

// Core node creation - used by all create functions
async function createNodeCore({ title, type, parentId, x, y }) {
  const nodeType = type || 'task'
  const nodeData = {
    title,
    type: nodeType,
    parent_id: parentId,
    workspace_id: getWorkspaceIdForNode(nodeType)
  }
  const newNode = await api.createNode(nodeData)
  if (!newNode || !newNode.id) {
    throw new Error('Failed to create node')
  }
  pushCommand(new CreateCommand({ nodeId: newNode.id, nodeData, parentId }))
  saveNodePosition(newNode.id, x, y)
  return newNode
}

async function createNode() {
  if (!newNodeTitle.value.trim()) return

  try {
    const targetParentId = addChildParentId.value || currentContainerId.value
    await createNodeCore({
      title: newNodeTitle.value,
      type: newNodeType.value,
      parentId: targetParentId
    })

    if (addChildParentId.value) {
      expandedIds.value.add(addChildParentId.value)
      await loadSidebarTree()
    }

    newNodeTitle.value = ''
    addChildParentId.value = null
    await loadChildren(currentContainerId.value, { silent: true })
  } catch (e) {
    error.value = e.message
  }
}

async function addChildNode({ parentId, title, type, x, y }) {
  try {
    await createNodeCore({ title, type, parentId, x, y })
    expandedIds.value.add(parentId)
    await refreshAfterChange({ sidebar: false, recent: false })
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

// Consolidated refresh after data changes
async function refreshAfterChange({ silent = true, sidebar = true, recent = true } = {}) {
  await loadChildren(currentContainerId.value, { silent })
  if (sidebar) await loadSidebarTree()
  if (recent) loadRecentItems()
}

// Single place for graph refresh after structure changes (links or parent-child)
async function refreshGraphAfterStructureChange(reloadData = false) {
  if (reloadData) {
    await loadChildren(currentContainerId.value, { silent: true })
    await nextTick()
  } else if (graphViewRef.value?.updateGraph) {
    await graphViewRef.value.updateGraph()
  }
}

// Refresh detail panel if it's showing one of the linked nodes
async function refreshDetailPanelLinks(sourceId, targetId) {
  if (selectedNode.value?.id === sourceId || selectedNode.value?.id === targetId) {
    selectedNode.value = await api.getNode(selectedNode.value.id)
    detailPanelRef.value?.loadLinkedNodes()
    detailPanelRef.value?.loadLinkedOrganizations()
    detailPanelRef.value?.loadLinkedMembers()
  }
}

async function moveNode({ nodeId, oldParentId, newParentId }) {
  const success = await nodeOps.moveNode({ nodeId, oldParentId, newParentId })
  if (success) {
    if (newParentId) expandedIds.value.add(newParentId)
    await refreshAfterChange()
  }
}

// Handle link events from GraphView (Option+drag)
async function linkNodesFromGraph({ sourceId, targetId }) {
  try {
    await api.linkNodes(sourceId, targetId)
    pushCommand(new LinkCommand({ sourceId, targetId }))
    await refreshGraphAfterStructureChange()
    await refreshDetailPanelLinks(sourceId, targetId)
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
    await refreshGraphAfterStructureChange()
    await refreshDetailPanelLinks(sourceId, targetId)
  } catch (e) {
    console.error('Failed to unlink nodes:', e)
    error.value = e.message
  }
}

async function moveMultipleNodes({ nodeIds, newParentId }) {
  const success = await nodeOps.moveMultipleNodes({ nodeIds, newParentId })
  if (success) {
    if (newParentId) expandedIds.value.add(newParentId)
    await refreshAfterChange()
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
    await refreshAfterChange()
  } catch (e) {
    error.value = e.message
  }
}

async function createNodeAtPosition({ title, type, x, y }) {
  try {
    const newNode = await createNodeCore({
      title,
      type,
      parentId: currentContainerId.value,
      x,
      y
    })
    await refreshAfterChange()
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
    await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])
  }
}

// Handle detach event from DetailPanel - open node in new window
async function handleDetach(node) {
  if (!node) return
  await openDetachedWindow(node.id, node.title)
}

// Common cleanup after delete operations
function clearSelectionAfterDelete() {
  showDetail.value = false
  selectedNode.value = null
}

async function refreshAfterDelete() {
  await loadChildren(currentContainerId.value, { silent: true })
  await loadSidebarTree()
  loadRecentItems()
}

async function deleteNode(nodeId) {
  const node = await api.getNode(nodeId)
  if (!node) return

  const descendants = await api.getDescendants(nodeId) || []
  const allIds = new Set([node, ...descendants].map(n => String(n.id)))
  const needsNavigation = allIds.has(String(currentContainerId.value)) ||
    breadcrumbs.value.some(b => allIds.has(String(b.id)))

  const result = await nodeOps.deleteNode(nodeId)
  if (result.success) {
    clearSelectionAfterDelete()
    if (needsNavigation) {
      if (node.parent_id) {
        await enterContainer({ id: node.parent_id })
      } else {
        currentContainerId.value = null
        breadcrumbs.value = []
      }
    }
    await refreshAfterDelete()
  }
}

async function deleteMultipleNodes(nodeIds) {
  if (!nodeIds || nodeIds.length === 0) return
  if (nodeIds.length > 1 && !confirm(`Delete ${nodeIds.length} nodes? (Cmd+Z to undo)`)) return

  const nodeIdSet = new Set(nodeIds.map(String))
  const needsNavigation = nodeIdSet.has(String(currentContainerId.value)) ||
    breadcrumbs.value.some(b => nodeIdSet.has(String(b.id)))

  const result = await nodeOps.deleteMultipleNodes(nodeIds)
  if (result.success) {
    clearSelectionAfterDelete()
    if (needsNavigation) {
      navigateBack()
    }
    await refreshAfterDelete()
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
    await refreshAfterChange()

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
  if (success) await refreshAfterChange()
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

// Wrapper for tooltip that checks editing state
function showCardTooltip(event, node) {
  if (editingCardId.value || inlineNotesId.value) return
  showTooltip(event, node)
}

// Add item modal functions
function showAddNodeModal(parentId = null) {
  showDetail.value = false
  addNodeModal.value = { visible: true, parentId }
}

function addChildToCard(parentId, e) {
  e?.stopPropagation()
  hideTooltip()
  showAddNodeModal(parentId)
}

let resizeObserver = null

// Keyboard shortcuts via composable
const { handleKeydown } = useKeyboardShortcuts({
  actions: {
    openSearch,
    undo,
    redo,
    showAddNodeModal,
    deleteSelectedNodes: async () => {
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
    },
    deleteNode,
    goToParent,
    goToFirstChild,
    goToPrevSibling,
    goToNextSibling,
    toggleDetailPanel,
    clearSelection: () => {
      selectedIds.value = new Set()
      selectedNode.value = null
      showDetail.value = false
    },
    selectAll: () => {
      selectedIds.value = new Set(flatChildren.value.map(n => n.id))
    }
  },
  state: {
    viewMode,
    selectedNode,
    selectedIds,
    currentContainerId,
    fullscreenDetail,
    detailPinned,
    showDetail,
    flatChildren
  }
})

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
  await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])

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
  document.addEventListener('click', handleExternalLinkClick, true)
  resizeObserver = new ResizeObserver(updateDimensions)
  const contentBody = document.querySelector('.content-body')
  if (contentBody) resizeObserver.observe(contentBody)

  // Listen for updates from detached windows
  onDetachedMessage(async (data) => {
    if (data.type === 'node-updated' && data.node) {
      await refreshAfterChange({ recent: false })
      loadFavorites()
      if (selectedNode.value?.id === data.node.id) selectedNode.value = { ...data.node }
    } else if (data.type === 'node-deleted' && data.nodeId) {
      if (selectedNode.value?.id === data.nodeId) clearSelectionAfterDelete()
      await refreshAfterChange({ recent: false })
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
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('open-link-search', handleOpenLinkSearchEvent)
  document.removeEventListener('click', handleExternalLinkClick, true)
  resizeObserver?.disconnect()
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
    <AppSidebar
      :visible="sidebarVisible"
      :pinned="sidebarPinned"
      :hovered="sidebarHovered"
      :current-container-id="currentContainerId"
      :selected-node-id="selectedNode?.id"
      :sidebar-tree="sidebarTree"
      :favorite-items="favoriteItems"
      :all-tags="allTags"
      :expanded-ids="sidebarExpandedIds"
      @toggle-pin="sidebarPinned = !sidebarPinned"
      @enter="enterContainer"
      @context-menu="(e, node) => showContextMenu(e, node)"
      @toggle-expand="toggleSidebarExpand"
      @select-tag="selectTag"
      @navigate-root="navigateToBreadcrumb(-1)"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    />

    <!-- Main Content -->
    <main class="main-content">
      <!-- Header with breadcrumbs -->
      <div class="content-header">
        <div class="header-row">
          <!-- Workspace Selector -->
          <WorkspaceSelector
            :workspaces="workspaces"
            :model-value="currentWorkspace"
            @update:model-value="currentWorkspace = $event"
            @create="createNewWorkspace($event)"
            @delete="deleteCurrentWorkspace"
          />

          <MainToolbar
            v-model:view-mode="viewMode"
            v-model:sort-alphabetically="sortAlphabetically"
            v-model:show-settings="showSettings"
            v-model:graph-detail-threshold="graphDetailThreshold"
            v-model:graph-max-depth="graphMaxDepth"
            v-model:graph-root-max-depth="graphRootMaxDepth"
            v-model:open-detail-fullscreen="openDetailFullscreen"
            v-model:hover-preview-enabled="hoverPreviewEnabled"
            :hide-completed="hideCompleted"
            :can-undo="undoStack.length > 0"
            :can-redo="redoStack.length > 0"
            :snapshot-message="snapshotMessage"
            :show-snapshot-list="showSnapshotList"
            :available-snapshots="availableSnapshots"
            :show-lost-found="showLostFound"
            :orphaned-nodes="orphanedNodes"
            @toggle-completed="hideCompleted = !hideCompleted"
            @undo="undo"
            @redo="redo"
            @create-snapshot="createSnapshot"
            @toggle-snapshots="showSnapshotList = !showSnapshotList; loadSnapshots()"
            @restore-snapshot="restoreSnapshot"
            @reload-database="reloadDatabase"
            @toggle-lost-found="loadOrphanedNodes(); showLostFound = !showLostFound"
            @move-to-root="moveToRoot"
            @delete-orphan="deleteOrphanedNode"
          />
      </div>
      </div>

      <!-- Add Node Input -->
      <AddNodeBar
        v-model:node-type="newNodeType"
        v-model:node-title="newNodeTitle"
        @create="createNode"
      />

      <!-- Content wrapper (breadcrumbs + body + detail panel) -->
      <div class="content-wrapper">
        <!-- Main content area (breadcrumbs + body) -->
        <div class="content-main">
          <!-- Breadcrumbs / Path -->
          <Breadcrumbs
            :breadcrumbs="breadcrumbs"
            @navigate="navigateToBreadcrumb"
          />
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
        <CardsView
          v-else-if="viewMode === 'cards'"
          :nodes="filteredChildren"
          :selected-id="selectedNode?.id"
          :selected-ids="[...selectedIds]"
          :hide-completed="hideCompleted"
          :current-container-id="currentContainerId"
          :color-map="inheritedColorMap"
          :card-size-class="cardSizeClass"
          :grid-style="cardsGridStyle"
          :editing-card-id="editingCardId"
          :editing-title="editingTitle"
          :inline-notes-id="inlineNotesId"
          :inline-notes-text="inlineNotesText"
          :drag-over-node-id="dropTarget?.id"
          :drag-position="dropPosition"
          @select="selectNode"
          @select-multiple="handleMultiSelect"
          @enter="enterContainer"
          @toggle-complete="toggleComplete"
          @delete="deleteNode"
          @add-child="addChildToCard"
          @context-menu="(e, node) => showContextMenu(e, node)"
          @show-tooltip="showCardTooltip"
          @hide-tooltip="hideTooltip"
          @drag-start="onCardDragStart"
          @drag-end="onCardDragEnd"
          @drag-over="onCardDragOver"
          @drag-leave="onCardDragLeave"
          @drop="onCardDrop"
          @start-edit="startEditing"
          @save-edit="saveEditing"
          @cancel-edit="cancelEditing"
          @start-notes="startInlineNotes"
          @save-notes="saveInlineNotes"
          @cancel-notes="cancelInlineNotes"
          @update:editing-title="editingTitle = $event"
          @update:inline-notes-text="inlineNotesText = $event"
        />

        <!-- Graph View -->
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
          @hide-tooltip="hideTooltip"
          @context-menu="handleViewContextMenu"
          @update="updateNode"
        />

        <!-- Calendar View -->
        <CalendarView
          v-else-if="viewMode === 'calendar'"
          :nodes="sortedChildren"
          :selected-id="selectedNode?.id"
          :hide-completed="hideCompleted"
          :color-map="inheritedColorMap"
          @select="selectNode"
          @enter="enterContainer"
          @show-tooltip="showCardTooltip"
          @hide-tooltip="hideTooltip"
          @context-menu="handleViewContextMenu"
          @update="updateNode"
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
        <TrashView
          v-else-if="viewMode === 'trash'"
          :items="trashedItems"
          @empty-all="emptyAllTrash"
          @restore="restoreFromTrash"
          @delete="permanentlyDelete"
        />

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
      @close="addNodeModal.visible = false"
      @create="addChildNode"
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
    <SpotlightSearch
      :visible="showSearch"
      :search-mode="searchMode"
      v-model:search-query="searchQuery"
      v-model:selected-result-index="selectedResultIndex"
      :search-results="searchResults"
      :recent-items="recentItems"
      :view-mode="viewMode"
      @close="closeSearch"
      @search-input="onSearchInput"
      @keydown="handleSearchKeydown"
      @select-result="_goToSearchResult"
      @clear-recent="clearRecent"
    />

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

</style>
