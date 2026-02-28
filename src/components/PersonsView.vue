<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../services/api.js'
import { personColors } from '../utils/constants.js'
import NotesEditor from './NotesEditor.vue'
import TagInput from './TagInput.vue'

const props = defineProps({
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false },
  workspaceId: { type: String, default: 'work' }
})

const emit = defineEmits(['select', 'update', 'delete', 'context-menu'])

// Context menu handler
function handleContextMenu(e, node) {
  e.preventDefault()
  emit('context-menu', { event: e, node })
}

const persons = ref([])
const personLinks = ref({})
const organizations = ref([]) // Organization nodes from People workspace
const loading = ref(true)
const editingPerson = ref(null)
const viewMode = ref('cards') // 'cards' or 'table'
const sortBy = ref('title')
const sortDir = ref('asc')
const hideSensitive = ref(true) // Hide email, phone, notes by default

// Organization autocomplete state
const orgQuery = ref('')
const showOrgDropdown = ref(false)
const selectedOrgIndex = ref(0)
const linkedOrganizations = ref([]) // Currently linked organizations for editing person

function maskEmail(email) {
  if (!email || !hideSensitive.value) return email
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return user.charAt(0) + '***@' + domain
}

function _maskPhone(phone) {
  if (!phone || !hideSensitive.value) return phone
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

onMounted(async () => {
  await loadPersons()
  await loadOrganizations()
})

// Load organization nodes from current workspace
async function loadOrganizations() {
  try {
    organizations.value = await api.getNodes({ type: 'organization', workspace_id: props.workspaceId })
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

const sortedPersons = computed(() => {
  let filtered = persons.value
  // Filter out completed persons if hideCompleted is true
  if (props.hideCompleted) {
    filtered = filtered.filter(p => !p.completed)
  }
  const sorted = [...filtered]
  sorted.sort((a, b) => {
    const aVal = (a[sortBy.value] || '').toLowerCase()
    const bVal = (b[sortBy.value] || '').toLowerCase()
    if (aVal < bVal) return sortDir.value === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDir.value === 'asc' ? 1 : -1
    return 0
  })
  return sorted
})

async function loadPersons() {
  loading.value = true
  try {
    const allNodes = await api.getNodes({ type: 'person' })
    persons.value = allNodes

    for (const person of persons.value) {
      try {
        const links = await api.getLinkedNodes(person.id)
        personLinks.value[person.id] = links
      } catch {
        personLinks.value[person.id] = []
      }
    }
  } catch (err) {
    console.error('Failed to load persons:', err)
  }
  loading.value = false
}

function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getRandomColor() {
  return personColors[Math.floor(Math.random() * personColors.length)]
}

// Get contrasting text color (white or black) based on background luminance
function getContrastColor(hexColor) {
  if (!hexColor) return '#ffffff'
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substr(0, 2), 16)
  const g = parseInt(hex.substr(2, 2), 16)
  const b = parseInt(hex.substr(4, 2), 16)
  // Calculate relative luminance (use lower threshold for better contrast)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.4 ? '#000000' : '#ffffff'
}

// Get effective color for a person (own color or inherited from parent/organization)
function getEffectiveColor(person) {
  // Use own color if set
  if (person.color && person.color !== '#0f4c75') {
    return person.color
  }
  // Try to get color from parent
  if (person.parent_id) {
    const parent = organizations.value.find(o => o.id === person.parent_id)
    if (parent?.color && parent.color !== '#0f4c75') {
      return parent.color
    }
  }
  // Try to get color from linked organization
  const links = personLinks.value[person.id] || []
  const linkedOrg = links.find(n => n.type === 'organization' && n.color && n.color !== '#0f4c75')
  if (linkedOrg) {
    return linkedOrg.color
  }
  // Neutral gray default
  return '#6b7280'
}

// Get full organization path (e.g., "TU Delft / REIT group")
async function getOrgPath(org) {
  if (!org) return ''
  const parts = [org.title]
  let current = org

  // Walk up the parent chain
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

// Load linked organizations for a person
async function loadLinkedOrganizations(personId) {
  try {
    const allOrgs = []
    const seenIds = new Set()

    // 1. Get organizations from links (node_links table)
    const links = await api.getLinkedNodes(personId)
    const linkedOrgs = links.filter(n => n.type === 'organization')
    for (const org of linkedOrgs) {
      if (!seenIds.has(org.id)) {
        seenIds.add(org.id)
        allOrgs.push({ ...org, isParent: false })
      }
    }

    // 2. Get the deepest parent organization (hierarchical relationship)
    // Only add the most specific org in the chain, not all ancestors
    const person = await api.getNode(personId)
    let currentNode = person
    let deepestParentOrg = null
    while (currentNode?.parent_id) {
      const parent = await api.getNode(currentNode.parent_id)
      if (parent?.type === 'organization') {
        deepestParentOrg = parent
        break // Stop at first (deepest) org parent
      }
      currentNode = parent
    }
    if (deepestParentOrg && !seenIds.has(deepestParentOrg.id)) {
      seenIds.add(deepestParentOrg.id)
      allOrgs.push({ ...deepestParentOrg, isParent: true })
    }

    // Filter out ancestors - only keep leaf orgs (orgs that don't have children in the list)
    const _orgIds = new Set(allOrgs.map(o => o.id))
    const leafOrgs = allOrgs.filter(org => {
      // Check if any other org in the list has this org as an ancestor
      for (const other of allOrgs) {
        if (other.id !== org.id && other.parent_id === org.id) {
          return false // This org is a parent of another, skip it
        }
      }
      return true
    })

    // Add paths to leaf organizations only
    const orgsWithPaths = await Promise.all(
      leafOrgs.map(async (org) => ({
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

function showAddPerson() {
  editingPerson.value = {
    title: '',
    email: '',
    phone: '',
    organization: '',
    role: '',
    website: '',
    notes: '',
    color: getRandomColor(),
    type: 'person'
  }
  linkedOrganizations.value = []
  orgQuery.value = ''
  showOrgDropdown.value = false
}

async function editPerson(person) {
  editingPerson.value = { ...person }
  orgQuery.value = ''
  showOrgDropdown.value = false
  await loadLinkedOrganizations(person.id)
}

async function savePerson() {
  if (!editingPerson.value?.title?.trim()) return

  try {
    const data = {
      title: editingPerson.value.title,
      type: 'person',
      email: editingPerson.value.email || '',
      phone: editingPerson.value.phone || '',
      organization: '', // Deprecated - now using linked organizations
      role: editingPerson.value.role || '',
      website: editingPerson.value.website || '',
      notes: editingPerson.value.notes || '',
      color: editingPerson.value.color || '#0f4c75',
      tags: editingPerson.value.tags || [],
      workspace_id: props.workspaceId
    }

    let personId = editingPerson.value.id
    if (personId) {
      await api.updateNode(personId, data)
    } else {
      // Create new person
      const newPerson = await api.createNode(data)
      personId = newPerson.id

      // Link organizations that were selected during creation
      for (const org of linkedOrganizations.value) {
        try {
          await api.linkNodes(personId, org.id)
        } catch (err) {
          console.error('Failed to link organization:', err)
        }
      }
    }

    editingPerson.value = null
    linkedOrganizations.value = []
    orgQuery.value = ''
    await loadPersons()
  } catch (err) {
    console.error('Failed to save person:', err)
  }
}

function deletePerson() {
  if (!editingPerson.value?.id) return
  emit('delete', editingPerson.value.id)
  editingPerson.value = null
}

function cancelEdit() {
  editingPerson.value = null
  linkedOrganizations.value = []
  orgQuery.value = ''
  showOrgDropdown.value = false
}

// Organization linking functions
async function linkOrganization(org) {
  if (!editingPerson.value?.id) {
    // For new person, just add to local list (will link after save)
    const orgWithPath = {
      ...org,
      path: await getOrgPath(org)
    }
    if (!linkedOrganizations.value.find(o => o.id === org.id)) {
      linkedOrganizations.value.push(orgWithPath)
    }
  } else {
    // For existing person, create link immediately
    try {
      await api.linkNodes(editingPerson.value.id, org.id)
      await loadLinkedOrganizations(editingPerson.value.id)
    } catch (err) {
      console.error('Failed to link organization:', err)
    }
  }
  orgQuery.value = ''
  showOrgDropdown.value = false
}

async function unlinkOrganization(org) {
  if (!editingPerson.value?.id) {
    // For new person, just remove from local list
    linkedOrganizations.value = linkedOrganizations.value.filter(o => o.id !== org.id)
  } else {
    // For existing person, remove link
    try {
      await api.unlinkNodes(editingPerson.value.id, org.id)
      await loadLinkedOrganizations(editingPerson.value.id)
    } catch (err) {
      console.error('Failed to unlink organization:', err)
    }
  }
}

async function createAndLinkOrganization() {
  if (!orgQuery.value.trim()) return

  try {
    // Create new organization node in current workspace
    const newOrg = await api.createNode({
      title: orgQuery.value.trim(),
      type: 'organization',
      workspace_id: props.workspaceId
    })

    // Add to organizations list
    organizations.value.push(newOrg)

    // Link it
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
    const max = exactOrgMatch.value ? filteredOrganizations.value.length : filteredOrganizations.value.length
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

function selectPerson(person) {
  emit('select', person)
}

function toggleSort(column) {
  if (sortBy.value === column) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortBy.value = column
    sortDir.value = 'asc'
  }
}

function getLinksForPerson(personId) {
  return personLinks.value[personId] || []
}

// Get organization names for display in card/table
function getOrganizationsForPerson(personId) {
  const links = personLinks.value[personId] || []
  return links.filter(n => n.type === 'organization').map(o => o.title)
}
</script>

<template>
  <div class="persons-view">
    <div class="persons-header">
      <h2>People</h2>
      <div class="view-switcher">
        <button :class="{ active: viewMode === 'cards' }" @click="viewMode = 'cards'">Cards</button>
        <button :class="{ active: viewMode === 'table' }" @click="viewMode = 'table'">Table</button>
      </div>
      <button
        class="sensitive-toggle"
        :class="{ active: hideSensitive }"
        @click="hideSensitive = !hideSensitive"
        :title="hideSensitive ? 'Show sensitive data' : 'Hide sensitive data'"
      >
        {{ hideSensitive ? 'Reveal' : 'Hide' }}
      </button>
      <button class="add-btn" @click="showAddPerson">+ Add Person</button>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <!-- Cards View -->
    <div v-else-if="viewMode === 'cards'" class="persons-cards">
      <div v-if="sortedPersons.length === 0" class="empty-state">No persons added yet</div>
      <div
        v-for="person in sortedPersons"
        :key="person.id"
        class="person-card"
        :style="{ borderLeftColor: getEffectiveColor(person) }"
        @click="editPerson(person)"
        @contextmenu.prevent="handleContextMenu($event, person)"
      >
        <div class="card-header">
          <div class="person-avatar" :style="{ background: getEffectiveColor(person), color: getContrastColor(getEffectiveColor(person)) }">
            {{ getInitials(person.title) }}
          </div>
          <div class="person-info">
            <div class="person-name">{{ person.title }}</div>
            <div v-if="person.role" class="person-role">{{ person.role }}</div>
          </div>
        </div>
        <div v-if="getOrganizationsForPerson(person.id).length > 0" class="person-company">
          {{ getOrganizationsForPerson(person.id).join(', ') }}
        </div>
        <div v-if="person.email" class="person-email">{{ maskEmail(person.email) }}</div>
        <div v-if="person.notes && !hideSensitive" class="person-notes">{{ person.notes }}</div>
        <div class="person-links-count">{{ getLinksForPerson(person.id).length }} linked</div>
      </div>
    </div>

    <!-- Table View -->
    <div v-else class="table-container">
      <table class="persons-table">
        <thead>
          <tr>
            <th class="col-color"></th>
            <th class="col-name sortable" @click="toggleSort('title')">
              Name
              <span v-if="sortBy === 'title'" class="sort-icon">{{ sortDir === 'asc' ? '^' : 'v' }}</span>
            </th>
            <th class="col-role sortable" @click="toggleSort('role')">
              Role
              <span v-if="sortBy === 'role'" class="sort-icon">{{ sortDir === 'asc' ? '^' : 'v' }}</span>
            </th>
            <th class="col-email sortable" @click="toggleSort('email')">
              Email
              <span v-if="sortBy === 'email'" class="sort-icon">{{ sortDir === 'asc' ? '^' : 'v' }}</span>
            </th>
            <th class="col-company sortable" @click="toggleSort('organization')">
              Organization
              <span v-if="sortBy === 'organization'" class="sort-icon">{{ sortDir === 'asc' ? '^' : 'v' }}</span>
            </th>
            <th class="col-links">Links</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="person in sortedPersons" :key="person.id" @click="selectPerson(person)" @contextmenu.prevent="handleContextMenu($event, person)">
            <td class="col-color">
              <div class="color-dot" :style="{ background: getEffectiveColor(person) }"></div>
            </td>
            <td class="col-name">{{ person.title }}</td>
            <td class="col-role">{{ person.role || '-' }}</td>
            <td class="col-email">{{ person.email ? maskEmail(person.email) : '-' }}</td>
            <td class="col-company">{{ getOrganizationsForPerson(person.id).join(', ') || '-' }}</td>
            <td class="col-links">{{ getLinksForPerson(person.id).length }}</td>
            <td class="col-actions">
              <button class="edit-btn" @click.stop="editPerson(person)">Edit</button>
            </td>
          </tr>
          <tr v-if="sortedPersons.length === 0">
            <td colspan="7" class="empty-row">No persons added yet</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Edit Person Modal -->
    <Teleport to="body">
      <div v-if="editingPerson" class="person-modal" @click.self="cancelEdit">
        <div class="modal-content">
          <h3>{{ editingPerson.id ? 'Edit Person' : 'Add Person' }}</h3>

          <div class="form-grid">
            <div class="form-field">
              <label>Name *</label>
              <input v-model="editingPerson.title" placeholder="Full name" />
            </div>

            <div class="form-field">
              <label>Email</label>
              <input v-model="editingPerson.email" type="email" placeholder="email@example.com" />
            </div>

            <div class="form-field">
              <label>Phone</label>
              <input v-model="editingPerson.phone" type="tel" placeholder="+1 234 567 8900" />
            </div>

            <div class="form-field full-width org-field">
              <label>Organizations</label>
              <!-- Linked organizations as tags -->
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
              <!-- Autocomplete input -->
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
              <input v-model="editingPerson.role" placeholder="Job title" />
            </div>

            <div class="form-field">
              <label>Website</label>
              <input v-model="editingPerson.website" type="url" placeholder="https://..." />
            </div>

            <div class="form-field full-width">
              <label>Notes</label>
              <div class="person-notes-editor">
                <NotesEditor
                  :model-value="editingPerson.notes || ''"
                  @update:model-value="editingPerson.notes = $event"
                />
              </div>
            </div>

            <div class="form-field full-width">
              <label>Tags</label>
              <TagInput
                :tags="editingPerson.tags || []"
                @update="editingPerson.tags = $event"
              />
            </div>
          </div>

          <div class="color-picker">
            <label>Color <span v-if="!editingPerson.color || editingPerson.color === '#0f4c75'" class="inherit-hint">(inherits from parent)</span></label>
            <div class="color-field">
              <input
                type="color"
                :value="editingPerson.color || '#6b7280'"
                @input="editingPerson.color = $event.target.value"
              />
              <button
                v-if="editingPerson.color && editingPerson.color !== '#0f4c75'"
                class="clear-btn"
                title="Inherit from parent"
                @click="editingPerson.color = null"
              >x</button>
            </div>
          </div>

          <div class="modal-actions">
            <button v-if="editingPerson.id" class="delete-btn" @click="deletePerson">Delete</button>
            <button @click="cancelEdit">Cancel</button>
            <button class="primary" :disabled="!editingPerson.title?.trim()" @click="savePerson">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.persons-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  padding: 16px;
}

.persons-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.persons-header h2 {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  margin: 0;
}

.view-switcher {
  display: flex;
  gap: 4px;
  background: var(--bg-secondary);
  padding: 4px;
  border-radius: 8px;
}

.view-switcher button {
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 6px;
  font-size: 12px;
}

.view-switcher button:hover {
  color: var(--text-primary);
}

.view-switcher button.active {
  background: var(--accent-color);
  color: white;
}

.add-btn {
  margin-left: auto;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.add-btn:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.sensitive-toggle {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
}

.sensitive-toggle:hover {
  background: var(--bg-tertiary);
}

.sensitive-toggle.active {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.loading {
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px;
}

/* Cards View */
.persons-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  overflow-y: auto;
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  color: var(--text-tertiary);
  padding: 40px;
}

.person-card {
  background: var(--bg-secondary);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.15s;
  border-left: 4px solid var(--accent-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.person-card:hover {
  background: var(--bg-tertiary);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  gap: 12px;
  align-items: center;
}

.person-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: 600;
  font-size: 14px;
  flex-shrink: 0;
}

.person-info .person-name {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-primary);
}

.person-info .person-role {
  font-size: 13px;
  color: var(--text-secondary);
}

.person-company {
  font-size: 13px;
  color: var(--text-secondary);
}

.person-email {
  font-size: 13px;
  color: var(--text-tertiary);
}

.person-notes {
  font-size: 13px;
  color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.03);
  padding: 8px;
  border-radius: 4px;
  white-space: pre-wrap;
  max-height: 80px;
  overflow: hidden;
}

.person-links-count {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: auto;
}

/* Table View */
.table-container {
  flex: 1;
  overflow: auto;
}

.persons-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.persons-table th,
.persons-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.persons-table th {
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-weight: 500;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  user-select: none;
}

.persons-table th.sortable {
  cursor: pointer;
}

.persons-table th.sortable:hover {
  color: var(--text-primary);
}

.sort-icon {
  margin-left: 4px;
  font-size: 10px;
}

.persons-table tbody tr {
  cursor: pointer;
  transition: background 0.15s;
}

.persons-table tbody tr:hover {
  background: var(--bg-secondary);
}

.col-color {
  width: 30px;
}

.color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.col-name {
  font-weight: 500;
  color: var(--text-primary);
}

.col-links {
  width: 60px;
  text-align: center;
}

.col-actions {
  width: 60px;
  text-align: right;
}

.edit-btn {
  background: var(--accent-color);
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 11px;
}

.empty-row {
  text-align: center;
  color: var(--text-tertiary);
  padding: 24px !important;
}
</style>

<style>
/* Modal - unscoped for Teleport */
.person-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.person-modal .modal-content {
  background: var(--bg-elevated, #1a1f2e);
  padding: 24px;
  border-radius: 12px;
  max-width: 600px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  border: 1px solid var(--border-color, #333);
}

.person-modal .modal-content h3 {
  margin: 0 0 20px 0;
  font-size: 18px;
  color: var(--text-primary, #f0f0f0);
}

.person-modal .form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 16px;
}

.person-modal .form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.person-modal .form-field.full-width {
  grid-column: 1 / -1;
}

.person-modal .form-field label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #aaa);
}

.person-modal .form-field input,
.person-modal .form-field textarea {
  background: var(--bg-primary, #0d0d0d);
  border: 1px solid var(--border-color, #333);
  color: var(--text-primary, #f0f0f0);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
}

.person-modal .form-field input:focus,
.person-modal .form-field textarea:focus {
  outline: none;
  border-color: var(--accent-color, #0f4c75);
}

.person-modal .form-field textarea {
  resize: vertical;
  min-height: 80px;
}

.person-modal .person-notes-editor {
  height: 120px;
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  overflow: hidden;
}

.person-modal .color-picker {
  margin: 16px 0;
}

.person-modal .color-picker label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary, #aaa);
}

.person-modal .color-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.person-modal .color-field input[type="color"] {
  width: 32px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
}

.person-modal .color-field .clear-btn {
  background: none;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 12px;
}

.person-modal .color-field .clear-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

.person-modal .inherit-hint {
  font-weight: normal;
  font-size: 10px;
  color: var(--text-tertiary);
}

.person-modal .modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
}

.person-modal .modal-actions button {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: var(--bg-tertiary, #2a2a2a);
  color: var(--text-primary, #f0f0f0);
  font-size: 13px;
}

.person-modal .modal-actions button:hover {
  background: var(--bg-hover, #333);
}

.person-modal .modal-actions button.primary {
  background: #2ecc71;
  color: white;
}

.person-modal .modal-actions button.primary:hover {
  background: #27ae60;
}

.person-modal .modal-actions button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.person-modal .modal-actions button.delete-btn {
  background: #e74c3c;
  color: white;
  margin-right: auto;
}

.person-modal .modal-actions button.delete-btn:hover {
  background: #c0392b;
}

/* Organization linking styles */
.person-modal .org-field {
  margin-bottom: 8px;
}

.person-modal .org-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
  min-height: 24px;
}

.person-modal .org-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-color, #0f4c75);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.person-modal .org-path {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.person-modal .org-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  line-height: 1;
}

.person-modal .org-remove:hover {
  color: white;
}

.person-modal .org-autocomplete {
  position: relative;
}

.person-modal .org-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-elevated, #1a1f2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  margin-top: 4px;
}

.person-modal .org-option {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #f0f0f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.person-modal .org-option:hover,
.person-modal .org-option.selected {
  background: var(--bg-tertiary, #2a2a2a);
}

.person-modal .org-option.linked {
  opacity: 0.6;
}

.person-modal .org-option .linked-badge {
  font-size: 10px;
  color: var(--text-tertiary, #666);
  padding: 2px 6px;
  background: var(--bg-secondary, #1a1a1a);
  border-radius: 3px;
}

.person-modal .org-option.create-option {
  color: var(--accent-color, #0f4c75);
  font-weight: 500;
  border-top: 1px solid var(--border-color, #333);
}
</style>
