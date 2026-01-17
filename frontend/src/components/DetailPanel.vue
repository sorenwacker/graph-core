<script setup>
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import MentionDropdown from './MentionDropdown.vue'
import TagInput from './TagInput.vue'
import NotesEditor from './NotesEditor.vue'
import { api } from '../services/api'
import { nodeTypes, getTypeIcon, getTypeColors, personIconSvg } from '../utils/constants.js'
import { useMentions } from '../composables/useMentions.js'

const props = defineProps({
  node: Object,
  width: { type: Number, default: 400 },
  fullscreen: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  workspaces: { type: Array, default: () => [] }
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
  onMentionInserted: async (personId, nodeId) => {
    // Refresh linked nodes after auto-linking
    await loadLinkedNodes()
  }
})

function onNotesInput(e) {
  editedNode.value.notes = e.target.value
  handleMentionInput(e, props.node?.id)
}

function onCodeMirrorNotesUpdate(newValue) {
  editedNode.value.notes = newValue
}

function onNotesKeydown(e) {
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
    // Reset organization linking state
    orgQuery.value = ''
    showOrgDropdown.value = false
    linkedOrganizations.value = []
    // Reset members state
    memberQuery.value = ''
    showMemberDropdown.value = false
    linkedMembers.value = []

    await Promise.all([loadChildren(), loadLinkedNodes()])

    // Load organizations for person nodes
    if (newNode.type === 'person') {
      await loadOrganizations()
      await loadLinkedOrganizations()
    }

    // Load members for organization nodes
    if (newNode.type === 'organization') {
      await loadAllPersons()
      await loadLinkedMembers()
    }

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
const isOrganization = computed(() => editedNode.value.type === 'organization')

// Color palette for persons
const personColors = [
  '#d93025', '#ea4335', '#ef5350', '#ff5252',
  '#c2185b', '#e91e63', '#f06292',
  '#ef6c00', '#ff7043', '#ff9800',
  '#f9a825', '#ffb300', '#ffc107',
  '#0f9d58', '#34a853', '#43a047', '#4caf50',
  '#009688', '#00897b', '#26a69a',
  '#00bcd4', '#00acc1',
  '#0288d1', '#039be5', '#03a9f4', '#4285f4',
  '#673ab7', '#5e35b1', '#7b1fa2', '#9c27b0',
  '#455a64', '#607d8b', '#78909c'
]

// Organization linking for persons
const organizations = ref([])
const orgQuery = ref('')
const showOrgDropdown = ref(false)
const selectedOrgIndex = ref(0)
const linkedOrganizations = ref([])

// Load organizations from People workspace
async function loadOrganizations() {
  try {
    organizations.value = await api.getNodes({ type: 'organization', workspace_id: null })
  } catch (err) {
    console.error('Failed to load organizations:', err)
    organizations.value = []
  }
}

// Filtered organizations for autocomplete
const filteredOrganizations = computed(() => {
  if (!orgQuery.value) {
    return organizations.value.slice(0, 10)
  }
  const q = orgQuery.value.toLowerCase()
  return organizations.value
    .filter(o => o.title?.toLowerCase().includes(q))
    .slice(0, 10)
})

// Check if query matches an existing organization exactly
const exactOrgMatch = computed(() => {
  if (!orgQuery.value) return null
  return organizations.value.find(
    o => o.title?.toLowerCase() === orgQuery.value.toLowerCase()
  )
})

// Get full organization path (e.g., "TU Delft / REIT group")
async function getOrgPath(org) {
  if (!org) return ''
  const parts = [org.title]
  let current = org
  while (current.parent_id) {
    try {
      const parent = await api.getNode(current.parent_id)
      if (parent && parent.type === 'organization') {
        parts.unshift(parent.title)
        current = parent
      } else {
        break
      }
    } catch {
      break
    }
  }
  return parts.join(' / ')
}

// Load linked organizations for a person (includes both linked and parent orgs)
async function loadLinkedOrganizations() {
  if (!props.node?.id || !isPerson.value) {
    linkedOrganizations.value = []
    return
  }
  try {
    const allOrgs = []
    const seenIds = new Set()

    // 1. Get organizations from links (node_links table)
    const links = await api.getLinkedNodes(props.node.id)
    const linkedOrgs = links.filter(n => n.type === 'organization')
    for (const org of linkedOrgs) {
      if (!seenIds.has(org.id)) {
        seenIds.add(org.id)
        allOrgs.push({ ...org, isParent: false })
      }
    }

    // 2. Get parent organizations (hierarchical relationship)
    let currentNode = props.node
    while (currentNode?.parent_id) {
      const parent = await api.getNode(currentNode.parent_id)
      if (parent?.type === 'organization' && !seenIds.has(parent.id)) {
        seenIds.add(parent.id)
        allOrgs.push({ ...parent, isParent: true })
      }
      currentNode = parent
    }

    // Add paths to all organizations
    const orgsWithPaths = await Promise.all(
      allOrgs.map(async (org) => ({
        ...org,
        path: await getOrgPath(org)
      }))
    )
    linkedOrganizations.value = orgsWithPaths
  } catch (err) {
    console.error('Failed to load linked organizations:', err)
    linkedOrganizations.value = []
  }
}

async function linkOrganization(org) {
  if (!props.node?.id) return
  try {
    await api.linkNodes(props.node.id, org.id)
    await loadLinkedOrganizations()
    await loadLinkedNodes()
  } catch (err) {
    console.error('Failed to link organization:', err)
  }
  orgQuery.value = ''
  showOrgDropdown.value = false
}

async function unlinkOrganization(org) {
  if (!props.node?.id) return
  try {
    await api.unlinkNodes(props.node.id, org.id)
    await loadLinkedOrganizations()
    await loadLinkedNodes()
  } catch (err) {
    console.error('Failed to unlink organization:', err)
  }
}

async function createAndLinkOrganization() {
  if (!orgQuery.value.trim() || !props.node?.id) return
  try {
    const newOrg = await api.createNode({
      title: orgQuery.value.trim(),
      type: 'organization',
      workspace_id: null
    })
    organizations.value.push(newOrg)
    await linkOrganization(newOrg)
  } catch (err) {
    console.error('Failed to create organization:', err)
  }
}

function handleOrgKeydown(e) {
  if (!showOrgDropdown.value) {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      showOrgDropdown.value = true
      e.preventDefault()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const max = filteredOrganizations.value.length
    selectedOrgIndex.value = Math.min(selectedOrgIndex.value + 1, max)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedOrgIndex.value = Math.max(selectedOrgIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedOrgIndex.value < filteredOrganizations.value.length) {
      linkOrganization(filteredOrganizations.value[selectedOrgIndex.value])
    } else if (!exactOrgMatch.value && orgQuery.value.trim()) {
      createAndLinkOrganization()
    }
  } else if (e.key === 'Escape') {
    showOrgDropdown.value = false
  }
}

function handleOrgInput() {
  showOrgDropdown.value = true
  selectedOrgIndex.value = 0
}

// Members linking for organizations (reverse direction)
const allPersons = ref([])
const memberQuery = ref('')
const showMemberDropdown = ref(false)
const selectedMemberIndex = ref(0)
const linkedMembers = ref([])

// Load all persons for member autocomplete
async function loadAllPersons() {
  try {
    allPersons.value = await api.getNodes({ type: 'person', workspace_id: null })
  } catch (err) {
    console.error('Failed to load persons:', err)
    allPersons.value = []
  }
}

// Filtered persons for member autocomplete
const filteredMembers = computed(() => {
  if (!memberQuery.value) {
    return allPersons.value.slice(0, 10)
  }
  const q = memberQuery.value.toLowerCase()
  return allPersons.value
    .filter(p => p.title?.toLowerCase().includes(q))
    .slice(0, 10)
})

// Check if query matches an existing person exactly
const exactMemberMatch = computed(() => {
  if (!memberQuery.value) return null
  return allPersons.value.find(
    p => p.title?.toLowerCase() === memberQuery.value.toLowerCase()
  )
})

// Load members (persons linked to this organization)
async function loadLinkedMembers() {
  if (!props.node?.id || !isOrganization.value) {
    linkedMembers.value = []
    return
  }
  try {
    const links = await api.getLinkedNodes(props.node.id)
    linkedMembers.value = links.filter(n => n.type === 'person')
  } catch (err) {
    console.error('Failed to load members:', err)
    linkedMembers.value = []
  }
}

async function linkMember(person) {
  if (!props.node?.id) return
  try {
    await api.linkNodes(props.node.id, person.id)
    await loadLinkedMembers()
    await loadLinkedNodes()
  } catch (err) {
    console.error('Failed to link member:', err)
  }
  memberQuery.value = ''
  showMemberDropdown.value = false
}

async function unlinkMember(person) {
  if (!props.node?.id) return
  try {
    await api.unlinkNodes(props.node.id, person.id)
    await loadLinkedMembers()
    await loadLinkedNodes()
  } catch (err) {
    console.error('Failed to unlink member:', err)
  }
}

async function createAndLinkMember() {
  if (!memberQuery.value.trim() || !props.node?.id) return
  try {
    const newPerson = await api.createNode({
      title: memberQuery.value.trim(),
      type: 'person',
      workspace_id: null
    })
    allPersons.value.push(newPerson)
    await linkMember(newPerson)
  } catch (err) {
    console.error('Failed to create member:', err)
  }
}

function handleMemberKeydown(e) {
  if (!showMemberDropdown.value) {
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      showMemberDropdown.value = true
      e.preventDefault()
    }
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    const max = filteredMembers.value.length
    selectedMemberIndex.value = Math.min(selectedMemberIndex.value + 1, max)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedMemberIndex.value = Math.max(selectedMemberIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedMemberIndex.value < filteredMembers.value.length) {
      linkMember(filteredMembers.value[selectedMemberIndex.value])
    } else if (!exactMemberMatch.value && memberQuery.value.trim()) {
      createAndLinkMember()
    }
  } else if (e.key === 'Escape') {
    showMemberDropdown.value = false
  }
}

function handleMemberInput() {
  showMemberDropdown.value = true
  selectedMemberIndex.value = 0
}

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

async function changeWorkspace(newWorkspaceId) {
  // Convert 'people' to null for database
  const wsId = newWorkspaceId === 'people' ? null : newWorkspaceId
  editedNode.value.workspace_id = wsId
  await api.updateNode(editedNode.value.id, { workspace_id: wsId })
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
defineExpose({ loadChildren, loadLinkedOrganizations, loadLinkedMembers, loadLinkedNodes })
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

      <!-- Person-specific form layout -->
      <template v-if="isPerson">
        <div class="person-form">
          <!-- Person avatar and basic info -->
          <div class="person-header-row">
            <div class="person-avatar-large" :style="{ backgroundColor: editedNode.color || '#3498db' }">
              {{ getInitials(editedNode.title) }}
            </div>
            <div class="person-quick-info">
              <div v-if="editedNode.role" class="person-role-display">{{ editedNode.role }}</div>
              <div v-if="linkedOrganizations.length" class="person-orgs-display">
                {{ linkedOrganizations.map(o => o.path || o.title).join(', ') }}
              </div>
            </div>
          </div>

          <!-- Person form fields -->
          <div class="person-form-grid">
            <div class="form-field">
              <label>Email</label>
              <input
                type="email"
                :value="editedNode.email || ''"
                @input="editedNode.email = $event.target.value"
                @blur="saveChanges"
                placeholder="email@example.com"
              />
            </div>

            <div class="form-field">
              <label>Phone</label>
              <input
                type="tel"
                :value="editedNode.phone || ''"
                @input="editedNode.phone = $event.target.value"
                @blur="saveChanges"
                placeholder="+1 234 567 890"
              />
            </div>

            <div class="form-field full-width">
              <label>Organizations</label>
              <div class="org-tags">
                <div
                  v-for="org in linkedOrganizations"
                  :key="org.id"
                  class="org-tag"
                >
                  <span class="org-path">{{ org.path || org.title }}</span>
                  <button class="org-remove" @click="unlinkOrganization(org)" title="Remove">&times;</button>
                </div>
              </div>
              <div class="org-autocomplete">
                <input
                  v-model="orgQuery"
                  placeholder="Search or create organization..."
                  @input="handleOrgInput"
                  @keydown="handleOrgKeydown"
                  @focus="showOrgDropdown = true"
                  @blur="setTimeout(() => showOrgDropdown = false, 200)"
                />
                <div v-if="showOrgDropdown && (filteredOrganizations.length > 0 || orgQuery.trim())" class="org-dropdown">
                  <div
                    v-for="(org, index) in filteredOrganizations"
                    :key="org.id"
                    class="org-option"
                    :class="{ selected: selectedOrgIndex === index, linked: linkedOrganizations.find(o => o.id === org.id) }"
                    @mousedown.prevent="linkOrganization(org)"
                  >
                    {{ org.title }}
                    <span v-if="linkedOrganizations.find(o => o.id === org.id)" class="linked-badge">linked</span>
                  </div>
                  <div
                    v-if="!exactOrgMatch && orgQuery.trim()"
                    class="org-option create-option"
                    :class="{ selected: selectedOrgIndex === filteredOrganizations.length }"
                    @mousedown.prevent="createAndLinkOrganization"
                  >
                    + Create "{{ orgQuery.trim() }}"
                  </div>
                </div>
              </div>
            </div>

            <div class="form-field">
              <label>Role / Title</label>
              <input
                type="text"
                :value="editedNode.role || ''"
                @input="editedNode.role = $event.target.value"
                @blur="saveChanges"
                placeholder="Job title"
              />
            </div>

            <div class="form-field">
              <label>Website</label>
              <input
                type="url"
                :value="editedNode.website || ''"
                @input="editedNode.website = $event.target.value"
                @blur="saveChanges"
                placeholder="https://..."
              />
            </div>

            <!-- Notes section with tabs -->
            <div class="form-field full-width notes-field">
              <div class="notes-header">
                <label>Notes</label>
                <div class="tab-buttons">
                  <button :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">Edit</button>
                  <button :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">Preview</button>
                  <button :class="{ active: activeTab === 'split' }" @click="activeTab = 'split'">Split</button>
                </div>
              </div>
              <NotesEditor
                v-if="activeTab === 'edit'"
                :model-value="editedNode.notes"
                @update:model-value="onCodeMirrorNotesUpdate"
                @blur="saveChanges"
                class="notes-codemirror person-notes"
              />
              <div v-else-if="activeTab === 'preview'" class="notes-preview markdown-body person-notes">
                <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
                <p v-else class="placeholder">No notes yet</p>
              </div>
              <div v-else class="notes-split person-notes">
                <NotesEditor
                  :model-value="editedNode.notes"
                  @update:model-value="onCodeMirrorNotesUpdate"
                  @blur="saveChanges"
                  class="notes-codemirror split-editor"
                />
                <div class="notes-preview markdown-body split-preview">
                  <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
                  <p v-else class="placeholder">No notes yet</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Color picker -->
          <div class="color-picker-section">
            <label>Color</label>
            <div class="color-grid">
              <div
                v-for="color in personColors"
                :key="color"
                class="color-option"
                :class="{ selected: editedNode.color === color }"
                :style="{ background: color }"
                @click="editedNode.color = color; saveChanges()"
              ></div>
            </div>
          </div>

          <!-- Links section for persons -->
          <div v-if="linkedNodes.filter(n => n.type !== 'organization').length" class="person-links-section">
            <label>Linked Items</label>
            <div class="links-list">
              <span
                v-for="linked in linkedNodes.filter(n => n.type !== 'organization')"
                :key="linked.id"
                class="link-chip"
                @click="emit('select-child', linked.id)"
              >
                <span class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
                {{ linked.title }}
                <button class="remove-link-btn" @click.stop="removeLink(linked)">x</button>
              </span>
              <button class="add-link-btn" @click="emit('open-link-search')" title="Add link">+</button>
            </div>
          </div>
          <button v-else class="add-field-btn link-btn" @click="emit('open-link-search')" title="Add link">+ Link to project/task</button>

          <!-- Tags for person -->
          <div class="person-tags-section">
            <label>Tags</label>
            <TagInput
              :tags="editedNode.tags || []"
              @update="updateTags"
            />
          </div>

          <!-- System info -->
          <div class="person-meta">
            <span>ID: {{ editedNode.id }}</span>
            <span>Created: {{ formattedCreatedDate }}</span>
            <span>Modified: {{ formattedUpdatedDate }}</span>
          </div>
        </div>
      </template>

      <!-- Organization-specific form layout -->
      <template v-else-if="isOrganization">
        <div class="organization-form">
          <!-- Organization header -->
          <div class="org-header-row">
            <div class="org-icon-large" :style="{ backgroundColor: editedNode.color || '#e67e22' }">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"/>
              </svg>
            </div>
            <div class="org-quick-info">
              <div v-if="linkedMembers.length" class="org-members-count">
                {{ linkedMembers.length }} member{{ linkedMembers.length !== 1 ? 's' : '' }}
              </div>
            </div>
          </div>

          <!-- Members section -->
          <div class="form-field full-width">
            <label>Members</label>
            <div class="member-tags">
              <div
                v-for="member in linkedMembers"
                :key="member.id"
                class="member-tag"
                :style="{ backgroundColor: member.color || '#3498db' }"
                @click="emit('select-child', member.id)"
              >
                <span class="member-initials">{{ getInitials(member.title) }}</span>
                <span class="member-name">{{ member.title }}</span>
                <button class="member-remove" @click.stop="unlinkMember(member)" title="Remove">&times;</button>
              </div>
            </div>
            <div class="member-autocomplete">
              <input
                v-model="memberQuery"
                placeholder="Search or create person..."
                @input="handleMemberInput"
                @keydown="handleMemberKeydown"
                @focus="showMemberDropdown = true"
                @blur="setTimeout(() => showMemberDropdown = false, 200)"
              />
              <div v-if="showMemberDropdown && (filteredMembers.length > 0 || memberQuery.trim())" class="member-dropdown">
                <div
                  v-for="(person, index) in filteredMembers"
                  :key="person.id"
                  class="member-option"
                  :class="{ selected: selectedMemberIndex === index, linked: linkedMembers.find(m => m.id === person.id) }"
                  @mousedown.prevent="linkMember(person)"
                >
                  <span class="member-option-avatar" :style="{ backgroundColor: person.color || '#3498db' }">
                    {{ getInitials(person.title) }}
                  </span>
                  {{ person.title }}
                  <span v-if="linkedMembers.find(m => m.id === person.id)" class="linked-badge">member</span>
                </div>
                <div
                  v-if="!exactMemberMatch && memberQuery.trim()"
                  class="member-option create-option"
                  :class="{ selected: selectedMemberIndex === filteredMembers.length }"
                  @mousedown.prevent="createAndLinkMember"
                >
                  + Create "{{ memberQuery.trim() }}"
                </div>
              </div>
            </div>
          </div>

          <!-- Notes section for organization with tabs -->
          <div class="form-field full-width notes-field">
            <div class="notes-header">
              <label>Notes</label>
              <div class="tab-buttons">
                <button :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">Edit</button>
                <button :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">Preview</button>
                <button :class="{ active: activeTab === 'split' }" @click="activeTab = 'split'">Split</button>
              </div>
            </div>
            <NotesEditor
              v-if="activeTab === 'edit'"
              :model-value="editedNode.notes"
              @update:model-value="onCodeMirrorNotesUpdate"
              @blur="saveChanges"
              class="notes-codemirror org-notes"
            />
            <div v-else-if="activeTab === 'preview'" class="notes-preview markdown-body org-notes">
              <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
              <p v-else class="placeholder">No notes yet</p>
            </div>
            <div v-else class="notes-split org-notes">
              <NotesEditor
                :model-value="editedNode.notes"
                @update:model-value="onCodeMirrorNotesUpdate"
                @blur="saveChanges"
                class="notes-codemirror split-editor"
              />
              <div class="notes-preview markdown-body split-preview">
                <MarkdownRenderer v-if="editedNode.notes" :content="editedNode.notes" />
                <p v-else class="placeholder">No notes yet</p>
              </div>
            </div>
          </div>

          <!-- Color picker for organization -->
          <div class="color-picker-section">
            <label>Color</label>
            <div class="color-grid">
              <div
                v-for="color in personColors"
                :key="color"
                class="color-option"
                :class="{ selected: editedNode.color === color }"
                :style="{ background: color }"
                @click="editedNode.color = color; saveChanges()"
              ></div>
            </div>
          </div>

          <!-- Links section for organization (non-person links) -->
          <div v-if="linkedNodes.filter(n => n.type !== 'person').length" class="org-links-section">
            <label>Linked Items</label>
            <div class="links-list">
              <span
                v-for="linked in linkedNodes.filter(n => n.type !== 'person')"
                :key="linked.id"
                class="link-chip"
                @click="emit('select-child', linked.id)"
              >
                <span class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
                {{ linked.title }}
                <button class="remove-link-btn" @click.stop="removeLink(linked)">x</button>
              </span>
              <button class="add-link-btn" @click="emit('open-link-search')" title="Add link">+</button>
            </div>
          </div>
          <button v-else class="add-field-btn link-btn" @click="emit('open-link-search')" title="Add link">+ Link to project/task</button>

          <!-- Tags for organization -->
          <div class="org-tags-section">
            <label>Tags</label>
            <TagInput
              :tags="editedNode.tags || []"
              @update="updateTags"
            />
          </div>

          <!-- System info -->
          <div class="org-meta">
            <span>ID: {{ editedNode.id }}</span>
            <span>Created: {{ formattedCreatedDate }}</span>
            <span>Modified: {{ formattedUpdatedDate }}</span>
          </div>
        </div>
      </template>

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
              :model-value="editedNode.notes"
              @update:model-value="onCodeMirrorNotesUpdate"
              @blur="saveChanges"
              class="notes-codemirror"
            />

            <div v-else-if="activeTab === 'preview'" class="notes-preview markdown-body">
              <div v-if="editedNode.notes_sensitive && !showSensitivePreview" class="sensitive-hidden">
                <p>Sensitive notes hidden</p>
                <button class="unlock-btn" @click="showSensitivePreview = true">Unlock</button>
              </div>
              <MarkdownRenderer v-else-if="editedNode.notes" :content="editedNode.notes" />
              <p v-else class="placeholder">No notes yet</p>
            </div>

            <div v-else class="notes-split">
              <NotesEditor
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
                  <button class="unlock-btn" @click="showSensitivePreview = true">Unlock</button>
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

                <!-- Workspace -->
                <div class="meta-item">
                  <label>Workspace</label>
                  <select
                    :value="editedNode.workspace_id === null ? 'people' : editedNode.workspace_id"
                    @change="changeWorkspace($event.target.value)"
                  >
                    <option value="people">People</option>
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

                <!-- Tags -->
                <div class="meta-item tags-row full-width">
                  <label>Tags</label>
                  <TagInput
                    :tags="editedNode.tags || []"
                    @update="updateTags"
                  />
                </div>

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
                      <span v-if="linked.type === 'person'" class="link-type person" v-html="personIconSvg"></span>
                      <span v-else class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
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

            </div>
          </div>
      </div>
      </template>

      <!-- Actions -->
      <div class="detail-actions">
        <button @click="wrapWithParent">Wrap with Parent</button>
        <button @click="moveToRoot">Move to Root</button>
        <button @click="copyNodeContent">Export</button>
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
.link-type.group { color: #a0a0d0; }
.link-type.event { color: #f07da0; }
.link-type.topic { color: #1abc9c; }
.link-type.folder { color: #95a5a6; }
.link-type.person { color: #3498db; display: inline-flex; align-items: center; }
.link-type.person :deep(svg) { width: 10px; height: 10px; }

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
.gc-type.group { color: #a0a0d0; }
.gc-type.event { color: #f07da0; }
.gc-type.topic { color: #1abc9c; }
.gc-type.folder { color: #95a5a6; }
.gc-type.person { color: #3498db; display: inline-flex; align-items: center; }
.gc-type.person :deep(svg) { width: 10px; height: 10px; }

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

.tags-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-basis: 100%;
}

.tags-row label {
  flex-shrink: 0;
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
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
}

.org-remove:hover {
  color: white;
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

/* Person form styles */
.person-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: 8px;
}

.person-header-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.person-avatar-large {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.person-quick-info {
  flex: 1;
  min-width: 0;
}

.person-role-display {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.person-orgs-display {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.person-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.person-form-grid .form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.person-form-grid .form-field.full-width {
  grid-column: 1 / -1;
}

.person-form-grid .form-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.person-form-grid .form-field input,
.person-form-grid .form-field textarea {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}

.person-form-grid .form-field input:focus,
.person-form-grid .form-field textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.person-form-grid .form-field textarea {
  resize: vertical;
  min-height: 80px;
}

/* Color picker section */
.color-picker-section {
  padding: 12px 0;
  border-top: 1px solid var(--border-color);
}

.color-picker-section label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
}

.color-option:hover {
  transform: scale(1.1);
}

.color-option.selected {
  border-color: white;
  transform: scale(1.15);
  box-shadow: 0 0 0 2px var(--accent-color);
}

/* Person links section */
.person-links-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.person-links-section label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.person-links-section .links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.person-links-section .link-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-secondary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.person-links-section .link-chip:hover {
  background: var(--bg-hover);
}

.person-links-section .link-type {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.person-links-section .link-type :deep(svg) {
  width: 12px;
  height: 12px;
}

.person-links-section .remove-link-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0 2px;
  font-size: 12px;
  line-height: 1;
}

.person-links-section .remove-link-btn:hover {
  color: #ff6b6b;
}

.person-links-section .add-link-btn {
  background: transparent;
  border: 1px dashed var(--border-color);
  color: var(--text-tertiary);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.person-links-section .add-link-btn:hover {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: white;
}

.add-field-btn.link-btn {
  display: block;
  width: 100%;
  padding: 8px;
  text-align: center;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.add-field-btn.link-btn:hover {
  background: var(--bg-secondary);
  border-color: var(--accent-color);
  color: var(--text-primary);
}

/* Person tags section */
.person-tags-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.person-tags-section label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

/* Person meta info */
.person-meta {
  padding-top: 12px;
  margin-top: auto;
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-tertiary);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* Organization form styles */
.organization-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
  padding-bottom: 8px;
}

.org-header-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.org-icon-large {
  width: 56px;
  height: 56px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.org-quick-info {
  flex: 1;
  min-width: 0;
}

.org-members-count {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.organization-form .form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.organization-form .form-field.full-width {
  width: 100%;
}

.organization-form .form-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.organization-form .form-field textarea {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  resize: vertical;
  min-height: 80px;
}

.organization-form .form-field textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* Member tags */
.member-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 20px;
}

.member-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  color: white;
  padding: 4px 8px 4px 4px;
  border-radius: 20px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.member-tag:hover {
  opacity: 0.9;
}

.member-initials {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
}

.member-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.member-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.member-remove:hover {
  color: white;
}

/* Member autocomplete */
.member-autocomplete {
  position: relative;
}

.member-autocomplete input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.member-autocomplete input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.member-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  margin-top: 4px;
}

.member-option {
  padding: 6px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.member-option:hover,
.member-option.selected {
  background: var(--bg-hover);
}

.member-option.linked {
  opacity: 0.6;
}

.member-option-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.member-option .linked-badge {
  font-size: 9px;
  color: var(--text-tertiary);
  padding: 2px 5px;
  background: var(--bg-secondary);
  border-radius: 3px;
  margin-left: auto;
}

.member-option.create-option {
  color: var(--accent-color);
  font-weight: 500;
  border-top: 1px solid var(--border-color);
}

/* Organization links section */
.org-links-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.org-links-section label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

.org-links-section .links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

/* Organization tags section */
.org-tags-section {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.org-tags-section label {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 8px;
}

/* Organization meta info */
.org-meta {
  padding-top: 12px;
  margin-top: auto;
  border-top: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-tertiary);
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

</style>
