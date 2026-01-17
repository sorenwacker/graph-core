<script setup>
import { ref, watch } from 'vue'
import { api } from '../services/api'

const props = defineProps({
  visible: { type: Boolean, default: false },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  node: { type: Object, default: null },
  linkedNodes: { type: Array, default: () => [] },
  workspaces: { type: Array, default: () => [] }
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
  'delete'
])

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

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && node"
      class="node-context-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
      @click.stop
    >
      <div class="context-menu-header">
        <span class="context-menu-type" :class="node?.type">{{ node?.type }}</span>
        <span class="context-menu-title">{{ node?.title }}</span>
      </div>

      <!-- Primary actions -->
      <div class="context-menu-item" @click="viewDetails">
        <span class="context-icon">i</span>
        View Details
      </div>
      <div class="context-menu-item" @click="enter">
        <span class="context-icon">-></span>
        Enter
      </div>
      <div v-if="node?.type !== 'person'" class="context-menu-item" @click="addChild">
        <span class="context-icon">+</span>
        Add Child
      </div>

      <div class="context-menu-divider"></div>

      <!-- Toggle complete (non-person) -->
      <div v-if="node?.type !== 'person'" class="context-menu-item" @click="toggleComplete">
        <span class="context-icon">{{ node?.completed ? 'o' : 'v' }}</span>
        {{ node?.completed ? 'Mark Incomplete' : 'Mark Complete' }}
      </div>

      <!-- Toggle favorite -->
      <div class="context-menu-item" @click="toggleFavorite">
        <span class="context-icon">{{ node?.favorite ? '*' : '*' }}</span>
        {{ node?.favorite ? 'Remove Favorite' : 'Add Favorite' }}
      </div>

      <div class="context-menu-divider"></div>

      <!-- Linking -->
      <div class="context-menu-item" @click="openLinkSearch">
        <span class="context-icon">~</span>
        Link to...
      </div>

      <div v-if="linkedNodes.length > 0" class="context-menu-section">
        <span class="context-section-label">Linked ({{ linkedNodes.length }})</span>
        <div
          v-for="linked in linkedNodes"
          :key="linked.id"
          class="context-menu-link"
        >
          <span v-if="linked.type === 'person'" class="link-avatar" :style="{ backgroundColor: linked.color || '#3498db' }">
            {{ getInitials(linked.title) }}
          </span>
          <span v-else class="link-type-icon" :class="linked.type">{{ linked.type[0].toUpperCase() }}</span>
          <span class="link-title">{{ linked.title }}</span>
          <button class="unlink-btn" @click.stop="unlinkNode(linked)" title="Remove link">x</button>
        </div>
      </div>

      <div class="context-menu-divider"></div>

      <!-- Move to Workspace -->
      <div class="context-menu-section">
        <span class="context-section-label">Move to Workspace</span>
        <div
          class="context-menu-item workspace-item"
          :class="{ active: node?.workspace_id === null }"
          @click="moveToWorkspace('people')"
        >
          People
        </div>
        <div
          v-for="ws in workspaces"
          :key="ws.id"
          class="context-menu-item workspace-item"
          :class="{ active: node?.workspace_id === ws.id }"
          @click="moveToWorkspace(ws.id)"
        >
          {{ ws.name }}
        </div>
      </div>

      <div class="context-menu-divider"></div>

      <!-- Danger zone -->
      <div class="context-menu-item danger" @click="deleteNode">
        <span class="context-icon">x</span>
        Delete
      </div>
    </div>
    <div v-if="visible" class="context-menu-backdrop" @click="close"></div>
  </Teleport>
</template>

<style scoped>
.node-context-menu {
  position: fixed;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 8px 0;
  min-width: 200px;
  max-width: 280px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 10000;
  font-size: 13px;
}

.context-menu-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9999;
}

.context-menu-header {
  padding: 8px 12px;
  border-bottom: 1px solid #333;
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-menu-type {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #333;
  color: #888;
  text-transform: uppercase;
}

.context-menu-type.task { background: #3b82f6; color: white; }
.context-menu-type.project { background: #8b5cf6; color: white; }
.context-menu-type.folder { background: #f59e0b; color: white; }
.context-menu-type.note { background: #10b981; color: white; }
.context-menu-type.person { background: #e67e22; color: white; }
.context-menu-type.organization { background: #9b59b6; color: white; }
.context-menu-type.group { background: #1abc9c; color: white; }

.context-menu-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #fff;
  font-weight: 500;
}

.context-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ccc;
}

.context-menu-item:hover {
  background: #2a2a2a;
  color: #fff;
}

.context-menu-item.danger {
  color: #ef4444;
}

.context-menu-item.danger:hover {
  background: #ef4444;
  color: white;
}

.context-menu-item.workspace-item {
  padding-left: 24px;
  font-size: 12px;
}

.context-menu-item.workspace-item.active {
  color: #3b82f6;
  font-weight: 600;
}

.context-icon {
  width: 16px;
  text-align: center;
  font-size: 12px;
}

.context-menu-divider {
  height: 1px;
  background: #333;
  margin: 4px 0;
}

.context-menu-section {
  padding: 4px 0;
}

.context-section-label {
  display: block;
  padding: 4px 12px;
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
}

.context-menu-link {
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #aaa;
}

.context-menu-link:hover {
  background: #2a2a2a;
}

.link-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: white;
  font-weight: 600;
}

.link-type-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: #333;
  color: #888;
}

.link-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.unlink-btn {
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 2px 6px;
  font-size: 14px;
}

.unlink-btn:hover {
  color: #ef4444;
}
</style>
