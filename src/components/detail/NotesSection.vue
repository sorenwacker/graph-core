<script setup>
import { ref, computed } from 'vue'
import NotesEditor from '../NotesEditor.vue'
import NotesAIToolbar from '../NotesAIToolbar.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'
import { useSensitiveNotes } from '../../composables/useSensitiveNotes.js'

const props = defineProps({
  notes: { type: String, default: '' },
  nodeId: { type: [String, Number], required: true },
  // Workspace used to scope @mention person auto-linking
  workspaceId: { type: String, default: 'work' },
  activeTab: { type: String, default: 'edit' },
  showSensitive: { type: Boolean, default: false },
  notesSensitive: { type: Boolean, default: false },
  cssClass: { type: String, default: '' },
})

const emit = defineEmits(['update:notes', 'update:activeTab', 'blur', 'ai-improve', 'mention-inserted'])

const { isLockedNote } = useSensitiveNotes()

/** The note is still ciphertext because the sensitive session is locked. */
const locked = computed(() => isLockedNote(props.notes))

/** Withhold the note from every tab: locked ciphertext, or flagged and not revealed. */
const hidden = computed(() => locked.value || (props.notesSensitive && !props.showSensitive))

const notesEditorRef = ref(null)
const notesEditorSplitRef = ref(null)

function onNotesUpdate(newValue) {
  emit('update:notes', newValue)
}

function onTabChange(tab) {
  emit('update:activeTab', tab)
}

function onBlur() {
  emit('blur')
}

function onAIImprove(payload) {
  emit('ai-improve', payload)
}

function getSelection() {
  const editor = notesEditorRef.value || notesEditorSplitRef.value
  if (editor && typeof editor.getSelection === 'function') {
    return editor.getSelection()
  }
  return { text: '', from: 0, to: 0 }
}

defineExpose({ getSelection, notesEditorRef, notesEditorSplitRef })
</script>

<template>
  <div class="notes-header">
    <div class="notes-header-actions">
      <NotesAIToolbar :notes="notes" :node-id="nodeId" :get-selection="getSelection" @apply-improvement="onAIImprove" />
      <div class="tab-buttons">
        <button :class="{ active: activeTab === 'edit' }" @click="onTabChange('edit')" title="Edit notes">Edit</button>
        <button :class="{ active: activeTab === 'preview' }" @click="onTabChange('preview')" title="Preview markdown">
          Preview
        </button>
        <button :class="{ active: activeTab === 'split' }" @click="onTabChange('split')" title="Side-by-side view">
          Split
        </button>
      </div>
    </div>
  </div>

  <!-- Masking wraps every tab, not just the preview. An edit or split tab that
       rendered the note would show the content the preview hides, and while the
       note is locked ciphertext any edit is rejected by the main process and
       silently lost. -->
  <div v-if="hidden" :class="['sensitive-hidden', cssClass]">
    <p>{{ locked ? 'Sensitive notes are locked' : 'Sensitive notes hidden' }}</p>
    <slot name="unlock-button" />
  </div>

  <NotesEditor
    v-else-if="activeTab === 'edit'"
    ref="notesEditorRef"
    :model-value="notes"
    :workspace-id="workspaceId"
    :node-id="typeof nodeId === 'number' ? nodeId : null"
    @update:model-value="onNotesUpdate"
    @blur="onBlur"
    @mention-inserted="emit('mention-inserted', $event)"
    :class="['notes-codemirror', cssClass]"
  />

  <div v-else-if="activeTab === 'preview'" :class="['notes-preview', 'markdown-body', cssClass]">
    <MarkdownRenderer v-if="notes" :content="notes" />
    <p v-else class="placeholder">No notes yet</p>
  </div>

  <div v-else :class="['notes-split', cssClass]">
    <NotesEditor
      ref="notesEditorSplitRef"
      :model-value="notes"
      :workspace-id="workspaceId"
      :node-id="typeof nodeId === 'number' ? nodeId : null"
      @update:model-value="onNotesUpdate"
      @blur="onBlur"
      @mention-inserted="emit('mention-inserted', $event)"
      class="notes-codemirror split-editor"
    />
    <div class="notes-preview markdown-body split-preview">
      <MarkdownRenderer v-if="notes" :content="notes" />
      <p v-else class="placeholder">No notes yet</p>
    </div>
  </div>
</template>

<style scoped>
/*
 * NotesSection is rendered inside detail forms (person/organization) whose
 * styling cannot reach these elements (parent scoped CSS does not penetrate a
 * child component). The split/editor/preview layout therefore lives here so the
 * component renders correctly regardless of where it is used.
 */
.notes-header {
  margin-bottom: 4px;
}

.notes-header-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tab-buttons {
  display: flex;
  gap: 4px;
}

.tab-buttons button {
  padding: 4px 10px;
  border: none;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
}

.tab-buttons button.active {
  background: var(--accent-color);
  color: white;
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

/* Split view: editor and preview side by side, each filling half the height. */
.notes-split {
  display: flex;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.notes-split .split-editor,
.notes-split .split-preview {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
}
</style>
