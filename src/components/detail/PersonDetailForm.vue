<script setup>
import { ref, watch } from 'vue'
import { api } from '../../services/api'
import { useErrorHandler } from '../../composables/useErrorHandler.js'
import { getInitials } from '../../utils/formatting.js'
import { nodeTypes } from '../../utils/constants.js'
import NotesSection from './NotesSection.vue'
import MetaInfoSection from './MetaInfoSection.vue'
import ColorPickerSection from './ColorPickerSection.vue'
import LinkedItemsSection from './LinkedItemsSection.vue'
import TagsSection from './TagsSection.vue'

const props = defineProps({
  editedNode: { type: Object, required: true },
  linkedNodes: { type: Array, default: () => [] },
  activeTab: { type: String, default: 'edit' },
  currentWorkspace: { type: String, default: 'work' },
})

const emit = defineEmits([
  'update:editedNode',
  'update:activeTab',
  'save',
  'select-child',
  'open-link-search',
  'ai-improve-notes',
  'remove-link',
  'unlink-tag',
  'reload-links',
])

const { handleError } = useErrorHandler()

// Organization linking state
const linkedOrganizations = ref([])

// Notes section ref
const notesSectionRef = ref(null)
// Revealing a flagged note is per-node and resets when the panel shows another.
const showSensitiveNotes = ref(false)

// Collapsible section state
const notesCollapsed = ref(false)
const metadataCollapsed = ref(true)

// Get full organization path
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

// Load linked organizations for a person
async function loadLinkedOrganizations() {
  if (!props.editedNode?.id) {
    linkedOrganizations.value = []
    return
  }
  try {
    const allOrgs = []
    const seenIds = new Set()

    // Get organizations from links
    const linkedOrgs = props.linkedNodes.filter(n => n.type === 'organization')
    for (const org of linkedOrgs) {
      if (!seenIds.has(org.id)) {
        seenIds.add(org.id)
        allOrgs.push({ ...org, isParent: false })
      }
    }

    // Get parent organizations
    let currentNode = props.editedNode
    while (currentNode?.parent_id) {
      const parent = await api.getNode(currentNode.parent_id)
      if (parent?.type === 'organization' && !seenIds.has(parent.id)) {
        seenIds.add(parent.id)
        allOrgs.push({ ...parent, isParent: true })
      }
      currentNode = parent
    }

    // Filter to leaf organizations only
    const parentIds = new Set(allOrgs.map(org => org.parent_id).filter(Boolean))
    const leafOrgs = allOrgs.filter(org => !parentIds.has(org.id))

    // Add paths
    const orgsWithPaths = await Promise.all(
      leafOrgs.map(async org => ({
        ...org,
        path: await getOrgPath(org),
      }))
    )
    linkedOrganizations.value = orgsWithPaths
  } catch (err) {
    handleError(err, { context: 'Loading linked organizations', silent: true })
    linkedOrganizations.value = []
  }
}

function unlinkOrganization(org) {
  if (!props.editedNode?.id) return
  // Delegate to the parent, which unlinks and refreshes linkedNodes. Re-deriving
  // from props.linkedNodes locally would read the stale (pre-unlink) prop.
  emit('remove-link', org)
}

function updateField(field, value) {
  const updated = { ...props.editedNode, [field]: value }
  emit('update:editedNode', updated)
}

function saveChanges() {
  emit('save')
}

function onNotesUpdate(notes) {
  updateField('notes', notes)
}

function onTagsUpdate(tags) {
  updateField('tags', tags)
  saveChanges()
}

function onColorUpdate(color) {
  updateField('color', color)
  saveChanges()
}

function onShowLinksUpdate(value) {
  updateField('show_links', value)
  saveChanges()
}

function onTypeChange(event) {
  updateField('type', event.target.value)
  saveChanges()
}

// Watch for node changes to reload data
watch(
  () => props.editedNode?.id,
  async newId => {
    // A reveal must not carry over to the next node shown in the panel.
    showSensitiveNotes.value = false
    if (newId) {
      await loadLinkedOrganizations()
    }
  },
  { immediate: true }
)

// Watch for linkedNodes changes to update organizations
watch(
  () => props.linkedNodes,
  () => {
    loadLinkedOrganizations()
  },
  { deep: true }
)

function getNotesSelection() {
  return notesSectionRef.value?.getSelection() || { text: '', from: 0, to: 0 }
}

defineExpose({ loadLinkedOrganizations, getNotesSelection })
</script>

<template>
  <div class="person-form collapsible-sections">
    <!-- Notes Section -->
    <div class="notes-section" :class="{ collapsed: notesCollapsed }">
      <div class="section-header" @click="notesCollapsed = !notesCollapsed">
        <span class="section-title">Notes</span>
        <span class="collapse-indicator">{{ notesCollapsed ? '+' : '-' }}</span>
      </div>
      <div v-show="!notesCollapsed" class="section-content">
        <NotesSection
          ref="notesSectionRef"
          :notes="editedNode.notes || ''"
          :notes-sensitive="Boolean(editedNode.notes_sensitive)"
          :show-sensitive="showSensitiveNotes"
          :node-id="editedNode.id"
          :workspace-id="currentWorkspace"
          :active-tab="activeTab"
          css-class="person-notes"
          @update:notes="onNotesUpdate"
          @update:active-tab="$emit('update:activeTab', $event)"
          @blur="saveChanges"
          @ai-improve="$emit('ai-improve-notes', $event)"
          @mention-inserted="$emit('reload-links')"
        >
          <template #unlock-button>
            <button class="unlock-btn" @click="showSensitiveNotes = true" title="Show sensitive notes">Show</button>
          </template>
        </NotesSection>
      </div>
    </div>

    <!-- Metadata Section -->
    <div class="meta-section" :class="{ collapsed: metadataCollapsed }">
      <div class="section-header" @click="metadataCollapsed = !metadataCollapsed">
        <span class="section-title">Details</span>
        <span class="collapse-indicator">{{ metadataCollapsed ? '+' : '-' }}</span>
      </div>
      <div v-show="!metadataCollapsed" class="section-content">
        <!-- Person avatar and basic info -->
        <div class="person-header-row">
          <div class="person-avatar-large" :style="{ backgroundColor: editedNode.color || '#3498db' }">
            {{ getInitials(editedNode.title) }}
          </div>
          <div class="person-quick-info">
            <div v-if="editedNode.role" class="person-role-display">{{ editedNode.role }}</div>
            <div v-if="linkedOrganizations.length || editedNode.organization" class="person-orgs-display">
              {{
                linkedOrganizations.length
                  ? linkedOrganizations.map(o => o.path || o.title).join(', ')
                  : editedNode.organization
              }}
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
              @input="updateField('email', $event.target.value)"
              @blur="saveChanges"
              placeholder="email@example.com"
            />
          </div>

          <div class="form-field">
            <label>Phone</label>
            <input
              type="tel"
              :value="editedNode.phone || ''"
              @input="updateField('phone', $event.target.value)"
              @blur="saveChanges"
              placeholder="+1 234 567 890"
            />
          </div>

          <div v-if="linkedOrganizations.length > 0" class="form-field full-width">
            <label>Organizations</label>
            <div class="org-tags">
              <div v-for="org in linkedOrganizations" :key="org.id" class="org-tag">
                <span class="org-path">{{ org.path || org.title }}</span>
                <button class="org-remove" @click="unlinkOrganization(org)" title="Remove">&times;</button>
              </div>
            </div>
          </div>

          <div class="form-field">
            <label>Role / Title</label>
            <input
              type="text"
              :value="editedNode.role || ''"
              @input="updateField('role', $event.target.value)"
              @blur="saveChanges"
              placeholder="Job title"
            />
          </div>

          <div class="form-field">
            <label>Website</label>
            <input
              type="url"
              :value="editedNode.website || ''"
              @input="updateField('website', $event.target.value)"
              @blur="saveChanges"
              placeholder="https://..."
            />
          </div>
        </div>

        <!-- Color picker -->
        <ColorPickerSection :color="editedNode.color" default-color="#3498db" @update:color="onColorUpdate" />

        <!-- Type selector -->
        <div class="type-section">
          <label>Convert to</label>
          <select :value="editedNode.type" @change="onTypeChange">
            <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <!-- Links section -->
        <LinkedItemsSection
          :linked-nodes="linkedNodes"
          :show-links="editedNode.show_links ?? 1"
          exclude-type="organization"
          @update:show-links="onShowLinksUpdate"
          @select="$emit('select-child', $event)"
          @remove="$emit('remove-link', $event)"
          @add="$emit('open-link-search')"
        />

        <!-- Tags -->
        <TagsSection
          :node-id="editedNode.id"
          :workspace-id="editedNode.workspace_id"
          :linked-nodes="linkedNodes"
          @unlink="$emit('unlink-tag', $event)"
          @refresh="$emit('reload-links')"
        />

        <!-- System info -->
        <MetaInfoSection :id="editedNode.id" :created-at="editedNode.created_at" :updated-at="editedNode.updated_at" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-header {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 6px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  border-radius: 4px;
  margin: 0;
  min-height: 0;
  line-height: 1;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-decoration: none;
  border: none;
  line-height: 1;
  margin: 0;
  padding: 0;
}

.person-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

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

.meta-section {
  padding: 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
}

.meta-section.collapsed .section-content {
  display: none;
}

.meta-section .section-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.person-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
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
  color: var(--text-secondary);
}

.person-orgs-display {
  font-size: 12px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.person-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-field.full-width {
  grid-column: 1 / -1;
}

.form-field label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.form-field input {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.form-field input:focus {
  outline: none;
  border-color: var(--accent-color);
}

/* Organization tags */
.org-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.org-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-tertiary);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.org-remove {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
}

.org-remove:hover {
  color: var(--danger-color);
}

.notes-field {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  font-size: 14px;
}

.type-section {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  border-top: 1px solid var(--border-color);
}

.type-section label {
  font-size: 12px;
  color: var(--text-secondary);
}

.type-section select {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 13px;
}
</style>
