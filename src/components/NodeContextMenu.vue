<script setup>
/**
 * NodeContextMenu - Context menu for node actions.
 * Uses data-driven menu item configuration with sub-components for maintainability.
 */
import { ref, computed } from 'vue'
import { calculateMenuPosition } from '../utils/menuPosition'
import { usePlatform } from '../composables/usePlatform.js'
import MenuGroup from './context-menu/MenuGroup.vue'
import LinkedItemsList from './context-menu/LinkedItemsList.vue'
import WorkspaceList from './context-menu/WorkspaceList.vue'

const { modifierKey, optionKey } = usePlatform()

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  node: { type: Object, default: null },
  linkedNodes: { type: Array, default: () => [] },
  workspaces: { type: Array, default: () => [] },
})

const menuRef = ref(null)

const menuStyle = computed(() => {
  if (!props.visible) return { left: '0px', top: '0px' }
  const pos = calculateMenuPosition(props.x, props.y)
  return { left: pos.x + 'px', top: pos.y + 'px' }
})

const emit = defineEmits([
  'close',
  'view-details',
  'enter',
  'add-child',
  'toggle-complete',
  'toggle-favorite',
  'open-link-search',
  'open-move-search',
  'unlink',
  'move-to-workspace',
  'delete',
  'open-in-window',
])

const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow

function close() {
  emit('close')
}

// Action handlers
const actions = {
  viewDetails: () => {
    emit('view-details', props.node)
    close()
  },
  openInWindow: () => {
    emit('open-in-window', props.node)
    close()
  },
  enter: () => {
    emit('enter', props.node)
    close()
  },
  addChild: () => {
    emit('add-child', props.node)
    close()
  },
  toggleComplete: () => {
    emit('toggle-complete', props.node)
  },
  toggleFavorite: () => {
    emit('toggle-favorite', props.node)
  },
  openLinkSearch: () => {
    emit('open-link-search', props.node)
    close()
  },
  openMoveSearch: () => {
    emit('open-move-search', props.node)
    close()
  },
  deleteNode: () => {
    emit('delete', props.node)
    close()
  },
}

function handleUnlink(linked) {
  emit('unlink', { source: props.node, target: linked })
}

function handleMoveToWorkspace(workspaceId) {
  emit('move-to-workspace', { node: props.node, workspaceId })
  close()
}

// Data-driven menu configurations
const primaryMenuItems = computed(() => [
  {
    id: 'view-details',
    label: 'View Details',
    icon: 'info',
    action: actions.viewDetails,
    shortcut: 'Enter',
    visible: true,
  },
  {
    id: 'open-in-window',
    label: 'Open in Window',
    icon: 'external',
    action: actions.openInWindow,
    visible: isElectron,
  },
  {
    id: 'enter',
    label: 'Enter',
    icon: 'expand',
    action: actions.enter,
    visible: true,
  },
  {
    id: 'add-child',
    label: 'Add Child',
    icon: 'add',
    action: actions.addChild,
    shortcut: `${modifierKey}+Click`,
    visible: props.node?.type !== 'person',
  },
])

const statusMenuItems = computed(() => [
  {
    id: 'toggle-complete',
    label: props.node?.completed ? 'Mark Incomplete' : 'Mark Complete',
    icon: props.node?.completed ? 'circle' : 'check-circle',
    iconClass: props.node?.completed ? '' : 'completed',
    action: actions.toggleComplete,
    visible: props.node?.type !== 'person',
  },
  {
    id: 'toggle-favorite',
    label: props.node?.favorite ? 'Remove Favorite' : 'Add Favorite',
    icon: 'star',
    iconClass: props.node?.favorite ? 'starred' : '',
    iconFill: props.node?.favorite,
    action: actions.toggleFavorite,
    visible: true,
  },
])

const linkingMenuItems = computed(() => [
  {
    id: 'link-to',
    label: 'Link to...',
    icon: 'link',
    action: actions.openLinkSearch,
    visible: true,
  },
  {
    id: 'move-to',
    label: 'Move to...',
    icon: 'move',
    action: actions.openMoveSearch,
    visible: true,
  },
])

const dangerMenuItems = computed(() => [
  {
    id: 'delete',
    label: 'Delete',
    icon: 'trash',
    action: actions.deleteNode,
    shortcut: `${optionKey}+${modifierKey}+Click`,
    danger: true,
    visible: true,
  },
])
</script>

<template>
  <Teleport to="body">
    <Transition name="menu">
      <div v-if="visible && node" ref="menuRef" class="context-menu" :style="menuStyle" @click.stop>
        <!-- Header with node info -->
        <div class="menu-header">
          <span class="menu-type-badge" :class="node?.type">{{ node?.type }}</span>
          <span class="menu-title">{{ node?.title }}</span>
        </div>

        <!-- Primary actions -->
        <MenuGroup :items="primaryMenuItems" />

        <div class="menu-divider"></div>

        <!-- Status toggles -->
        <MenuGroup :items="statusMenuItems" />

        <div class="menu-divider"></div>

        <!-- Linking and moving section -->
        <MenuGroup :items="linkingMenuItems" />

        <!-- Linked nodes list -->
        <LinkedItemsList :linked-nodes="linkedNodes" @unlink="handleUnlink" />

        <div class="menu-divider"></div>

        <!-- Workspace section -->
        <WorkspaceList
          :workspaces="workspaces"
          :current-workspace-id="node?.workspace_id"
          @move-to-workspace="handleMoveToWorkspace"
        />

        <div class="menu-divider"></div>

        <!-- Danger zone -->
        <MenuGroup :items="dangerMenuItems" />
      </div>
    </Transition>
    <Transition name="backdrop">
      <div v-if="visible" class="menu-backdrop" @click="close" @contextmenu.prevent="close"></div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Menu container */
.context-menu {
  position: fixed;
  z-index: 10000;
  min-width: 240px;
  max-width: 320px;
  padding: 6px;
  background: var(--bg-primary);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-lg);
  font-size: 13px;
  transform-origin: top left;
}

/* Subtle inner glow */
.context-menu::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 12px;
  padding: 1px;
  background: linear-gradient(135deg, var(--border-subtle) 0%, transparent 50%, transparent 100%);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

/* Backdrop */
.menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.2);
}

/* Header */
.menu-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-bottom: 1px solid var(--border-subtle);
}

.menu-type-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 3px 7px;
  border-radius: 5px;
  text-transform: uppercase;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.menu-type-badge.project {
  background: var(--type-project-bg);
  color: var(--type-project-text);
}
.menu-type-badge.task {
  background: var(--type-task-bg);
  color: var(--type-task-text);
}
.menu-type-badge.note {
  background: var(--type-note-bg);
  color: var(--type-note-text);
}
.menu-type-badge.milestone {
  background: var(--type-milestone-bg);
  color: var(--type-milestone-text);
}
.menu-type-badge.group {
  background: var(--type-group-bg);
  color: var(--type-group-text);
}
.menu-type-badge.person {
  background: var(--type-person-bg);
  color: var(--type-person-text);
}
.menu-type-badge.event {
  background: var(--type-event-bg);
  color: var(--type-event-text);
}
.menu-type-badge.topic {
  background: var(--type-topic-bg);
  color: var(--type-topic-text);
}
.menu-type-badge.organization {
  background: var(--type-organization-bg);
  color: var(--type-organization-text);
}
.menu-type-badge.component {
  background: var(--type-component-bg);
  color: var(--type-component-text);
}

.menu-title {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Divider */
.menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: linear-gradient(90deg, transparent, var(--border-subtle) 20%, var(--border-subtle) 80%, transparent);
}

/* Entrance/exit animations */
.menu-enter-active {
  animation: menu-in 0.2s var(--ease-out-expo);
}

.menu-leave-active {
  animation: menu-out 0.15s ease-in forwards;
}

@keyframes menu-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes menu-out {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.97);
  }
}

.backdrop-enter-active {
  animation: backdrop-in 0.2s ease;
}

.backdrop-leave-active {
  animation: backdrop-out 0.15s ease forwards;
}

@keyframes backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes backdrop-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .menu-enter-active,
  .menu-leave-active,
  .backdrop-enter-active,
  .backdrop-leave-active {
    animation: none;
  }
}
</style>
