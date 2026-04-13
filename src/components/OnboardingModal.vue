<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="modal-overlay" @click.self="handleClose">
        <div class="modal onboarding-modal" @keydown="handleKeydown">
          <!-- Header -->
          <div class="modal-header">
            <div class="modal-title-row">
              <svg class="modal-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              <h3>Welcome to GraphCore</h3>
            </div>
            <button class="close-btn" @click="handleClose" aria-label="Close" title="Close dialog">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="modal-content">
            <p class="intro-text">Get started with these essential interactions:</p>

            <div class="shortcuts-list">
              <div class="shortcut-card">
                <div class="shortcut-key"><kbd>Space</kbd></div>
                <div class="shortcut-info">
                  <span class="shortcut-action">View Details</span>
                  <span class="shortcut-hint">See full node content in the detail panel</span>
                </div>
              </div>

              <div class="shortcut-card">
                <div class="shortcut-key"><kbd>Enter</kbd></div>
                <div class="shortcut-info">
                  <span class="shortcut-action">Drill Down</span>
                  <span class="shortcut-hint">Navigate into a node to see its children</span>
                </div>
              </div>

              <div class="shortcut-card">
                <div class="shortcut-key"><kbd>N</kbd></div>
                <div class="shortcut-info">
                  <span class="shortcut-action">Create New</span>
                  <span class="shortcut-hint">Open the new node dialog</span>
                </div>
              </div>

              <div class="shortcut-card">
                <div class="shortcut-key">
                  <kbd>{{ modifierKey }}</kbd>
                  <kbd>K</kbd>
                </div>
                <div class="shortcut-info">
                  <span class="shortcut-action">Quick Search</span>
                  <span class="shortcut-hint">Find any node instantly</span>
                </div>
              </div>
            </div>

            <p class="tip">Press <kbd>{{ modifierKey }}</kbd><kbd>/</kbd> anytime to see all shortcuts.</p>

            <!-- Demo workspace option -->
            <div class="demo-section">
              <p class="demo-intro">Want to explore with sample data?</p>
              <button class="demo-btn" @click="handleCreateDemo">
                <svg class="demo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 3l1.912 5.813L20 10.236l-4.938 3.978L16.82 20 12 16.5 7.18 20l1.758-5.786L4 10.236l6.088-1.423L12 3z" />
                </svg>
                Create Demo Workspace
              </button>
              <span class="demo-hint">Creates a "Demo" workspace with sample nodes to explore</span>
              <p class="settings-tip">Tip: Adjust graph depth and detail settings in Settings &gt; General</p>
            </div>
          </div>

          <!-- Footer -->
          <div class="modal-footer onboarding-footer">
            <label class="dont-show-again">
              <input type="checkbox" v-model="dontShowAgain" />
              <span>Don't show this again</span>
            </label>
            <button class="primary-btn" @click="handleClose">Get Started</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { usePlatform } from '../composables/usePlatform.js'
import '../assets/modal-base.css'

const { modifierKey } = usePlatform()

defineProps({
  visible: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'dismiss-forever', 'create-demo'])

const dontShowAgain = ref(false)

function handleClose() {
  if (dontShowAgain.value) {
    emit('dismiss-forever')
  }
  emit('close')
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    handleClose()
  } else if (e.key === 'Enter') {
    handleClose()
  }
}

function handleCreateDemo() {
  emit('create-demo')
  handleClose()
}
</script>

<style scoped>
/* Larger icon for onboarding */
.onboarding-modal .modal-icon {
  width: 22px;
  height: 22px;
}

.onboarding-modal .modal-header h3 {
  font-size: 16px;
}

/* Content */
.intro-text {
  margin: 0 0 20px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.shortcuts-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.shortcut-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  transition: all 0.2s ease;
}

.shortcut-card:hover {
  border-color: var(--border-color);
  background: var(--bg-hover);
}

.shortcut-key {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.shortcut-key kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 10px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);
  box-shadow: 0 2px 0 var(--border-color);
}

.shortcut-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shortcut-action {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.shortcut-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.tip {
  margin: 0;
  padding: 12px;
  background: var(--bg-secondary);
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.tip kbd {
  display: inline-block;
  padding: 2px 6px;
  margin: 0 2px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
}

/* Footer with flex layout */
.onboarding-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.dont-show-again {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.dont-show-again input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-color);
  cursor: pointer;
}

.primary-btn {
  padding: 10px 20px;
  background: var(--accent-color);
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.primary-btn:hover {
  filter: brightness(1.1);
}

.primary-btn:active {
  transform: scale(0.98);
}

/* Demo section */
.demo-section {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
  text-align: center;
}

.demo-intro {
  margin: 0 0 12px 0;
  font-size: 13px;
  color: var(--text-secondary);
}

.demo-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #9333ea 0%, #7c3aed 100%);
  border: none;
  border-radius: 8px;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  transition: all 0.15s ease;
}

.demo-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
}

.demo-btn:active {
  transform: scale(0.98) translateY(0);
}

.demo-icon {
  width: 18px;
  height: 18px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.demo-hint {
  display: block;
  margin-top: 8px;
  font-size: 11px;
  color: var(--text-tertiary);
}

.settings-tip {
  margin: 12px 0 0 0;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-secondary);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .shortcut-card,
  .primary-btn,
  .demo-btn {
    transition: none;
  }
}
</style>
