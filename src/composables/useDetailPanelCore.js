import { ref, computed } from 'vue'
import { api } from '../services/api'
import { getInitials, formatDate, getDueStatus } from '../utils/formatting.js'
import { useErrorHandler } from './useErrorHandler.js'
import { useMentions } from './useMentions.js'
import { useNodeTable } from './useNodeTable.js'

/**
 * Core composable for DetailPanel shared functionality
 * Used by DetailPanel, PersonDetailForm, and OrganizationDetailForm
 */
export function useDetailPanelCore(props, emit) {
  const { handleError } = useErrorHandler()

  // Core state
  const editedNode = ref({})
  const children = ref([])
  const loadingChildren = ref(false)
  const linkedNodes = ref([])
  const newTaskTitle = ref('')

  // Tab state for notes
  const activeTab = ref('edit')
  const showSensitivePreview = ref(false)

  // Collapsible sections
  const notesCollapsed = ref(false)
  const tableCollapsed = ref(true)
  const childrenCollapsed = ref(false)
  const metadataCollapsed = ref(false)

  // Node table (spreadsheet) state
  const {
    table: nodeTable,
    cells: tableCells,
    loading: tableLoading,
    hasTable,
    loadTable,
    createTable,
    updateTable,
    deleteTable,
    saveCell,
    saveCellStyle
  } = useNodeTable()

  // Expanded children and their grandchildren
  const expandedChildren = ref(new Set())
  const grandchildren = ref({})

  // Drag state for reordering
  const draggedChild = ref(null)
  const dropTarget = ref(null)
  const dropPosition = ref(null)

  // Panel state
  const isResizing = ref(false)
  const showExportMenu = ref(false)

  // Notes autosave timeout
  let notesAutosaveTimeout = null

  // Refs for editor components
  const titleInput = ref(null)
  const notesEditorRef = ref(null)
  const notesEditorSplitRef = ref(null)

  // Mentions system
  const {
    showMentions,
    mentionPosition,
    filteredPersons,
    selectedMentionIndex,
    handleInput: handleMentionInput,
    handleKeydown: handleMentionKeydown,
    selectMention,
    hideMentions,
    refreshPersons
  } = useMentions({
    onMentionInserted: async () => {
      await loadLinkedNodes()
    },
    workspaceId: props.currentWorkspace
  })

  // Computed properties
  const filteredChildren = computed(() => {
    if (!props.hideCompleted) return children.value
    return children.value.filter(child => !child.completed)
  })

  const completedChildrenCount = computed(() => {
    return children.value.filter(c => c.completed).length
  })

  const formattedCreatedDate = computed(() => formatDate(editedNode.value?.created_at))
  const formattedUpdatedDate = computed(() => formatDate(editedNode.value?.updated_at))

  const isPerson = computed(() => editedNode.value.type === 'person')
  const isOrganization = computed(() => editedNode.value.type === 'organization')

  // Data loading functions
  async function loadChildren() {
    if (!props.node?.id) return
    loadingChildren.value = true
    try {
      const childNodes = await api.getChildren(props.node.id)
      children.value = childNodes.filter(d => d.type === 'task')
    } catch (err) {
      handleError(err, { context: 'Loading children', silent: true })
      children.value = []
    } finally {
      loadingChildren.value = false
    }
  }

  async function loadLinkedNodes() {
    if (!props.node?.id) return
    try {
      linkedNodes.value = await api.getLinkedNodes(props.node.id)
    } catch (err) {
      handleError(err, { context: 'Loading linked nodes', silent: true })
      linkedNodes.value = []
    }
  }

  async function removeLink(targetNode) {
    try {
      await api.unlinkNodes(props.node.id, targetNode.id)
      await loadLinkedNodes()
    } catch (err) {
      handleError(err, { context: 'Unlinking nodes' })
    }
  }

  // Notes handling
  function onCodeMirrorNotesUpdate(newValue) {
    editedNode.value.notes = newValue
    if (notesAutosaveTimeout) clearTimeout(notesAutosaveTimeout)
    notesAutosaveTimeout = setTimeout(() => {
      saveChanges()
    }, 500)
  }

  function getNotesSelection() {
    const editor = notesEditorRef.value || notesEditorSplitRef.value
    if (editor && typeof editor.getSelection === 'function') {
      return editor.getSelection()
    }
    return { text: '', from: 0, to: 0 }
  }

  function onAIImproveNotes(payload) {
    emit('ai-improve-notes', payload)
  }

  // Save and update functions
  function saveChanges() {
    if (notesAutosaveTimeout) {
      clearTimeout(notesAutosaveTimeout)
      notesAutosaveTimeout = null
    }
    emit('update', editedNode.value)
  }

  async function changeWorkspace(newWorkspaceId) {
    editedNode.value.workspace_id = newWorkspaceId
    await api.updateNode(editedNode.value.id, { workspace_id: newWorkspaceId })
    emit('update', editedNode.value)
  }

  function deleteNode() {
    emit('delete', props.node.id)
  }

  function wrapWithParent() {
    const title = prompt('New parent title:')
    if (title) {
      emit('wrap-with-parent', { nodeId: props.node.id, parentTitle: title })
    }
  }

  function moveToRoot() {
    emit('move-to-root', props.node.id)
  }

  // Field update functions
  function setImportance(level) {
    editedNode.value.importance = level
    saveChanges()
  }

  function clearDate(field) {
    editedNode.value[field] = null
    saveChanges()
  }

  function updateDate(field, value) {
    editedNode.value[field] = value || null
    saveChanges()
  }

  function updateTags(newTags) {
    editedNode.value.tags = newTags
    saveChanges()
  }

  // Child task functions
  function addTask() {
    const title = newTaskTitle.value.trim()
    if (!title) return
    emit('add-child', { parentId: props.node.id, title, type: 'task' })
    newTaskTitle.value = ''
  }

  async function toggleChildComplete(child) {
    try {
      await api.updateNode(child.id, { completed: !child.completed })
      await loadChildren()
      emit('child-updated', child.id)
    } catch (err) {
      handleError(err, { context: 'Toggling child completion' })
    }
  }

  function selectChild(child) {
    emit('select-child', child.id)
  }

  // Drag and drop for reordering
  function onDragStart(e, child) {
    draggedChild.value = child
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', child.id)
  }

  function onDragOver(e, child) {
    if (!draggedChild.value || draggedChild.value.id === child.id) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const rect = e.currentTarget.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    dropPosition.value = e.clientY < midY ? 'before' : 'after'
    dropTarget.value = child
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      if (dropTarget.value?.id === e.currentTarget.dataset.childId) {
        dropTarget.value = null
        dropPosition.value = null
      }
    }
  }

  async function onDrop(e, child) {
    e.preventDefault()
    if (!draggedChild.value || draggedChild.value.id === child.id) return

    try {
      await api.reorderNode(draggedChild.value.id, child.id, dropPosition.value)
      await loadChildren()
      emit('child-updated', draggedChild.value.id)
    } catch (err) {
      handleError(err, { context: 'Reordering children' })
    }

    draggedChild.value = null
    dropTarget.value = null
    dropPosition.value = null
  }

  function onDragEnd() {
    draggedChild.value = null
    dropTarget.value = null
    dropPosition.value = null
  }

  // Export functions
  function generateFilename(ext) {
    const date = new Date()
    const yy = String(date.getFullYear()).slice(-2)
    const mm = String(date.getMonth() + 1).padStart(2, '0')
    const dd = String(date.getDate()).padStart(2, '0')
    const dateStr = `${yy}${mm}${dd}`
    const safeName = editedNode.value.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50)
    return `${dateStr}-${safeName}.${ext}`
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  async function exportMarkdown() {
    try {
      const result = await api.exportMarkdown(editedNode.value.id)
      downloadFile(result.markdown, generateFilename('md'), 'text/markdown')
      showExportMenu.value = false
    } catch (err) {
      handleError(err, { context: 'Exporting markdown' })
    }
  }

  async function exportJSON() {
    try {
      const result = await api.exportJSON(editedNode.value.id)
      downloadFile(JSON.stringify(result, null, 2), generateFilename('json'), 'application/json')
      showExportMenu.value = false
    } catch (err) {
      handleError(err, { context: 'Exporting JSON' })
    }
  }

  async function exportCSV() {
    try {
      const result = await api.exportCSV(editedNode.value.id, props.currentWorkspace)
      downloadFile(result.csv, generateFilename('csv'), 'text/csv')
      showExportMenu.value = false
    } catch (err) {
      handleError(err, { context: 'Exporting CSV' })
    }
  }

  // Table handlers
  async function handleCreateTable() {
    if (!props.node?.id) return
    await createTable(props.node.id, { name: 'Table' })
    tableCollapsed.value = false
  }

  async function handleDeleteTable() {
    if (!props.node?.id) return
    await deleteTable(props.node.id)
  }

  async function handleCellChange({ row, col, value, isFormula }) {
    if (!props.node?.id) return
    await saveCell(props.node.id, row, col, value, isFormula)
  }

  async function handleStyleChange({ row, col, style }) {
    if (!props.node?.id) return
    await saveCellStyle(props.node.id, row, col, style)
  }

  async function handleTableStructureChange({ type, value }) {
    if (!props.node?.id) return
    await updateTable(props.node.id, { [type]: value })
    await loadTable(props.node.id)
  }

  // Resize handling
  function startResize(e) {
    isResizing.value = true
    emit('resize-start', e)
  }

  function autoResizeTitle(e) {
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  // Keyboard handling
  function handleKeydown(e) {
    if (e.key === 'Escape') {
      const active = document.activeElement
      if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
        active.blur()
        return
      }
      emit('close')
    }
  }

  // Cleanup
  function cleanup() {
    if (notesAutosaveTimeout) {
      clearTimeout(notesAutosaveTimeout)
      notesAutosaveTimeout = null
    }
  }

  return {
    // State
    editedNode,
    children,
    loadingChildren,
    linkedNodes,
    newTaskTitle,
    activeTab,
    showSensitivePreview,
    notesCollapsed,
    tableCollapsed,
    childrenCollapsed,
    metadataCollapsed,
    expandedChildren,
    grandchildren,
    draggedChild,
    dropTarget,
    dropPosition,
    isResizing,
    showExportMenu,
    titleInput,
    notesEditorRef,
    notesEditorSplitRef,

    // Node table
    nodeTable,
    tableCells,
    tableLoading,
    hasTable,
    loadTable,

    // Mentions
    showMentions,
    mentionPosition,
    filteredPersons,
    selectedMentionIndex,
    handleMentionInput,
    handleMentionKeydown,
    selectMention,
    hideMentions,
    refreshPersons,

    // Computed
    filteredChildren,
    completedChildrenCount,
    formattedCreatedDate,
    formattedUpdatedDate,
    isPerson,
    isOrganization,

    // Data loading
    loadChildren,
    loadLinkedNodes,
    removeLink,

    // Notes
    onCodeMirrorNotesUpdate,
    getNotesSelection,
    onAIImproveNotes,

    // Save/update
    saveChanges,
    changeWorkspace,
    deleteNode,
    wrapWithParent,
    moveToRoot,

    // Helpers
    getInitials,
    getDueStatus,
    setImportance,
    clearDate,
    updateDate,
    updateTags,

    // Child tasks
    addTask,
    toggleChildComplete,
    selectChild,

    // Drag and drop
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,

    // Export
    exportMarkdown,
    exportJSON,
    exportCSV,

    // Table
    handleCreateTable,
    handleDeleteTable,
    handleCellChange,
    handleStyleChange,
    handleTableStructureChange,

    // UI
    startResize,
    autoResizeTitle,
    handleKeydown,
    cleanup
  }
}
