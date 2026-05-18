<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted, toRaw } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import MentionDropdown from './MentionDropdown.vue'
import NotesEditor from './NotesEditor.vue'
import NotesAIToolbar from './NotesAIToolbar.vue'
import NodeSpreadsheet from './NodeSpreadsheet.vue'
import PersonDetailForm from './detail/PersonDetailForm.vue'
import OrganizationDetailForm from './detail/OrganizationDetailForm.vue'
import ChildrenSection from './detail/ChildrenSection.vue'
import MetadataGridSection from './detail/MetadataGridSection.vue'
import { api } from '../services/api'
import { useMentions } from '../composables/useMentions.js'
import { useNodeTable } from '../composables/useNodeTable.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { AUTOSAVE_DELAY_MS } from '../utils/settingsConstants'

const props = defineProps({
  node: Object,
  width: { type: Number, default: 400 },
  fullscreen: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  workspaces: { type: Array, default: () => [] },
  currentWorkspace: { type: String, default: 'work' },
})

const emit = defineEmits([
  'update',
  'delete',
  'close',
  'wrap-with-parent',
  'move-to-root',
  'select-child',
  'resize-start',
  'resize',
  'toggle-fullscreen',
  'open-link-search',
  'toggle-pin',
  'add-child',
  'child-updated',
  'detach',
  'ai-improve-notes',
])

// Check if running in Electron (for detach button visibility)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow

const editedNode = ref({})
const children = ref([])
const loadingChildren = ref(false)
// Links state
const linkedNodes = ref([])

// Tab state for notes
const activeTab = ref('edit')
const showSensitivePreview = ref(false)

// Collapsible sections
const notesCollapsed = ref(false)
const tableCollapsed = ref(true)
const childrenCollapsed = ref(false)
const metadataCollapsed = ref(true)

// Node table (spreadsheet) state
const {
  table: nodeTable,
  cells: tableCells,
  hasTable,
  loadTable,
  createTable,
  updateTable,
  deleteTable,
  saveCell,
  saveCellStyle,
} = useNodeTable()

// Split view preview ref
const splitPreview = ref(null)
const titleInput = ref(null)
const notesEditorRef = ref(null)
const notesEditorSplitRef = ref(null)

// Scroll sync for split view
let isScrollSyncing = false

function syncEditorToPreview() {
  if (isScrollSyncing || !notesEditorSplitRef.value || !splitPreview.value) return
  isScrollSyncing = true

  const info = notesEditorSplitRef.value.getScrollInfo()
  const scrollableHeight = info.scrollHeight - info.clientHeight
  if (scrollableHeight > 0) {
    const percent = info.scrollTop / scrollableHeight
    const previewScrollable = splitPreview.value.scrollHeight - splitPreview.value.clientHeight
    splitPreview.value.scrollTop = percent * previewScrollable
  }

  requestAnimationFrame(() => {
    isScrollSyncing = false
  })
}

function syncPreviewToEditor() {
  if (isScrollSyncing || !notesEditorSplitRef.value || !splitPreview.value) return
  isScrollSyncing = true

  const preview = splitPreview.value
  const scrollableHeight = preview.scrollHeight - preview.clientHeight
  if (scrollableHeight > 0) {
    const percent = preview.scrollTop / scrollableHeight
    const info = notesEditorSplitRef.value.getScrollInfo()
    const editorScrollable = info.scrollHeight - info.clientHeight
    notesEditorSplitRef.value.setScrollTop(percent * editorScrollable)
  }

  requestAnimationFrame(() => {
    isScrollSyncing = false
  })
}

// Panel resizing
const isResizing = ref(false)

// Notes autosave timeout
let notesAutosaveTimeout = null

// Scroll sync listener for split view
let editorScrollListener = null

// Mentions system
const { showMentions, mentionPosition, filteredPersons, selectedMentionIndex, selectMention } = useMentions({
  onMentionInserted: async () => {
    // Refresh linked nodes after auto-linking
    await loadLinkedNodes()
  },
  workspaceId: props.currentWorkspace,
})

// Error handling
const { handleError } = useErrorHandler()

function onCodeMirrorNotesUpdate(newValue) {
  editedNode.value.notes = newValue
  // Debounced autosave after inactivity
  if (notesAutosaveTimeout) clearTimeout(notesAutosaveTimeout)
  notesAutosaveTimeout = setTimeout(() => {
    saveChanges()
  }, AUTOSAVE_DELAY_MS)
}

function onMentionSelect(index) {
  selectMention(
    index,
    editedNode.value.notes,
    newVal => {
      editedNode.value.notes = newVal
    },
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
  // Clean up scroll sync listener
  if (editorScrollListener && notesEditorSplitRef.value) {
    const scrollEl = notesEditorSplitRef.value.getScrollElement()
    if (scrollEl) {
      scrollEl.removeEventListener('scroll', editorScrollListener)
    }
  }
})

// Refs for child form components
const personFormRef = ref(null)
const organizationFormRef = ref(null)

watch(
  () => props.node,
  async (newNode, oldNode) => {
    if (newNode) {
      const isNewNode = newNode.id !== oldNode?.id
      editedNode.value = { ...newNode }

      // Only reset UI state when switching to a different node
      if (isNewNode) {
        // Always show notes expanded by default
        notesCollapsed.value = false
        // Set tab based on whether notes exist
        activeTab.value = newNode.notes?.trim() ? 'preview' : 'edit'
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
        // Metadata: always start collapsed
        metadataCollapsed.value = true
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
    }
  },
  { immediate: true }
)

// Set up scroll sync when split view is activated
watch(
  () => activeTab.value,
  async newTab => {
    // Clean up old listener
    if (editorScrollListener && notesEditorSplitRef.value) {
      const scrollEl = notesEditorSplitRef.value.getScrollElement()
      if (scrollEl) {
        scrollEl.removeEventListener('scroll', editorScrollListener)
      }
      editorScrollListener = null
    }

    // Set up new listener for split view
    if (newTab === 'split') {
      await nextTick()
      if (notesEditorSplitRef.value) {
        const scrollEl = notesEditorSplitRef.value.getScrollElement()
        if (scrollEl) {
          editorScrollListener = syncEditorToPreview
          scrollEl.addEventListener('scroll', editorScrollListener)
        }
      }
    }
  }
)

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

function onUnlinkTag(tagNode) {
  // Optimistically remove tag from linkedNodes immediately
  if (tagNode?.id) {
    linkedNodes.value = linkedNodes.value.filter(n => n.id !== tagNode.id)
  }
}

const isPerson = computed(() => editedNode.value.type === 'person')
const isOrganization = computed(() => editedNode.value.type === 'organization')

function saveChanges() {
  // Clear any pending autosave
  if (notesAutosaveTimeout) {
    clearTimeout(notesAutosaveTimeout)
    notesAutosaveTimeout = null
  }
  // Use toRaw to unwrap Vue proxy before emitting (prevents IPC cloning errors)
  emit('update', { ...toRaw(editedNode.value) })
}

// Toggle handlers for template
function toggleFavorite() {
  try {
    editedNode.value.favorite = !editedNode.value.favorite
    saveChanges()
  } catch (e) {
    console.error('toggleFavorite failed:', e)
  }
}

function onCompletedChange(event) {
  editedNode.value.completed = event.target.checked
  saveChanges()
}

function onTitleInput(event) {
  editedNode.value.title = event.target.value
  autoResizeTitle(event)
}

function toggleNotesSensitive() {
  editedNode.value.notes_sensitive = !editedNode.value.notes_sensitive
  saveChanges()
}

function onLinksVisibilityToggle(value) {
  editedNode.value.show_links = value
  saveChanges()
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

function updateTags(newTags) {
  editedNode.value.tags = newTags
  saveChanges()
}

// Handler for ChildrenSection reorder event
async function onChildReorder({ draggedId, targetId, position }) {
  try {
    await api.reorderNode(draggedId, targetId, position)
    await loadChildren()
    emit('child-updated', draggedId)
  } catch (err) {
    handleError(err, { context: 'Reordering children' })
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
  getNotesSelection: getNotesSelectionFromForm,
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
    <div v-if="!fullscreen" class="resize-handle" :class="{ dragging: isResizing }" @mousedown="startResize"></div>

    <div class="detail-panel-header">
      <div class="header-controls">
        <button
          class="favorite-btn"
          :class="{ active: editedNode.favorite }"
          @click="toggleFavorite"
          title="Toggle favorite"
          :aria-label="editedNode.favorite ? 'Remove from favorites' : 'Add to favorites'"
          :aria-pressed="editedNode.favorite"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
            <polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
            />
          </svg>
        </button>
        <label v-if="editedNode.type !== 'person'" class="done-checkbox" title="Mark as done">
          <input type="checkbox" :checked="editedNode.completed" @change="onCompletedChange" />
        </label>
        <button
          class="pin-btn"
          :class="{ active: pinned }"
          @click="$emit('toggle-pin')"
          :title="pinned ? 'Unpin panel' : 'Pin panel open'"
          :aria-label="pinned ? 'Unpin panel' : 'Pin panel open'"
          :aria-pressed="pinned"
        >
          {{ pinned ? '&#128205;' : '&#128204;' }}
        </button>
        <button
          v-if="isElectron"
          class="detach-btn"
          @click="$emit('detach', props.node)"
          title="Open in new window"
          aria-label="Open in new window"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </button>
        <button
          class="fullscreen-btn"
          @click="$emit('toggle-fullscreen')"
          :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          :aria-label="fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          :aria-pressed="fullscreen"
        >
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
        @input="onTitleInput"
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
        <div
          class="collapsible-sections"
          :class="{ 'all-collapsed': notesCollapsed && childrenCollapsed && metadataCollapsed }"
        >
          <!-- Notes Section -->
          <div class="notes-section" :class="{ collapsed: notesCollapsed }">
            <div class="section-header" @click="notesCollapsed = !notesCollapsed">
              <span class="section-title">Notes</span>
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
                  @click="toggleNotesSensitive"
                  :title="
                    editedNode.notes_sensitive
                      ? 'Notes are hidden (click to unlock)'
                      : 'Notes are visible (click to lock)'
                  "
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
                  <button class="unlock-btn" @click="showSensitivePreview = true" title="Show sensitive notes">
                    Unlock
                  </button>
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
                <div ref="splitPreview" class="notes-preview markdown-body split-preview" @scroll="syncPreviewToEditor">
                  <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                    <p>Sensitive notes hidden</p>
                    <button class="unlock-btn" @click="showSensitivePreview = true" title="Show sensitive notes">
                      Unlock
                    </button>
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
          <div
            class="bottom-sections"
            :class="{ 'all-collapsed': tableCollapsed && childrenCollapsed && metadataCollapsed }"
          >
            <!-- Table Section -->
            <div class="table-section" :class="{ collapsed: tableCollapsed }">
              <div class="section-header" @click="tableCollapsed = !tableCollapsed">
                <span class="section-title">Table</span>
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
            <ChildrenSection
              :children="children"
              :hide-completed="hideCompleted"
              :loading-children="loadingChildren"
              :collapsed="childrenCollapsed"
              :parent-id="props.node?.id"
              :width="width"
              :fullscreen="fullscreen"
              @update:collapsed="childrenCollapsed = $event"
              @select-child="selectChild({ id: $event })"
              @toggle-complete="toggleChildComplete"
              @add-task="emit('add-child', $event)"
              @add-subtask="emit('add-child', { parentId: $event.parentId, title: '', type: 'task', prompt: true })"
              @reorder="onChildReorder"
            />

            <!-- Metadata Section -->
            <MetadataGridSection
              :edited-node="editedNode"
              :linked-nodes="linkedNodes"
              :workspaces="workspaces"
              :collapsed="metadataCollapsed"
              @update:collapsed="metadataCollapsed = $event"
              @update:field="editedNode[$event.field] = $event.value"
              @update:tags="updateTags"
              @update:color="editedNode.color = $event"
              @change-workspace="changeWorkspace"
              @select-link="emit('select-child', $event)"
              @remove-link="removeLink"
              @add-link="emit('open-link-search')"
              @toggle-links-visibility="onLinksVisibilityToggle"
              @save="saveChanges"
              @reload-links="loadLinkedNodes"
              @unlink-tag="onUnlinkTag"
            />
          </div>
        </div>
      </template>

      <!-- Actions -->
      <div class="detail-actions">
        <button @click="wrapWithParent" title="Create a new parent node and make this node its child">
          Wrap with Parent
        </button>
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

<style scoped src="./DetailPanel.css"></style>
