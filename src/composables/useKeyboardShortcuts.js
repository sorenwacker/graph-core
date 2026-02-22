/**
 * Composable for handling global keyboard shortcuts.
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.actions - Action callbacks for each shortcut
 * @param {Object} options.state - Reactive state refs needed for shortcuts
 */
export function useKeyboardShortcuts({ actions, state }) {
  const {
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
    selectAll
  } = actions

  const {
    viewMode,
    selectedNode,
    selectedIds,
    currentContainerId,
    fullscreenDetail,
    detailPinned,
    showDetail,
    flatChildren
  } = state

  function isEditableElement(target) {
    return target.tagName === 'INPUT' ||
           target.tagName === 'TEXTAREA' ||
           target.tagName === 'SELECT' ||
           target.isContentEditable
  }

  function handleKeydown(e) {
    // Cmd/Ctrl+K - open spotlight search (works anywhere)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      openSearch()
      return
    }

    // Cmd/Ctrl+Z - Undo (works globally except in inputs)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
      if (!isEditableElement(e.target)) {
        e.preventDefault()
        undo()
        return
      }
    }

    // Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y - Redo (works globally except in inputs)
    if ((e.metaKey || e.ctrlKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      if (!isEditableElement(e.target)) {
        e.preventDefault()
        redo()
        return
      }
    }

    // Cmd/Ctrl+Enter - add child to selected node (cards/table view)
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      if (viewMode.value === 'cards' || viewMode.value === 'tree') {
        e.preventDefault()
        const parentId = selectedNode.value?.id || currentContainerId.value
        showAddNodeModal(parentId)
        return
      }
    }

    // Don't trigger other shortcuts if typing in an editable element
    if (isEditableElement(e.target)) return

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
      return
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
        clearSelection()
      }
      return
    }

    // Enter - toggle detail panel
    if (e.key === 'Enter') {
      e.preventDefault()
      toggleDetailPanel()
      return
    }

    // n - create new node (add to current container or selected node)
    if (e.key === 'n') {
      e.preventDefault()
      const parentId = selectedNode.value?.id || currentContainerId.value
      showAddNodeModal(parentId)
      return
    }

    // Ctrl/Cmd+A - select all visible
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      selectAll()
      return
    }
  }

  function setup() {
    window.addEventListener('keydown', handleKeydown)
  }

  function cleanup() {
    window.removeEventListener('keydown', handleKeydown)
  }

  // Note: Caller is responsible for calling setup() in onMounted
  // and cleanup() in onUnmounted if manual control is needed

  return {
    handleKeydown,
    setup,
    cleanup
  }
}
