<script setup>
import { ref, computed } from 'vue'
import { calculateMenuPosition } from '../utils/menuPosition'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  node: { type: Object, default: null },
  linkedNodes: { type: Array, default: () => [] },
  workspaces: { type: Array, default: () => [] }
})

const menuRef = ref(null)

// Compute position keeping menu in viewport
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
  'unlink',
  'move-to-workspace',
  'delete',
  'open-in-window'
])

// Check if running in Electron (for open in window option)
const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.openDetachedWindow

function close() {
  emit('close')
}

function viewDetails() {
  emit('view-details', props.node)
  close()
}

function enter() {
  emit('enter', props.node)
  close()
}

function addChild() {
  emit('add-child', props.node)
  close()
}

function toggleComplete() {
  emit('toggle-complete', props.node)
}

function toggleFavorite() {
  emit('toggle-favorite', props.node)
}

function openLinkSearch() {
  emit('open-link-search', props.node)
  close()
}

function unlinkNode(linked) {
  emit('unlink', { source: props.node, target: linked })
}

function moveToWorkspace(workspaceId) {
  emit('move-to-workspace', { node: props.node, workspaceId })
  close()
}

function deleteNode() {
  emit('delete', props.node)
  close()
}

function openInWindow() {
  emit('open-in-window', props.node)
  close()
}

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="menu">
      <div
        v-if="visible && node"
        ref="menuRef"
        class="context-menu"
        :style="menuStyle"
        @click.stop
      >
        <!-- Header with node info -->
        <div class="menu-header">
          <span class="menu-type-badge" :class="node?.type">{{ node?.type }}</span>
          <span class="menu-title">{{ node?.title }}</span>
        </div>

        <!-- Primary actions -->
        <div class="menu-group">
          <button class="menu-item" @click="viewDetails">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 16v-4M12 8h.01"/>
            </svg>
            <span>View Details</span>
            <kbd class="menu-shortcut">Enter</kbd>
          </button>

          <button v-if="isElectron" class="menu-item" @click="openInWindow">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            <span>Open in Window</span>
          </button>

          <button class="menu-item" @click="enter">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M15 3h6v6M14 10l6.1-6.1M9 21H3v-6M10 14l-6.1 6.1"/>
            </svg>
            <span>Enter</span>
          </button>

          <button v-if="node?.type !== 'person'" class="menu-item" @click="addChild">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 8v8M8 12h8"/>
            </svg>
            <span>Add Child</span>
            <kbd class="menu-shortcut">Cmd+Click</kbd>
          </button>
        </div>

        <div class="menu-divider"></div>

        <!-- Status toggles -->
        <div class="menu-group">
          <button v-if="node?.type !== 'person'" class="menu-item" @click="toggleComplete">
            <svg v-if="node?.completed" class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <svg v-else class="menu-icon completed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            <span>{{ node?.completed ? 'Mark Incomplete' : 'Mark Complete' }}</span>
          </button>

          <button class="menu-item" @click="toggleFavorite">
            <svg v-if="node?.favorite" class="menu-icon starred" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <svg v-else class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            <span>{{ node?.favorite ? 'Remove Favorite' : 'Add Favorite' }}</span>
          </button>
        </div>

        <div class="menu-divider"></div>

        <!-- Linking section -->
        <div class="menu-group">
          <button class="menu-item" @click="openLinkSearch">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>Link to...</span>
          </button>
        </div>

        <!-- Linked nodes list -->
        <div v-if="linkedNodes.length > 0" class="menu-section">
          <div class="section-header">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span>Linked</span>
            <span class="section-count">{{ linkedNodes.length }}</span>
          </div>
          <div class="linked-list">
            <div
              v-for="linked in linkedNodes"
              :key="linked.id"
              class="linked-item"
            >
              <span v-if="linked.type === 'person'" class="linked-avatar" :style="{ backgroundColor: linked.color || 'var(--type-person-bg)' }">
                {{ getInitials(linked.title) }}
              </span>
              <span v-else class="linked-type" :class="linked.type">
                {{ linked.type[0].toUpperCase() }}
              </span>
              <span class="linked-title">{{ linked.title }}</span>
              <button class="unlink-btn" @click.stop="unlinkNode(linked)" title="Remove link">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div class="menu-divider"></div>

        <!-- Workspace section -->
        <div class="menu-section">
          <div class="section-header">
            <svg class="section-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            <span>Move to Workspace</span>
          </div>
          <div class="workspace-list">
            <button
              class="workspace-item"
              :class="{ active: node?.workspace_id === null }"
              @click="moveToWorkspace('people')"
            >
              <svg class="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span>People</span>
            </button>
            <button
              v-for="ws in workspaces"
              :key="ws.id"
              class="workspace-item"
              :class="{ active: node?.workspace_id === ws.id }"
              @click="moveToWorkspace(ws.id)"
            >
              <svg class="workspace-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                <line x1="3" y1="9" x2="21" y2="9"/>
                <line x1="9" y1="21" x2="9" y2="9"/>
              </svg>
              <span>{{ ws.name }}</span>
            </button>
          </div>
        </div>

        <div class="menu-divider"></div>

        <!-- Danger zone -->
        <div class="menu-group">
          <button class="menu-item danger" @click="deleteNode">
            <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              <line x1="10" y1="11" x2="10" y2="17"/>
              <line x1="14" y1="11" x2="14" y2="17"/>
            </svg>
            <span>Delete</span>
            <kbd class="menu-shortcut">Opt+Cmd+Click</kbd>
          </button>
        </div>
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
  background: rgba(12, 12, 12, 0.95);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.5),
    0 8px 40px rgba(0, 0, 0, 0.6),
    0 0 80px rgba(0, 0, 0, 0.4);
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
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.1) 0%,
    transparent 50%,
    transparent 100%
  );
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
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
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.menu-type-badge {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.5px;
  padding: 3px 7px;
  border-radius: 5px;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-secondary);
}

.menu-type-badge.project { background: var(--type-project-bg); color: var(--type-project-text); }
.menu-type-badge.task { background: var(--type-task-bg); color: var(--type-task-text); }
.menu-type-badge.note { background: var(--type-note-bg); color: var(--type-note-text); }
.menu-type-badge.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.menu-type-badge.group { background: var(--type-group-bg); color: var(--type-group-text); }
.menu-type-badge.person { background: var(--type-person-bg); color: var(--type-person-text); }
.menu-type-badge.event { background: var(--type-event-bg); color: var(--type-event-text); }
.menu-type-badge.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.menu-type-badge.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }
.menu-type-badge.component { background: var(--type-component-bg); color: var(--type-component-text); }

.menu-title {
  flex: 1;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Menu groups */
.menu-group {
  padding: 2px 0;
}

/* Menu items */
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
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary);
}

.menu-item:hover .menu-icon {
  color: var(--accent-color);
  transform: scale(1.1);
}

.menu-item:active {
  background: rgba(255, 255, 255, 0.12);
  transform: scale(0.98);
}

/* Icons */
.menu-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: all 0.2s var(--ease-out-expo);
}

.menu-icon.completed {
  color: var(--success-color);
}

.menu-icon.starred {
  color: var(--warning-color);
}

/* Keyboard shortcuts */
.menu-shortcut {
  margin-left: auto;
  font-size: 10px;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-tertiary);
  border: none;
}

/* Divider */
.menu-divider {
  height: 1px;
  margin: 4px 8px;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.08) 20%,
    rgba(255, 255, 255, 0.08) 80%,
    transparent
  );
}

/* Sections */
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

.section-icon {
  width: 12px;
  height: 12px;
  opacity: 0.6;
}

.section-count {
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 10px;
}

/* Linked items */
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
  background: rgba(255, 255, 255, 0.05);
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
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-tertiary);
}

.linked-type.project { background: var(--type-project-bg); color: var(--type-project-text); }
.linked-type.task { background: var(--type-task-bg); color: var(--type-task-text); }
.linked-type.note { background: var(--type-note-bg); color: var(--type-note-text); }
.linked-type.milestone { background: var(--type-milestone-bg); color: var(--type-milestone-text); }
.linked-type.event { background: var(--type-event-bg); color: var(--type-event-text); }
.linked-type.topic { background: var(--type-topic-bg); color: var(--type-topic-text); }
.linked-type.organization { background: var(--type-organization-bg); color: var(--type-organization-text); }
.linked-type.component { background: var(--type-component-bg); color: var(--type-component-text); }

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

/* Workspace list */
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
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

.workspace-item.active {
  background: var(--accent-subtle);
  color: var(--accent-color);
}

.workspace-item.active .workspace-icon {
  color: var(--accent-color);
}

.workspace-icon {
  width: 14px;
  height: 14px;
  opacity: 0.6;
}

/* Danger items */
.menu-item.danger {
  color: var(--error-color);
}

.menu-item.danger:hover {
  background: rgba(239, 68, 68, 0.12);
  color: var(--error-color);
}

.menu-item.danger:hover .menu-icon {
  color: var(--error-color);
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
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes backdrop-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .menu-enter-active,
  .menu-leave-active,
  .backdrop-enter-active,
  .backdrop-leave-active {
    animation: none;
  }

  .menu-item,
  .menu-icon {
    transition: none;
  }
}
</style>
