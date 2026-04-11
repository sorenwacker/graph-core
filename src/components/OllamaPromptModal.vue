<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  isLoading: { type: Boolean, default: false },
})

const emit = defineEmits(['submit', 'close'])

const customPrompt = ref('')
const inputRef = ref(null)

function handleSubmit() {
  if (customPrompt.value.trim() && !props.isLoading) {
    emit('submit', customPrompt.value.trim())
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  inputRef.value?.focus()
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-content">
      <div class="modal-header">
        <h3>Custom AI Prompt</h3>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <textarea
          ref="inputRef"
          v-model="customPrompt"
          placeholder="Enter your prompt, e.g., 'Make this more formal' or 'Add bullet points'"
          :disabled="isLoading"
          @keydown.ctrl.enter="handleSubmit"
          @keydown.meta.enter="handleSubmit"
        ></textarea>
        <span class="hint">Press Ctrl+Enter to submit</span>
      </div>
      <div class="modal-footer">
        <button class="cancel-btn" @click="emit('close')" :disabled="isLoading">Cancel</button>
        <button class="submit-btn" @click="handleSubmit" :disabled="!customPrompt.trim() || isLoading">
          <span v-if="isLoading" class="spinner"></span>
          <span v-else>Generate</span>
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

.modal-content {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.close-btn {
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

.modal-body {
  padding: 16px;
}

.modal-body textarea {
  width: 100%;
  min-height: 100px;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  resize: vertical;
  font-family: inherit;
}

.modal-body textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.modal-body textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.cancel-btn,
.submit-btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
}

.cancel-btn {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.cancel-btn:hover:not(:disabled) {
  background: var(--bg-hover);
}

.submit-btn {
  background: var(--accent-color);
  border: none;
  color: white;
  min-width: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.submit-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
