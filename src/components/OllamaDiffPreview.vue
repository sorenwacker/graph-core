<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  originalContent: { type: String, required: true },
  improvedContent: { type: String, required: true },
  promptUsed: { type: String, default: '' }
})

const emit = defineEmits(['accept', 'reject', 'edit'])

const editedContent = ref(props.improvedContent)
const isEditing = ref(false)

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('reject')
  }
}

function handleAccept() {
  emit('accept', editedContent.value)
}

function handleEdit() {
  isEditing.value = true
}

function handleSaveEdit() {
  isEditing.value = false
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('reject')">
    <div class="diff-modal">
      <div class="modal-header">
        <h3>AI Suggestion</h3>
        <span v-if="promptUsed" class="prompt-badge">{{ promptUsed }}</span>
        <button class="close-btn" @click="emit('reject')">&times;</button>
      </div>

      <div class="diff-container">
        <div class="diff-panel">
          <div class="panel-header">Original</div>
          <div class="panel-content">
            <pre>{{ originalContent }}</pre>
          </div>
        </div>

        <div class="diff-panel improved">
          <div class="panel-header">
            <span>Improved</span>
            <button v-if="!isEditing" class="edit-btn" @click="handleEdit">Edit</button>
            <button v-else class="edit-btn" @click="handleSaveEdit">Done</button>
          </div>
          <div class="panel-content">
            <textarea
              v-if="isEditing"
              v-model="editedContent"
              class="edit-textarea"
            ></textarea>
            <pre v-else>{{ editedContent }}</pre>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="reject-btn" @click="emit('reject')">
          Reject
        </button>
        <button class="accept-btn" @click="handleAccept">
          Accept
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.diff-modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 90%;
  max-width: 900px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.prompt-badge {
  font-size: 0.75rem;
  padding: 2px 8px;
  background: var(--accent-subtle);
  color: var(--accent-color);
  border-radius: 4px;
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.diff-container {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.diff-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  min-width: 0;
}

.diff-panel:last-child {
  border-right: none;
}

.diff-panel.improved {
  background: rgba(34, 197, 94, 0.02);
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-secondary);
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.edit-btn {
  padding: 2px 8px;
  font-size: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
}

.edit-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.panel-content {
  flex: 1;
  overflow: auto;
  padding: 12px;
}

.panel-content pre {
  margin: 0;
  font-family: inherit;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-primary);
  line-height: 1.5;
}

.edit-textarea {
  width: 100%;
  height: 100%;
  min-height: 200px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.85rem;
  line-height: 1.5;
  resize: none;
}

.edit-textarea:focus {
  outline: none;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.reject-btn,
.accept-btn {
  padding: 8px 20px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.reject-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.reject-btn:hover {
  background: var(--bg-hover);
  border-color: #ef4444;
  color: #ef4444;
}

.accept-btn {
  background: #22c55e;
  border: none;
  color: white;
}

.accept-btn:hover {
  background: #16a34a;
}
</style>
