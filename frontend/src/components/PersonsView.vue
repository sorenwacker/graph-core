<script setup>
import { ref, computed, onMounted } from 'vue'
import { api } from '../services/api.js'

const props = defineProps({
  selectedId: Number
})

const emit = defineEmits(['select', 'update'])

const persons = ref([])
const personLinks = ref({}) // personId -> [linked nodes]
const loading = ref(true)
const newPersonName = ref('')
const expandedPersons = ref(new Set())
const editingPerson = ref(null)

onMounted(async () => {
  await loadPersons()
})

async function loadPersons() {
  loading.value = true
  try {
    // Get all person nodes
    const allNodes = await api.getRoots()
    persons.value = allNodes.filter(n => n.type === 'person')

    // Load links for each person
    for (const person of persons.value) {
      const links = await api.getLinkedNodes(person.id)
      personLinks.value[person.id] = links
    }
  } catch (err) {
    console.error('Failed to load persons:', err)
  }
  loading.value = false
}

async function addPerson() {
  if (!newPersonName.value.trim()) return

  try {
    await api.createNode({
      title: newPersonName.value.trim(),
      type: 'person'
    })
    newPersonName.value = ''
    await loadPersons()
  } catch (err) {
    console.error('Failed to create person:', err)
  }
}

async function deletePerson(person) {
  if (!confirm(`Delete "${person.title}"?`)) return

  try {
    await api.deleteNode(person.id)
    await loadPersons()
  } catch (err) {
    console.error('Failed to delete person:', err)
  }
}

function toggleExpand(personId) {
  if (expandedPersons.value.has(personId)) {
    expandedPersons.value.delete(personId)
  } else {
    expandedPersons.value.add(personId)
  }
}

function selectPerson(person) {
  emit('select', person)
}

function startEdit(person) {
  editingPerson.value = { ...person }
}

async function saveEdit() {
  if (!editingPerson.value) return

  try {
    await api.updateNode(editingPerson.value.id, {
      title: editingPerson.value.title,
      email: editingPerson.value.email,
      phone: editingPerson.value.phone,
      organization: editingPerson.value.organization,
      role: editingPerson.value.role,
      address: editingPerson.value.address,
      website: editingPerson.value.website,
      notes: editingPerson.value.notes
    })
    editingPerson.value = null
    await loadPersons()
  } catch (err) {
    console.error('Failed to update person:', err)
  }
}

function cancelEdit() {
  editingPerson.value = null
}

function getLinksForPerson(personId) {
  return personLinks.value[personId] || []
}
</script>

<template>
  <div class="persons-view">
    <div class="persons-header">
      <h3>Persons Register</h3>
      <div class="add-person">
        <input
          v-model="newPersonName"
          placeholder="Add person..."
          @keyup.enter="addPerson"
        />
        <button @click="addPerson">+</button>
      </div>
    </div>

    <div v-if="loading" class="loading">Loading...</div>

    <div v-else-if="persons.length === 0" class="empty">
      No persons yet. Add one above.
    </div>

    <div v-else class="persons-list">
      <div
        v-for="person in persons"
        :key="person.id"
        class="person-item"
        :class="{ selected: selectedId === person.id }"
      >
        <div class="person-header" @click="selectPerson(person)">
          <button
            class="expand-btn"
            @click.stop="toggleExpand(person.id)"
          >
            {{ expandedPersons.has(person.id) ? '-' : '+' }}
          </button>
          <span class="person-icon">U</span>
          <div class="person-info">
            <span class="person-name">{{ person.title }}</span>
            <span v-if="person.organization || person.role" class="person-subtitle">
              {{ person.role }}{{ person.role && person.organization ? ' @ ' : '' }}{{ person.organization }}
            </span>
          </div>
          <span class="link-count">({{ getLinksForPerson(person.id).length }})</span>
          <button class="edit-btn" @click.stop="startEdit(person)" title="Edit">e</button>
          <button class="delete-btn" @click.stop="deletePerson(person)" title="Delete">x</button>
        </div>

        <div v-if="expandedPersons.has(person.id)" class="person-details">
          <!-- Contact Info -->
          <div class="detail-section">
            <div v-if="person.email" class="detail-row">
              <span class="detail-label">Email</span>
              <a :href="'mailto:' + person.email" class="detail-value link">{{ person.email }}</a>
            </div>
            <div v-if="person.phone" class="detail-row">
              <span class="detail-label">Phone</span>
              <a :href="'tel:' + person.phone" class="detail-value link">{{ person.phone }}</a>
            </div>
            <div v-if="person.organization" class="detail-row">
              <span class="detail-label">Organization</span>
              <span class="detail-value">{{ person.organization }}</span>
            </div>
            <div v-if="person.role" class="detail-row">
              <span class="detail-label">Role</span>
              <span class="detail-value">{{ person.role }}</span>
            </div>
            <div v-if="person.address" class="detail-row">
              <span class="detail-label">Address</span>
              <span class="detail-value">{{ person.address }}</span>
            </div>
            <div v-if="person.website" class="detail-row">
              <span class="detail-label">Website</span>
              <a :href="person.website" target="_blank" class="detail-value link">{{ person.website }}</a>
            </div>
            <div v-if="person.notes" class="detail-row notes-row">
              <span class="detail-label">Notes</span>
              <span class="detail-value notes">{{ person.notes }}</span>
            </div>
            <div v-if="!person.email && !person.phone && !person.organization && !person.role && !person.address && !person.website && !person.notes" class="no-details">
              No contact details. Click edit to add.
            </div>
          </div>

          <!-- Linked Nodes -->
          <div class="links-section">
            <div class="section-title">Linked to ({{ getLinksForPerson(person.id).length }})</div>
            <div v-if="getLinksForPerson(person.id).length === 0" class="no-links">
              Not linked to any nodes
            </div>
            <div
              v-for="link in getLinksForPerson(person.id)"
              :key="link.id"
              class="link-item"
            >
              <span class="link-type" :class="link.type">{{ link.type[0].toUpperCase() }}</span>
              <span class="link-title">{{ link.title }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editingPerson" class="edit-modal-overlay" @click.self="cancelEdit">
      <div class="edit-modal">
        <div class="edit-modal-header">
          <h3>Edit Person</h3>
          <button class="close-btn" @click="cancelEdit">x</button>
        </div>
        <div class="edit-modal-body">
          <div class="edit-field">
            <label>Name</label>
            <input v-model="editingPerson.title" />
          </div>
          <div class="edit-field">
            <label>Email</label>
            <input v-model="editingPerson.email" type="email" placeholder="email@example.com" />
          </div>
          <div class="edit-field">
            <label>Phone</label>
            <input v-model="editingPerson.phone" type="tel" placeholder="+1 234 567 8900" />
          </div>
          <div class="edit-field">
            <label>Organization</label>
            <input v-model="editingPerson.organization" placeholder="Company name" />
          </div>
          <div class="edit-field">
            <label>Role / Title</label>
            <input v-model="editingPerson.role" placeholder="Job title" />
          </div>
          <div class="edit-field">
            <label>Address</label>
            <input v-model="editingPerson.address" placeholder="Address" />
          </div>
          <div class="edit-field">
            <label>Website</label>
            <input v-model="editingPerson.website" type="url" placeholder="https://..." />
          </div>
          <div class="edit-field">
            <label>Notes</label>
            <textarea v-model="editingPerson.notes" rows="3" placeholder="Additional notes..."></textarea>
          </div>
        </div>
        <div class="edit-modal-footer">
          <button class="cancel-btn" @click="cancelEdit">Cancel</button>
          <button class="save-btn" @click="saveEdit">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.persons-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
}

.persons-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.persons-header h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.add-person {
  display: flex;
  gap: 8px;
}

.add-person input {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-primary);
}

.add-person button {
  padding: 8px 12px;
  background: var(--accent-color);
  border: none;
  border-radius: 4px;
  color: white;
  cursor: pointer;
}

.loading, .empty {
  padding: 24px;
  text-align: center;
  color: var(--text-tertiary);
}

.persons-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.person-item {
  margin-bottom: 8px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.person-item.selected .person-header {
  background: var(--accent-color);
}

.person-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: var(--bg-secondary);
  cursor: pointer;
  transition: background 0.15s;
}

.person-header:hover {
  background: var(--bg-tertiary);
}

.expand-btn {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
}

.person-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 50%;
  font-size: 14px;
  font-weight: 600;
}

.person-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.person-name {
  font-weight: 600;
  font-size: 15px;
}

.person-subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
}

.link-count {
  font-size: 12px;
  color: var(--text-tertiary);
}

.edit-btn, .delete-btn {
  opacity: 0;
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: opacity 0.15s;
}

.edit-btn {
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.3);
  color: #60a5fa;
}

.delete-btn {
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
}

.person-header:hover .edit-btn,
.person-header:hover .delete-btn {
  opacity: 1;
}

.person-details {
  padding: 16px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-color);
}

.detail-section {
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.detail-label {
  width: 100px;
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
}

.detail-value {
  flex: 1;
  font-size: 14px;
  color: var(--text-primary);
}

.detail-value.link {
  color: var(--accent-color);
  text-decoration: none;
}

.detail-value.link:hover {
  text-decoration: underline;
}

.detail-value.notes {
  white-space: pre-wrap;
  color: var(--text-secondary);
}

.notes-row {
  flex-direction: column;
  gap: 4px;
}

.notes-row .detail-label {
  width: auto;
}

.no-details {
  font-size: 13px;
  color: var(--text-tertiary);
  font-style: italic;
  padding: 8px 0;
}

.links-section {
  border-top: 1px solid var(--border-color);
  padding-top: 12px;
}

.section-title {
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  margin-bottom: 8px;
}

.no-links {
  font-size: 12px;
  color: var(--text-tertiary);
  font-style: italic;
}

.link-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.link-type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
}

.link-type.project { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.link-type.task { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
.link-type.note { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
.link-type.milestone { background: rgba(168, 85, 247, 0.15); color: #c084fc; }
.link-type.topic { background: rgba(6, 182, 212, 0.15); color: #22d3ee; }

.link-title {
  color: var(--text-secondary);
}

/* Edit Modal */
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edit-modal {
  background: var(--bg-elevated);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  width: 400px;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.edit-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
}

.edit-modal-header h3 {
  margin: 0;
  font-size: 16px;
}

.close-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  cursor: pointer;
}

.edit-modal-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.edit-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.edit-field label {
  font-size: 12px;
  color: var(--text-secondary);
}

.edit-field input,
.edit-field textarea {
  padding: 10px 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 14px;
}

.edit-field input:focus,
.edit-field textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.edit-field textarea {
  resize: vertical;
  min-height: 60px;
}

.edit-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px;
  border-top: 1px solid var(--border-color);
}

.cancel-btn {
  padding: 10px 16px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
}

.save-btn {
  padding: 10px 20px;
  background: var(--accent-color);
  border: none;
  border-radius: 6px;
  color: white;
  font-weight: 500;
  cursor: pointer;
}

.save-btn:hover {
  opacity: 0.9;
}
</style>
