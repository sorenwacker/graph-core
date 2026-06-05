<script setup>
defineProps({
  breadcrumbs: { type: Array, default: () => [] },
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <nav class="header-breadcrumbs" aria-label="Breadcrumb navigation">
    <div class="breadcrumb-path">
      <span class="crumb home-crumb" @click="emit('navigate', -1)">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </span>
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
        <span class="crumb-sep">/</span>
        <span
          class="crumb"
          :class="{ current: index === breadcrumbs.length - 1 }"
          @click="index < breadcrumbs.length - 1 ? emit('navigate', index) : null"
        >
          {{ crumb.title }}
        </span>
      </template>
    </div>
    <div id="view-controls-target"></div>
  </nav>
</template>

<style scoped>
.header-breadcrumbs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px 8px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  min-height: 36px;
}

.breadcrumb-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
  overflow: hidden;
}

.crumb {
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 4px;
}

.crumb:hover {
  color: var(--accent-color);
  background: var(--bg-hover);
}

.crumb.current {
  color: var(--text-primary);
  font-weight: 500;
  cursor: default;
}

.crumb.current:hover {
  color: var(--text-primary);
}

.crumb-sep {
  color: var(--text-tertiary);
}
</style>
