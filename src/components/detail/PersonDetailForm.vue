<script setup>
import { ref, watch } from 'vue'
import { api } from '../../services/api'
import { useErrorHandler } from '../../composables/useErrorHandler.js'
import { useAutocomplete } from '../../composables/useAutocomplete.js'
import { getInitials } from '../../utils/formatting.js'
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
])

const { handleError } = useErrorHandler()

// Organization linking state
const organizations = ref([])
const linkedOrganizations = ref([])

// Use autocomplete composable for organization search
const {
  query: orgQuery,
  showDropdown: showOrgDropdown,
  selectedIndex: selectedOrgIndex,
  filteredItems: filteredOrganizations,
  exactMatch: exactOrgMatch,
  handleKeydown: orgAutocompleteKeydown,
  handleInput: handleOrgInput,
  reset: resetOrgAutocomplete,
} = useAutocomplete({ items: organizations })

// Notes section ref
const notesSectionRef = ref(null)

// Load organizations from current workspace
async function loadOrganizations() {
  try {
    organizations.value = await api.getNodes({ type: 'organization', workspace_id: props.currentWorkspace })
  } catch (err) {
    handleError(err, { context: 'Loading organizations', silent: true })
    organizations.value = []
  }
}

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

async function linkOrganization(org) {
  if (!props.editedNode?.id) return
  try {
    await api.linkNodes(props.editedNode.id, org.id)
    await loadLinkedOrganizations()
  } catch (err) {
    handleError(err, { context: 'Linking organization' })
  }
  resetOrgAutocomplete()
}

async function unlinkOrganization(org) {
  if (!props.editedNode?.id) return
  try {
    await api.unlinkNodes(props.editedNode.id, org.id)
    await loadLinkedOrganizations()
  } catch (err) {
    handleError(err, { context: 'Unlinking organization' })
  }
}

async function createAndLinkOrganization() {
  if (!orgQuery.value.trim() || !props.editedNode?.id) return
  try {
    const newOrg = await api.createNode({
      title: orgQuery.value.trim(),
      type: 'organization',
      workspace_id: props.currentWorkspace,
    })
    organizations.value.push(newOrg)
    await linkOrganization(newOrg)
  } catch (err) {
    handleError(err, { context: 'Creating organization' })
  }
}

function handleOrgKeydown(e) {
  orgAutocompleteKeydown(e, {
    onSelect: linkOrganization,
    onCreate: () => createAndLinkOrganization(),
    linkedItems: linkedOrganizations.value,
  })
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

// Watch for node changes to reload data
watch(
  () => props.editedNode?.id,
  async newId => {
    if (newId) {
      resetOrgAutocomplete()
      await loadOrganizations()
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
  <div class="person-form">
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
        <div class="org-autocomplete">
          <input
            v-model="orgQuery"
            placeholder="Search or create organization..."
            @input="handleOrgInput"
            @keydown="handleOrgKeydown"
            @focus="showOrgDropdown = true"
            @blur="setTimeout(() => (showOrgDropdown = false), 200)"
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

      <!-- Notes section -->
      <div class="form-field full-width notes-field">
        <NotesSection
          ref="notesSectionRef"
          :notes="editedNode.notes || ''"
          :node-id="editedNode.id"
          :active-tab="activeTab"
          css-class="person-notes"
          @update:notes="onNotesUpdate"
          @update:active-tab="$emit('update:activeTab', $event)"
          @blur="saveChanges"
          @ai-improve="$emit('ai-improve-notes', $event)"
        />
      </div>
    </div>

    <!-- Color picker -->
    <ColorPickerSection :color="editedNode.color" default-color="#3498db" @update:color="onColorUpdate" />

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
    <TagsSection :tags="editedNode.tags || []" @update:tags="onTagsUpdate" />

    <!-- System info -->
    <MetaInfoSection :id="editedNode.id" :created-at="editedNode.created_at" :updated-at="editedNode.updated_at" />
  </div>
</template>

<style scoped>
.person-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  flex: 1;
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
  background: var(--bg-secondary);
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

/* Organization autocomplete */
.org-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
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

.org-autocomplete {
  position: relative;
}

.org-autocomplete input {
  width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
}

.org-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.org-option {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.org-option:hover,
.org-option.selected {
  background: var(--bg-hover);
}

.org-option.linked {
  opacity: 0.6;
}

.org-option.create-option {
  color: var(--accent-color);
  border-top: 1px solid var(--border-color);
}

.linked-badge {
  font-size: 10px;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--text-tertiary);
}

.notes-field {
  flex: 1;
  min-height: 150px;
  display: flex;
  flex-direction: column;
}
</style>
