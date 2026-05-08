<script setup>
/**
 * LinkedItemsList - Displays linked nodes with unlink functionality.
 */
import { getInitials } from '../../utils/formatting.js'
import MenuIcon from './MenuIcon.vue'

defineProps({
  linkedNodes: {
    type: Array,
    required: true,
  },
})

const emit = defineEmits(['unlink'])

function unlinkNode(linked) {
  emit('unlink', linked)
}
</script>

<template>
  <div v-if="linkedNodes.length > 0" class="menu-section">
    <div class="section-header">
      <MenuIcon name="link" class="section-icon" />
      <span>Linked</span>
      <span class="section-count">{{ linkedNodes.length }}</span>
    </div>
    <div class="linked-list">
      <div v-for="linked in linkedNodes" :key="linked.id" class="linked-item">
        <span
          v-if="linked.type === 'person'"
          class="linked-avatar"
          :style="{ backgroundColor: linked.color || 'var(--type-person-bg)' }"
        >
          {{ getInitials(linked.title) }}
        </span>
        <span v-else class="linked-type" :class="linked.type">
          {{ linked.type[0].toUpperCase() }}
        </span>
        <span class="linked-title">{{ linked.title }}</span>
        <button class="unlink-btn" @click.stop="unlinkNode(linked)" title="Remove link">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.menu-section {
  padding: 4px 0;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-tertiary);
}

.section-header :deep(.menu-icon) {
  width: 12px;
  height: 12px;
  opacity: 0.6;
}

.section-count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--bg-tertiary);
  font-size: 10px;
}

.linked-list {
  padding: 2px 6px;
}

.linked-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.linked-item:hover {
  background: var(--bg-hover);
}

.linked-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.linked-type {
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
  background: var(--bg-tertiary);
  color: var(--text-tertiary);
}

.linked-type.project {
  background: var(--type-project-bg);
  color: var(--type-project-text);
}
.linked-type.task {
  background: var(--type-task-bg);
  color: var(--type-task-text);
}
.linked-type.note {
  background: var(--type-note-bg);
  color: var(--type-note-text);
}
.linked-type.milestone {
  background: var(--type-milestone-bg);
  color: var(--type-milestone-text);
}
.linked-type.event {
  background: var(--type-event-bg);
  color: var(--type-event-text);
}
.linked-type.topic {
  background: var(--type-topic-bg);
  color: var(--type-topic-text);
}
.linked-type.organization {
  background: var(--type-organization-bg);
  color: var(--type-organization-text);
}
.linked-type.component {
  background: var(--type-component-bg);
  color: var(--type-component-text);
}

.linked-title {
  flex: 1;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.unlink-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;
}

.linked-item:hover .unlink-btn {
  opacity: 1;
}

.unlink-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error-color);
}

.unlink-btn svg {
  width: 12px;
  height: 12px;
}
</style>
