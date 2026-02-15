<script setup>
defineProps({
  ancestors: { type: Array, default: () => [] },
  current: Object
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <nav class="breadcrumb" v-if="current">
    <!-- Home/Root button -->
    <button class="breadcrumb-home" @click="emit('navigate', null)" title="Go to root">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    </button>

    <!-- Ancestor trail -->
    <template v-for="(node, index) in ancestors" :key="node.id">
      <svg class="breadcrumb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <button
        class="breadcrumb-item"
        :class="{ truncate: ancestors.length > 3 && index < ancestors.length - 2 }"
        @click="emit('navigate', node)"
      >
        {{ node.title }}
      </button>
    </template>

    <!-- Current location -->
    <svg class="breadcrumb-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
    <span class="breadcrumb-current">{{ current.title }}</span>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 8px 16px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
  min-height: 40px;
  overflow: hidden;
}

.breadcrumb-home {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.breadcrumb-home svg {
  width: 16px;
  height: 16px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.breadcrumb-home:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.breadcrumb-home:active {
  transform: scale(0.95);
}

.breadcrumb-chevron {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  opacity: 0.5;
  flex-shrink: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.breadcrumb-item {
  padding: 4px 8px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.breadcrumb-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.breadcrumb-item:active {
  transform: scale(0.98);
}

/* Truncate middle items when path is long */
.breadcrumb-item.truncate {
  max-width: 60px;
}

.breadcrumb-current {
  padding: 4px 8px;
  color: var(--text-primary);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
}

/* Responsive - hide middle items on small screens */
@media (max-width: 600px) {
  .breadcrumb-item.truncate {
    display: none;
  }

  .breadcrumb-item.truncate + .breadcrumb-chevron {
    display: none;
  }

  .breadcrumb-item {
    max-width: 100px;
  }

  .breadcrumb-current {
    max-width: 120px;
  }
}
</style>
