/**
 * Resolve the rendered notes preview element that contains a DOM node, if any.
 *
 * The notes preview (and split preview) is a non-editable `.notes-preview` div,
 * so keyboard events targeting it bubble to the window-level handler. This helper
 * lets the Cmd/Ctrl+A handler recognise that the user is reading preview text.
 *
 * @param {Node|null|undefined} node - A DOM node (element or text node).
 * @returns {Element|null} The enclosing `.notes-preview` element, or null.
 */
export function resolveNotesPreview(node) {
  if (!node) return null
  const el = node.nodeType === 1 ? node : node.parentElement
  return el?.closest?.('.notes-preview') || null
}

/**
 * Find the notes preview the user is currently interacting with for a key event.
 *
 * Checks, in order: the event target, the focused element, and the current text
 * selection anchor. Any of these landing inside a `.notes-preview` means Cmd+A
 * should select that text rather than selecting all nodes.
 *
 * @param {KeyboardEvent} e - The keyboard event.
 * @returns {Element|null} The active preview element, or null.
 */
export function activeNotesPreview(e) {
  const sel = typeof window !== 'undefined' && window.getSelection ? window.getSelection() : null
  return (
    resolveNotesPreview(e?.target) ||
    resolveNotesPreview(typeof document !== 'undefined' ? document.activeElement : null) ||
    resolveNotesPreview(sel?.anchorNode)
  )
}

/**
 * Select all text contents of an element as a native browser selection.
 *
 * @param {Element} el - The element whose contents should be selected.
 */
export function selectElementText(el) {
  if (typeof window === 'undefined' || !window.getSelection || typeof document === 'undefined') {
    return
  }
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

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
    selectAll,
    enterContainer,
    openDetachedWindow,
    showShortcuts,
  } = actions

  const {
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
  } = state

  function isEditableElement(target) {
    return (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable ||
      // Check if inside CodeMirror editor
      target.closest?.('.cm-editor') !== null
    )
  }

  function isTextInput(target) {
    if (target.tagName === 'TEXTAREA' || target.isContentEditable) return true
    if (target.tagName === 'INPUT') {
      const type = target.type?.toLowerCase()
      return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type)
    }
    return false
  }

  function hasNoModifiers(e) {
    return !e.metaKey && !e.ctrlKey && !e.altKey
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

    // Space - toggle detail panel (works in table view even when checkbox is focused)
    // Shift+Space opens in detached window (Electron only)
    if (e.key === ' ' && !isTextInput(e.target)) {
      e.preventDefault()
      if (e.shiftKey && selectedNode.value && openDetachedWindow) {
        openDetachedWindow(selectedNode.value)
      } else {
        toggleDetailPanel()
      }
      return
    }

    // Enter - navigate into selected node (view subgraph)
    // Shift+Enter - navigate to parent
    if (e.key === 'Enter' && !isTextInput(e.target)) {
      e.preventDefault()
      if (e.shiftKey) {
        goToParent()
      } else if (selectedNode.value && enterContainer) {
        enterContainer(selectedNode.value)
      }
      return
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

    // ? - show keyboard shortcuts modal
    if (e.key === '?' && showShortcuts) {
      e.preventDefault()
      showShortcuts()
      return
    }

    // n - create new node (add to current container or selected node)
    if (e.key === 'n') {
      e.preventDefault()
      const parentId = selectedNode.value?.id || currentContainerId.value
      showAddNodeModal(parentId)
      return
    }

    // Ctrl/Cmd+A - select all visible nodes, unless the user is reading a
    // rendered notes preview, in which case select that text instead.
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      const previewEl = activeNotesPreview(e)
      if (previewEl) {
        e.preventDefault()
        selectElementText(previewEl)
        return
      }
      e.preventDefault()
      selectAll()
      return
    }

    // Tab / Shift+Tab - select next/previous visible node (when not in detail panel)
    if (e.key === 'Tab' && !showDetail?.value) {
      // Use flatChildren for graph view (all nodes in subgraph), filteredChildren for other views
      const nodes = viewMode.value === 'graph' ? flatChildren?.value || [] : filteredChildren?.value || []
      if (nodes.length === 0) return

      e.preventDefault()
      const currentId = selectedNode.value?.id
      const currentIndex = currentId ? nodes.findIndex(n => n.id === currentId) : -1

      let nextIndex
      if (e.shiftKey) {
        // Shift+Tab - previous node
        nextIndex = currentIndex <= 0 ? nodes.length - 1 : currentIndex - 1
      } else {
        // Tab - next node
        nextIndex = currentIndex >= nodes.length - 1 ? 0 : currentIndex + 1
      }

      const nextNode = nodes[nextIndex]
      if (nextNode && actions.selectNode) {
        actions.selectNode(nextNode)
      }
      return
    }

    // Arrow keys - grid navigation in cards view (without modifiers)
    if (viewMode.value === 'cards' && hasNoModifiers(e)) {
      const nodes = filteredChildren?.value || []
      if (nodes.length === 0) return

      const currentId = selectedNode.value?.id
      const currentIndex = currentId ? nodes.findIndex(n => n.id === currentId) : -1
      const cols = gridColumns?.value || 1

      let nextIndex = currentIndex
      if (e.key === 'ArrowLeft') {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex
      } else if (e.key === 'ArrowRight') {
        nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : currentIndex
      } else if (e.key === 'ArrowUp') {
        nextIndex = currentIndex >= cols ? currentIndex - cols : currentIndex
      } else if (e.key === 'ArrowDown') {
        nextIndex = currentIndex + cols < nodes.length ? currentIndex + cols : currentIndex
      }

      if (nextIndex !== currentIndex && nextIndex >= 0) {
        e.preventDefault()
        const nextNode = nodes[nextIndex]
        if (nextNode && actions.selectNode) {
          actions.selectNode(nextNode)
        }
      }
      return
    }

    // Arrow keys - list navigation in table/tree view (without modifiers)
    if ((viewMode.value === 'tree' || viewMode.value === 'table') && hasNoModifiers(e)) {
      // Use flatChildren for table which includes expanded hierarchy
      const nodes = flatChildren?.value || filteredChildren?.value || []
      if (nodes.length === 0) return

      const currentId = selectedNode.value?.id
      const currentIndex = currentId ? nodes.findIndex(n => n.id === currentId) : -1

      let nextIndex = currentIndex
      if (e.key === 'ArrowUp') {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : currentIndex
      } else if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < nodes.length - 1 ? currentIndex + 1 : currentIndex
      }

      if (nextIndex !== currentIndex && nextIndex >= 0) {
        e.preventDefault()
        const nextNode = nodes[nextIndex]
        if (nextNode && actions.selectNode) {
          actions.selectNode(nextNode)
        }
      }
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
    cleanup,
  }
}
