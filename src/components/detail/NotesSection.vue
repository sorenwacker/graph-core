<script setup>
import { ref } from 'vue'
import NotesEditor from '../NotesEditor.vue'
import NotesAIToolbar from '../NotesAIToolbar.vue'
import MarkdownRenderer from '../MarkdownRenderer.vue'

defineProps({
  notes: { type: String, default: '' },
  nodeId: { type: [String, Number], required: true },
  activeTab: { type: String, default: 'edit' },
  showSensitive: { type: Boolean, default: false },
  notesSensitive: { type: Boolean, default: false },
  cssClass: { type: String, default: '' },
})

const emit = defineEmits(['update:notes', 'update:activeTab', 'blur', 'ai-improve'])

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
    <label>Notes</label>
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

  <NotesEditor
    v-if="activeTab === 'edit'"
    ref="notesEditorRef"
    :model-value="notes"
    @update:model-value="onNotesUpdate"
    @blur="onBlur"
    :class="['notes-codemirror', cssClass]"
  />

  <div v-else-if="activeTab === 'preview'" :class="['notes-preview', 'markdown-body', cssClass]">
    <div v-if="notesSensitive && !showSensitive" class="sensitive-hidden">
      <p>Sensitive notes hidden</p>
      <slot name="unlock-button" />
    </div>
    <MarkdownRenderer v-else-if="notes" :content="notes" />
    <p v-else class="placeholder">No notes yet</p>
  </div>

  <div v-else :class="['notes-split', cssClass]">
    <NotesEditor
      ref="notesEditorSplitRef"
      :model-value="notes"
      @update:model-value="onNotesUpdate"
      @blur="onBlur"
      class="notes-codemirror split-editor"
    />
    <div class="notes-preview markdown-body split-preview">
      <MarkdownRenderer v-if="notes" :content="notes" />
      <p v-else class="placeholder">No notes yet</p>
    </div>
  </div>
</template>
