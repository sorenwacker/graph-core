<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../services/api.js'
import { personColors } from '../utils/constants.js'
import { getInitials, getContrastColor } from '../utils/formatting.js'
import NotesEditor from './NotesEditor.vue'
import TagInput from './TagInput.vue'
import { useErrorHandler } from '../composables/useErrorHandler.js'

const { handleError } = useErrorHandler()

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
    handleError(err, { context: 'Loading organizations', silent: true })
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
    const allNodes = await api.getNodes({ type: 'person', workspace_id: props.workspaceId })
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
    handleError(err, { context: 'Loading persons', silent: true })
  }
  loading.value = false
}

function getRandomColor() {
  return personColors[Math.floor(Math.random() * personColors.length)]
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
    handleError(err, { context: 'Loading linked organizations', silent: true })
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
          handleError(err, { context: 'Linking organization to new person', silent: true })
        }
      }
    }

    editingPerson.value = null
    linkedOrganizations.value = []
    orgQuery.value = ''
    await loadPersons()
  } catch (err) {
    handleError(err, { context: 'Saving person' })
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
      handleError(err, { context: 'Linking organization' })
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
      handleError(err, { context: 'Unlinking organization' })
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
    handleError(err, { context: 'Creating organization' })
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

<style scoped src="./PersonsView.css"></style>
