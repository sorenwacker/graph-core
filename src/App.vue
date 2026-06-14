<script setup>
import { ref, computed, watch } from 'vue'
import { api } from './services/api.js'
import { handleExternalLinkClick } from './utils/markdown.js'
import { provideAppContext } from './composables/useAppContext'
import { useAppLifecycle } from './composables/useAppLifecycle.js'
import { useNodeTooltip } from './composables/useNodeTooltip.js'
import { useDetachedWindow } from './composables/useDetachedWindow.js'
import { useSelection } from './composables/useSelection.js'
import { useCardDrag } from './composables/useCardDrag.js'
import { useSearch } from './composables/useSearch.js'
import { useInlineEdit } from './composables/useInlineEdit.js'
import { useSnapshots } from './composables/useSnapshots.js'
import { useContextMenu } from './composables/useContextMenu.js'
import { useUndoRedo } from './composables/useUndoRedo'
import { useSettings } from './composables/useSettings'
import { useWorkspace } from './composables/useWorkspace'
import { useSidebar } from './composables/useSidebar'
import { useNodeOperations } from './composables/useNodeOperations'
import { useDataLoading } from './composables/useDataLoading'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'
import { useTreeExpand } from './composables/useTreeExpand.js'
import { useCardsLayout } from './composables/useCardsLayout.js'
import { useNavigation } from './composables/useNavigation.js'
import { useGraphOperations } from './composables/useGraphOperations.js'
import { useRefresh } from './composables/useRefresh.js'
import { useNodeActionsUI } from './composables/useNodeActionsUI'
import { useDetailController } from './composables/useDetailController'
import { useModalController } from './composables/useModalController'
import { useViewStateController } from './composables/useViewStateController'
import { useNavigationState } from './composables/useNavigationState'
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
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.vue'
import OnboardingModal from './components/OnboardingModal.vue'
import HintBar from './components/HintBar.vue'
import { showToast } from './composables/useToast.js'
import { handleError } from './composables/useErrorHandler.js'
import { useDemoWorkspace } from './composables/useDemoWorkspace.js'
import { useFiltersStore } from './stores/filters.js'
import { useGraphSettings } from './composables/useGraphSettings'

// Settings
const {
  viewMode,
  containerId: savedContainerId,
  hideCompleted,
  hideSensitive,
  graphDetailThreshold,
  graphMaxDepth,
  graphNotesPreviewLength,
  openDetailFullscreen,
  hoverPreviewEnabled,
  inheritColors,
  sidebarPinned,
  aiProvider,
  aiEnabled,
  ollamaEndpoint,
  ollamaModel,
  ollamaContextSize,
  openaiEndpoint,
  openaiApiKey,
  openaiModel,
  openaiSkipSslVerification,
  ollamaEnabled,
  hasSeenOnboarding,
  showHintBar,
} = useSettings()

// Detail panel controller
const {
  showDetail,
  fullscreenDetail,
  detailPinned,
  detailWidth,
  isResizingDetail,
  detailPanelRef,
  closeDetail,
  onDetailResizeStart,
} = useDetailController()

// Modal controller
const modalController = useModalController()
const { addNodeModal, showShortcutsModal, showOnboarding, showSettings, showSnapshotList, showLostFound } =
  modalController
if (!hasSeenOnboarding.value) showOnboarding.value = true

// View state controller
const viewStateController = useViewStateController({ viewMode })
const { sortAlphabetically, transitioning, transitionDirection } = viewStateController

// Filter store - shared filter state across all views
const filtersStore = useFiltersStore()
// Initialize with persisted settings immediately (before any graph rendering)
filtersStore.setMaxDepth(graphMaxDepth.value)

// Navigation state
const { currentContainerId, currentContainer, breadcrumbs, children, syncFromNavigation, resetNavigationState } =
  useNavigationState()

// Core state
const error = ref(null)
const newNodeTitle = ref('')
const newNodeType = ref('task')
const containerWidth = ref(800)
const containerHeight = ref(600)
const viewRendererRef = ref(null)
const addChildParentId = ref(null)

// Sidebar
const {
  hovered: sidebarHovered,
  expandedIds: sidebarExpandedIds,
  visible: sidebarVisible,
  onEnter: onSidebarEnter,
  onLeave: onSidebarLeave,
  toggleExpand: toggleSidebarExpand,
  expandToPath: expandSidebarToPath,
} = useSidebar({ pinned: sidebarPinned })

// Workspace
const {
  currentWorkspace,
  workspaces,
  loadWorkspaces,
  createWorkspace: createNewWorkspace,
  deleteCurrentWorkspace: _deleteCurrentWorkspace,
  renameWorkspace,
  getWorkspaceIdForNode,
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
  },
})

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
  deleteOrphanedNode,
} = useDataLoading(currentWorkspace)

const selectTag = tag => {
  // For legacy string tags, search by hashtag
  const tagName = tag.title || tag
  searchQuery.value = `#${tagName}`
  showSearch.value = true
  onSearchInput()
}

const navigateToTag = async tagNode => {
  // Navigate into the tag node to show all linked items
  if (tagNode && tagNode.id) {
    await enterContainer(tagNode)
  }
}
watch(viewMode, mode => {
  if (mode === 'trash') loadTrashedItems()
})

// Snapshots
const { availableSnapshots, snapshotMessage, loadSnapshots, createSnapshot, restoreSnapshot, reloadDatabase } =
  useSnapshots({
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
    },
  })

function toggleSnapshots() {
  showSnapshotList.value = !showSnapshotList.value
  loadSnapshots()
}
function toggleLostFound() {
  loadOrphanedNodes()
  showLostFound.value = !showLostFound.value
}

// Tooltip
const {
  showTooltip,
  hideTooltip,
  forceHide: forceHideTooltip,
  toggleLock: toggleTooltipLock,
} = useNodeTooltip({
  onToggleComplete: async nodeId => {
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (node) await toggleComplete(node)
  },
  getHideSensitive: () => hideSensitive.value,
  shouldShowTooltip: node => {
    if (hideSensitive.value && node?.notes_sensitive) {
      return false
    }
    return hoverPreviewEnabled.value && !showDetail.value && !sidebarVisible.value
  },
})
watch(showDetail, isOpen => {
  if (isOpen) forceHideTooltip()
})
watch(sidebarVisible, isOpen => {
  if (isOpen) forceHideTooltip()
})

// Detached window
const {
  openDetachedWindow,
  broadcastNodeUpdate,
  broadcastNodeDelete,
  onMessage: onDetachedMessage,
} = useDetachedWindow()

// Cards layout
const {
  filteredChildren,
  sortedChildren,
  flatChildren,
  cardSizeClass,
  cardsGridStyle,
  gridColumns,
  inheritedColorMap,
} = useCardsLayout({
  children,
  hideCompleted,
  sortAlphabetically,
  containerWidth,
  containerHeight,
  breadcrumbs,
  currentContainer,
  inheritColors,
})

// Undo/redo
const { undoStack, redoStack, pushCommand, undo, redo } = useUndoRedo({
  api,
  showNotification: showToast,
  onSuccess: async () => {
    await loadChildren(currentContainerId.value, { silent: true })
    await loadSidebarTree()
  },
})

// Node operations
const nodeOps = useNodeOperations({
  api,
  pushCommand,
  getWorkspaceIdForNode,
  onSuccess: async ({ type, node, x, y }) => {
    if (type === 'create' && node) saveNodePosition(node.id, x, y, node.parent_id)
  },
  // Surface node-operation failures as a transient toast, consistent with the
  // selection and move handlers. Previously this set the sticky `error` ref,
  // which replaced the whole view with a banner that never cleared.
  onError: e => handleError(e, { context: 'Node operation' }),
  broadcastUpdate: broadcastNodeUpdate,
  broadcastDelete: broadcastNodeDelete,
})

// Tree expand
const { expandedIds, toggleExpand, expandAll, collapseAll, expandAncestors, loadExpandedState } = useTreeExpand({
  workspace: currentWorkspace,
  flatChildren,
})

// Auto-expand tree to show current container
watch(currentContainerId, newId => {
  if (newId) {
    expandAncestors(newId)
    expandedIds.value.add(newId) // Also expand the current node to show its children
    expandedIds.value = new Set(expandedIds.value) // Trigger reactivity
    // Also expand sidebar tree to current path
    expandSidebarToPath(breadcrumbs.value)
    sidebarExpandedIds.value.add(newId)
    sidebarExpandedIds.value = new Set(sidebarExpandedIds.value)
  }
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
  selectAll,
} = useSelection({
  showDetail,
  fullscreenDetail,
  openDetailFullscreen,
  flatChildren,
  currentContainer,
  getNode: nodeId => api.getNode(nodeId),
  onError: handleError,
})

function selectNode(node, options = {}) {
  if (!node && detailPinned.value) return
  _selectNode(node, options)
}
watch(selectedNode, node => {
  if (!node && !detailPinned.value) showDetail.value = false
})

// Card drag
const {
  dropTarget,
  dropPosition,
  onDragStart: _onCardDragStart,
  onDragEnd: onCardDragEnd,
  onDragOver: onCardDragOver,
  onDragLeave: onCardDragLeave,
  onDrop: onCardDrop,
} = useCardDrag({
  selectedIds,
  onMove: (src, tgt) => moveNode({ nodeId: src.id, newParentId: tgt.id }),
  onMoveMultiple: (nodeIds, tgt) => moveMultipleNodes({ nodeIds, newParentId: tgt.id }),
  onReorder: (src, tgt, pos) => handleReorder({ nodeId: src.id, targetId: tgt.id, position: pos }),
})

// Wrap drag start to hide tooltip
function onCardDragStart(e, node) {
  forceHideTooltip()
  _onCardDragStart(e, node)
}

// Workspace graph settings defaults (for filter sync)
const workspaceGraphSettings = useGraphSettings({ workspace: currentWorkspace })

// Sync filter store changes back to global settings for persistence
watch(
  () => filtersStore.maxDepth,
  val => {
    if (val !== graphMaxDepth.value) {
      graphMaxDepth.value = val
    }
  }
)

watch(
  () => filtersStore.visibleTypes,
  val => {
    const current = workspaceGraphSettings.visibleTypes.value
    if (JSON.stringify(val) !== JSON.stringify(current)) {
      workspaceGraphSettings.visibleTypes.value = [...val]
    }
  },
  { deep: true }
)

// Sync filter state from container settings when navigating
watch(currentContainer, container => {
  filtersStore.syncFromNode(container, {
    maxDepth: graphMaxDepth.value,
    visibleTypes: workspaceGraphSettings.visibleTypes.value,
  })
})

// Navigation
const navigation = useNavigation({
  api,
  workspace: currentWorkspace,
  debounce: { enabled: true, delay: 200 },
  buildChildTree,
  onBeforeNavigate: cancelDetailOpen,
  onLeafNode: () => false,
  onSelectNode: selectNode,
  onSidebarSync: rootChildren => {
    sidebarTree.value = rootChildren
  },
  onTransitionStart: dir => {
    transitionDirection.value = dir
    transitioning.value = true
  },
  onTransitionEnd: () => {
    transitioning.value = false
  },
  onNotFound: async () => {
    currentContainerId.value = null
    localStorage.removeItem('graphcore-containerId')
    await navigation.loadChildren(null)
  },
  onAfterNavigate: () => {
    // Don't sync filter settings on navigation - keep global settings persistent
  },
})

syncFromNavigation(navigation)

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
  navigateToNode,
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
  loadMoreResults,
} = useSearch({
  selectedNode,
  onSearch: async (query, mode, workspaceId, paginationOptions = {}) => {
    const searchOptions = { hideCompleted: hideCompleted.value, ...paginationOptions }
    if (query.startsWith('#') && query.length > 1)
      return await api.getNodesByTag(query.slice(1), workspaceId, searchOptions)
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
      // Reload data to immediately reflect the move in the UI
      await refreshGraphAfterStructureChange(true)
      if (selectedNode.value?.id === sourceId) selectedNode.value = await api.getNode(sourceId)
    } catch (e) {
      handleError(e, { context: 'Moving node' })
    }
  },
  onNavigate: async node => {
    if (currentContainerId.value !== node.id) await loadChildren(node.id)
    selectNode(node)
  },
  getAncestors: api.getAncestors,
  getWorkspace: () => currentWorkspace.value,
})

// Inline edit
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
  cancelInlineNotes,
} = useInlineEdit({
  findNode: nodeId => flatChildren.value.find(n => n.id === nodeId),
  onSaveTitle: async (nodeId, newTitle) => {
    await api.updateNode(nodeId, { title: newTitle })
    await loadChildren(currentContainerId.value)
  },
  onSaveNotes: async (nodeId, newNotes, { autoSave }) => {
    await api.updateNode(nodeId, { notes: newNotes })
    // Update local node data for immediate preview update
    const node = flatChildren.value.find(n => n.id === nodeId)
    if (node) node.notes = newNotes
    if (!autoSave) await loadChildren(currentContainerId.value)
  },
})

// Refresh operations
const {
  refreshAfterChange,
  refreshAfterDelete,
  refreshGraphAfterStructureChange,
  refreshDetailPanelLinks,
  refreshAfterChildUpdate,
} = useRefresh({
  api,
  loadChildren,
  loadSidebarTree,
  loadRecentItems,
  loadFavorites,
  loadTags,
  invalidateSidebarCache,
  currentContainerId,
  selectedNode,
  graphViewRef: viewRendererRef,
  detailPanelRef,
})

// Provide app context for composables using provide/inject pattern
provideAppContext({
  // Services
  api,
  // State refs
  currentWorkspace,
  currentContainerId,
  selectedNode,
  selectedIds,
  showDetail,
  expandedIds,
  breadcrumbs,
  children,
  flatChildren,
  viewRendererRef,
  detailPanelRef,
  error,
  // Navigation
  enterContainer,
  navigateBack,
  // Data loading
  loadChildren,
  loadSidebarTree,
  loadFavorites,
  loadRecentItems,
  loadTags,
  invalidateSidebarCache,
  // Refresh operations
  refreshAfterChange,
  refreshAfterDelete,
  refreshGraphAfterStructureChange,
  refreshDetailPanelLinks,
})

// Graph operations
const graphOps = useGraphOperations({
  api,
  currentContainerId,
  currentWorkspace,
  expandedIds,
  getWorkspaceIdForNode,
  refreshAfterChange,
})
const { saveNodePosition, insertBetween } = graphOps

// Node actions UI (uses app context for shared state)
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
  clearSelection,
} = useNodeActionsUI({
  nodeOps,
  pushCommand,
  getWorkspaceIdForNode,
})

// Node creation
async function createNode() {
  if (!newNodeTitle.value.trim()) return
  const targetParentId = addChildParentId.value || currentContainerId.value
  const newNode = await nodeOps.createNode({
    title: newNodeTitle.value,
    type: newNodeType.value,
    parentId: targetParentId,
  })
  if (newNode) {
    if (addChildParentId.value) {
      expandedIds.value.add(addChildParentId.value)
      await loadSidebarTree()
    }
    newNodeTitle.value = ''
    addChildParentId.value = null
    await loadChildren(currentContainerId.value, { silent: true })
  }
}

const addChildFromDetail = async payload => {
  await addChildNode(payload)
  detailPanelRef.value?.loadChildren()
}

async function createNodeAtPosition({ title, type, x, y }) {
  const newNode = await nodeOps.createNode({ title, type, parentId: currentContainerId.value, x, y })
  if (newNode) {
    await refreshAfterChange()
    selectNode(newNode)
  }
}

const handleDetach = node => node && openDetachedWindow(node.id, node.title)

// Context menu
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
  handleViewContextMenu,
} = useContextMenu({
  onLoadLinks: api.getLinkedNodes,
  onViewDetails: selectNode,
  onEnter: enterContainer,
  onAddChild: node => showAddNodeModal(node.id),
  onToggleComplete: toggleComplete,
  onToggleFavorite: toggleFavorite,
  onOpenLinkSearch: openLinkSearch,
  onOpenMoveSearch: openMoveSearch,
  onUnlink: nodeOps.unlinkNodes,
  onMoveToWorkspace: async (nodeId, wsId) => {
    await api.updateNode(nodeId, { workspace_id: wsId })
    await loadChildren()
  },
  onDelete: deleteNode,
  onRefreshSelectedNode: async sourceId => {
    if (showDetail.value && selectedNode.value?.id === sourceId) selectedNode.value = await api.getNode(sourceId)
  },
})

const showCardTooltip = (e, node) => {
  if (!editingCardId.value && !inlineNotesId.value) showTooltip(e, node)
}

// Handle select with optional tooltip lock (for cards view)
const handleSelectWithTooltip = (node, event) => {
  // If event is passed (from cards view), toggle tooltip lock
  if (node && event && typeof event.preventDefault === 'function') {
    toggleTooltipLock(node, event)
  } else if (!node) {
    // Clicking canvas (deselect) should dismiss any locked tooltip
    forceHideTooltip()
  }
  selectNode(node)
}

// Add node modal
const showAddNodeModal = (parentId = null) => {
  showDetail.value = false
  addNodeModal.value = { visible: true, parentId }
}

function handleAddChild(payload, e) {
  if (payload?.title) {
    addChildNode(payload)
    return
  }
  e?.stopPropagation()
  hideTooltip()
  showAddNodeModal(payload)
}

function handleCreate(payload) {
  if (payload?.title) {
    createNodeAtPosition(payload)
    return
  }
  hideTooltip()
  showAddNodeModal(currentContainerId.value)
}

// Keyboard shortcuts
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
    openDetachedWindow: handleDetach,
    showShortcuts: () => {
      showShortcutsModal.value = true
    },
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
    gridColumns,
  },
})

const handleOpenLinkSearchEvent = e => {
  if (e.detail?.nodeId === selectedNode.value?.id) openLinkSearch()
}

// Demo workspace
const { createDemo, resetDemo } = useDemoWorkspace({ api, currentWorkspace, loadWorkspaces })

function handleShowOnboarding() {
  showSettings.value = false
  showOnboarding.value = true
}
function handleCreateDemo() {
  showSettings.value = false
  createDemo()
}
function handleResetDemo() {
  showSettings.value = false
  resetDemo()
}

// App lifecycle
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
  showSettings,
  showShortcuts: showShortcutsModal,
  onAfterInitialLoad: () => {
    // Initialize filter store with global settings
    filtersStore.setMaxDepth(graphMaxDepth.value)
  },
})
</script>

<template>
  <div class="app" :class="{ 'is-resizing': isResizingDetail }">
    <div v-if="!sidebarPinned" class="sidebar-trigger" @mouseenter="onSidebarEnter" @mouseleave="onSidebarLeave"></div>

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
      @navigate-tag="navigateToTag"
      @navigate-root="navigateToBreadcrumb(-1)"
      @mouseenter="onSidebarEnter"
      @mouseleave="onSidebarLeave"
    />

    <main class="main-content">
      <div class="content-header">
        <div class="header-row">
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
            v-model:graph-notes-preview-length="graphNotesPreviewLength"
            v-model:open-detail-fullscreen="openDetailFullscreen"
            v-model:hover-preview-enabled="hoverPreviewEnabled"
            v-model:inherit-colors="inheritColors"
            v-model:show-hint-bar="showHintBar"
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
            :current-workspace="currentWorkspace"
            @toggle-completed="hideCompleted = !hideCompleted"
            @open-search="openSearch"
            @undo="undo"
            @redo="redo"
            @create-snapshot="createSnapshot"
            @toggle-snapshots="toggleSnapshots"
            @restore-snapshot="restoreSnapshot"
            @reload-database="reloadDatabase"
            @toggle-lost-found="toggleLostFound"
            @move-to-root="moveToRoot"
            @delete-orphan="deleteOrphanedNode"
            @import-complete="loadChildren()"
            @show-onboarding="handleShowOnboarding"
            @create-demo="handleCreateDemo"
            @reset-demo="handleResetDemo"
          />
        </div>
      </div>

      <AddNodeBar v-model:node-type="newNodeType" v-model:node-title="newNodeTitle" @create="createNode" />

      <div class="content-wrapper">
        <div class="content-main">
          <Breadcrumbs :breadcrumbs="breadcrumbs" @navigate="navigateToBreadcrumb" />
          <div
            class="content-body"
            :class="{
              transitioning,
              'transition-forward': transitionDirection === 'forward',
              'transition-back': transitionDirection === 'back',
            }"
          >
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
              :sidebar-visible="sidebarVisible"
              :show-detail="showDetail"
              :graph-detail-threshold="graphDetailThreshold"
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
              @select="handleSelectWithTooltip"
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
              @drag-over="(e, node, pos) => onCardDragOver(e, node, pos)"
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

    <AddNodeModal
      :visible="addNodeModal.visible"
      :parent-id="addNodeModal.parentId"
      @close="addNodeModal.visible = false"
      @create="addChildNode"
    />

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

    <ToastContainer />
    <KeyboardShortcutsModal :visible="showShortcutsModal" @close="showShortcutsModal = false" />
    <OnboardingModal
      :visible="showOnboarding"
      @close="showOnboarding = false"
      @dismiss-forever="hasSeenOnboarding = true"
      @create-demo="createDemo"
    />
    <HintBar :visible="showHintBar" :sidebar-pinned="sidebarPinned" @dismiss="showHintBar = false" />
  </div>
</template>

<style scoped>
.app.is-resizing {
  cursor: ew-resize;
  user-select: none;
}
.app.is-resizing * {
  cursor: ew-resize !important;
}

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

.content-body {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
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
