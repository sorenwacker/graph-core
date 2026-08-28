<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Enter Value' },
  placeholder: { type: String, default: '' },
  value: { type: String, default: '' },
  // Named per caller: this dialog is not only used for creating things.
  confirmLabel: { type: String, default: 'OK' },
})

const emit = defineEmits(['close', 'submit', 'update:value'])

const inputRef = ref(null)

watch(
  () => props.visible,
  v => {
    if (v) {
      nextTick(() => inputRef.value?.focus())
    }
  }
)

function handleKeydown(e) {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    emit('submit')
  }
}

defineExpose({ inputRef })
</script>

<template>
  <div v-if="visible" class="prompt-modal-overlay" @click.self="emit('close')">
    <div class="prompt-modal">
      <div class="prompt-modal-header">
        <h3>{{ title }}</h3>
      </div>
      <div class="prompt-modal-content">
        <input
          ref="inputRef"
          :value="value"
          @input="emit('update:value', $event.target.value)"
          :placeholder="placeholder"
          class="prompt-input"
          @keydown="handleKeydown"
        />
      </div>
      <div class="prompt-modal-footer">
        <button class="btn-secondary" @click="emit('close')">Cancel</button>
        <button class="btn-primary" @click="emit('submit')">{{ confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.prompt-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.prompt-modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  width: 90%;
  max-width: 400px;
  overflow: hidden;
}

.prompt-modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-secondary);
}

.prompt-modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.prompt-modal-content {
  padding: 20px;
}

.prompt-input {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 14px;
}

.prompt-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.prompt-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-secondary);
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
