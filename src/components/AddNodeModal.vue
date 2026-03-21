<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="$emit('close')">
        <div class="modal" @keydown="handleKeydown">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-row">
              <svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v8M8 12h8"/>
              </svg>
              <h3>{{ title }}</h3>
            </div>
            <button class="close-btn" @click="$emit('close')" aria-label="Close" title="Close dialog">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="modal-content">
            <div class="input-wrapper">
              <input
                ref="inputRef"
                v-model="nodeTitle"
                placeholder="What do you want to create?"
                class="node-input"
                @keydown.enter.prevent="createWithType('task')"
              />
              <span v-if="nodeTitle.trim()" class="input-hint">
                Press Enter for task, or select type below
              </span>
            </div>

            <!-- Type grid -->
            <div class="type-grid">
              <button
                v-for="t in nodeTypes"
                :key="t"
                class="type-btn"
                :class="[t, { disabled: !nodeTitle.trim() }]"
                :disabled="!nodeTitle.trim()"
                @click="createWithType(t)"
                :title="`Create as ${t}`"
              >
                <span class="type-icon">{{ getTypeIcon(t) }}</span>
                <span class="type-label">{{ t }}</span>
              </button>
            </div>
          </div>

          <!-- Footer hint -->
          <div class="modal-footer">
            <kbd>Esc</kbd> to cancel
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'
import { nodeTypes } from '../utils/constants.js'

const typeIcons = {
  task: 'T',
  project: 'P',
  note: 'N',
  milestone: 'M',
  topic: 'Tp',
  component: 'C',
  group: 'G',
  event: 'E',
  person: 'Pe',
  organization: 'O'
}

function getTypeIcon(type) {
  return typeIcons[type] || type[0].toUpperCase()
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: 'Create New Node' },
  parentId: { type: [Number, String], default: null },
  position: { type: Object, default: null },
  insertBetween: { type: Object, default: null }
})

const emit = defineEmits(['close', 'create'])
const nodeTitle = ref('')
const inputRef = ref(null)

function createWithType(type) {
  const title = nodeTitle.value.trim()
  if (!title) return

  emit('create', {
    title,
    type,
    parentId: props.parentId,
    position: props.position,
    insertBetween: props.insertBetween
  })

  nodeTitle.value = ''
  emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

// Auto-focus when modal opens
watch(() => props.visible, (visible) => {
  if (visible) {
    nodeTitle.value = ''
    nextTick(() => {
      inputRef.value?.focus()
    })
  }
})
</script>

<style scoped>
/* Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

/* Modal container */
.modal {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  width: 90%;
  max-width: 480px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

/* Subtle top glow */
.modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--border-color) 30%,
    var(--border-color) 70%,
    transparent
  );
}

/* Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.modal-icon {
  width: 20px;
  height: 20px;
  color: var(--accent-color);
  stroke-linecap: round;
  stroke-linejoin: round;
}

.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.close-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.close-btn svg {
  width: 16px;
  height: 16px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.close-btn:active {
  transform: scale(0.95);
}

/* Content */
.modal-content {
  padding: 20px;
}

.input-wrapper {
  position: relative;
  margin-bottom: 20px;
}

.node-input {
  width: 100%;
  padding: 14px 16px;
  font-size: 15px;
  font-family: inherit;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  color: var(--text-primary);
  box-sizing: border-box;
  transition: all 0.2s ease;
}

.node-input::placeholder {
  color: var(--text-tertiary);
}

.node-input:focus {
  outline: none;
  border-color: var(--accent-color);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.input-hint {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

/* Type grid */
.type-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 8px;
}

.type-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-family: inherit;
  cursor: pointer;
  transition: all 0.2s var(--ease-out-expo);
}

.type-btn:hover:not(.disabled) {
  border-color: var(--border-color);
  background: var(--bg-hover);
  transform: translateY(-2px);
}

.type-btn:active:not(.disabled) {
  transform: translateY(0) scale(0.98);
}

.type-btn.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.type-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.02em;
  transition: transform 0.2s var(--ease-out-expo);
}

.type-btn:hover:not(.disabled) .type-icon {
  transform: scale(1.1);
}

.type-label {
  font-size: 10px;
  text-transform: capitalize;
  font-weight: 500;
  letter-spacing: 0.02em;
}

/* Type-specific colors */
.type-btn.task .type-icon { background: var(--type-task-bg); color: var(--type-task-text); }
.type-btn.project .type-icon { background: var(--type-project-bg); color: var(--type-project-text); }
.type-btn.note .type-icon { background: var(--type-note-bg); color: var(--type-note-text); }
.type-btn.milestone .type-icon { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.type-btn.topic .type-icon { background: var(--type-topic-bg); color: var(--type-topic-text); }
.type-btn.component .type-icon { background: var(--type-component-bg); color: var(--type-component-text); }
.type-btn.group .type-icon { background: var(--type-group-bg); color: var(--type-group-text); }
.type-btn.event .type-icon { background: var(--type-event-bg); color: var(--type-event-text); }
.type-btn.person .type-icon { background: var(--type-person-bg); color: var(--type-person-text); }
.type-btn.organization .type-icon { background: var(--type-organization-bg); color: var(--type-organization-text); }

.type-btn.task:hover:not(.disabled) { border-color: var(--type-task-text); }
.type-btn.project:hover:not(.disabled) { border-color: var(--type-project-text); }
.type-btn.note:hover:not(.disabled) { border-color: var(--type-note-text); }
.type-btn.milestone:hover:not(.disabled) { border-color: var(--type-milestone-text); }
.type-btn.topic:hover:not(.disabled) { border-color: var(--type-topic-text); }
.type-btn.component:hover:not(.disabled) { border-color: var(--type-component-text); }
.type-btn.group:hover:not(.disabled) { border-color: var(--type-group-text); }
.type-btn.event:hover:not(.disabled) { border-color: var(--type-event-text); }
.type-btn.person:hover:not(.disabled) { border-color: var(--type-person-text); }
.type-btn.organization:hover:not(.disabled) { border-color: var(--type-organization-text); }

/* Footer */
.modal-footer {
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
  font-size: 11px;
  color: var(--text-tertiary);
}

.modal-footer kbd {
  display: inline-block;
  padding: 2px 6px;
  margin-right: 4px;
  border-radius: 4px;
  background: var(--bg-tertiary);
  font-family: inherit;
  font-size: 10px;
}

/* Entrance/exit animations */
.modal-enter-active {
  animation: overlay-in 0.25s ease;
}

.modal-leave-active {
  animation: overlay-out 0.2s ease forwards;
}

.modal-enter-active .modal {
  animation: modal-in 0.3s var(--ease-out-expo);
}

.modal-leave-active .modal {
  animation: modal-out 0.2s ease forwards;
}

@keyframes overlay-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes overlay-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modal-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.98) translateY(-4px);
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active,
  .modal-enter-active .modal,
  .modal-leave-active .modal {
    animation: none;
  }

  .type-btn,
  .type-icon {
    transition: none;
  }
}

/* Responsive */
@media (max-width: 520px) {
  .type-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 400px) {
  .type-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
