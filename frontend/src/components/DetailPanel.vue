<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { api } from '../services/api'
import { nodeTypes } from '../utils/constants.js'

const props = defineProps({
  node: Object,
  width: { type: Number, default: 400 },
  fullscreen: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false }
})

const emit = defineEmits([
  'update', 'delete', 'close', 'wrap-with-parent', 'move-to-root',
  'select-child', 'resize-start', 'resize', 'toggle-fullscreen',
  'open-link-search', 'toggle-pin', 'add-child', 'child-updated'
])

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
const childrenCollapsed = ref(false)
const metadataCollapsed = ref(false)

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

// Panel resizing
const isResizing = ref(false)

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
})

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
    await Promise.all([loadChildren(), loadLinkedNodes()])
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
    console.error('Failed to load children:', err)
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
    console.error('Failed to load linked nodes:', err)
    linkedNodes.value = []
  }
}

async function removeLink(targetNode) {
  try {
    await api.unlinkNodes(props.node.id, targetNode.id)
    await loadLinkedNodes()
  } catch (err) {
    console.error('Failed to unlink nodes:', err)
  }
}

const isPerson = computed(() => editedNode.value.type === 'person')

const completedChildrenCount = computed(() => {
  return children.value.filter(c => c.completed).length
})

const formattedCreatedDate = computed(() => {
  if (!editedNode.value?.created_at) return ''
  const d = new Date(editedNode.value.created_at)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

const formattedUpdatedDate = computed(() => {
  if (!editedNode.value?.updated_at) return ''
  const d = new Date(editedNode.value.updated_at)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function saveChanges() {
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

async function copyNodeContent() {
  try {
    const result = await api.exportMarkdown(editedNode.value.id)

    // Generate filename: YYMMDD-nodename.md
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
    const filename = `${dateStr}-${safeName}.md`

    // Download file
    const blob = new Blob([result.markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Failed to export:', err)
  }
}

async function toggleChildComplete(child) {
  try {
    await api.updateNode(child.id, { completed: !child.completed })
    await loadChildren()
    emit('child-updated', child.id)
  } catch (err) {
    console.error('Failed to toggle child:', err)
  }
}

async function toggleChildExpand(child) {
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
        console.error('Failed to load grandchildren:', err)
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
    console.error('Failed to reorder:', err)
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

// Expose methods for parent component
defineExpose({ loadChildren })
</script>

<template>
  <aside v-if="node" class="detail-panel" :class="{ fullscreen: fullscreen }" :style="fullscreen ? {} : { width: width + 'px' }">
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
        <button class="pin-btn" :class="{ active: pinned }" @click="$emit('toggle-pin')" :title="pinned ? 'Unpin panel' : 'Pin panel open'">
          {{ pinned ? '&#128205;' : '&#128204;' }}
        </button>
        <button class="fullscreen-btn" @click="$emit('toggle-fullscreen')" :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'">
          {{ fullscreen ? '⊙' : '⛶' }}
        </button>
        <button class="close-btn" @click="$emit('close')" title="Close">x</button>
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

            <textarea
              v-if="activeTab === 'edit'"
              :value="editedNode.notes"
              placeholder="Add notes (Markdown supported)..."
              class="notes-editor notes-textarea"
              @input="editedNode.notes = $event.target.value"
              @blur="saveChanges"
            ></textarea>

            <div v-else-if="activeTab === 'preview'" class="notes-preview markdown-body">
              <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                <p>Sensitive notes hidden</p>
                <button class="unlock-btn" @click="showSensitivePreview = true">Unlock</button>
              </div>
              <MarkdownRenderer v-else-if="editedNode.notes" :content="editedNode.notes" />
              <p v-else class="placeholder">No notes yet</p>
            </div>

            <div v-else class="notes-split">
              <textarea
                :value="editedNode.notes"
                placeholder="Add notes (Markdown supported)..."
                class="notes-editor notes-textarea split-editor"
                @input="editedNode.notes = $event.target.value"
                @blur="saveChanges"
              ></textarea>
              <div
                ref="splitPreview"
                class="notes-preview markdown-body split-preview"
              >
                <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                  <p>Sensitive notes hidden</p>
                  <button class="unlock-btn" @click="showSensitivePreview = true">Unlock</button>
                </div>
                <MarkdownRenderer v-else-if="editedNode.notes" :content="editedNode.notes" />
                <p v-else class="placeholder">No notes yet</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom sections (children + links side by side in fullscreen) -->
        <div class="bottom-sections">
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
                <button class="add-task-btn" @click="addTask" :disabled="!newTaskTitle.trim()">+</button>
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
                    <span v-if="child.due_date" class="child-due">{{ child.due_date }}</span>
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
                      <span class="gc-type" :class="gc.type">{{ gc.type[0].toUpperCase() }}</span>
                      <span class="gc-title">{{ gc.title }}</span>
                      <button class="add-subtask-btn" @click.stop="emit('add-child', { parentId: gc.id, title: '', type: 'task', prompt: true })" title="Add subtask">+</button>
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>
        </div>

          <!-- Metadata Section (own row) -->
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
                    <button v-if="editedNode.start_date" class="clear-btn" @click="clearDate('start_date')">x</button>
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
                    <button v-if="editedNode.end_date" class="clear-btn" @click="clearDate('end_date')">x</button>
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
                    >x</button>
                  </div>
                </div>

                <!-- Location -->
                <div v-if="editedNode.location" class="meta-item">
                  <label>Location</label>
                  <input
                    type="text"
                    :value="editedNode.location"
                    @input="editedNode.location = $event.target.value"
                    @blur="saveChanges"
                    class="location-input"
                  />
                  <button class="clear-btn" @click="editedNode.location = null; saveChanges()">x</button>
                </div>
                <button v-else class="add-field-btn" @click="editedNode.location = ' '" title="Add location">+Loc</button>

                <!-- Links -->
                <div v-if="linkedNodes.length" class="meta-item links-row">
                  <label>Links</label>
                  <div class="links-inline">
                    <span
                      v-for="linked in linkedNodes"
                      :key="linked.id"
                      class="link-chip"
                      @click="emit('select-child', linked.id)"
                    >
                      <span class="link-type" :class="linked.type">{{ linked.type[0].toUpperCase() }}</span>
                      {{ linked.title }}
                      <button class="remove-link-btn" @click.stop="removeLink(linked)">x</button>
                    </span>
                    <button class="add-link-btn" @click="emit('open-link-search')" title="Add link">+</button>
                  </div>
                </div>
                <button v-else class="add-field-btn" @click="emit('open-link-search')" title="Add link">+Link</button>

                <!-- System info (at end) -->
                <div class="meta-item">
                  <label>ID</label>
                  <span class="meta-value mono">{{ editedNode.id }}</span>
                </div>

                <div class="meta-item">
                  <label>Created</label>
                  <span class="meta-value">{{ formattedCreatedDate }}</span>
                </div>

                <div class="meta-item">
                  <label>Modified</label>
                  <span class="meta-value">{{ formattedUpdatedDate }}</span>
                </div>
              </div>

              <!-- Person-specific fields -->
              <template v-if="isPerson">
                <div class="person-fields-header">Contact Information</div>
                <div class="meta-grid">
                  <div class="meta-item wide">
                    <label>Email</label>
                    <input
                      type="email"
                      :value="editedNode.email || ''"
                      @input="editedNode.email = $event.target.value"
                      @blur="saveChanges"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div class="meta-item">
                    <label>Phone</label>
                    <input
                      type="tel"
                      :value="editedNode.phone || ''"
                      @input="editedNode.phone = $event.target.value"
                      @blur="saveChanges"
                      placeholder="+1 234 567 890"
                    />
                  </div>
                  <div class="meta-item">
                    <label>Organization</label>
                    <input
                      type="text"
                      :value="editedNode.organization || ''"
                      @input="editedNode.organization = $event.target.value"
                      @blur="saveChanges"
                      placeholder="Company"
                    />
                  </div>
                  <div class="meta-item">
                    <label>Role</label>
                    <input
                      type="text"
                      :value="editedNode.role || ''"
                      @input="editedNode.role = $event.target.value"
                      @blur="saveChanges"
                      placeholder="Job title"
                    />
                  </div>
                  <div class="meta-item wide">
                    <label>Website</label>
                    <input
                      type="url"
                      :value="editedNode.website || ''"
                      @input="editedNode.website = $event.target.value"
                      @blur="saveChanges"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>
              </template>
            </div>
          </div>
      </div>

      <!-- Actions -->
      <div class="detail-actions">
        <button @click="wrapWithParent">Wrap with Parent</button>
        <button @click="moveToRoot">Move to Root</button>
        <span class="spacer"></span>
        <button class="danger" @click="deleteNode">Delete</button>
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
  flex-direction: row;
  gap: 20px;
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

.detail-panel-header .pin-btn:hover,
.detail-panel-header .fullscreen-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.detail-panel-header .pin-btn.active {
  color: var(--accent-color);
}

.detail-panel-header .close-btn:hover {
  background: var(--bg-hover);
  color: #ff6b6b;
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

.link-type.task { color: #f0c674; }
.link-type.note { color: #81a2be; }
.link-type.project { color: #b5bd68; }
.link-type.milestone { color: #b294bb; }
.link-type.event { color: #e74c3c; }
.link-type.topic { color: #1abc9c; }
.link-type.folder { color: #95a5a6; }
.link-type.person { color: #3498db; }

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

.gc-type.task { color: #f0c674; }
.gc-type.note { color: #81a2be; }
.gc-type.project { color: #b5bd68; }
.gc-type.milestone { color: #b294bb; }
.gc-type.event { color: #e74c3c; }
.gc-type.topic { color: #1abc9c; }
.gc-type.folder { color: #95a5a6; }
.gc-type.person { color: #3498db; }

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

.links-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
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

.links-row .add-link-btn {
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-tertiary);
  padding: 2px 8px;
  border-radius: 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.15s;
}

.links-row .add-link-btn:hover {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: #fff;
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
  background: #4a1a1a;
  border-color: #7a2a2a;
  color: #e07d7d;
}

.detail-actions button.danger:hover {
  background: #5a2a2a;
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

</style>
