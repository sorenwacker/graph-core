<script setup>
import { getInitials } from '../utils/formatting.js'

defineProps({
  persons: { type: Array, default: () => [] },
  selectedIndex: { type: Number, default: 0 },
  position: { type: Object, default: () => ({ top: 0, left: 0 }) }
})

const emit = defineEmits(['select', 'hover'])
</script>

<template>
  <Teleport to="body">
    <div
      class="mention-dropdown"
      :style="{ top: position.top + 'px', left: position.left + 'px' }"
    >
      <div v-if="persons.length === 0" class="mention-empty">
        No persons found
      </div>
      <div
        v-for="(person, index) in persons"
        :key="person.id"
        class="mention-item"
        :class="{ selected: index === selectedIndex }"
        @mousedown.prevent="emit('select', index)"
        @mouseenter="$emit('hover', index)"
      >
        <span class="mention-avatar" :style="{ backgroundColor: person.color || '#3498db' }">
          {{ getInitials(person.title) }}
        </span>
        <div class="mention-info">
          <span class="mention-name">{{ person.title }}</span>
          <span v-if="person.role || person.organization" class="mention-role">
            {{ person.role || person.organization }}
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mention-dropdown {
  position: fixed;
  z-index: 10000;
  background: var(--bg-elevated, #1a1f2e);
  border: 1px solid var(--border-color, #333);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  max-height: 240px;
  min-width: 200px;
  max-width: 300px;
  overflow-y: auto;
  padding: 4px;
}

.mention-empty {
  padding: 12px 16px;
  color: var(--text-tertiary, #666);
  font-size: 12px;
  text-align: center;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s;
}

.mention-item:hover,
.mention-item.selected {
  background: var(--bg-hover, rgba(255, 255, 255, 0.1));
}

.mention-item.selected {
  background: var(--accent-color, #0f4c75);
}

.mention-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.mention-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.mention-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary, #f0f0f0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.mention-role {
  font-size: 11px;
  color: var(--text-tertiary, #888);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
