<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { marked } from 'marked'
import tippy from 'tippy.js'
import 'tippy.js/dist/tippy.css'
import 'tippy.js/themes/translucent.css'
import { api } from './services/api.js'
import DetailPanel from './components/DetailPanel.vue'
import GraphView from './components/GraphView.vue'
import TableView from './components/TableView.vue'
import TimelineView from './components/TimelineView.vue'
import PersonsView from './components/PersonsView.vue'

// Configure marked for inline rendering with links opening in new tab
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

// Track active card tippy instance
let activeCardTippy = null

// Navigation state - drill-down model
const currentContainerId = ref(null)  // null = root level
const currentContainer = ref(null)
const breadcrumbs = ref([])  // path from root to current container
const children = ref([])     // children of current container

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
const expandedIds = ref(new Set())
const transitioning = ref(false)
const transitionDirection = ref('forward')
const containerWidth = ref(800)
const sidebarTree = ref([])  // Full tree for sidebar navigation
const sidebarExpandedIds = ref(new Set())
const recentItems = ref([])  // Recent items for sidebar
const sidebarTreeCollapsed = ref(false)
const sidebarFavoritesCollapsed = ref(false)
const sidebarRecentCollapsed = ref(false)

// Favorites computed from all loaded nodes
const favoriteItems = computed(() => {
  const favorites = []
  function collectFavorites(nodes) {
    for (const node of nodes) {
      if (node.favorite) favorites.push(node)
      if (node.children?.length) collectFavorites(node.children)
    }
  }
  collectFavorites(sidebarTree.value)
  return favorites
})
const sidebarPinned = ref(localStorage.getItem('graphcore-sidebarPinned') !== 'false')
const sidebarHovered = ref(false)
let sidebarHideTimeout = null

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

function onSidebarLeave() {
  sidebarHideTimeout = setTimeout(() => {
    sidebarHovered.value = false
  }, 300)
}

// Inline editing state
const editingCardId = ref(null)
const editingTitle = ref('')
const editingNotes = ref('')

// Inline notes-only editing (separate from full card editing)
const inlineNotesId = ref(null)
const inlineNotesText = ref('')
const inlineNotesRef = ref(null)

// Add item dialog state
const addDialog = ref({
  visible: false,
  parentId: null,
  title: '',
  type: 'task'
})
const addDialogInput = ref(null)

// Sensitive info visibility - restore from localStorage
const hideSensitive = ref(localStorage.getItem('graphcore-hideSensitive') === 'true')

// Hide completed items - restore from localStorage (default: true)
const hideCompleted = ref(localStorage.getItem('graphcore-hideCompleted') !== 'false')

// Graph settings - restore from localStorage
const graphDetailThreshold = ref(parseInt(localStorage.getItem('graphcore-graphDetailThreshold')) || 30)
const graphMaxDepth = ref(parseInt(localStorage.getItem('graphcore-graphMaxDepth')) || 0) // 0 = all
const showSettings = ref(false)

// Persist view mode changes
watch(viewMode, (newMode) => {
  localStorage.setItem('graphcore-viewMode', newMode)
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

// Persist graph max depth
watch(graphMaxDepth, (newVal) => {
  localStorage.setItem('graphcore-graphMaxDepth', String(newVal))
})

// Persist sidebar pinned state
watch(sidebarPinned, (newVal) => {
  localStorage.setItem('graphcore-sidebarPinned', String(newVal))
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
  if (action.type === 'move') {
    await api.moveNode(action.nodeId, action.oldParentId)
    redoStack.value.push({
      type: 'move',
      nodeId: action.nodeId,
      oldParentId: action.newParentId,
      newParentId: action.oldParentId
    })
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
  }
}

async function redo() {
  if (redoStack.value.length === 0) return
  const action = redoStack.value.pop()
  if (action.type === 'move') {
    await api.moveNode(action.nodeId, action.newParentId)
    undoStack.value.push({
      type: 'move',
      nodeId: action.nodeId,
      oldParentId: action.newParentId,
      newParentId: action.oldParentId
    })
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
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
  // Start with container's color if any
  const containerColor = currentContainer.value?.color && currentContainer.value.color !== '#0f4c75'
    ? currentContainer.value.color
    : null
  buildMap(children.value, containerColor)
  return colorMap
})

function getNodeColor(node) {
  return inheritedColorMap.value[node.id] || null
}

const cardsGridStyle = computed(() => {
  const count = filteredChildren.value.length
  if (count === 0) return {}

  // Calculate columns based on container width and card count
  const minCardWidth = count <= 4 ? 280 : count <= 9 ? 220 : count <= 16 ? 180 : 140
  const maxCols = Math.floor(containerWidth.value / minCardWidth)
  const idealCols = Math.ceil(Math.sqrt(count))
  const cols = Math.max(1, Math.min(idealCols, maxCols, 6))
  const rows = Math.ceil(count / cols)

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: '10px',
    height: '100%',
    minHeight: '100%'
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

// Helper to calculate nested grid style based on count
// 1=full, 2=halves, 4=quarters, etc.
function nestedGridStyle(count, level = 1) {
  if (!count || count === 0) return {}

  // Calculate square-ish grid
  const idealCols = Math.ceil(Math.sqrt(count))
  const cols = Math.max(1, idealCols)
  const rows = Math.ceil(count / cols)

  const gap = level === 1 ? '4px' : '2px'

  return {
    display: 'grid',
    gridTemplateColumns: `repeat(${cols}, 1fr)`,
    gridTemplateRows: `repeat(${rows}, 1fr)`,
    gap: gap,
    flex: '1',
    overflow: 'hidden',
    height: '100%'
  }
}

// Methods
async function loadSidebarTree() {
  try {
    const roots = await api.getRoots()
    // Exclude persons from sidebar - they have their own register
    const nonPersonRoots = roots.filter(r => r.type !== 'person')
    const rootsWithChildren = await Promise.all(
      nonPersonRoots.map(async (root) => {
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

async function loadRecentItems() {
  try {
    recentItems.value = await api.getRecent(10)
  } catch (e) {
    console.error('Failed to load recent items:', e)
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
      // Root level - get all root nodes with their descendants (exclude persons)
      const roots = await api.getRoots()
      const nonPersonRoots = roots.filter(r => r.type !== 'person')
      // Fetch descendants for each root to build nested structure
      const rootsWithChildren = await Promise.all(
        nonPersonRoots.map(async (root) => {
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
      breadcrumbs.value = await api.getAncestors(containerId)
      breadcrumbs.value.push(container)
    }
    currentContainerId.value = containerId
    // Expand first level
    expandedIds.value = new Set(children.value.map(n => n.id))
  } catch (e) {
    error.value = e.message
    console.error('Failed to load:', e)
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

async function enterContainer(node) {
  if (!node) return

  // Animate transition
  transitionDirection.value = 'forward'
  transitioning.value = true

  await nextTick()
  setTimeout(async () => {
    await loadChildren(node.id)
    transitioning.value = false
  }, 150)
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

// Anchor node for shift+click range selection (like Finder)
const anchorNode = ref(null)

function selectNode(node) {
  selectedNode.value = node
  lastSelectedNode.value = node
  anchorNode.value = node  // Set anchor for shift+click range selection
  selectedIds.value = new Set([node.id])
  showDetail.value = true
}

async function selectChildById(nodeId) {
  try {
    const node = await api.getNode(nodeId)
    selectNode(node)
  } catch (err) {
    console.error('Failed to select child:', err)
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
    await api.reorderNode(nodeId, targetId, position)
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
    await api.createNode({
      title: newNodeTitle.value,
      type: newNodeType.value,
      parent_id: currentContainerId.value
    })
    newNodeTitle.value = ''
    await loadChildren(currentContainerId.value)
  } catch (e) {
    error.value = e.message
  }
}

async function addChildNode({ parentId, title, type, x, y }) {
  try {
    const newNode = await api.createNode({
      title,
      type: type || 'task',
      parent_id: parentId
    })
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

async function moveNode({ nodeId, oldParentId, newParentId }) {
  try {
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
  } catch (e) {
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
  } catch (e) {
    error.value = e.message
  }
}

async function insertBetween({ parentId, childId, title }) {
  try {
    // Create new node as child of parent
    const newNode = await api.createNode({
      title,
      type: 'task',
      parent_id: parentId
    })
    // Move the original child to be under the new node
    await api.moveNode(childId, newNode.id)
    expandedIds.value.add(parentId)
    expandedIds.value.add(newNode.id)
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

async function createNodeAtPosition({ title, type, x, y }) {
  try {
    // Double-click far from nodes creates child of current container
    const newNode = await api.createNode({
      title,
      type: type || 'task',
      parent_id: currentContainerId.value
    })
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

async function updateNode(updatedNode) {
  try {
    await api.updateNode(updatedNode.id, {
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
      importance: updatedNode.importance
    })
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

async function deleteNode(nodeId) {
  try {
    await api.deleteNode(nodeId, false)  // Soft delete
    showDetail.value = false
    selectedNode.value = null
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()  // Refresh sidebar
  } catch (e) {
    error.value = e.message
  }
}

async function wrapWithParent({ nodeId, parentTitle }) {
  try {
    // Get the node to find its current parent
    const node = await api.getNode(nodeId)

    // Create new parent at same level as current node
    const newParent = await api.createNode({
      title: parentTitle,
      type: 'folder',
      parent_id: node.parent_id
    })

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
  } catch (e) {
    error.value = e.message
  }
}

async function toggleComplete(node) {
  try {
    await api.updateNode(node.id, { completed: !node.completed })
    await loadChildren(currentContainerId.value)
  } catch (e) {
    error.value = e.message
  }
}

function toggleExpand(nodeId) {
  if (expandedIds.value.has(nodeId)) {
    expandedIds.value.delete(nodeId)
  } else {
    expandedIds.value.add(nodeId)
  }
  expandedIds.value = new Set(expandedIds.value)
}

function expandAll() {
  expandedIds.value = new Set(flatChildren.value.map(n => n.id))
}

function collapseAll() {
  expandedIds.value = new Set()
}

// Search functions - spotlight style
function openSearch() {
  showSearch.value = true
  searchQuery.value = ''
  searchResults.value = []
  selectedResultIndex.value = 0
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
}

async function handleSearch() {
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }

  try {
    const results = await api.search(searchQuery.value)
    searchResults.value = results
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
    // Normal click - select (same as child cards)
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
    selectNode(node)
  }
}

function isCardSelected(nodeId) {
  return selectedIds.value.has(nodeId) || selectedNode.value?.id === nodeId
}

// Inline editing functions
function startEditing(node, e) {
  e?.stopPropagation()
  editingCardId.value = node.id
  editingTitle.value = node.title
  editingNotes.value = node.notes || ''
  nextTick(() => {
    const input = document.querySelector('.node-card-title-input')
    if (input) input.focus()
  })
}

async function saveEditing() {
  if (!editingCardId.value) return

  const nodeId = editingCardId.value
  const originalNode = flatChildren.value.find(n => n.id === nodeId)
  if (!originalNode) {
    editingCardId.value = null
    return
  }

  // Only update if something changed
  if (editingTitle.value !== originalNode.title || editingNotes.value !== originalNode.notes) {
    try {
      await api.updateNode(nodeId, {
        title: editingTitle.value,
        notes: editingNotes.value
      })
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
  editingNotes.value = ''
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
  inlineNotesRef.value?.focus()
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

// Build tooltip HTML for card hover (same as graph view)
function buildCardTooltip(node) {
  const childCount = node.children?.length || 0
  const isCompleted = node.completed

  let tooltip = `<div class="tt-header">`
  tooltip += `<div class="tt-title">${node.title}</div>`
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
    if (node.due_date) tooltip += `<span class="tt-due">Due: ${node.due_date}</span>`
    if (node.start_date) tooltip += `<span class="tt-start">Start: ${node.start_date}</span>`
    if (node.end_date) tooltip += `<span class="tt-end">End: ${node.end_date}</span>`
    tooltip += `</div>`
  }

  if (node.notes && !(isSensitiveNode(node) && hideSensitive.value)) {
    const notesHtml = marked.parse(node.notes)
    tooltip += `<div class="tt-notes markdown-body">${notesHtml}</div>`
  } else if (isSensitiveNode(node) && hideSensitive.value) {
    tooltip += `<div class="tt-notes">[Sensitive content hidden]</div>`
  }

  return tooltip
}

function showCardTooltip(event, node) {
  // Don't show tooltip if editing
  if (editingCardId.value || inlineNotesId.value) return

  // Destroy previous tooltip
  if (activeCardTippy) {
    activeCardTippy.destroy()
    activeCardTippy = null
  }

  const el = event.currentTarget
  const tooltipContent = buildCardTooltip(node)

  activeCardTippy = tippy(el, {
    content: tooltipContent,
    allowHTML: true,
    interactive: true,
    interactiveBorder: 20,
    delay: [400, 100],
    duration: [200, 150],
    placement: 'right',
    appendTo: document.body,
    theme: 'graph-tooltip',
    maxWidth: 400,
    trigger: 'manual',
    onShown: (instance) => {
      const checkbox = instance.popper.querySelector('input[type="checkbox"][data-node-id]')
      if (checkbox) {
        checkbox.addEventListener('change', async (e) => {
          const nodeId = parseInt(e.target.dataset.nodeId)
          const targetNode = flatChildren.value.find(n => n.id === nodeId)
          if (targetNode) {
            await toggleComplete(targetNode)
            instance.destroy()
            activeCardTippy = null
          }
        })
      }
    }
  })

  activeCardTippy.show()
}

function hideCardTooltip() {
  if (activeCardTippy) {
    activeCardTippy.destroy()
    activeCardTippy = null
  }
}

// Add item dialog functions
async function openAddDialog(parentId, e) {
  e?.stopPropagation()
  hideCardTooltip()
  addDialog.value = {
    visible: true,
    parentId,
    title: '',
    type: 'task'
  }
  await nextTick()
  addDialogInput.value?.focus()
}

async function submitAddDialog() {
  if (!addDialog.value.title.trim()) return

  try {
    await api.createNode({
      title: addDialog.value.title.trim(),
      type: addDialog.value.type,
      parent_id: addDialog.value.parentId
    })
    await loadChildren(currentContainerId.value)
    expandedIds.value.add(addDialog.value.parentId)
    closeAddDialog()
  } catch (e) {
    error.value = e.message
  }
}

function closeAddDialog() {
  addDialog.value.visible = false
}

function handleAddDialogKeydown(e) {
  if (e.key === 'Escape') {
    closeAddDialog()
  } else if (e.key === 'Enter') {
    submitAddDialog()
  }
}

function toggleSensitiveVisibility() {
  hideSensitive.value = !hideSensitive.value
}

function toggleCompletedVisibility() {
  hideCompleted.value = !hideCompleted.value
}

// Check if a node has sensitive content
function isSensitiveNode(node) {
  return node.notes_sensitive || false
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

// Removed isCardDropTarget - now using getCardDropClass

let resizeObserver = null

// Keyboard shortcuts
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

  // Don't trigger other shortcuts if typing in an editable element
  const target = e.target
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return
  if (target.isContentEditable) return

  // Delete/Backspace - delete selected items
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    if (selectedIds.value.size > 0) {
      deleteSelectedNodes()
    } else if (selectedNode.value) {
      // If no multi-selection but a node is selected, delete it
      deleteNode(selectedNode.value.id)
    }
  }

  // Escape - clear selection
  if (e.key === 'Escape') {
    selectedIds.value = new Set()
    selectedNode.value = null
    showDetail.value = false
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
  try {
    for (const id of idsToDelete) {
      await api.deleteNode(id, false)
    }
    selectedIds.value = new Set()
    selectedNode.value = null
    showDetail.value = false
    await loadChildren(currentContainerId.value)
    await loadSidebarTree()
    loadRecentItems()
  } catch (e) {
    error.value = e.message
  }
}

onMounted(async () => {
  // Restore last container or start at root
  const initialContainerId = savedContainerId ? parseInt(savedContainerId, 10) : null
  try {
    await loadChildren(initialContainerId)
  } catch (e) {
    // If saved container no longer exists, fall back to root
    console.warn('Saved container not found, loading root')
    await loadChildren(null)
  }

  // Load recent items for sidebar
  loadRecentItems()

  // Track container width for responsive grid
  const updateWidth = () => {
    const el = document.querySelector('.content-body')
    if (el) containerWidth.value = el.clientWidth
  }

  updateWidth()
  window.addEventListener('resize', updateWidth)
  window.addEventListener('keydown', handleKeydown)
  resizeObserver = new ResizeObserver(updateWidth)
  const contentBody = document.querySelector('.content-body')
  if (contentBody) resizeObserver.observe(contentBody)
})

onUnmounted(() => {
  window.removeEventListener('resize', () => {})
  window.removeEventListener('keydown', handleKeydown)
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
      :class="{ collapsed: !sidebarVisible, pinned: sidebarPinned }"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    >
      <div class="sidebar-header">
        <h2 v-if="sidebarVisible">Graph Core</h2>
        <button
          class="pin-btn"
          :class="{ pinned: sidebarPinned }"
          @click="sidebarPinned = !sidebarPinned"
          :title="sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'"
        >
          {{ sidebarPinned ? '[=]' : '[>]' }}
        </button>
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
                <span class="type-icon" :class="node.type">{{ node.type[0].toUpperCase() }}</span>
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
                    <span class="type-icon" :class="child.type">{{ child.type[0].toUpperCase() }}</span>
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
                      <span class="type-icon" :class="grandchild.type">{{ grandchild.type[0].toUpperCase() }}</span>
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
              @click="selectNode(item)"
            >
              <span class="favorite-star">&#9733;</span>
              <span class="type-icon" :class="item.type">{{ item.type[0].toUpperCase() }}</span>
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
          </div>
          <div v-show="!sidebarRecentCollapsed">
            <div
              v-for="item in recentItems"
              :key="'recent-' + item.id"
              class="sidebar-item recent-item"
              :class="{ active: selectedNode?.id === item.id }"
              @click="selectNode(item)"
            >
              <span class="type-icon" :class="item.type">{{ item.type[0].toUpperCase() }}</span>
              <span class="label">{{ item.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Legend (fixed at bottom, outside scrollable content) -->
      <div class="sidebar-legend" v-if="sidebarVisible">
        <div class="legend-title">Node Types</div>
        <div class="legend-items">
          <div class="legend-item"><span class="legend-badge project">P</span> Project</div>
          <div class="legend-item"><span class="legend-badge task">T</span> Task</div>
          <div class="legend-item"><span class="legend-badge note">N</span> Note</div>
          <div class="legend-item"><span class="legend-badge milestone">M</span> Milestone</div>
          <div class="legend-item"><span class="legend-badge topic">O</span> Topic</div>
          <div class="legend-item"><span class="legend-badge folder">F</span> Folder</div>
          <div class="legend-item"><span class="legend-badge person">U</span> Person</div>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Header with breadcrumbs -->
      <div class="content-header">
        <nav class="header-breadcrumbs">
          <span class="crumb" @click="navigateToBreadcrumb(-1)">Root</span>
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

        <div class="toolbar">
          <button :class="{ primary: viewMode === 'tree' }" @click="viewMode = 'tree'">Table</button>
          <button :class="{ primary: viewMode === 'cards' }" @click="viewMode = 'cards'">Cards</button>
          <button :class="{ primary: viewMode === 'graph' }" @click="viewMode = 'graph'">Graph</button>
          <button :class="{ primary: viewMode === 'timeline' }" @click="viewMode = 'timeline'">Timeline</button>
          <button :class="{ primary: viewMode === 'persons' }" @click="viewMode = 'persons'">Persons</button>
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
          <div class="settings-dropdown">
            <button class="settings-btn" @click="showSettings = !showSettings" title="Settings">
              <span>...</span>
            </button>
            <div v-if="showSettings" class="settings-panel">
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
            </div>
          </div>
        </div>
      </div>

      <!-- Add Node Input -->
      <div class="add-node-bar">
        <select v-model="newNodeType" class="type-select">
          <option value="project">Project</option>
          <option value="task">Task</option>
          <option value="note">Note</option>
          <option value="milestone">Milestone</option>
          <option value="topic">Topic</option>
          <option value="folder">Folder</option>
          <option value="person">Person</option>
        </select>
        <input
          v-model="newNodeTitle"
          placeholder="Add new..."
          @keyup.enter="createNode"
        />
        <button class="primary" @click="createNode">Add</button>
        <template v-if="viewMode === 'tree'">
          <button @click="expandAll" title="Expand all">++</button>
          <button @click="collapseAll" title="Collapse all">--</button>
        </template>
      </div>

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
          @select="selectNode"
          @select-multiple="handleMultiSelect"
          @enter="enterContainer"
          @toggle-complete="toggleComplete"
          @toggle-expand="toggleExpand"
          @delete="deleteNode"
          @move="moveNode"
          @move-multiple="moveMultipleNodes"
          @reorder="handleReorder"
        />

        <!-- Cards View -->
        <div v-else-if="viewMode === 'cards'" class="node-cards" :style="cardsGridStyle">
          <div
            v-for="node in filteredChildren"
            :key="node.id"
            class="node-card"
            :class="[cardSizeClass, `type-${node.type}`, { selected: isCardSelected(node.id) }, getCardDropClass(node)]"
            :style="getNodeColor(node) ? { background: `linear-gradient(135deg, ${getNodeColor(node)}77 0%, var(--bg-primary) 80%)` } : {}"
            draggable="true"
            @click="handleCardClick($event, node)"
            @dblclick="enterContainer(node)"
            @dragstart="onCardDragStart($event, node)"
            @dragend="onCardDragEnd"
            @dragover="onCardDragOver($event, node)"
            @dragleave="onCardDragLeave"
            @drop="onCardDrop($event, node)"
            @mouseenter="showCardTooltip($event, node)"
            @mouseleave="hideCardTooltip"
          >
            <!-- Header - always visible but adapts -->
            <div class="node-card-header">
              <span v-if="node.favorite" class="card-favorite-star" title="Favorite">&#9733;</span>
              <input
                v-if="node.type === 'task'"
                type="checkbox"
                class="card-checkbox"
                :checked="node.completed"
                @click.stop
                @change.stop="toggleComplete(node)"
                title="Mark as complete"
              />
              <span v-if="cardSizeClass !== 'card-xs'" class="drag-handle card-drag" title="Drag to reorder">::</span>
              <span class="node-card-type" :class="node.type" :title="'Type: ' + node.type">
                {{ cardSizeClass === 'card-xs' ? node.type[0].toUpperCase() : node.type.toUpperCase() }}
              </span>
              <span v-if="node.children?.length && cardSizeClass !== 'card-xs'" class="node-card-children" :title="node.children.length + ' children'">
                {{ node.children.length }}
              </span>
              <!-- Due date warning -->
              <span
                v-if="getDueDateStatus(node.due_date) && !node.completed"
                class="due-warning"
                :class="getDueDateStatus(node.due_date).type"
                :title="'Due: ' + node.due_date"
              >{{ getDueDateStatus(node.due_date).text }}</span>
              <button class="card-add-btn" @click.stop="openAddDialog(node.id, $event)" title="Add child item">+</button>
              <button class="card-info-btn" @click.stop="selectNode(node)" title="Open details panel">i</button>
            </div>

            <!-- Inline editing mode (xl/lg only) -->
            <template v-if="editingCardId === node.id && (cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg')">
              <input
                class="node-card-title-input"
                v-model="editingTitle"
                @keydown="handleEditKeydown"
                @blur="saveEditing"
                placeholder="Title"
              />
              <textarea
                class="node-card-notes-input"
                v-model="editingNotes"
                @keydown="handleEditKeydown"
                placeholder="Notes..."
                rows="3"
              ></textarea>
              <!-- Dates for xl cards -->
              <div v-if="cardSizeClass === 'card-xl'" class="card-dates-inline">
                <div class="card-date-field">
                  <label>Due</label>
                  <input type="date" :value="node.due_date" @change="updateNode({ ...node, due_date: $event.target.value })" />
                </div>
                <div class="card-date-field">
                  <label>Start</label>
                  <input type="date" :value="node.start_date" @change="updateNode({ ...node, start_date: $event.target.value })" />
                </div>
              </div>
              <div class="card-edit-actions">
                <button class="card-save-btn" @click.stop="saveEditing">Save</button>
                <button class="card-cancel-btn" @click.stop="cancelEditing">Cancel</button>
              </div>
            </template>

            <!-- Normal display mode -->
            <template v-else>
              <!-- Title - adapts to size -->
              <div
                class="node-card-title"
                :class="{ 'title-truncate': cardSizeClass === 'card-xs' || cardSizeClass === 'card-sm' }"
                @dblclick.stop="(cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg') && startEditing(node, $event)"
              >{{ node.title }}</div>

              <!-- Interactive notes area - xl/lg/md -->
              <div
                v-if="cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg' || cardSizeClass === 'card-md'"
                class="node-card-notes-area"
                @click.stop
              >
                <textarea
                  v-if="inlineNotesId === node.id"
                  ref="inlineNotesRef"
                  v-model="inlineNotesText"
                  class="inline-notes-textarea"
                  placeholder="Add notes..."
                  @blur="saveInlineNotes"
                  @keydown="handleInlineNotesKeydown"
                ></textarea>
                <div
                  v-else
                  class="inline-notes-display"
                  :class="{
                    empty: !node.notes,
                    sensitive: isSensitiveNode(node) && hideSensitive,
                    truncate: cardSizeClass === 'card-md'
                  }"
                  @click="startInlineNotes(node, $event)"
                >
                  <template v-if="isSensitiveNode(node) && hideSensitive">[Hidden]</template>
                  <template v-else-if="node.notes">
                    <div class="markdown-content" v-html="renderMarkdown(node.notes)"></div>
                  </template>
                  <template v-else>Add notes...</template>
                </div>
              </div>

              <!-- Metadata - xl/lg only -->
              <div v-if="(cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg') && (node.due_date || node.start_date || node.importance)" class="node-card-meta">
                <span v-if="node.due_date" class="meta-item due">
                  <span class="meta-icon">D</span>{{ node.due_date }}
                </span>
                <span v-if="node.start_date && cardSizeClass === 'card-xl'" class="meta-item start">
                  <span class="meta-icon">S</span>{{ node.start_date }}
                </span>
                <span v-if="node.importance" class="meta-item importance" :class="'imp-' + node.importance">
                  P{{ node.importance }}
                </span>
              </div>
            </template>

            <!-- Nested children cards - xl/lg/md only -->
            <div
              v-if="node.children?.length && (cardSizeClass === 'card-xl' || cardSizeClass === 'card-lg' || cardSizeClass === 'card-md')"
              class="node-card-children-grid"
              :style="nestedGridStyle(node.children.length, 1)"
              @click.stop
            >
              <div
                v-for="child in node.children"
                :key="child.id"
                class="child-card"
                :class="[child.type, getNestedCardSize(node.children.length, 1), { selected: isCardSelected(child.id) }, getCardDropClass(child)]"
                :style="getNodeColor(child) ? { background: `linear-gradient(135deg, ${getNodeColor(child)}55 0%, var(--bg-secondary) 80%)` } : {}"
                draggable="true"
                @click.stop="handleChildCardClick($event, child)"
                @dblclick.stop="enterContainer(child)"
                @dragstart.stop="onCardDragStart($event, child)"
                @dragend="onCardDragEnd"
                @dragover.stop="onCardDragOver($event, child)"
                @dragleave="onCardDragLeave"
                @drop.stop="onCardDrop($event, child)"
                @mouseenter="showCardTooltip($event, child)"
                @mouseleave="hideCardTooltip"
              >
                <span class="child-card-title">{{ child.title }}</span>
                <!-- Interactive notes for child cards -->
                <div
                  v-if="getNestedCardSize(node.children.length, 1) === 'child-lg'"
                  class="child-card-notes-area"
                  @click.stop
                >
                  <textarea
                    v-if="inlineNotesId === child.id"
                    ref="inlineNotesRef"
                    v-model="inlineNotesText"
                    class="child-notes-textarea"
                    placeholder="Add notes..."
                    @blur="saveInlineNotes"
                    @keydown="handleInlineNotesKeydown"
                  ></textarea>
                  <div
                    v-else
                    class="child-notes-display"
                    :class="{ empty: !child.notes }"
                    @click="startInlineNotes(child, $event)"
                  >
                    <template v-if="child.notes">
                      <div class="markdown-content" v-html="renderMarkdown(child.notes)"></div>
                    </template>
                    <template v-else>Add notes...</template>
                  </div>
                </div>
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
                    :style="getNodeColor(grandchild) ? { background: `linear-gradient(135deg, ${getNodeColor(grandchild)}44 0%, var(--bg-primary) 80%)` } : {}"
                    draggable="true"
                    @click.stop="handleChildCardClick($event, grandchild)"
                    @dblclick.stop="enterContainer(grandchild)"
                    @dragstart.stop="onCardDragStart($event, grandchild)"
                    @dragend="onCardDragEnd"
                    @dragover.stop="onCardDragOver($event, grandchild)"
                    @dragleave="onCardDragLeave"
                    @drop.stop="onCardDrop($event, grandchild)"
                    @mouseenter="showCardTooltip($event, grandchild)"
                    @mouseleave="hideCardTooltip"
                  >
                    <input
                      v-if="grandchild.type === 'task'"
                      type="checkbox"
                      class="grandchild-checkbox"
                      :checked="grandchild.completed"
                      @click.stop
                      @change.stop="toggleComplete(grandchild)"
                    />
                    <span class="grandchild-title" :class="{ completed: grandchild.completed }">{{ grandchild.title }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Compact children indicator for sm/xs -->
            <div v-if="node.children?.length && (cardSizeClass === 'card-sm' || cardSizeClass === 'card-xs')" class="node-card-children-compact">
              +{{ node.children.length }}
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
          @select="selectNode"
          @enter="enterContainer"
          @move="moveNode"
          @add-child="addChildNode"
          @insert-between="insertBetween"
          @update="updateNode"
          @create="createNodeAtPosition"
          @delete="deleteNode"
          @wrap-with-parent="wrapWithParent"
        />

        <!-- Timeline View -->
        <TimelineView
          v-else-if="viewMode === 'timeline'"
          :nodes="children"
          :selected-id="selectedNode?.id"
          :hide-completed="hideCompleted"
          @select="selectNode"
          @enter="enterContainer"
        />

        <!-- Persons View -->
        <PersonsView
          v-else-if="viewMode === 'persons'"
          :selected-id="selectedNode?.id"
          :hide-completed="hideCompleted"
          @select="selectNode"
        />
      </div>
    </main>

    <!-- Add Item Dialog -->
    <div v-if="addDialog.visible" class="add-dialog-overlay" @click="closeAddDialog">
      <div class="add-dialog" @click.stop>
        <div class="add-dialog-header">Add Item</div>
        <div class="add-dialog-body">
          <input
            ref="addDialogInput"
            v-model="addDialog.title"
            class="add-dialog-input"
            placeholder="Title..."
            @keydown="handleAddDialogKeydown"
          />
          <select v-model="addDialog.type" class="add-dialog-select">
            <option value="task">Task</option>
            <option value="note">Note</option>
            <option value="folder">Folder</option>
            <option value="project">Project</option>
            <option value="milestone">Milestone</option>
            <option value="topic">Topic</option>
          </select>
        </div>
        <div class="add-dialog-actions">
          <button class="add-dialog-cancel" @click="closeAddDialog">Cancel</button>
          <button class="add-dialog-submit" @click="submitAddDialog">Add</button>
        </div>
      </div>
    </div>

    <!-- Detail Panel -->
    <DetailPanel
      v-if="showDetail && selectedNode"
      :node="selectedNode"
      :width="detailWidth"
      @update="updateNode"
      @delete="deleteNode"
      @wrap-with-parent="wrapWithParent"
      @select-child="selectChildById"
      @resize-start="onDetailResizeStart"
      @close="showDetail = false"
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
              placeholder="Search nodes..."
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
                {{ result.type[0].toUpperCase() }}
              </div>
              <div class="result-body">
                <div class="result-title">{{ result.title }}</div>
                <div class="result-meta" v-if="result.due_date || result.importance || result.path">
                  <span v-if="result.path" class="result-path">{{ result.path }}</span>
                  <span v-if="result.due_date" class="result-due">Due: {{ result.due_date.split('T')[0] }}</span>
                  <span v-if="result.importance" class="result-priority">P{{ result.importance }}</span>
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

.content-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--bg-secondary);
}

.header-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1.1rem;
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
  display: flex;
  gap: var(--spacing-sm);
  padding: var(--spacing-md) var(--spacing-lg);
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
.card-info-btn {
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
}

.card-info-btn {
  margin-left: auto;
  font-style: italic;
}

.card-edit-btn {
  margin-left: auto;
}

.card-add-btn {
  font-size: 14px;
  font-weight: bold;
}

.card-info-btn:hover,
.card-edit-btn:hover,
.card-add-btn:hover {
  opacity: 1;
  background: var(--accent-color);
  border-color: var(--accent-color);
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
  margin: 8px 16px;
  width: calc(100% - 32px);
}

.inline-notes-display {
  font-size: 13px;
  color: var(--text-secondary);
  cursor: text;
  padding: 4px 8px;
  border-radius: 4px;
  min-height: 1.4em;
  max-height: 150px;
  overflow-y: auto;
  white-space: pre-wrap;
  transition: background 0.15s;
}

.inline-notes-display:hover {
  background: rgba(255, 255, 255, 0.05);
}

.inline-notes-display.empty {
  color: var(--text-tertiary);
  font-style: italic;
}

.inline-notes-display.sensitive {
  color: var(--text-tertiary);
  font-style: italic;
}

.inline-notes-display.truncate {
  max-height: 2.8em;
  overflow: hidden;
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
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
  font-size: 13px;
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
  padding: 16px 20px 10px 20px;
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
  padding: 10px 14px 6px 14px;
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
  padding: 6px 10px 8px 10px;
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
  padding: 4px 8px 6px 8px;
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

.child-card-notes {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Card checkbox */
.card-checkbox {
  width: 18px;
  height: 18px;
  cursor: pointer;
  flex-shrink: 0;
}

.node-card.card-sm .card-checkbox,
.node-card.card-xs .card-checkbox {
  width: 14px;
  height: 14px;
}

/* Completed card styling */
.node-card:has(.card-checkbox:checked) {
  opacity: 0.6;
}

.node-card:has(.card-checkbox:checked) .node-card-title {
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

.legend-badge.project { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.legend-badge.task { background: rgba(234, 179, 8, 0.2); color: #fbbf24; }
.legend-badge.note { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
.legend-badge.milestone { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.legend-badge.topic { background: rgba(6, 182, 212, 0.2); color: #22d3ee; }
.legend-badge.folder { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
.legend-badge.person { background: rgba(251, 146, 60, 0.2); color: #fb923c; }

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

.result-type.project { background: #1a4d7a; color: #8cc4ff; }
.result-type.task { background: #5a5a1a; color: #f0f07d; }
.result-type.note { background: #1a5a1a; color: #7df07d; }
.result-type.milestone { background: #5a1a5a; color: #f07df0; }
.result-type.topic { background: #1a5a5a; color: #7df0f0; }
.result-type.folder { background: #4a4a4a; color: #ccc; }
.result-type.person { background: #5a3a1a; color: #f0b07d; }

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

/* Add Item Dialog */
.add-dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.add-dialog {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  min-width: 300px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.add-dialog-header {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
}

.add-dialog-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-dialog-input {
  padding: 8px 12px;
  font-size: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
}

.add-dialog-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.add-dialog-select {
  padding: 8px 12px;
  font-size: 14px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
}

.add-dialog-select:focus {
  outline: none;
  border-color: var(--accent-color);
}

.add-dialog-actions {
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--border-color);
}

.add-dialog-cancel,
.add-dialog-submit {
  padding: 6px 16px;
  font-size: 13px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.add-dialog-cancel {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.add-dialog-cancel:hover {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.add-dialog-submit {
  background: var(--accent-color);
  border: 1px solid var(--accent-color);
  color: white;
}

.add-dialog-submit:hover {
  background: #3a8eef;
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

.result-type-badge.project { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
.result-type-badge.task { background: rgba(234, 179, 8, 0.2); color: #fbbf24; }
.result-type-badge.note { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
.result-type-badge.milestone { background: rgba(168, 85, 247, 0.2); color: #c084fc; }
.result-type-badge.topic { background: rgba(6, 182, 212, 0.2); color: #22d3ee; }
.result-type-badge.folder { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }
.result-type-badge.person { background: rgba(251, 146, 60, 0.2); color: #fb923c; }

.result-body {
  flex: 1;
  min-width: 0;
}

.spotlight-result .result-title {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
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
</style>
