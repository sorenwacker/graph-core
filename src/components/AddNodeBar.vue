<script setup>
import { nodeTypes } from '../utils/constants.js'

const props = defineProps({
  nodeType: { type: String, required: true },
  nodeTitle: { type: String, required: true }
})

const emit = defineEmits(['update:nodeType', 'update:nodeTitle', 'create'])

function formatType(t) {
  return t.charAt(0).toUpperCase() + t.slice(1)
}
</script>

<template>
  <div class="add-node-bar">
    <select
      :value="nodeType"
      class="type-select"
      @change="emit('update:nodeType', $event.target.value)"
    >
      <option v-for="t in nodeTypes" :key="t" :value="t">{{ formatType(t) }}</option>
    </select>
    <input
      :value="nodeTitle"
      placeholder="Add new..."
      @input="emit('update:nodeTitle', $event.target.value)"
      @keyup.enter="emit('create')"
    />
    <button class="primary" @click="emit('create')">Add</button>
  </div>
</template>

<style scoped>
.add-node-bar {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.add-node-bar input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
}

.add-node-bar input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.type-select {
  padding: 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
}

.type-select:hover {
  border-color: var(--accent-color);
}

.primary {
  padding: 6px 16px;
  border: none;
  border-radius: 4px;
  background: var(--accent-color);
  color: white;
  font-weight: 500;
  cursor: pointer;
}

.primary:hover {
  background: var(--accent-hover);
}
</style>
