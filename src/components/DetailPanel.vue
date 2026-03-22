<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import MentionDropdown from './MentionDropdown.vue'
import TagInput from './TagInput.vue'
import NotesEditor from './NotesEditor.vue'
import NotesAIToolbar from './NotesAIToolbar.vue'
import NodeSpreadsheet from './NodeSpreadsheet.vue'
import PersonDetailForm from './detail/PersonDetailForm.vue'
import OrganizationDetailForm from './detail/OrganizationDetailForm.vue'
import { api } from '../services/api'
import { nodeTypes, getTypeIcon, personIconSvg } from '../utils/constants.js'
import { getInitials, formatDate } from '../utils/formatting.js'
import { useMentions } from '../composables/useMentions.js'
import { useNodeTable } from '../composables/useNodeTable.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'

const props = defineProps({
  node: Object,
  width: { type: Number, default: 400 },
  fullscreen: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  workspaces: { type: Array, default: () => [] },
  currentWorkspace: { type: String, default: 'work' }
})

const emit = defineEmits([
  'update', 'delete', 'close', 'wrap-with-parent', 'move-to-root',
  'select-child', 'resize-start', 'resize', 'toggle-fullscreen',
  'open-link-search', 'toggle-pin', 'add-child', 'child-updated', 'detach',
  'ai-improve-notes'
])

// Check if running in Electron (for detach button visibility)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow

const editedNode = ref({})
const children = ref([])
const loadingChildren = ref(false)
const newTaskTitle = ref('')

// Filter children based on hideCompleted setting
const filteredChildren = computed(() => {
  if (!props.hideCompleted) return children.value
  return children.value.filter(child => !child.completed)
})

// Links state
const linkedNodes = ref([])

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
const grandchildren = ref({}) // childId -> grandchildren array

// Drag state for reordering
const draggedChild = ref(null)
const dropTarget = ref(null)
const dropPosition = ref(null) // 'before' or 'after'

// Split view preview ref
const splitPreview = ref(null)
const titleInput = ref(null)
const notesEditorRef = ref(null)
const notesEditorSplitRef = ref(null)

// Panel resizing
const isResizing = ref(false)

// Notes autosave timeout
let notesAutosaveTimeout = null

// Mentions system
const {
  showMentions,
  mentionPosition,
  filteredPersons,
  selectedMentionIndex,
  handleInput: handleMentionInput,
  handleKeydown: handleMentionKeydown,
  selectMention,
  hideMentions: _hideMentions,
  refreshPersons: _refreshPersons
} = useMentions({
  onMentionInserted: async (_personId, _nodeId) => {
    // Refresh linked nodes after auto-linking
    await loadLinkedNodes()
  },
  workspaceId: props.currentWorkspace
})

// Error handling
const { handleError } = useErrorHandler()

function _onNotesInput(e) {
  editedNode.value.notes = e.target.value
  handleMentionInput(e, props.node?.id)
}

function onCodeMirrorNotesUpdate(newValue) {
  editedNode.value.notes = newValue
  // Debounced autosave after 500ms of inactivity
  if (notesAutosaveTimeout) clearTimeout(notesAutosaveTimeout)
  notesAutosaveTimeout = setTimeout(() => {
    saveChanges()
  }, 500)
}

function _onNotesKeydown(e) {
  const handled = handleMentionKeydown(
    e,
    editedNode.value.notes,
    (newVal) => { editedNode.value.notes = newVal },
    props.node?.id
  )
  // If mention handler handled it, don't propagate
  if (handled) return
}

function onMentionSelect(index) {
  selectMention(
    index,
    editedNode.value.notes,
    (newVal) => { editedNode.value.notes = newVal },
    props.node?.id
  )
}

function onAIImproveNotes(payload) {
  emit('ai-improve-notes', payload)
}

function getNotesSelection() {
  // Check both refs for the active editor
  const editor = notesEditorRef.value || notesEditorSplitRef.value
  if (editor && typeof editor.getSelection === 'function') {
    return editor.getSelection()
  }
  return { text: '', from: 0, to: 0 }
}

// Handle Escape key to close
function handleKeydown(e) {
  if (e.key === 'Escape') {
    // Don't close if user is typing in an input
    const active = document.activeElement
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      active.blur()
      return
    }
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  // Clear autosave timeout
  if (notesAutosaveTimeout) {
    clearTimeout(notesAutosaveTimeout)
    notesAutosaveTimeout = null
  }
})

// Refs for child form components
const personFormRef = ref(null)
const organizationFormRef = ref(null)

watch(() => props.node, async (newNode) => {
  if (newNode) {
    editedNode.value = { ...newNode }
    // Always show notes expanded by default
    notesCollapsed.value = false
    // Set tab based on whether notes exist
    activeTab.value = newNode.notes?.trim() ? 'preview' : 'edit'
    // Reset expanded children
    expandedChildren.value = new Set()
    grandchildren.value = {}
    // Reset links
    linkedNodes.value = []
    // Reset sensitive preview unlock
    showSensitivePreview.value = false
    // Reset table collapsed - will be expanded only if table exists after loading
    tableCollapsed.value = true

    await Promise.all([loadChildren(), loadLinkedNodes(), loadTable(newNode.id)])

    // Set collapsed states based on content
    // Children: collapse if no children
    childrenCollapsed.value = children.value.length === 0
    // Metadata: collapse if all fields are empty/default
    const hasMetadata = newNode.due_date || newNode.start_date || newNode.end_date ||
      newNode.importance || newNode.location || newNode.email || newNode.phone ||
      newNode.website || newNode.role || newNode.organization ||
      (newNode.tags && newNode.tags.length > 0)
    metadataCollapsed.value = !hasMetadata
    // Table: collapse if no table
    tableCollapsed.value = !hasTable.value

    // Auto-resize title for long titles
    nextTick(() => {
      if (titleInput.value) {
        titleInput.value.style.height = 'auto'
        titleInput.value.style.height = titleInput.value.scrollHeight + 'px'
      }
    })
  }
}, { immediate: true })

async function loadChildren() {
  if (!props.node?.id) return
  loadingChildren.value = true
  try {
    // Get immediate children and filter for tasks
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

const isPerson = computed(() => editedNode.value.type === 'person')
const isOrganization = computed(() => editedNode.value.type === 'organization')

const completedChildrenCount = computed(() => {
  return children.value.filter(c => c.completed).length
})

const formattedCreatedDate = computed(() => formatDate(editedNode.value?.created_at))
const formattedUpdatedDate = computed(() => formatDate(editedNode.value?.updated_at))

function saveChanges() {
  // Clear any pending autosave
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

// Export helpers
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

const showExportMenu = ref(false)

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

async function toggleChildComplete(child) {
  try {
    await api.updateNode(child.id, { completed: !child.completed })
    await loadChildren()
    emit('child-updated', child.id)
  } catch (err) {
    handleError(err, { context: 'Toggling child completion' })
  }
}

async function _toggleChildExpand(child) {
  if (expandedChildren.value.has(child.id)) {
    expandedChildren.value.delete(child.id)
    expandedChildren.value = new Set(expandedChildren.value) // trigger reactivity
  } else {
    expandedChildren.value.add(child.id)
    expandedChildren.value = new Set(expandedChildren.value) // trigger reactivity
    // Load grandchildren if not already loaded
    if (!grandchildren.value[child.id]) {
      try {
        grandchildren.value[child.id] = await api.getChildren(child.id)
      } catch (err) {
        handleError(err, { context: 'Loading grandchildren', silent: true })
        grandchildren.value[child.id] = []
      }
    }
  }
}

function selectChild(child) {
  emit('select-child', child.id)
}

// Resize handling
function startResize(e) {
  isResizing.value = true
  emit('resize-start', e)
}

// Auto-resize title textarea
function autoResizeTitle(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

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

// Check due date status: 'overdue', 'soon' (within 3 days), or null
function getDueStatus(node) {
  if (!node?.due_date || node.completed) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(node.due_date)
  due.setHours(0, 0, 0, 0)
  const daysUntilDue = Math.ceil((due - today) / (1000 * 60 * 60 * 24))
  if (daysUntilDue < 0) return 'overdue'
  if (daysUntilDue <= 3) return 'soon'
  return null
}

function updateTags(newTags) {
  editedNode.value.tags = newTags
  saveChanges()
}


function addTask() {
  const title = newTaskTitle.value.trim()
  if (!title) return
  emit('add-child', { parentId: props.node.id, title, type: 'task' })
  newTaskTitle.value = ''
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

  // Determine drop position based on mouse position
  const rect = e.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  dropPosition.value = e.clientY < midY ? 'before' : 'after'
  dropTarget.value = child
}

function onDragLeave(e) {
  // Only clear if leaving the item entirely
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
  console.log('handleTableStructureChange:', type, value)
  await updateTable(props.node.id, { [type]: value })
  // Reload table to get updated data
  await loadTable(props.node.id)
}

// Helper to get notes selection from the active form
function getNotesSelectionFromForm() {
  if (isPerson.value && personFormRef.value) {
    return personFormRef.value.getNotesSelection?.() || { text: '', from: 0, to: 0 }
  }
  if (isOrganization.value && organizationFormRef.value) {
    return organizationFormRef.value.getNotesSelection?.() || { text: '', from: 0, to: 0 }
  }
  return getNotesSelection()
}

// Expose methods for parent component - delegate to child forms when appropriate
defineExpose({
  loadChildren,
  loadLinkedNodes,
  loadLinkedOrganizations: () => personFormRef.value?.loadLinkedOrganizations?.(),
  loadLinkedMembers: () => organizationFormRef.value?.loadLinkedMembers?.(),
  saveChanges,
  getNotesSelection: getNotesSelectionFromForm
})
</script>

<template>
  <aside
    v-if="node"
    class="detail-panel"
    role="complementary"
    aria-label="Node details"
    :class="{ fullscreen: fullscreen }"
    :style="fullscreen ? {} : { width: width + 'px' }"
  >
    <div
      v-if="!fullscreen"
      class="resize-handle"
      :class="{ dragging: isResizing }"
      @mousedown="startResize"
    ></div>

    <div class="detail-panel-header">
      <div class="header-controls">
        <button
          class="favorite-btn"
          :class="{ active: editedNode.favorite }"
          @click="editedNode.favorite = !editedNode.favorite; saveChanges()"
          title="Toggle favorite"
          :aria-label="editedNode.favorite ? 'Remove from favorites' : 'Add to favorites'"
          :aria-pressed="editedNode.favorite"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <label v-if="editedNode.type !== 'person'" class="done-checkbox" title="Mark as done">
          <input
            type="checkbox"
            :checked="editedNode.completed"
            @change="editedNode.completed = $event.target.checked; saveChanges()"
          />
        </label>
        <button class="pin-btn" :class="{ active: pinned }" @click="$emit('toggle-pin')" :title="pinned ? 'Unpin panel' : 'Pin panel open'" :aria-label="pinned ? 'Unpin panel' : 'Pin panel open'" :aria-pressed="pinned">
          {{ pinned ? '&#128205;' : '&#128204;' }}
        </button>
        <button v-if="isElectron && !fullscreen" class="detach-btn" @click="$emit('detach', props.node)" title="Open in new window" aria-label="Open in new window">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        </button>
        <button class="fullscreen-btn" @click="$emit('toggle-fullscreen')" :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'" :aria-label="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'" :aria-pressed="fullscreen">
          {{ fullscreen ? '⊙' : '⛶' }}
        </button>
        <button class="close-btn" @click="$emit('close')" title="Close" aria-label="Close panel">x</button>
      </div>
      <textarea
        ref="titleInput"
        :value="editedNode.title"
        class="title-input"
        placeholder="Title"
        rows="1"
        @input="editedNode.title = $event.target.value; autoResizeTitle($event)"
        @change="saveChanges"
        @keydown.escape="$emit('close')"
        @keydown.enter.prevent="saveChanges"
      ></textarea>
    </div>

    <div class="detail-panel-content">

      <!-- Person-specific form layout -->
      <PersonDetailForm
        v-if="isPerson"
        ref="personFormRef"
        :edited-node="editedNode"
        :linked-nodes="linkedNodes"
        :active-tab="activeTab"
        :current-workspace="currentWorkspace"
        @update:edited-node="editedNode = $event"
        @update:active-tab="activeTab = $event"
        @save="saveChanges"
        @select-child="emit('select-child', $event)"
        @open-link-search="emit('open-link-search')"
        @remove-link="removeLink"
        @ai-improve-notes="onAIImproveNotes"
      />

      <!-- Organization-specific form layout -->
      <OrganizationDetailForm
        v-else-if="isOrganization"
        ref="organizationFormRef"
        :edited-node="editedNode"
        :linked-nodes="linkedNodes"
        :active-tab="activeTab"
        :current-workspace="currentWorkspace"
        @update:edited-node="editedNode = $event"
        @update:active-tab="activeTab = $event"
        @save="saveChanges"
        @select-child="emit('select-child', $event)"
        @open-link-search="emit('open-link-search')"
        @remove-link="removeLink"
        @ai-improve-notes="onAIImproveNotes"
      />

      <!-- Regular node layout (non-person, non-organization) -->
      <template v-else>
      <!-- Collapsible sections container -->
      <div class="collapsible-sections" :class="{ 'all-collapsed': notesCollapsed && childrenCollapsed && metadataCollapsed }">

        <!-- Notes Section -->
        <div class="notes-section" :class="{ collapsed: notesCollapsed }">
          <div class="section-header" @click="notesCollapsed = !notesCollapsed">
            <span class="section-title">Notes</span>
            <span class="collapse-indicator">{{ notesCollapsed ? '+' : '-' }}</span>
          </div>
          <div v-show="!notesCollapsed" class="section-content">
            <div class="tabs-row">
              <NotesAIToolbar
                :notes="editedNode.notes"
                :node-id="editedNode.id"
                :get-selection="getNotesSelection"
                @apply-improvement="onAIImproveNotes"
              />
              <div class="tabs">
                <button :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">Edit</button>
                <button :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">Preview</button>
                <button :class="{ active: activeTab === 'split' }" @click="activeTab = 'split'">Split</button>
              </div>
              <button
                class="sensitive-btn"
                :class="{ active: editedNode.notes_sensitive }"
                @click="editedNode.notes_sensitive = !editedNode.notes_sensitive; saveChanges()"
                :title="editedNode.notes_sensitive ? 'Notes are hidden (click to unlock)' : 'Notes are visible (click to lock)'"
              >
                {{ editedNode.notes_sensitive ? '&#128274;' : '&#128275;' }}
              </button>
            </div>

            <NotesEditor
              v-if="activeTab === 'edit'"
              ref="notesEditorRef"
              :model-value="editedNode.notes"
              @update:model-value="onCodeMirrorNotesUpdate"
              @blur="saveChanges"
              class="notes-codemirror"
            />

            <div v-else-if="activeTab === 'preview'" class="notes-preview markdown-body">
              <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                <p>Sensitive notes hidden</p>
                <button class="unlock-btn" @click="showSensitivePreview = true" title="Show sensitive notes">Unlock</button>
              </div>
              <MarkdownRenderer v-else-if="editedNode.notes" :content="editedNode.notes" />
              <p v-else class="placeholder">No notes yet</p>
            </div>

            <div v-else class="notes-split">
              <NotesEditor
                ref="notesEditorSplitRef"
                :model-value="editedNode.notes"
                @update:model-value="onCodeMirrorNotesUpdate"
                @blur="saveChanges"
                class="notes-codemirror split-editor"
              />
              <div
                ref="splitPreview"
                class="notes-preview markdown-body split-preview"
              >
                <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                  <p>Sensitive notes hidden</p>
                  <button class="unlock-btn" @click="showSensitivePreview = true" title="Show sensitive notes">Unlock</button>
                </div>
                <MarkdownRenderer v-else-if="editedNode.notes" :content="editedNode.notes" />
                <p v-else class="placeholder">No notes yet</p>
              </div>
            </div>

            <!-- Mention autocomplete dropdown -->
            <MentionDropdown
              v-if="showMentions"
              :persons="filteredPersons"
              :selected-index="selectedMentionIndex"
              :position="mentionPosition"
              @select="onMentionSelect"
            />
          </div>
        </div>

        <!-- Bottom sections (table + children + metadata) -->
        <div class="bottom-sections" :class="{ 'all-collapsed': tableCollapsed && childrenCollapsed && metadataCollapsed }">
          <!-- Table Section -->
          <div class="table-section" :class="{ collapsed: tableCollapsed }">
            <div class="section-header" @click="tableCollapsed = !tableCollapsed">
              <span class="section-title">Table</span>
              <span class="collapse-indicator">{{ tableCollapsed ? '+' : '-' }}</span>
            </div>
            <div v-show="!tableCollapsed" class="section-content">
              <NodeSpreadsheet
                :node-id="props.node?.id"
                :table-data="nodeTable"
                :cell-data="tableCells"
                @create="handleCreateTable"
                @delete="handleDeleteTable"
                @cell-change="handleCellChange"
                @structure-change="handleTableStructureChange"
                @style-change="handleStyleChange"
              />
            </div>
          </div>
          <!-- Children Section -->
          <div class="children-section" :class="{ collapsed: childrenCollapsed }">
            <div class="section-header" @click="childrenCollapsed = !childrenCollapsed">
              <span class="section-title">Tasks</span>
              <span class="collapse-indicator">{{ childrenCollapsed ? '+' : '-' }}</span>
              <span v-if="children.length" class="section-count">{{ completedChildrenCount }}/{{ children.length }}</span>
            </div>
            <div v-show="!childrenCollapsed" class="section-content">
              <!-- Add task input -->
              <div class="add-task-row">
                <input
                  v-model="newTaskTitle"
                  type="text"
                  placeholder="Add task..."
                  class="add-task-input"
                  @keydown.enter="addTask"
                />
                <button class="add-task-btn" @click="addTask" :disabled="!newTaskTitle.trim()" title="Add task">+</button>
              </div>
              <div v-if="loadingChildren" class="loading">Loading...</div>
              <div v-if="filteredChildren.length" class="children-list">
                <template v-for="child in filteredChildren" :key="child.id">
                  <!-- Person: circle with initials -->
                  <div
                    v-if="child.type === 'person'"
                    class="child-item person-item"
                    :title="child.title + (child.organization ? ' - ' + child.organization : '')"
                    @click="selectChild(child)"
                  >
                    <span class="person-avatar" :style="{ backgroundColor: child.color || '#3498db' }">
                      {{ getInitials(child.title) }}
                    </span>
                  </div>
                  <!-- Other types: color dot with checkbox -->
                  <div
                    v-else
                    class="child-item"
                    :class="{
                      completed: child.completed,
                      dragging: draggedChild?.id === child.id,
                      'drop-before': dropTarget?.id === child.id && dropPosition === 'before',
                      'drop-after': dropTarget?.id === child.id && dropPosition === 'after'
                    }"
                    :data-child-id="child.id"
                    draggable="true"
                    @dragstart="onDragStart($event, child)"
                    @dragover="onDragOver($event, child)"
                    @dragleave="onDragLeave($event)"
                    @drop="onDrop($event, child)"
                    @dragend="onDragEnd"
                    @click="selectChild(child)"
                  >
                    <span class="child-color-dot" :style="{ backgroundColor: child.color || '#0f4c75' }">
                      <input
                        type="checkbox"
                        :checked="child.completed"
                        @click.stop
                        @change="toggleChildComplete(child)"
                      />
                    </span>
                    <span class="child-title">{{ child.title?.slice(0, 30) }}{{ child.title?.length > 30 ? '...' : '' }}</span>
                    <span v-if="child.end_date && (fullscreen || width >= 500)" class="child-end-date">{{ child.end_date.split('T')[0] }}</span>
                    <span v-if="child.due_date" class="child-due" :class="{ 'due-warning': getDueStatus(child) === 'soon', 'due-overdue': getDueStatus(child) === 'overdue' }">{{ child.due_date }}</span>
                    <button class="add-subtask-btn" @click.stop="emit('add-child', { parentId: child.id, title: '', type: 'task', prompt: true })" title="Add subtask">+</button>
                  </div>
                  <!-- Grandchildren -->
                  <template v-if="expandedChildren.has(child.id) && grandchildren[child.id]?.length">
                    <div
                      v-for="gc in grandchildren[child.id]"
                      :key="gc.id"
                      class="grandchild-item"
                      :class="{ completed: gc.completed }"
                      @click="emit('select-child', gc.id)"
                    >
                      <span v-if="gc.type === 'person'" class="gc-type person" v-html="personIconSvg"></span>
                      <span v-else class="gc-type" :class="gc.type" v-html="getTypeIcon(gc.type)"></span>
                      <span class="gc-title">{{ gc.title }}</span>
                      <button class="add-subtask-btn" @click.stop="emit('add-child', { parentId: gc.id, title: '', type: 'task', prompt: true })" title="Add subtask">+</button>
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>

          <!-- Metadata Section -->
          <div class="meta-section" :class="{ collapsed: metadataCollapsed }">
            <div class="section-header" @click="metadataCollapsed = !metadataCollapsed">
              <span class="section-title">Metadata</span>
              <span class="collapse-indicator">{{ metadataCollapsed ? '+' : '-' }}</span>
            </div>
            <div v-show="!metadataCollapsed" class="section-content">
              <div class="meta-grid">
                <!-- Type -->
                <div class="meta-item">
                  <label>Type</label>
                  <select v-model="editedNode.type" @change="saveChanges">
                    <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
                  </select>
                </div>

                <!-- Workspace -->
                <div class="meta-item">
                  <label>Workspace</label>
                  <select
                    :value="editedNode.workspace_id"
                    @change="changeWorkspace($event.target.value)"
                  >
                    <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">{{ ws.name }}</option>
                  </select>
                </div>

                <!-- Importance -->
                <div class="meta-item">
                  <label>Importance</label>
                  <div class="importance-picker">
                    <button
                      v-for="level in 5"
                      :key="level"
                      class="importance-btn"
                      :class="{ active: editedNode.importance === level }"
                      @click="setImportance(level)"
                    >{{ level }}</button>
                  </div>
                </div>

                <!-- Start Date -->
                <div class="meta-item">
                  <label>Start</label>
                  <div class="date-field">
                    <input
                      type="date"
                      :value="editedNode.start_date?.split('T')[0] || ''"
                      @change="updateDate('start_date', $event.target.value)"
                    />
                    <button v-if="editedNode.start_date" class="clear-btn" @click="clearDate('start_date')" title="Clear start date">x</button>
                  </div>
                </div>

                <!-- Due Date -->
                <div class="meta-item">
                  <label :class="{ 'due-warning': getDueStatus(editedNode) === 'soon', 'due-overdue': getDueStatus(editedNode) === 'overdue' }">Due</label>
                  <div class="date-field" :class="{ 'due-warning': getDueStatus(editedNode) === 'soon', 'due-overdue': getDueStatus(editedNode) === 'overdue' }">
                    <input
                      type="date"
                      :value="editedNode.due_date?.split('T')[0] || ''"
                      @change="updateDate('due_date', $event.target.value)"
                    />
                    <button v-if="editedNode.due_date" class="clear-btn" @click="clearDate('due_date')" title="Clear due date">x</button>
                  </div>
                </div>

                <!-- End Date -->
                <div class="meta-item">
                  <label>End</label>
                  <div class="date-field">
                    <input
                      type="date"
                      :value="editedNode.end_date?.split('T')[0] || ''"
                      @change="updateDate('end_date', $event.target.value)"
                    />
                    <button v-if="editedNode.end_date" class="clear-btn" @click="clearDate('end_date')" title="Clear end date">x</button>
                  </div>
                </div>

                <!-- Color -->
                <div class="meta-item">
                  <label>Color</label>
                  <div class="color-field">
                    <input
                      type="color"
                      :value="editedNode.color || '#0f4c75'"
                      @change="editedNode.color = $event.target.value; saveChanges()"
                    />
                    <button
                      v-if="editedNode.color && editedNode.color !== '#0f4c75'"
                      class="clear-btn"
                      @click="editedNode.color = '#0f4c75'; saveChanges()"
                      title="Reset to default color"
                    >x</button>
                  </div>
                </div>

                <!-- Location, Tags, Links (compact row) -->
                <div class="meta-item compact-row">
                  <div v-if="editedNode.location" class="compact-field location-field">
                    <label>Location</label>
                    <input
                      type="text"
                      :value="editedNode.location"
                      @input="editedNode.location = $event.target.value"
                      @blur="saveChanges"
                      class="location-input"
                    />
                    <button class="clear-btn" @click="editedNode.location = null; saveChanges()" title="Clear location">x</button>
                  </div>
                  <button v-else class="add-field-btn compact" @click="editedNode.location = ' '" title="Add location">+Location</button>

                  <div class="compact-field tags-field">
                    <label>Tags</label>
                    <TagInput
                      :tags="editedNode.tags || []"
                      @update="updateTags"
                    />
                  </div>

                  <template v-if="editedNode.show_links !== 0">
                    <div v-if="linkedNodes.length" class="compact-field links-field">
                      <label>
                        Links
                        <button class="toggle-links-btn" @click.stop="editedNode.show_links = 0; saveChanges()" title="Hide links section">-</button>
                      </label>
                      <div class="links-inline">
                        <span
                          v-for="linked in linkedNodes"
                          :key="linked.id"
                          class="link-chip"
                          @click="emit('select-child', linked.id)"
                        >
                          <span v-if="linked.type === 'person'" class="link-type person" v-html="personIconSvg"></span>
                          <span v-else class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
                          {{ linked.title }}
                          <button class="remove-link-btn" @click.stop="removeLink(linked)" title="Remove link">x</button>
                        </span>
                        <button class="add-link-btn" @click="emit('open-link-search')" title="Add link">+</button>
                      </div>
                    </div>
                    <button v-else class="add-field-btn compact" @click="emit('open-link-search')" title="Add link">+Link</button>
                  </template>
                  <button v-else class="add-field-btn compact" @click="editedNode.show_links = 1; saveChanges()" title="Show links section">+Link</button>
                </div>

                <!-- System info (compact second row) -->
                <div class="meta-item compact-row system-info">
                  <div class="compact-field">
                    <label>ID</label>
                    <span class="meta-value mono">{{ editedNode.id }}</span>
                  </div>
                  <div class="compact-field">
                    <label>Created</label>
                    <span class="meta-value">{{ formattedCreatedDate }}</span>
                  </div>
                  <div class="compact-field">
                    <label>Modified</label>
                    <span class="meta-value">{{ formattedUpdatedDate }}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
      </template>

      <!-- Actions -->
      <div class="detail-actions">
        <button @click="wrapWithParent" title="Create a new parent node and make this node its child">Wrap with Parent</button>
        <button @click="moveToRoot" title="Move this node to the root level">Move to Root</button>
        <div class="export-dropdown">
          <button @click="showExportMenu = !showExportMenu" title="Export node and children">
            Export <span class="dropdown-arrow">v</span>
          </button>
          <div v-if="showExportMenu" class="export-menu" @mouseleave="showExportMenu = false">
            <button @click="exportJSON">JSON (full data)</button>
            <button @click="exportCSV">CSV (flat table)</button>
            <button @click="exportMarkdown">Markdown (text)</button>
          </div>
        </div>
        <span class="spacer"></span>
        <button class="danger" @click="deleteNode" title="Delete this node">Delete</button>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.detail-panel {
  width: 400px;
  min-width: 300px;
  max-width: 90vw;
  background: var(--bg-primary);
  border-left: 3px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: relative;
  flex-shrink: 0;
  overflow: hidden;
}

.detail-panel.fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw !important;
  max-width: 100vw;
  min-width: 100vw;
  height: 100vh;
  z-index: 1000;
  border-left: none;
  padding: 20px 40px;
  box-sizing: border-box;
}

.detail-panel.fullscreen .bottom-sections {
  flex-direction: column;
  gap: 20px;
}

.detail-panel.fullscreen .bottom-sections.all-collapsed {
  flex-direction: row;
}

.detail-panel.fullscreen .table-section:not(.collapsed) {
  flex: 1 1 auto;
  min-height: 300px;
}

.detail-panel.fullscreen .bottom-sections:has(.table-section:not(.collapsed)) .children-section,
.detail-panel.fullscreen .bottom-sections:has(.table-section:not(.collapsed)) .meta-section {
  flex: 0 0 auto;
}

.detail-panel.fullscreen .children-section {
  flex: 1;
  min-width: 0;
}

.detail-panel.fullscreen .children-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 6px;
  max-height: none;
}

.resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  background: transparent;
  transition: background 0.2s;
  z-index: 10;
}

.resize-handle:hover,
.resize-handle.dragging {
  background: var(--accent-color);
}

.detail-panel-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.detail-panel-header .header-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: flex-end;
}

.detail-panel-header .title-input {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-primary);
  font-size: 1rem;
  font-weight: 600;
  padding: 4px 0;
  resize: none;
  overflow: hidden;
  line-height: 1.3;
  font-family: inherit;
  min-height: 1.3em;
  cursor: text;
}

.detail-panel-header .title-input:focus {
  outline: none;
}

.detail-panel-header .pin-btn,
.detail-panel-header .detach-btn,
.detail-panel-header .fullscreen-btn,
.detail-panel-header .close-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.detail-panel-header .detach-btn {
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-panel-header .pin-btn:hover,
.detail-panel-header .detach-btn:hover,
.detail-panel-header .fullscreen-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.detail-panel-header .pin-btn.active {
  color: var(--accent-color);
}

.detail-panel-header .close-btn:hover {
  background: var(--bg-hover);
  color: var(--error-color);
}

.detail-panel-content {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.favorite-btn {
  width: 24px;
  height: 24px;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.favorite-btn svg {
  fill: transparent;
  stroke: var(--text-tertiary);
  transition: all 0.15s;
}

.favorite-btn:hover svg {
  stroke: #ffd700;
  fill: rgba(255, 215, 0, 0.2);
}

.favorite-btn.active svg {
  fill: #ffd700;
  stroke: #ffd700;
  filter: drop-shadow(0 0 6px rgba(255, 215, 0, 0.8)) drop-shadow(0 0 12px rgba(255, 215, 0, 0.5));
}

.title-input {
  flex: 1;
  font-size: 18px;
  font-weight: 600;
  padding: 8px 0;
  border: none;
  border-bottom: 2px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  outline: none;
}

.title-input:focus {
  border-bottom-color: var(--accent-color);
}

/* Collapsible sections */
.collapsible-sections {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}

.section-header:hover {
  color: var(--accent-color);
}

.section-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-left: auto;
}

.collapse-indicator {
  font-size: 12px;
  color: var(--text-tertiary);
  width: 12px;
  text-align: center;
}

/* Notes section */
.notes-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
  min-height: 100px;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
}

.notes-section.collapsed {
  flex: 0 0 auto;
  min-height: 0;
}

/* Table section */
.table-section {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  overflow: hidden;
  min-height: 200px;
}

.table-section.collapsed {
  flex: 0 0 auto;
  min-height: 0;
}

.table-section .section-content {
  padding-top: 4px;
}

.notes-section .section-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.tabs {
  display: flex;
  gap: 4px;
}

.notes-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sensitive-btn {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.15s;
}

.sensitive-btn:hover {
  background: var(--bg-hover);
  border-color: var(--text-tertiary);
}

.sensitive-btn.active {
  background: var(--bg-hover);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.tabs button {
  padding: 4px 10px;
  border: none;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}

.tabs button.active {
  background: var(--accent-color);
  color: white;
}

.notes-editor,
.notes-preview {
  width: 100%;
  border: none;
  border-radius: 4px;
  background: var(--bg-primary);
  box-sizing: border-box;
  overflow-y: auto;
  flex: 1 1 0;
  min-height: 100px;
}

.notes-textarea {
  color: var(--text-primary);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.5;
  resize: none;
  padding: 8px;
}

.notes-textarea:focus {
  outline: none;
}

.notes-codemirror {
  flex: 1 1 0;
  min-height: 200px;
  border-radius: 4px;
  overflow: hidden;
}

.notes-codemirror.split-editor {
  flex: 1;
}

.notes-preview {
  padding: 8px;
  font-size: 13px;
  overflow-y: auto;
  line-height: 1.5;
}

.notes-preview .placeholder {
  color: var(--text-tertiary);
  font-style: italic;
}

.notes-preview .sensitive-hidden {
  color: var(--text-tertiary);
  font-style: italic;
  text-align: center;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.notes-preview .sensitive-hidden p {
  margin: 0;
}

.unlock-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.unlock-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Split view */
.notes-split {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
}

.notes-split .split-editor,
.notes-split .split-preview {
  flex: 1 1 0;
  min-width: 0;
}

/* Bottom sections */
.bottom-sections {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.bottom-sections.all-collapsed {
  flex-direction: row;
  gap: 8px;
}

.bottom-sections.all-collapsed .table-section,
.bottom-sections.all-collapsed .children-section,
.bottom-sections.all-collapsed .meta-section {
  flex: 1;
}

/* Children section */
.children-section {
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.children-list {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.child-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 4px 1px 1px;
  border-radius: 4px;
  cursor: grab;
  transition: background 0.15s, border 0.1s;
  position: relative;
  border: 2px solid transparent;
}

.child-item:hover {
  background: var(--bg-hover);
}

.child-item:active {
  cursor: grabbing;
}

.child-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.child-item.drop-before {
  border-top-color: var(--accent-color);
}

.child-item.drop-after {
  border-bottom-color: var(--accent-color);
}

.child-item.completed .child-title {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.child-color-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.child-color-dot input[type="checkbox"] {
  width: 12px;
  height: 12px;
  margin: 0;
  accent-color: white;
  cursor: pointer;
}

.person-item {
  padding: 2px;
  background: transparent;
}

.person-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.child-title {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.child-due {
  font-size: 11px;
  color: var(--text-tertiary);
}
.child-due.due-warning {
  color: #e67e22;
}
.child-due.due-overdue {
  color: #e74c3c;
}

.child-end-date {
  font-size: 11px;
  color: var(--text-tertiary);
  opacity: 0.7;
  flex-shrink: 0;
}

.add-subtask-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 14px;
  cursor: pointer;
  border-radius: 3px;
  opacity: 0;
  transition: all 0.15s;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.child-item:hover .add-subtask-btn,
.grandchild-item:hover .add-subtask-btn {
  opacity: 1;
}

.add-subtask-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-color);
}

/* Link type colors */
.link-type {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.link-type.project { color: var(--type-project-text); }
.link-type.task { color: var(--type-task-text); }
.link-type.note { color: var(--type-note-text); }
.link-type.milestone { color: var(--type-milestone-text); }
.link-type.group { color: var(--type-group-text); }
.link-type.event { color: var(--type-event-text); }
.link-type.topic { color: var(--type-topic-text); }
.link-type.person { color: var(--type-person-text); display: inline-flex; align-items: center; }
.link-type.person :deep(svg) { width: 10px; height: 10px; }
.link-type.organization { color: var(--type-organization-text); }

.child-expand-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
}

.child-expand-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.child-expand-placeholder {
  width: 18px;
  flex-shrink: 0;
}

.grandchild-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 34px;
  margin-left: 18px;
  border-left: 1px solid var(--border-color);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.grandchild-item:hover {
  background: var(--bg-hover);
}

.grandchild-item.completed .gc-title {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.gc-type {
  font-size: 9px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 2px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.gc-type.project { color: var(--type-project-text); }
.gc-type.task { color: var(--type-task-text); }
.gc-type.note { color: var(--type-note-text); }
.gc-type.milestone { color: var(--type-milestone-text); }
.gc-type.group { color: var(--type-group-text); }
.gc-type.event { color: var(--type-event-text); }
.gc-type.topic { color: var(--type-topic-text); }
.gc-type.person { color: var(--type-person-text); display: inline-flex; align-items: center; }
.gc-type.person :deep(svg) { width: 10px; height: 10px; }
.gc-type.organization { color: var(--type-organization-text); }

.gc-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-secondary);
}

.loading, .empty-message {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: 8px 0;
}

/* Add task input */
.add-task-row {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.add-task-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.add-task-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.add-task-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
}

.add-task-btn:hover:not(:disabled) {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.add-task-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Metadata section */
.meta-section {
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.meta-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.meta-item.wide {
  flex-basis: 100%;
}

.meta-item.flexible {
  flex: 1 1 auto;
  min-width: 120px;
}

.meta-item.flexible input {
  flex: 1;
  min-width: 80px;
}

.meta-item.full-width {
  flex-basis: 100%;
}

/* Compact row for Location, Tags, Links - single inline row */
.compact-row {
  display: inline-flex;
  flex-wrap: nowrap;
  gap: 12px;
  align-items: center;
}

.compact-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.compact-field label {
  font-size: 11px;
  color: var(--text-tertiary);
  white-space: nowrap;
}

.compact-field input,
.compact-field .location-input {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 12px;
  padding: 2px 6px;
  width: 80px;
}

.compact-field input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.compact-field .meta-value {
  font-size: 11px;
  color: var(--text-secondary);
}

.add-field-btn.compact {
  padding: 2px 6px;
  font-size: 11px;
}

.links-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.link-chip:hover {
  background: var(--bg-hover);
}

.link-chip .link-type {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
}

.link-chip .remove-link-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
}

.link-chip .remove-link-btn:hover {
  color: #ff6b6b;
}

.links-field .add-link-btn,
.links-inline .add-link-btn {
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-tertiary);
  padding: 2px 8px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s;
}

.links-field .add-link-btn:hover,
.links-inline .add-link-btn:hover {
  border-style: solid;
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.toggle-links-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.links-field:hover .toggle-links-btn,
.person-links-section:hover .toggle-links-btn,
.org-links-section:hover .toggle-links-btn {
  opacity: 1;
}

.toggle-links-btn:hover {
  color: var(--text-primary);
}

.meta-item label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.meta-item select,
.meta-item input[type="date"],
.meta-item input[type="text"],
.meta-item input[type="email"],
.meta-item input[type="tel"],
.meta-item input[type="url"] {
  padding: 3px 6px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 11px;
}

/* Make date picker icons visible on dark background */
.meta-item input[type="date"] {
  color-scheme: dark;
}

.meta-item input[type="date"]::-webkit-calendar-picker-indicator {
  filter: invert(0.7) sepia(1) saturate(0) brightness(1);
  opacity: 0.6;
  cursor: pointer;
}

.meta-item input[type="color"] {
  width: 24px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  cursor: pointer;
}

/* Importance picker */
.importance-picker {
  display: flex;
  gap: 2px;
}

.importance-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 10px;
}

.importance-btn.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.created-value {
  font-size: 11px;
  color: var(--text-primary);
}

.date-field,
.color-field {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Due date warning states */
label.due-warning {
  color: #e67e22 !important;
}
label.due-overdue {
  color: #e74c3c !important;
}
.date-field.due-warning input {
  border-color: #e67e22;
  background: rgba(230, 126, 34, 0.1);
}
.date-field.due-overdue input {
  border-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.clear-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px 4px;
  font-size: 10px;
}

.clear-btn:hover {
  color: var(--text-primary);
}

.location-input {
  min-width: 80px;
  max-width: 200px;
}

.add-field-btn {
  padding: 2px 6px;
  border: 1px dashed var(--border-color);
  border-radius: 3px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 10px;
}

.add-field-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-color);
  color: var(--text-primary);
}

/* Person fields */
.person-fields-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-top: 12px;
  margin-bottom: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

/* Node meta info */
.detail-meta {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-tertiary);
  display: flex;
  gap: 6px 12px;
  flex-wrap: wrap;
}

.detail-meta span:last-child {
  flex-basis: 100%;
  word-break: break-all;
}

/* Actions */
.detail-actions {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.detail-actions .spacer {
  flex: 1;
}

.detail-actions button {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
  cursor: pointer;
}

.detail-actions button:hover {
  background: var(--bg-hover);
}

.detail-actions button.danger {
  background: var(--error-bg);
  border-color: var(--error-border);
  color: var(--error-color);
}

.detail-actions button.danger:hover {
  background: var(--error-hover);
}

/* Export dropdown */
.export-dropdown {
  position: relative;
}

.export-dropdown > button .dropdown-arrow {
  font-size: 10px;
  margin-left: 4px;
}

.export-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 4px;
  min-width: 140px;
  box-shadow: var(--shadow-lg);
  z-index: 100;
  margin-bottom: 4px;
}

.export-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
}

.export-menu button:hover {
  background: var(--bg-hover);
}

/* Text selection highlight */
.detail-panel ::selection {
  background: rgba(59, 130, 246, 0.5);
  color: #fff;
}

.notes-editor::selection,
.title-input::selection,
input::selection,
textarea::selection {
  background: rgba(59, 130, 246, 0.5);
  color: #fff;
}

.meta-value {
  font-size: 0.8rem;
  color: var(--text-secondary);
}

.meta-value.mono {
  font-family: monospace;
}

/* Organization linking styles */
.org-linking {
  margin-top: 8px;
}

.org-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 20px;
}

.org-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-color);
  color: white;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.org-path {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.org-remove {
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
}

.org-remove:hover {
  color: var(--text-primary);
}

.org-autocomplete {
  position: relative;
}

.org-autocomplete input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.org-autocomplete input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.org-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-height: 180px;
  overflow-y: auto;
  z-index: 100;
  margin-top: 4px;
}

.org-option {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.org-option:hover,
.org-option.selected {
  background: var(--bg-hover);
}

.org-option.linked {
  opacity: 0.6;
}

.org-option .linked-badge {
  font-size: 9px;
  color: var(--text-tertiary);
  padding: 2px 5px;
  background: var(--bg-secondary);
  border-radius: 3px;
}

.org-option.create-option {
  color: var(--accent-color);
  font-weight: 500;
  border-top: 1px solid var(--border-color);
}

</style>
