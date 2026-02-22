<script setup>
import { viewModes } from '../utils/viewConfig.js'

const props = defineProps({
  modelValue: { type: String, required: true }
})

const emit = defineEmits(['update:modelValue'])

function setView(id) {
  emit('update:modelValue', id)
}
</script>

<template>
  <div class="view-switcher">
    <button
      v-for="view in viewModes"
      :key="view.id"
      class="view-btn"
      :class="{ active: modelValue === view.id }"
      :title="view.label"
      @click="setView(view.id)"
      v-html="view.icon"
    >
    </button>
  </div>
</template>

<style scoped>
.view-switcher {
  display: flex;
  gap: 2px;
}

.view-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.view-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.view-btn.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.view-btn :deep(svg) {
  width: 20px;
  height: 20px;
}
</style>
