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
])

const { handleError } = useErrorHandler()

// Members linking state
const linkedMembers = ref([])

// Notes section ref
const notesSectionRef = ref(null)

// Collapsible section state
const notesCollapsed = ref(false)
const metadataCollapsed = ref(true)

// Load members (persons linked to this organization)
async function loadLinkedMembers() {
  if (!props.editedNode?.id) {
    linkedMembers.value = []
    return
  }
  try {
    linkedMembers.value = props.linkedNodes.filter(n => n.type === 'person')
  } catch (err) {
    handleError(err, { context: 'Loading members', silent: true })
    linkedMembers.value = []
  }
}

async function unlinkMember(person) {
  if (!props.editedNode?.id) return
  try {
    await api.unlinkNodes(props.editedNode.id, person.id)
    await loadLinkedMembers()
  } catch (err) {
    handleError(err, { context: 'Unlinking member' })
  }
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
    if (newId) {
      await loadLinkedMembers()
    }
  },
  { immediate: true }
)

// Watch for linkedNodes changes to update members
watch(
  () => props.linkedNodes,
  () => {
    loadLinkedMembers()
  },
  { deep: true }
)

function getNotesSelection() {
  return notesSectionRef.value?.getSelection() || { text: '', from: 0, to: 0 }
}

defineExpose({ loadLinkedMembers, getNotesSelection })
</script>

<template>
  <div class="organization-form collapsible-sections">
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
          :node-id="editedNode.id"
          :active-tab="activeTab"
          css-class="org-notes"
          @update:notes="onNotesUpdate"
          @update:active-tab="$emit('update:activeTab', $event)"
          @blur="saveChanges"
          @ai-improve="$emit('ai-improve-notes', $event)"
        />
      </div>
    </div>

    <!-- Metadata Section -->
    <div class="meta-section" :class="{ collapsed: metadataCollapsed }">
      <div class="section-header" @click="metadataCollapsed = !metadataCollapsed">
        <span class="section-title">Details</span>
        <span class="collapse-indicator">{{ metadataCollapsed ? '+' : '-' }}</span>
      </div>
      <div v-show="!metadataCollapsed" class="section-content">
        <!-- Organization header -->
        <div class="org-header-row">
          <div class="org-icon-large" :style="{ backgroundColor: editedNode.color || '#e67e22' }">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path
                d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z"
              />
            </svg>
          </div>
          <div class="org-quick-info">
            <div v-if="linkedMembers.length" class="org-members-count">
              {{ linkedMembers.length }} member{{ linkedMembers.length !== 1 ? 's' : '' }}
            </div>
          </div>
        </div>

        <!-- Organization form fields -->
        <div class="org-form-grid">
          <div class="form-field">
            <label>Email</label>
            <input
              type="email"
              :value="editedNode.email || ''"
              @input="updateField('email', $event.target.value)"
              @blur="saveChanges"
              placeholder="contact@organization.com"
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

        <!-- Members section -->
        <div v-if="linkedMembers.length > 0" class="form-field full-width">
          <label>Members</label>
          <div class="member-tags">
            <div
              v-for="member in linkedMembers"
              :key="member.id"
              class="member-tag"
              :style="{ backgroundColor: member.color || '#3498db' }"
              @click="$emit('select-child', member.id)"
            >
              <span class="member-initials">{{ getInitials(member.title) }}</span>
              <span class="member-name">{{ member.title }}</span>
              <button class="member-remove" @click.stop="unlinkMember(member)" title="Remove">&times;</button>
            </div>
          </div>
        </div>

        <!-- Color picker -->
        <ColorPickerSection :color="editedNode.color" default-color="#e67e22" @update:color="onColorUpdate" />

        <!-- Type selector -->
        <div class="type-section">
          <label>Convert to</label>
          <select :value="editedNode.type" @change="onTypeChange">
            <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>

        <!-- Tags -->
        <TagsSection :tags="editedNode.tags || []" @update:tags="onTagsUpdate" />

        <!-- System info -->
        <MetaInfoSection :id="editedNode.id" :created-at="editedNode.created_at" :updated-at="editedNode.updated_at" />

        <!-- Links section -->
        <LinkedItemsSection
          :linked-nodes="linkedNodes"
          :show-links="editedNode.show_links ?? 1"
          exclude-type="person"
          @update:show-links="onShowLinksUpdate"
          @select="$emit('select-child', $event)"
          @remove="$emit('remove-link', $event)"
          @add="$emit('open-link-search')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.organization-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

/* Collapsible sections */
.section-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  user-select: none;
  background: var(--bg-secondary);
  border-radius: 6px;
  margin-bottom: 4px;
}

.section-header:hover {
  background: var(--bg-hover);
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.collapse-indicator {
  margin-left: auto;
  font-size: 14px;
  color: var(--text-tertiary);
  flex-shrink: 0;
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

.org-header-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.org-icon-large {
  width: 48px;
  height: 48px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.org-quick-info {
  flex: 1;
}

.org-members-count {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.org-form-grid {
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
  width: 100%;
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

/* Member tags */
.member-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.member-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px 4px 4px;
  border-radius: 16px;
  font-size: 12px;
  color: white;
  cursor: pointer;
}

.member-tag:hover {
  filter: brightness(1.1);
}

.member-initials {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
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
  padding: 0;
  font-size: 14px;
  line-height: 1;
}

.member-remove:hover {
  color: white;
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
