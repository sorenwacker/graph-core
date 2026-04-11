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

// Members linking state
const allPersons = ref([])
const linkedMembers = ref([])

// Use autocomplete composable for member search
const {
  query: memberQuery,
  showDropdown: showMemberDropdown,
  selectedIndex: selectedMemberIndex,
  filteredItems: filteredMembers,
  exactMatch: exactMemberMatch,
  handleKeydown: memberAutocompleteKeydown,
  handleInput: handleMemberInput,
  reset: resetMemberAutocomplete,
} = useAutocomplete({ items: allPersons })

// Notes section ref
const notesSectionRef = ref(null)

// Load all persons for member autocomplete
async function loadAllPersons() {
  try {
    allPersons.value = await api.getNodes({ type: 'person', workspace_id: props.currentWorkspace })
  } catch (err) {
    handleError(err, { context: 'Loading persons', silent: true })
    allPersons.value = []
  }
}

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

async function linkMember(person) {
  if (!props.editedNode?.id) return
  try {
    await api.linkNodes(props.editedNode.id, person.id)
    await loadLinkedMembers()
  } catch (err) {
    handleError(err, { context: 'Linking member' })
  }
  resetMemberAutocomplete()
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

async function createAndLinkMember() {
  if (!memberQuery.value.trim() || !props.editedNode?.id) return
  try {
    const newPerson = await api.createNode({
      title: memberQuery.value.trim(),
      type: 'person',
      workspace_id: props.currentWorkspace,
    })
    allPersons.value.push(newPerson)
    await linkMember(newPerson)
  } catch (err) {
    handleError(err, { context: 'Creating member' })
  }
}

function handleMemberKeydown(e) {
  memberAutocompleteKeydown(e, {
    onSelect: linkMember,
    onCreate: () => createAndLinkMember(),
    linkedItems: linkedMembers.value,
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
      resetMemberAutocomplete()
      await loadAllPersons()
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
  <div class="organization-form">
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

    <!-- Members section -->
    <div class="form-field full-width">
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
      <div class="member-autocomplete">
        <input
          v-model="memberQuery"
          placeholder="Search or create person..."
          @input="handleMemberInput"
          @keydown="handleMemberKeydown"
          @focus="showMemberDropdown = true"
          @blur="setTimeout(() => (showMemberDropdown = false), 200)"
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

    <!-- Notes section -->
    <div class="form-field full-width notes-field">
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

    <!-- Color picker -->
    <ColorPickerSection :color="editedNode.color" default-color="#e67e22" @update:color="onColorUpdate" />

    <!-- Tags -->
    <TagsSection :tags="editedNode.tags || []" @update:tags="onTagsUpdate" />

    <!-- System info -->
    <MetaInfoSection :id="editedNode.id" :created-at="editedNode.created_at" :updated-at="editedNode.updated_at" />

    <!-- Links section - at bottom like metadata -->
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
</template>

<style scoped>
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

/* Give notes more space */
.notes-field {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

/* Member tags */
.member-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
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

/* Member autocomplete */
.member-autocomplete {
  position: relative;
}

.member-autocomplete input {
  width: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 13px;
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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-top: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.member-option {
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
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

.member-option.create-option {
  color: var(--accent-color);
  border-top: 1px solid var(--border-color);
}

.member-option-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  color: white;
}

.linked-badge {
  margin-left: auto;
  font-size: 10px;
  background: var(--bg-tertiary);
  padding: 2px 6px;
  border-radius: 8px;
  color: var(--text-tertiary);
}
</style>
