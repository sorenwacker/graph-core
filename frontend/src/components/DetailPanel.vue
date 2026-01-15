<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { api } from '../services/api'

const props = defineProps({
  node: Object,
  width: { type: Number, default: 400 }
})

const emit = defineEmits([
  'update', 'delete', 'close', 'wrap-with-parent',
  'select-child', 'resize-start', 'resize'
])

const editedNode = ref({})
const children = ref([])
const loadingChildren = ref(false)

// Links state
const linkedNodes = ref([])
const linkSearch = ref('')
const linkSearchResults = ref([])
const showLinkSearch = ref(false)

// Tab state for notes
const activeTab = ref('edit')

// Collapsible sections
const notesCollapsed = ref(false)
const childrenCollapsed = ref(false)
const metadataCollapsed = ref(false)

// Expanded children and their grandchildren
const expandedChildren = ref(new Set())
const grandchildren = ref({}) // childId -> grandchildren array

// Split view preview ref
const splitPreview = ref(null)

// Panel resizing
const isResizing = ref(false)

watch(() => props.node, async (newNode) => {
  if (newNode) {
    editedNode.value = { ...newNode }
    // Always show notes expanded by default
    notesCollapsed.value = false
    // Reset expanded children
    expandedChildren.value = new Set()
    grandchildren.value = {}
    // Reset links
    linkedNodes.value = []
    linkSearch.value = ''
    linkSearchResults.value = []
    showLinkSearch.value = false
    await Promise.all([loadChildren(), loadLinkedNodes()])
  }
}, { immediate: true })

async function loadChildren() {
  if (!props.node?.id) return
  loadingChildren.value = true
  try {
    children.value = await api.getChildren(props.node.id)
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

async function searchForLink() {
  if (!linkSearch.value.trim()) {
    linkSearchResults.value = []
    return
  }
  try {
    const results = await api.searchNodes(linkSearch.value)
    // Filter out current node and already linked nodes
    const linkedIds = new Set(linkedNodes.value.map(n => n.id))
    linkSearchResults.value = results.filter(n =>
      n.id !== props.node.id && !linkedIds.has(n.id)
    ).slice(0, 10)
  } catch (err) {
    console.error('Search failed:', err)
    linkSearchResults.value = []
  }
}

async function addLink(targetNode) {
  try {
    await api.linkNodes(props.node.id, targetNode.id)
    await loadLinkedNodes()
    linkSearch.value = ''
    linkSearchResults.value = []
    showLinkSearch.value = false
  } catch (err) {
    console.error('Failed to link nodes:', err)
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

const nodeTypes = ['project', 'task', 'note', 'milestone', 'topic', 'folder', 'person', 'event']
const isPerson = computed(() => editedNode.value.type === 'person')

const completedChildrenCount = computed(() => {
  return children.value.filter(c => c.completed).length
})

const formattedCreatedDate = computed(() => {
  if (!editedNode.value?.created_at) return ''
  const d = new Date(editedNode.value.created_at)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
})

function saveChanges() {
  emit('update', editedNode.value)
}

function deleteNode() {
  if (confirm('Delete this node?')) {
    emit('delete', props.node.id)
  }
}

function wrapWithParent() {
  const title = prompt('New parent title:')
  if (title) {
    emit('wrap-with-parent', { nodeId: props.node.id, parentTitle: title })
  }
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
</script>

<template>
  <aside v-if="node" class="detail-panel" :style="{ width: width + 'px' }">
    <div
      class="resize-handle"
      :class="{ dragging: isResizing }"
      @mousedown="startResize"
    ></div>

    <div class="detail-panel-header">
      <div class="header-actions">
        <button class="copy-btn" @click="copyNodeContent" title="Copy as Markdown">
          MD
        </button>
        <button class="close-btn" @click="$emit('close')" title="Close">x</button>
      </div>
    </div>

    <div class="detail-panel-content">
      <!-- Title row -->
      <div class="title-row">
        <button
          class="favorite-btn"
          :class="{ active: editedNode.favorite }"
          @click="editedNode.favorite = !editedNode.favorite; saveChanges()"
          title="Toggle favorite"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        <input
          v-if="editedNode.type !== 'person'"
          type="checkbox"
          :checked="editedNode.completed"
          class="title-checkbox"
          @change="editedNode.completed = $event.target.checked; saveChanges()"
        />
        <input
          :value="editedNode.title"
          class="title-input"
          placeholder="Title"
          @input="editedNode.title = $event.target.value"
          @change="saveChanges"
          @keydown.escape="$emit('close')"
        />
      </div>

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
              <label class="sensitive-checkbox">
                <input
                  :checked="editedNode.notes_sensitive"
                  type="checkbox"
                  @change="editedNode.notes_sensitive = $event.target.checked; saveChanges()"
                />
                <span class="lock-icon">S</span>
              </label>
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
              <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
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
                <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
                <p v-else class="placeholder">No notes yet</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom sections -->
        <div class="bottom-sections">
          <!-- Children Section -->
          <div class="children-section" :class="{ collapsed: childrenCollapsed }">
            <div class="section-header" @click="childrenCollapsed = !childrenCollapsed">
              <span class="section-title">Children</span>
              <span class="collapse-indicator">{{ childrenCollapsed ? '+' : '-' }}</span>
              <span v-if="children.length" class="section-count">{{ completedChildrenCount }}/{{ children.length }}</span>
            </div>
            <div v-show="!childrenCollapsed" class="section-content">
              <div v-if="loadingChildren" class="loading">Loading...</div>
              <div v-else-if="children.length === 0" class="empty-message">No children</div>
              <div v-else class="children-list">
                <template v-for="child in children" :key="child.id">
                  <div
                    class="child-item"
                    :class="{ completed: child.completed, expanded: expandedChildren.has(child.id) }"
                    @click="selectChild(child)"
                  >
                    <button
                      v-if="child.children?.length || grandchildren[child.id]?.length"
                      class="child-expand-btn"
                      @click.stop="toggleChildExpand(child)"
                    >{{ expandedChildren.has(child.id) ? '-' : '+' }}</button>
                    <span v-else class="child-expand-placeholder"></span>
                    <input
                      type="checkbox"
                      :checked="child.completed"
                      @click.stop
                      @change="toggleChildComplete(child)"
                    />
                    <span class="child-type" :class="child.type">{{ child.type[0].toUpperCase() }}</span>
                    <span class="child-title">{{ child.title }}</span>
                    <span v-if="child.due_date" class="child-due">{{ child.due_date }}</span>
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
                    </div>
                  </template>
                </template>
              </div>
            </div>
          </div>

          <!-- Links Section -->
          <div class="links-section">
            <div class="section-header">
              <span class="section-title">Links</span>
              <span v-if="linkedNodes.length" class="section-count">{{ linkedNodes.length }}</span>
              <button class="add-link-btn" @click="showLinkSearch = !showLinkSearch">+</button>
            </div>
            <div class="section-content">
              <!-- Search for links -->
              <div v-if="showLinkSearch" class="link-search">
                <input
                  v-model="linkSearch"
                  type="text"
                  placeholder="Search nodes to link..."
                  @input="searchForLink"
                  @keydown.escape="showLinkSearch = false"
                />
                <div v-if="linkSearchResults.length" class="link-search-results">
                  <div
                    v-for="result in linkSearchResults"
                    :key="result.id"
                    class="link-search-item"
                    @click="addLink(result)"
                  >
                    <span class="link-type" :class="result.type">{{ result.type[0].toUpperCase() }}</span>
                    <span class="link-title">{{ result.title }}</span>
                  </div>
                </div>
              </div>
              <!-- Linked nodes list -->
              <div v-if="linkedNodes.length === 0 && !showLinkSearch" class="empty-message">No links</div>
              <div v-else class="links-list">
                <div
                  v-for="linked in linkedNodes"
                  :key="linked.id"
                  class="link-item"
                  @click="emit('select-child', linked.id)"
                >
                  <span class="link-type" :class="linked.type">{{ linked.type[0].toUpperCase() }}</span>
                  <span class="link-title">{{ linked.title }}</span>
                  <button class="remove-link-btn" @click.stop="removeLink(linked)" title="Remove link">x</button>
                </div>
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

                <!-- Created -->
                <div class="meta-item">
                  <label>Created</label>
                  <span class="created-value">{{ formattedCreatedDate }}</span>
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
                <div class="meta-item flexible">
                  <label>Location</label>
                  <input
                    type="text"
                    :value="editedNode.location || ''"
                    @input="editedNode.location = $event.target.value"
                    @blur="saveChanges"
                    placeholder="Address or place"
                  />
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


              <!-- Node info -->
              <div class="detail-meta">
                <span>ID: {{ node.id }}</span>
                <span>Depth: {{ node.depth }}</span>
                <span v-if="node.path">Path: {{ node.path }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="detail-actions">
        <button @click="wrapWithParent">Wrap with Parent</button>
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
  justify-content: flex-end;
  flex-shrink: 0;
  background: var(--bg-secondary);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.header-actions button {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.header-actions button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-actions button svg {
  display: block;
}

.copy-btn:active {
  color: var(--accent-color);
}

.detail-panel-content {
  flex: 1;
  overflow: hidden;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Title row */
.title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.title-checkbox {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: var(--accent-color);
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

.sensitive-checkbox {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
}

.lock-icon {
  font-size: 10px;
  padding: 2px 4px;
  background: var(--bg-primary);
  border-radius: 3px;
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
  max-height: 200px;
  overflow-y: auto;
}

.child-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.child-item:hover {
  background: var(--bg-hover);
}

.child-item.completed .child-title {
  text-decoration: line-through;
  color: var(--text-tertiary);
}

.child-type {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.child-type.task { color: #f0c674; }
.child-type.note { color: #81a2be; }
.child-type.project { color: #b5bd68; }
.child-type.milestone { color: #b294bb; }
.child-type.event { color: #e74c3c; }
.child-type.topic { color: #1abc9c; }
.child-type.folder { color: #95a5a6; }
.child-type.person { color: #3498db; }

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

/* Links section */
.links-section {
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.links-section .section-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.add-link-btn {
  margin-left: auto;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-primary);
  color: var(--text-secondary);
  border-radius: 3px;
  cursor: pointer;
  font-size: 14px;
}

.add-link-btn:hover {
  background: var(--bg-hover);
  color: var(--accent-color);
}

.link-search {
  margin-bottom: 8px;
}

.link-search input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.link-search input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.link-search-results {
  margin-top: 4px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
}

.link-search-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.link-search-item:hover {
  background: var(--bg-hover);
}

.links-list {
  max-height: 150px;
  overflow-y: auto;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s;
}

.link-item:hover {
  background: var(--bg-hover);
}

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

.link-title {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.remove-link-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 2px 6px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.link-item:hover .remove-link-btn {
  opacity: 1;
}

.remove-link-btn:hover {
  color: #e74c3c;
}

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
</style>
