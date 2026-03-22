<script setup>
import { computed } from 'vue'
import { getTypeIcon } from '../../utils/constants.js'

const props = defineProps({
  linkedNodes: { type: Array, default: () => [] },
  showLinks: { type: Number, default: 1 },
  excludeType: { type: String, default: null }, // e.g., 'organization' or 'person'
  addButtonText: { type: String, default: '+ Link to project/task' }
})

const emit = defineEmits(['update:showLinks', 'select', 'remove', 'add'])

const filteredLinks = computed(() => {
  if (!props.excludeType) return props.linkedNodes
  return props.linkedNodes.filter(n => n.type !== props.excludeType)
})

function hideLinks() {
  emit('update:showLinks', 0)
}

function expandLinks() {
  emit('update:showLinks', 1)
}

function onSelect(node) {
  emit('select', node.id)
}

function onRemove(node) {
  emit('remove', node)
}

function onAdd() {
  emit('add')
}
</script>

<template>
  <template v-if="showLinks !== 0">
    <div v-if="filteredLinks.length" class="links-section">
      <label>
        Linked Items
        <button class="toggle-links-btn" @click.stop="hideLinks" title="Hide links section">-</button>
      </label>
      <div class="links-list">
        <span
          v-for="linked in filteredLinks"
          :key="linked.id"
          class="link-chip"
          @click="onSelect(linked)"
        >
          <span class="link-type" :class="linked.type" v-html="getTypeIcon(linked.type)"></span>
          {{ linked.title }}
          <button class="remove-link-btn" @click.stop="onRemove(linked)" title="Remove link">x</button>
        </span>
        <button class="add-link-btn" @click="onAdd" title="Add link">+</button>
      </div>
    </div>
    <button v-else class="add-field-btn link-btn" @click="onAdd" :title="addButtonText">{{ addButtonText }}</button>
  </template>
  <button v-else class="add-field-btn link-btn" @click="expandLinks" :title="addButtonText">{{ addButtonText }}</button>
</template>

<style scoped>
.links-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.links-section label {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toggle-links-btn {
  background: var(--bg-tertiary);
  border: none;
  color: var(--text-secondary);
  width: 16px;
  height: 16px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
}

.toggle-links-btn:hover {
  background: var(--bg-hover);
}

.links-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.link-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-secondary);
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.link-chip:hover {
  background: var(--bg-hover);
}

.link-type {
  font-size: 10px;
  opacity: 0.7;
}

.remove-link-btn {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
}

.remove-link-btn:hover {
  opacity: 1;
  color: var(--danger-color);
}

.add-link-btn {
  background: var(--bg-tertiary);
  border: none;
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  cursor: pointer;
}

.add-link-btn:hover {
  background: var(--accent-color);
  color: white;
}

.add-field-btn {
  background: none;
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  width: 100%;
}

.add-field-btn:hover {
  border-color: var(--accent-color);
  color: var(--accent-color);
}
</style>
