<script setup>
import { ref, watch, nextTick } from 'vue'
import MarkdownRenderer from './MarkdownRenderer.vue'
import { nodeTypes } from '../utils/constants.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  node: { type: Object, default: null },
  editedNode: { type: Object, default: () => ({}) },
})

const emit = defineEmits(['close', 'save', 'go-to-parent', 'wrap-with-parent', 'update:editedNode'])

const showNotesPreview = ref(false)
const editTitleInput = ref(null)
const editModalEl = ref(null)

watch(
  () => props.visible,
  v => {
    if (v) {
      showNotesPreview.value = false
      nextTick(() => editTitleInput.value?.focus())
    }
  }
)

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    emit('save')
  }
}

function updateField(field, value) {
  emit('update:editedNode', { ...props.editedNode, [field]: value })
}

defineExpose({ editTitleInput, editModalEl })
</script>

<template>
  <div v-if="visible" class="edit-modal-overlay" @click.self="emit('close')">
    <div ref="editModalEl" class="edit-modal" @keydown="handleKeydown">
      <div class="edit-modal-header">
        <h2>Edit Node</h2>
        <button class="modal-close" @click="emit('close')">X</button>
      </div>
      <div class="edit-modal-content">
        <div class="edit-field">
          <label>Title</label>
          <input
            ref="editTitleInput"
            :value="editedNode.title"
            @input="updateField('title', $event.target.value)"
            class="edit-input"
            placeholder="Title"
          />
        </div>
        <div class="edit-field">
          <label>Type</label>
          <select :value="editedNode.type" @change="updateField('type', $event.target.value)" class="edit-select">
            <option v-for="t in nodeTypes" :key="t" :value="t">{{ t }}</option>
          </select>
        </div>
        <div v-if="editedNode.type !== 'person'" class="edit-field checkbox-field">
          <label>
            <input
              type="checkbox"
              :checked="editedNode.completed"
              @change="updateField('completed', $event.target.checked)"
            />
            Completed
          </label>
        </div>
        <div class="edit-field notes-field">
          <div class="notes-header">
            <label>Notes</label>
            <button
              class="preview-toggle"
              :class="{ active: showNotesPreview }"
              @click="showNotesPreview = !showNotesPreview"
            >
              {{ showNotesPreview ? 'Edit' : 'Preview' }}
            </button>
          </div>
          <textarea
            v-if="!showNotesPreview"
            :value="editedNode.notes"
            @input="updateField('notes', $event.target.value)"
            class="edit-textarea"
            placeholder="Add notes..."
            rows="6"
          ></textarea>
          <div v-else class="notes-preview">
            <MarkdownRenderer :content="editedNode.notes" />
          </div>
        </div>
        <div class="edit-field checkbox-field">
          <label>
            <input
              type="checkbox"
              :checked="editedNode.notes_sensitive"
              @change="updateField('notes_sensitive', $event.target.checked)"
            />
            Sensitive content
          </label>
          <span class="field-hint">Hide notes in sensitive mode</span>
        </div>
        <div class="edit-field-row">
          <div class="edit-field">
            <label>Due Date</label>
            <input
              type="date"
              :value="editedNode.due_date"
              @input="updateField('due_date', $event.target.value)"
              class="edit-input"
            />
          </div>
          <div class="edit-field">
            <label>Start Date</label>
            <input
              type="date"
              :value="editedNode.start_date"
              @input="updateField('start_date', $event.target.value)"
              class="edit-input"
            />
          </div>
          <div class="edit-field">
            <label>End Date</label>
            <input
              type="date"
              :value="editedNode.end_date"
              @input="updateField('end_date', $event.target.value)"
              class="edit-input"
            />
          </div>
        </div>
        <div class="edit-field-row">
          <div class="edit-field">
            <label>Color</label>
            <input
              type="color"
              :value="editedNode.color"
              @input="updateField('color', $event.target.value)"
              class="edit-color"
            />
          </div>
          <div class="edit-field">
            <label>Importance (1-5)</label>
            <input
              type="number"
              :value="editedNode.importance"
              @input="updateField('importance', Number($event.target.value))"
              min="1"
              max="5"
              class="edit-input importance-input"
            />
          </div>
        </div>
        <div class="edit-meta">
          <span>ID: {{ node?.id }}</span>
          <span>Depth: {{ node?.depth }}</span>
          <span>Path: {{ node?.path || '-' }}</span>
        </div>
      </div>
      <div class="edit-modal-footer">
        <div class="footer-left">
          <button class="btn-secondary" @click="emit('wrap-with-parent')">Wrap with Parent</button>
          <button class="btn-secondary" @click="emit('go-to-parent')">Go to Parent</button>
        </div>
        <div class="footer-right">
          <button class="btn-secondary" @click="emit('close')">Cancel</button>
          <button class="btn-primary" @click="emit('save')">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.edit-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edit-modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.edit-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
}

.edit-modal-header h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  font-size: 18px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px 8px;
}

.modal-close:hover {
  color: var(--text-primary);
}

.edit-modal-content {
  padding: 20px;
  overflow-y: auto;
  flex: 1;
}

.edit-field {
  margin-bottom: 16px;
}

.edit-field label {
  display: block;
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.edit-input,
.edit-select,
.edit-textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.edit-input:focus,
.edit-select:focus,
.edit-textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.edit-textarea {
  resize: vertical;
  font-family: inherit;
}

.edit-color {
  width: 60px;
  height: 32px;
  padding: 2px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  cursor: pointer;
}

.importance-input {
  width: 80px;
}

.checkbox-field label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.checkbox-field input[type='checkbox'] {
  margin: 0;
}

.field-hint {
  display: block;
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: 4px;
  margin-left: 24px;
}

.notes-field .notes-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.notes-field .notes-header label {
  margin-bottom: 0;
}

.preview-toggle {
  padding: 4px 8px;
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
}

.preview-toggle:hover,
.preview-toggle.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.notes-preview {
  padding: 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-secondary);
  min-height: 120px;
  font-size: 14px;
  color: var(--text-primary);
}

.edit-field-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.edit-field-row .edit-field {
  flex: 1;
  margin-bottom: 0;
}

.edit-meta {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.edit-modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-top: 1px solid var(--border-secondary);
}

.footer-left,
.footer-right {
  display: flex;
  gap: 8px;
}

.btn-secondary,
.btn-primary {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.btn-secondary {
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  color: var(--text-primary);
}

.btn-secondary:hover {
  background: var(--bg-hover);
}

.btn-primary {
  background: var(--accent-color);
  border: none;
  color: white;
}

.btn-primary:hover {
  background: var(--accent-hover);
}
</style>
