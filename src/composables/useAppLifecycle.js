import { onMounted, onUnmounted } from 'vue'

/**
 * Composable for App.vue lifecycle management.
 * Handles initialization, event listeners, resize observer, and cleanup.
 */
export function useAppLifecycle({
  // Dependencies
  loadWorkspaces,
  loadChildren,
  loadExpandedState,
  loadRecentItems,
  loadFavorites,
  loadTags,
  savedContainerId,
  // Dimensions
  containerWidth,
  containerHeight,
  // Event handlers
  handleKeydown,
  handleExternalLinkClick,
  handleOpenLinkSearchEvent,
  // Detached window
  onDetachedMessage,
  refreshAfterChange,
  loadFavoritesAfterSync,
  clearSelectionAfterDelete,
  selectedNode,
  // Inline edit
  saveInlineNotes,
  detailPanelRef,
  // Undo/redo
  undo,
  redo,
  // Settings
  showSettings,
  // Shortcuts modal
  showShortcuts,
  // Callback after initial load
  onAfterInitialLoad,
}) {
  let resizeObserver = null

  function updateDimensions() {
    const el = document.querySelector('.content-body')
    if (el) {
      containerWidth.value = el.clientWidth
      containerHeight.value = el.clientHeight
    }
  }

  function setupDetachedMessageHandler() {
    onDetachedMessage(async data => {
      if (data.type === 'node-updated' && data.node) {
        await refreshAfterChange({ recent: false })
        loadFavoritesAfterSync()
        if (selectedNode.value?.id === data.node.id) {
          selectedNode.value = { ...data.node }
        }
      } else if (data.type === 'node-deleted' && data.nodeId) {
        if (selectedNode.value?.id === data.nodeId) {
          clearSelectionAfterDelete()
        }
        await refreshAfterChange({ recent: false })
      }
    })
  }

  function setupElectronHandlers() {
    if (window.electronAPI) {
      window.electronAPI.onMenuUndo(() => undo())
      window.electronAPI.onMenuRedo(() => redo())
      window.electronAPI.onOpenSettings(() => {
        showSettings.value = true
      })
      if (showShortcuts) {
        window.electronAPI.onShowShortcuts?.(() => {
          showShortcuts.value = true
        })
      }

      // Autosave before app quits
      window.electronAPI.onBeforeQuit(() => {
        saveInlineNotes()
        detailPanelRef.value?.saveChanges()
      })
    }
  }

  function setupResizeObserver() {
    updateDimensions()
    resizeObserver = new ResizeObserver(updateDimensions)
    const contentBody = document.querySelector('.content-body')
    if (contentBody) {
      resizeObserver.observe(contentBody)
    }
  }

  function setupEventListeners() {
    window.addEventListener('resize', updateDimensions)
    window.addEventListener('keydown', handleKeydown)
    window.addEventListener('open-link-search', handleOpenLinkSearchEvent)
    document.addEventListener('click', handleExternalLinkClick, true)
  }

  function cleanupEventListeners() {
    window.removeEventListener('resize', updateDimensions)
    window.removeEventListener('keydown', handleKeydown)
    window.removeEventListener('open-link-search', handleOpenLinkSearchEvent)
    document.removeEventListener('click', handleExternalLinkClick, true)
    resizeObserver?.disconnect()
  }

  async function initialize() {
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

    // Sync filters after initial load
    if (onAfterInitialLoad) {
      onAfterInitialLoad()
    }

    // Restore expanded state from localStorage
    loadExpandedState()

    // Load recent items, favorites, and tags for sidebar
    await Promise.all([loadRecentItems(), loadFavorites(), loadTags()])

    // Setup resize observer and event listeners
    setupResizeObserver()
    setupEventListeners()

    // Setup handlers
    setupDetachedMessageHandler()
    setupElectronHandlers()
  }

  onMounted(initialize)
  onUnmounted(cleanupEventListeners)

  return {
    updateDimensions,
  }
}
