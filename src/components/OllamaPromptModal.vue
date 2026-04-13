<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import '../assets/modal-base.css'

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
    <div class="modal prompt-modal">
      <div class="modal-header">
        <div class="modal-title-row">
          <h3>Custom AI Prompt</h3>
        </div>
        <button class="close-btn" @click="emit('close')" aria-label="Close" title="Close dialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div class="modal-content prompt-body">
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
      <div class="modal-footer prompt-footer">
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
/* Override modal sizing */
.prompt-modal {
  --modal-max-width: 500px;
  --modal-border-radius: 8px;
}

.prompt-body {
  padding: 16px;
}

.prompt-body textarea {
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
  box-sizing: border-box;
}

.prompt-body textarea:focus {
  outline: none;
  border-color: var(--accent-color);
}

.prompt-body textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 6px;
}

.prompt-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
}

.cancel-btn,
.submit-btn {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.15s;
  font-family: inherit;
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

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .cancel-btn,
  .submit-btn {
    transition: none;
  }

  .spinner {
    animation: none;
  }
}
</style>
