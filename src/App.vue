<script setup>
import { ref, computed, watch } from 'vue'
import { api } from './services/api.js'
import { handleExternalLinkClick } from './utils/markdown.js'
import { useAppLifecycle } from './composables/useAppLifecycle.js'
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
import { useNavigation } from './composables/useNavigation.js'
import { useGraphOperations } from './composables/useGraphOperations.js'
import { useRefresh } from './composables/useRefresh.js'
import { useNodeActionsUI } from './composables/useNodeActionsUI.js'
import DetailPanel from './components/DetailPanel.vue'
import ViewRenderer from './components/ViewRenderer.vue'
import NodeContextMenu from './components/NodeContextMenu.vue'
import AddNodeModal from './components/AddNodeModal.vue'
import ToastContainer from './components/ToastContainer.vue'
import AppSidebar from './components/AppSidebar.vue'
import WorkspaceSelector from './components/WorkspaceSelector.vue'
import AddNodeBar from './components/AddNodeBar.vue'
import Breadcrumbs from './components/Breadcrumbs.vue'
import MainToolbar from './components/MainToolbar.vue'
import SpotlightSearch from './components/SpotlightSearch.vue'
import { showToast } from './composables/useToast.js'
import { handleError } from './composables/useErrorHandler.js'

// Navigation state placeholders (reassigned from composable)
let currentContainerId = ref(null)
let currentContainer = ref(null)
let breadcrumbs = ref([])
let children = ref([])

// UI state - managed by useSettings composable
const {
  viewMode,
  containerId: savedContainerId,
  hideCompleted,
  hideSensitive,
  graphDetailThreshold,
  graphMaxDepth,
  graphRootMaxDepth,
  graphNotesPreviewLength,
  openDetailFullscreen,
  hoverPreviewEnabled,
  inheritColors,
  sidebarPinned,
  // AI settings
  aiProvider,
  aiEnabled,
  ollamaEndpoint,
  ollamaModel,
  ollamaContextSize,
  openaiEndpoint,
  openaiApiKey,
  openaiModel,
  openaiSkipSslVerification,
  // Legacy
  ollamaEnabled
} = useSettings()

// loading state is managed by useNavigation composable
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
  toggleExpand: toggleSidebarExpand
} = useSidebar({ pinned: sidebarPinned })

// Context menu state is managed by useContextMenu composable (initialized after functions it needs)

// Workspace management
const {
  currentWorkspace,
  workspaces,
  loadWorkspaces,
  createWorkspace: createNewWorkspace,
  deleteCurrentWorkspace: _deleteCurrentWorkspace,
  renameWorkspace,
  getWorkspaceIdForNode
} = useWorkspace({
  api,
  onWorkspaceChange: async () => {
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
  }
})

// Wrap deleteCurrentWorkspace with confirmation
async function deleteCurrentWorkspace() {
  const ws = workspaces.value.find(w => w.id === currentWorkspace.value)
  if (ws && confirm(`Delete workspace "${ws.name}"?`)) await _deleteCurrentWorkspace()
}

// Data loading
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
  invalidateSidebarCache,
  clearRecent,
  restoreFromTrash,
  emptyAllTrash,
  moveToRoot,
  deleteOrphanedNode
} = useDataLoading(currentWorkspace)

const selectTag = (tag) => { searchQuery.value = `#${tag}`; showSearch.value = true; onSearchInput() }

// Detail panel resize
const {
  detailWidth,
  isResizing: isResizingDetail,
  onResizeStart: onDetailResizeStart
} = useDetailResize()

const closeDetail = () => { showDetail.value = false; fullscreenDetail.value = false; detailPinned.value = false }

// Tooltip composable
const { showTooltip, hideTooltip, forceHide: forceHideTooltip } = useNodeTooltip({
  onToggleComplete: async (nodeId) => {
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (node) await toggleComplete(node)
  },
  getHideSensitive: () => hideSensitive.value,
  shouldShowTooltip: () => hoverPreviewEnabled.value && !showDetail.value
})

// Detached window for cross-window sync
const {
  openDetachedWindow,
  broadcastNodeUpdate,
  broadcastNodeDelete,
  onMessage: onDetachedMessage
} = useDetachedWindow()

// Additional UI state
const showSettings = ref(false)
const sortAlphabetically = ref(false)

// Cards layout - filtering, grid computation, color inheritance, and flat tree
const {
  filteredChildren,
  sortedChildren,
  flatChildren,
  cardSizeClass,
  cardsGridStyle,
  gridColumns,
  inheritedColorMap
} = useCardsLayout({
  children,
  hideCompleted,
  sortAlphabetically,
  containerWidth,
  containerHeight,
  breadcrumbs,
  currentContainer,
  inheritColors
})

// Snapshot/backup management (callbacks reference functions defined below via closure)
const {
  availableSnapshots,
  showSnapshotList,
  snapshotMessage,
  loadSnapshots,
  createSnapshot,
  restoreSnapshot,
  reloadDatabase
} = useSnapshots({
  onListBackups: api.listBackups,
  onCreateBackup: api.backup,
  onRestoreBackup: api.restoreBackup,
  onReload: api.reload,
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
    if (selectedNode.value?.id) selectedNode.value = await api.getNode(selectedNode.value.id)
  }
})

// Load trash items when switching to trash view
watch(viewMode, (mode) => { if (mode === 'trash') loadTrashedItems() })

// Close tooltips when detail panel opens
watch(showDetail, (isOpen) => { if (isOpen) forceHideTooltip() })

// Component refs
const viewRendererRef = ref(null)
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
  undo,
  redo
} = useUndoRedo({
  api,
  showNotification: showToast,
  onSuccess: async () => {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
  }
})

// Node operations (CRUD with undo/redo)
const nodeOps = useNodeOperations({
  api,
  pushCommand,
  getWorkspaceIdForNode,
  onSuccess: async ({ type, node, x, y }) => { if (type === 'create' && node) saveNodePosition(node.id, x, y, node.parent_id) },
  onError: (e) => { error.value = e.message },
  broadcastUpdate: broadcastNodeUpdate,
  broadcastDelete: broadcastNodeDelete
})

// Cards drag
const {
  dropTarget,
  dropPosition,
  onDragStart: onCardDragStart,
  onDragEnd: onCardDragEnd,
  onDragOver: onCardDragOver,
  onDragLeave: onCardDragLeave,
  onDrop: onCardDrop
} = useCardDrag({
  onMove: (src, tgt) => moveNode({ nodeId: src.id, newParentId: tgt.id }),
  onReorder: (src, tgt, pos) => handleReorder({ nodeId: src.id, targetId: tgt.id, position: pos })
})

// Graph depth: use root setting at root level
const effectiveGraphMaxDepth = computed(() => currentContainerId.value === null ? graphRootMaxDepth.value : graphMaxDepth.value)

// Tree expand/collapse
const {
  expandedIds,
  toggleExpand,
  expandAll,
  collapseAll,
  loadExpandedState
} = useTreeExpand({
  workspace: currentWorkspace,
  flatChildren
})

// Selection
const {
  selectedNode,
  selectedIds,
  hoverSelectNode,
  selectNode: _selectNode,
  cancelDetailOpen,
  handleMultiSelect,
  toggleDetailPanel,
  selectChildById,
  openNodeFullscreen,
  selectAll
} = useSelection({
  showDetail,
  fullscreenDetail,
  openDetailFullscreen,
  flatChildren,
  currentContainer,
  getNode: (nodeId) => api.getNode(nodeId),
  onError: handleError
})

// Wrap selectNode to respect pin state - don't deselect when pinned
function selectNode(node, options = {}) {
  if (!node && detailPinned.value) return
  _selectNode(node, options)
}

// Navigation composable
const navigation = useNavigation({
  api,
  workspace: currentWorkspace,
  debounce: { enabled: true, delay: 200 },
  buildChildTree,
  onBeforeNavigate: cancelDetailOpen,
  onLeafNode: () => false,
  onSelectNode: selectNode,
  onSidebarSync: (rootChildren) => { sidebarTree.value = rootChildren },
  onTransitionStart: (dir) => { transitionDirection.value = dir; transitioning.value = true },
  onTransitionEnd: () => { transitioning.value = false },
  onNotFound: async () => {
    currentContainerId.value = null
    localStorage.removeItem('graphcore-containerId')
    await navigation.loadChildren(null)
  }
})

// Sync navigation state to local refs (preserves reactivity for composables initialized earlier)
watch(navigation.children, (val) => {
  children.value = val
}, { immediate: true, deep: true })
watch(navigation.breadcrumbs, (val) => {
  breadcrumbs.value = val
}, { immediate: true, deep: true })
watch(navigation.currentContainer, (val) => {
  currentContainer.value = val
}, { immediate: true })
watch(navigation.currentContainerId, (val) => {
  currentContainerId.value = val
}, { immediate: true })
const {
  loading,
  loadChildren,
  enterContainer,
  navigateBack,
  navigateToBreadcrumb,
  goToParent,
  goToFirstChild,
  goToPrevSibling,
  goToNextSibling,
  navigateToNode
} = navigation

// Search
const {
  searchQuery,
  searchResults,
  showSearch,
  selectedResultIndex,
  searchMode,
  openSearch,
  openLinkSearch,
  openMoveSearch,
  closeSearch,
  onSearchInput,
  handleSearchKeydown,
  goToSearchResult: _goToSearchResult,
  hasMoreResults,
  isLoadingMore,
  loadMoreResults
} = useSearch({
  selectedNode,
  onSearch: async (query, mode, workspaceId, paginationOptions = {}) => {
    const searchOptions = { hideCompleted: hideCompleted.value, ...paginationOptions }
    if (query.startsWith('#') && query.length > 1) {
      return await api.getNodesByTag(query.slice(1), workspaceId, searchOptions)
    }
    return await api.search(query, null, workspaceId, searchOptions)
  },
  onLink: async (targetNode, sourceId) => {
    const success = await nodeOps.linkNodes(sourceId, targetNode.id)
    if (success) {
      await refreshGraphAfterStructureChange()
      if (selectedNode.value?.id === sourceId) {
        selectedNode.value = await api.getNode(sourceId)
        detailPanelRef.value?.loadLinkedNodes()
      }
    }
  },
  onMove: async (sourceId, targetId) => {
    try {
      await api.moveNode(sourceId, targetId)
      await refreshGraphAfterStructureChange()
      if (selectedNode.value?.id === sourceId) {
        selectedNode.value = await api.getNode(sourceId)
      }
    } catch (e) {
      handleError(e, { context: 'Moving node' })
    }
  },
  onNavigate: async (node) => {
    if (currentContainerId.value !== node.id) await loadChildren(node.id)
    selectNode(node)
  },
  getAncestors: api.getAncestors,
  getWorkspace: () => currentWorkspace.value
})

// Close detail panel when node is deselected (if not pinned)
watch(selectedNode, (node) => { if (!node && !detailPinned.value) showDetail.value = false })

// Inline editing
const {
  editingCardId, editingTitle, inlineNotesId, inlineNotesText,
  startEditing, saveEditing, cancelEditing, startInlineNotes, saveInlineNotes, cancelInlineNotes
} = useInlineEdit({
  findNode: (nodeId) => flatChildren.value.find(n => n.id === nodeId),
  onSaveTitle: async (nodeId, newTitle) => { await api.updateNode(nodeId, { title: newTitle }); await loadChildren(currentContainerId.value) },
  onSaveNotes: async (nodeId, newNotes, { autoSave }) => { await api.updateNode(nodeId, { notes: newNotes }); if (!autoSave) await loadChildren(currentContainerId.value) }
})

// Graph operations (initialized after refreshAfterChange)
let graphOps = null

async function createNode() {
  if (!newNodeTitle.value.trim()) return
  const targetParentId = addChildParentId.value || currentContainerId.value
  const newNode = await nodeOps.createNode({ title: newNodeTitle.value, type: newNodeType.value, parentId: targetParentId })
  if (newNode) {
    if (addChildParentId.value) { expandedIds.value.add(addChildParentId.value); await loadSidebarTree() }
    newNodeTitle.value = ''; addChildParentId.value = null
    await loadChildren(currentContainerId.value, { silent: true })
  }
}

const addChildFromDetail = async (payload) => { await addChildNode(payload); detailPanelRef.value?.loadChildren() }

// Refresh operations
const {
  refreshAfterChange,
  refreshAfterDelete,
  refreshGraphAfterStructureChange,
  refreshDetailPanelLinks,
  refreshAfterChildUpdate
} = useRefresh({
  api,
  loadChildren,
  loadSidebarTree,
  loadRecentItems,
  currentContainerId,
  selectedNode,
  graphViewRef: viewRendererRef,
  detailPanelRef
})

// Initialize graph operations now that refreshAfterChange is defined
graphOps = useGraphOperations({
  api,
  currentContainerId,
  currentWorkspace,
  expandedIds,
  getWorkspaceIdForNode,
  refreshAfterChange
})

const { saveNodePosition, insertBetween } = graphOps

// Node actions with UI state management
const {
  addChildNode,
  clearSelectionAfterDelete,
  deleteNode,
  deleteMultipleNodes,
  deleteSelectedNodes,
  wrapWithParent,
  moveNode,
  moveMultipleNodes,
  moveNodeToRoot,
  toggleComplete,
  toggleFavorite,
  linkNodesFromGraph,
  unlinkNodesFromGraph,
  handleAIImproveNotes,
  handleReorder,
  updateNode,
  clearSelection
} = useNodeActionsUI({
  api,
  nodeOps,
  pushCommand,
  getWorkspaceIdForNode,
  selectedNode,
  selectedIds,
  showDetail,
  currentContainerId,
  breadcrumbs,
  children,
  expandedIds,
  flatChildren,
  viewRendererRef,
  error,
  enterContainer,
  navigateBack,
  refreshAfterChange,
  refreshAfterDelete,
  refreshGraphAfterStructureChange,
  refreshDetailPanelLinks,
  loadSidebarTree,
  loadFavorites,
  loadChildren,
  invalidateSidebarCache,
  loadRecentItems,
  loadTags
})

async function createNodeAtPosition({ title, type, x, y }) {
  const newNode = await nodeOps.createNode({ title, type, parentId: currentContainerId.value, x, y })
  if (newNode) { await refreshAfterChange(); selectNode(newNode) }
}

// Open node in detached window
const handleDetach = (node) => node && openDetachedWindow(node.id, node.title)

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
  handleOpenMoveSearch: handleContextMenuOpenMoveSearch,
  handleUnlink: handleContextMenuUnlink,
  handleMoveToWorkspace: handleContextMenuMoveToWorkspace,
  handleDelete: handleContextMenuDelete,
  handleViewContextMenu
} = useContextMenu({
  onLoadLinks: api.getLinkedNodes,
  onViewDetails: selectNode,
  onEnter: enterContainer,
  onAddChild: (node) => showAddNodeModal(node.id),
  onToggleComplete: toggleComplete,
  onToggleFavorite: toggleFavorite,
  onOpenLinkSearch: openLinkSearch,
  onOpenMoveSearch: openMoveSearch,
  onUnlink: nodeOps.unlinkNodes,
  onMoveToWorkspace: async (nodeId, wsId) => { await api.updateNode(nodeId, { workspace_id: wsId }); await loadChildren() },
  onDelete: deleteNode,
  onRefreshSelectedNode: async (sourceId) => { if (showDetail.value && selectedNode.value?.id === sourceId) selectedNode.value = await api.getNode(sourceId) }
})

// Tooltip wrapper that checks editing state
const showCardTooltip = (e, node) => { if (!editingCardId.value && !inlineNotesId.value) showTooltip(e, node) }

// Add node modal
const showAddNodeModal = (parentId = null) => { showDetail.value = false; addNodeModal.value = { visible: true, parentId } }

// Unified add-child handler (Graph: object with title, Cards: parentId)
function handleAddChild(payload, e) {
  if (payload?.title) { addChildNode(payload); return }
  e?.stopPropagation(); hideTooltip(); showAddNodeModal(payload)
}

// Unified create handler (Graph: object with position, Cards: opens modal)
function handleCreate(payload) {
  if (payload?.title) { createNodeAtPosition(payload); return }
  hideTooltip(); showAddNodeModal(currentContainerId.value)
}

// Keyboard shortcuts via composable
const { handleKeydown } = useKeyboardShortcuts({
  actions: {
    openSearch,
    undo,
    redo,
    showAddNodeModal,
    deleteSelectedNodes,
    deleteNode,
    goToParent,
    goToFirstChild,
    goToPrevSibling,
    goToNextSibling,
    toggleDetailPanel,
    clearSelection,
    selectAll,
    selectNode,
    enterContainer,
    openDetachedWindow: handleDetach
  },
  state: {
    viewMode,
    selectedNode,
    selectedIds,
    currentContainerId,
    fullscreenDetail,
    detailPinned,
    showDetail,
    flatChildren,
    filteredChildren,
    gridColumns
  }
})

// Custom open-link-search event handler
const handleOpenLinkSearchEvent = (e) => { if (e.detail?.nodeId === selectedNode.value?.id) openLinkSearch() }

// App lifecycle management (initialization, event listeners, cleanup)
useAppLifecycle({
  loadWorkspaces,
  loadChildren,
  loadExpandedState,
  loadRecentItems,
  loadFavorites,
  loadTags,
  savedContainerId,
  containerWidth,
  containerHeight,
  handleKeydown,
  handleExternalLinkClick,
  handleOpenLinkSearchEvent,
  onDetachedMessage,
  refreshAfterChange,
  loadFavoritesAfterSync: loadFavorites,
  clearSelectionAfterDelete,
  selectedNode,
  saveInlineNotes,
  detailPanelRef,
  undo,
  redo,
  showSettings
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
            @rename="renameWorkspace($event.id, $event.name)"
          />

          <MainToolbar
            v-model:view-mode="viewMode"
            v-model:sort-alphabetically="sortAlphabetically"
            v-model:show-settings="showSettings"
            v-model:graph-detail-threshold="graphDetailThreshold"
            v-model:graph-max-depth="graphMaxDepth"
            v-model:graph-root-max-depth="graphRootMaxDepth"
            v-model:graph-notes-preview-length="graphNotesPreviewLength"
            v-model:open-detail-fullscreen="openDetailFullscreen"
            v-model:hover-preview-enabled="hoverPreviewEnabled"
            v-model:inherit-colors="inheritColors"
            v-model:ai-enabled="aiEnabled"
            v-model:ai-provider="aiProvider"
            v-model:ollama-endpoint="ollamaEndpoint"
            v-model:ollama-model="ollamaModel"
            v-model:ollama-context-size="ollamaContextSize"
            v-model:openai-endpoint="openaiEndpoint"
            v-model:openai-api-key="openaiApiKey"
            v-model:openai-model="openaiModel"
            v-model:openai-skip-ssl-verification="openaiSkipSslVerification"
            v-model:ollama-enabled="ollamaEnabled"
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
            :current-workspace="currentWorkspace"
            @import-complete="loadChildren()"
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
          <!-- View Renderer - handles all view modes -->
          <ViewRenderer
            ref="viewRendererRef"
            :view-mode="viewMode"
            :loading="loading"
            :error="error"
            :sorted-children="sortedChildren"
            :filtered-children="filteredChildren"
            :selected-node="selectedNode"
            :selected-ids="selectedIds"
            :expanded-ids="expandedIds"
            :hide-completed="hideCompleted"
            :hide-sensitive="hideSensitive"
            :current-container-id="currentContainerId"
            :current-container="currentContainer"
            :color-map="inheritedColorMap"
            :hover-preview-enabled="hoverPreviewEnabled"
            :show-detail="showDetail"
            :graph-detail-threshold="graphDetailThreshold"
            :effective-graph-max-depth="effectiveGraphMaxDepth"
            :graph-notes-preview-length="graphNotesPreviewLength"
            :inherit-colors="inheritColors"
            :fullscreen-detail="fullscreenDetail"
            :sort-alphabetically="sortAlphabetically"
            :workspace="currentWorkspace"
            :workspaces="workspaces"
            :card-size-class="cardSizeClass"
            :cards-grid-style="cardsGridStyle"
            :editing-card-id="editingCardId"
            :editing-title="editingTitle"
            :inline-notes-id="inlineNotesId"
            :inline-notes-text="inlineNotesText"
            :drop-target="dropTarget"
            :drop-position="dropPosition"
            :container-title="currentContainer?.title"
            :trashed-items="trashedItems"
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
            @add-child="handleAddChild"
            @create="handleCreate"
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
            @link="linkNodesFromGraph"
            @unlink="unlinkNodesFromGraph"
            @insert-between="insertBetween"
            @update="updateNode"
            @delete-multiple="deleteMultipleNodes"
            @wrap-with-parent="wrapWithParent"
            @go-first-child="goToFirstChild"
            @go-prev-sibling="goToPrevSibling"
            @go-next-sibling="goToNextSibling"
            @navigate="navigateToNode"
            @empty-all="emptyAllTrash"
            @restore="restoreFromTrash"
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
          @child-updated="refreshAfterChildUpdate"
          @detach="handleDetach"
          @ai-improve-notes="handleAIImproveNotes"
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
      @open-move-search="handleContextMenuOpenMoveSearch"
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
      :has-more-results="hasMoreResults"
      :is-loading-more="isLoadingMore"
      @close="closeSearch"
      @search-input="onSearchInput"
      @keydown="handleSearchKeydown"
      @select-result="_goToSearchResult"
      @clear-recent="clearRecent"
      @load-more="loadMoreResults"
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
