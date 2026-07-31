<script setup>
/**
 * WorkspaceList - Displays workspace selection for moving nodes.
 */
import MenuIcon from './MenuIcon.vue'

defineProps({
  workspaces: {
    type: Array,
    required: true,
  },
  currentWorkspaceId: {
    type: [String, Number, null],
    default: null,
  },
})

const emit = defineEmits(['move-to-workspace'])

function moveToWorkspace(workspaceId) {
  emit('move-to-workspace', workspaceId)
}
</script>

<template>
  <div class="menu-section">
    <div class="section-header">
      <MenuIcon name="home" class="section-icon" />
      <span>Move to Workspace</span>
    </div>
    <div class="workspace-list">
      <button
        v-for="ws in workspaces"
        :key="ws.id"
        class="workspace-item"
        :class="{ active: currentWorkspaceId === ws.id }"
        @click="moveToWorkspace(ws.id)"
      >
        <MenuIcon name="workspace" class="workspace-icon" />
        <span>{{ ws.name }}</span>
      </button>
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

.workspace-list {
  padding: 2px 6px;
}

.workspace-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
}

.workspace-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.workspace-item.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.workspace-item.active :deep(.menu-icon) {
  color: var(--accent-color);
}

.workspace-item :deep(.menu-icon) {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}
</style>
