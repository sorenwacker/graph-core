<script setup>
defineProps({
  ancestors: { type: Array, default: () => [] },
  current: Object
})

const emit = defineEmits(['navigate'])
</script>

<template>
  <nav class="breadcrumb" v-if="current">
    <span class="breadcrumb-item" @click="emit('navigate', null)">
      Root
    </span>
    <span v-for="node in ancestors" :key="node.id">
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-item" @click="emit('navigate', node)">
        {{ node.title }}
      </span>
    </span>
    <span class="breadcrumb-sep">/</span>
    <span class="breadcrumb-current">{{ current.title }}</span>
  </nav>
</template>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: var(--text-tertiary);
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.breadcrumb-item {
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
}

.breadcrumb-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.breadcrumb-sep {
  color: var(--text-tertiary);
}

.breadcrumb-current {
  color: var(--text-primary);
  font-weight: 500;
}
</style>
