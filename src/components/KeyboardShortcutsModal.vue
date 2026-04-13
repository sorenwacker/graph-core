<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal shortcuts-modal" @keydown="handleKeydown">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-row">
              <svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01" />
                <path d="M8 12h8" />
                <path d="M6 16h.01M10 16h.01M14 16h.01M18 16h.01" />
              </svg>
              <h3>Keyboard Shortcuts</h3>
            </div>
            <button class="close-btn" @click="$emit('close')" aria-label="Close" title="Close dialog">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="modal-content">
            <div class="shortcuts-grid">
              <div v-for="(section, sectionKey) in shortcuts" :key="sectionKey" class="shortcut-section">
                <h4 class="section-title">{{ sectionTitles[sectionKey] }}</h4>
                <div class="shortcut-list">
                  <div v-for="(shortcut, idx) in section" :key="idx" class="shortcut-item">
                    <span class="shortcut-keys">
                      <kbd v-for="(key, keyIdx) in resolveKeys(shortcut.keys, platformKeys)" :key="keyIdx">{{
                        key
                      }}</kbd>
                    </span>
                    <span class="shortcut-desc">{{ shortcut.desc }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer">
            <span class="footer-hint"><kbd>Esc</kbd> to close</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue'
import { usePlatform } from '../composables/usePlatform.js'
import { shortcuts, sectionTitles, resolveKeys } from '../utils/keyboardShortcuts.js'
import '../assets/modal-base.css'

const { modifierKey, optionKey, shiftKey, deleteKey } = usePlatform()

const platformKeys = computed(() => ({
  modifierKey: modifierKey.value,
  optionKey: optionKey.value,
  shiftKey: shiftKey.value,
  deleteKey: deleteKey.value,
}))

defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close'])

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<style scoped>
/* Override modal width for shortcuts grid */
.shortcuts-modal {
  --modal-max-width: 720px;
}

/* Shortcuts grid layout */
.shortcuts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

.shortcut-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 16px;
}

.section-title {
  margin: 0 0 12px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-tertiary);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.shortcut-keys kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  padding: 0 8px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  box-shadow: 0 1px 0 var(--border-color);
}

.shortcut-desc {
  font-size: 13px;
  color: var(--text-secondary);
  text-align: right;
}

/* Footer centered */
.modal-footer {
  text-align: center;
}

/* Responsive */
@media (max-width: 640px) {
  .shortcuts-grid {
    grid-template-columns: 1fr;
  }
}
</style>
