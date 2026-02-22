<script setup>
const props = defineProps({
  breadcrumbs: { type: Array, default: () => [] }
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <nav class="header-breadcrumbs">
    <div class="breadcrumb-path">
      <span class="crumb" @click="emit('navigate', -1)">~</span>
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
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  min-height: 36px;
}

.breadcrumb-path {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  overflow: hidden;
}

.crumb {
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
}

.crumb:hover {
  color: var(--accent-color);
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
