<script setup>
import { usePlatform } from '../composables/usePlatform.js'

const { modifierKey, optionKey } = usePlatform()

defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])
</script>

<template>
  <div v-if="visible" class="hotkey-help-overlay" @click.self="emit('close')">
    <div class="hotkey-help-modal">
      <h3>Keyboard Shortcuts</h3>
      <div class="hotkey-list">
        <div class="hotkey-section">
          <h4>Selection</h4>
          <div class="hotkey-item"><kbd>Click</kbd> Select node</div>
          <div class="hotkey-item"><kbd>Shift</kbd>+<kbd>Click</kbd> Multi-select</div>
          <div class="hotkey-item"><kbd>Shift</kbd>+<kbd>Drag</kbd> Lasso select</div>
        </div>
        <div class="hotkey-section">
          <h4>Actions</h4>
          <div class="hotkey-item">
            <kbd>{{ modifierKey }}</kbd
            >+<kbd>Click</kbd> Add child
          </div>
          <div class="hotkey-item"><kbd>Double-click</kbd> Enter node</div>
          <div class="hotkey-item">
            <kbd>{{ optionKey }}</kbd
            >+<kbd>{{ modifierKey }}</kbd
            >+<kbd>Click</kbd> Delete
          </div>
        </div>
        <div class="hotkey-section">
          <h4>Navigation</h4>
          <div class="hotkey-item">
            <kbd>{{ modifierKey }}</kbd
            >+<kbd>Up</kbd> Go to parent
          </div>
          <div class="hotkey-item">
            <kbd>{{ modifierKey }}</kbd
            >+<kbd>Down</kbd> First child
          </div>
          <div class="hotkey-item">
            <kbd>{{ modifierKey }}</kbd
            >+<kbd>Left/Right</kbd> Siblings
          </div>
        </div>
        <div class="hotkey-section">
          <h4>Links</h4>
          <div class="hotkey-item">
            <kbd>{{ optionKey }}</kbd> Hold for link mode
          </div>
          <div class="hotkey-item">
            <kbd>{{ optionKey }}</kbd
            >+<kbd>Drag</kbd> Create link
          </div>
        </div>
      </div>
      <button class="hotkey-close" @click="emit('close')">Close</button>
    </div>
  </div>
</template>

<style scoped>
.hotkey-help-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.hotkey-help-modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 12px;
  padding: 24px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.hotkey-help-modal h3 {
  margin: 0 0 16px;
  font-size: 18px;
  color: var(--text-primary);
}

.hotkey-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.hotkey-section h4 {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.hotkey-item {
  font-size: 12px;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.hotkey-item kbd {
  display: inline-block;
  padding: 2px 6px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  font-family: inherit;
  font-size: 11px;
}

.hotkey-close {
  margin-top: 16px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
}

.hotkey-close:hover {
  background: var(--bg-hover);
}
</style>
