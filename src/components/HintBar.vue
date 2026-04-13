<template>
  <Transition name="hint-bar">
    <div v-if="visible" class="hint-bar" :class="{ 'sidebar-open': sidebarPinned }">
      <div class="hints">
        <span class="hint">
          <kbd>Click</kbd>
          <span class="hint-label">select</span>
        </span>
        <span class="hint">
          <kbd>Double-click</kbd>
          <span class="hint-label">drill down</span>
        </span>
        <span class="hint">
          <kbd>Space</kbd>
          <span class="hint-label">details</span>
        </span>
        <span class="hint">
          <kbd>?</kbd>
          <span class="hint-label">all shortcuts</span>
        </span>
      </div>
      <button class="dismiss-btn" @click="emit('dismiss')" aria-label="Dismiss hints" title="Dismiss">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  </Transition>
</template>

<script setup>
defineProps({
  /** Whether hint bar is visible */
  visible: { type: Boolean, default: true },
  /** Current workspace ID */
  currentWorkspace: { type: String, default: '' },
  /** Whether sidebar is pinned open */
  sidebarPinned: { type: Boolean, default: false },
})

const emit = defineEmits(['dismiss'])
</script>

<style scoped>
.hint-bar {
  position: fixed;
  bottom: 16px;
  left: 16px;
  z-index: 9500;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: left 0.2s ease;
}

/* Shift right when sidebar is pinned open (sidebar width is 240px) */
.hint-bar.sidebar-open {
  left: 256px;
}

.hints {
  display: flex;
  align-items: center;
  gap: 16px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-primary);
}

.hint-label {
  margin-left: 2px;
  color: var(--text-tertiary);
}

.dismiss-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.dismiss-btn:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.dismiss-btn svg {
  width: 14px;
  height: 14px;
}

/* Transition */
.hint-bar-enter-active,
.hint-bar-leave-active {
  transition: all 0.2s ease;
}

.hint-bar-enter-from,
.hint-bar-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .hint-bar,
  .dismiss-btn {
    transition: none;
  }

  .hint-bar-enter-active,
  .hint-bar-leave-active {
    transition: none;
  }
}
</style>
