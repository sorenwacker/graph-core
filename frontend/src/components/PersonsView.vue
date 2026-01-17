<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../services/api.js'

const props = defineProps({
  selectedId: Number,
  hideCompleted: { type: Boolean, default: false }
})

const emit = defineEmits(['select', 'update', 'delete'])

const persons = ref([])
const personLinks = ref({})
const loading = ref(true)
const editingPerson = ref(null)
const viewMode = ref('cards') // 'cards' or 'table'
const sortBy = ref('title')
const sortDir = ref('asc')
const hideSensitive = ref(true) // Hide email, phone, notes by default

function maskEmail(email) {
  if (!email || !hideSensitive.value) return email
  const [user, domain] = email.split('@')
  if (!domain) return '***'
  return user.charAt(0) + '***@' + domain
}

function maskPhone(phone) {
  if (!phone || !hideSensitive.value) return phone
  return phone.slice(0, 4) + '****' + phone.slice(-2)
}

// Color palette
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

onMounted(async () => {
  await loadPersons()
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
}

function editPerson(person) {
  editingPerson.value = { ...person }
}

async function savePerson() {
  if (!editingPerson.value?.title?.trim()) return

  try {
    const data = {
      title: editingPerson.value.title,
      type: 'person',
      email: editingPerson.value.email || '',
      phone: editingPerson.value.phone || '',
      organization: editingPerson.value.organization || '',
      role: editingPerson.value.role || '',
      website: editingPerson.value.website || '',
      notes: editingPerson.value.notes || '',
      color: editingPerson.value.color || '#0f4c75'
    }

    if (editingPerson.value.id) {
      await api.updateNode(editingPerson.value.id, data)
    } else {
      await api.createNode(data)
    }

    editingPerson.value = null
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
        :style="{ borderLeftColor: person.color || '#0f4c75' }"
        @click="editPerson(person)"
      >
        <div class="card-header">
          <div class="person-avatar" :style="{ background: person.color || '#0f4c75' }">
            {{ getInitials(person.title) }}
          </div>
          <div class="person-info">
            <div class="person-name">{{ person.title }}</div>
            <div v-if="person.role" class="person-role">{{ person.role }}</div>
          </div>
        </div>
        <div v-if="person.organization" class="person-company">{{ person.organization }}</div>
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
          <tr v-for="person in sortedPersons" :key="person.id" @click="selectPerson(person)">
            <td class="col-color">
              <div class="color-dot" :style="{ background: person.color || '#0f4c75' }"></div>
            </td>
            <td class="col-name">{{ person.title }}</td>
            <td class="col-role">{{ person.role || '-' }}</td>
            <td class="col-email">{{ person.email ? maskEmail(person.email) : '-' }}</td>
            <td class="col-company">{{ person.organization || '-' }}</td>
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

            <div class="form-field">
              <label>Organization</label>
              <input v-model="editingPerson.organization" placeholder="Company name" />
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
              <textarea v-model="editingPerson.notes" placeholder="Add notes..." rows="4"></textarea>
            </div>
          </div>

          <div class="color-picker">
            <label>Color</label>
            <div class="color-grid">
              <div
                v-for="color in personColors"
                :key="color"
                class="color-option"
                :class="{ selected: editingPerson.color === color }"
                :style="{ background: color }"
                @click="editingPerson.color = color"
              ></div>
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

.person-modal .color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.person-modal .color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s;
}

.person-modal .color-option:hover {
  transform: scale(1.1);
}

.person-modal .color-option.selected {
  border-color: white;
  transform: scale(1.15);
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
</style>
