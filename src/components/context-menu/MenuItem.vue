<script setup>
/**
 * MenuItem - Reusable menu item component for context menus.
 * Renders a button with icon, label, and optional keyboard shortcut.
 */
import MenuIcon from './MenuIcon.vue'

defineProps({
  item: {
    type: Object,
    required: true,
    validator: item => item.label && item.icon && item.action,
  },
})
</script>

<template>
  <button v-if="item.visible !== false" class="menu-item" :class="{ danger: item.danger }" @click="item.action">
    <MenuIcon :name="item.icon" :fill="item.iconFill" :icon-class="item.iconClass || ''" />
    <span>{{ item.label }}</span>
    <kbd v-if="item.shortcut" class="menu-shortcut">{{ item.shortcut }}</kbd>
  </button>
</template>

<style scoped>
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.menu-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.menu-item:hover :deep(.menu-icon) {
  color: var(--accent-color);
  transform: scale(1.1);
}

.menu-item:active {
  background: var(--bg-hover);
  transform: scale(0.98);
}

.menu-shortcut {
  margin-left: auto;
  font-size: 10px;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-tertiary);
  border: none;
}

.menu-item.danger {
  color: var(--error-color);
}

.menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: var(--error-color);
}

.menu-item.danger:hover :deep(.menu-icon) {
  color: var(--error-color);
}
</style>
