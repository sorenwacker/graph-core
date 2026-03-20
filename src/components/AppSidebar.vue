<script setup>
import { ref, watch } from 'vue'
import { getTypeIcon, typeConfig, nodeTypes } from '../utils/constants.js'
import SidebarTreeItem from './SidebarTreeItem.vue'

const appVersion = ref(__APP_VERSION__)

const props = defineProps({
  visible: { type: Boolean, default: true },
  pinned: { type: Boolean, default: true },
  hovered: { type: Boolean, default: false },
  currentContainerId: [Number, String],
  selectedNodeId: Number,
  sidebarTree: { type: Array, default: () => [] },
  favoriteItems: { type: Array, default: () => [] },
  allTags: { type: Array, default: () => [] },
  expandedIds: { type: Set, default: () => new Set() }
})

const emit = defineEmits([
  'toggle-pin',
  'enter',
  'context-menu',
  'toggle-expand',
  'select-tag',
  'navigate-root',
  'mouseenter',
  'mouseleave'
])

// Local collapse state - persisted to localStorage
const treeCollapsed = ref(localStorage.getItem('sidebar-tree-collapsed') === 'true')
const favoritesCollapsed = ref(localStorage.getItem('sidebar-favorites-collapsed') === 'true')
const tagsCollapsed = ref(localStorage.getItem('sidebar-tags-collapsed') === 'true')

// Persist collapse state changes
watch(treeCollapsed, (val) => localStorage.setItem('sidebar-tree-collapsed', String(val)))
watch(favoritesCollapsed, (val) => localStorage.setItem('sidebar-favorites-collapsed', String(val)))
watch(tagsCollapsed, (val) => localStorage.setItem('sidebar-tags-collapsed', String(val)))
</script>

<template>
  <aside
    class="sidebar"
    :class="{ collapsed: !visible && pinned, pinned: pinned, show: hovered }"
    @mouseenter="emit('mouseenter')"
    @mouseleave="emit('mouseleave')"
  >
    <div class="sidebar-header" @mouseenter="emit('mouseenter')">
      <div class="sidebar-header-row" @mouseenter="emit('mouseenter')">
        <h2 @mouseenter="emit('mouseenter')">Graph Core</h2>
        <button
          class="sidebar-pin-btn"
          :class="{ active: pinned }"
          @click.stop="emit('toggle-pin')"
          @mouseenter="emit('mouseenter')"
          :title="pinned ? 'Unpin sidebar' : 'Pin sidebar'"
        >
          <span v-html="pinned ? '&#128205;' : '&#128204;'"></span>
        </button>
      </div>
    </div>

    <!-- Root (sticky, does not scroll) -->
    <div class="sidebar-section sidebar-root-section">
      <div
        class="sidebar-item"
        :class="{ active: currentContainerId === null }"
        @click="emit('navigate-root')"
      >
        <span class="icon">~</span>
        <span class="label">Root</span>
      </div>
    </div>

    <div class="sidebar-content">
      <!-- Favorites -->
      <div v-if="favoriteItems.length > 0" class="sidebar-section collapsible-section">
        <div class="sidebar-section-header" @click="favoritesCollapsed = !favoritesCollapsed">
          <span class="collapse-btn">{{ favoritesCollapsed ? '+' : '-' }}</span>
          <span>Favorites</span>
          <span class="section-count">{{ favoriteItems.length }}</span>
        </div>
        <div v-show="!favoritesCollapsed">
          <div
            v-for="item in favoriteItems"
            :key="'fav-' + item.id"
            class="sidebar-item favorite-item"
            :class="{ active: selectedNodeId === item.id }"
            @click="emit('enter', item)"
          >
            <span class="favorite-star">&#9733;</span>
            <span class="type-icon" :class="item.type"><span v-html="getTypeIcon(item.type)"></span></span>
            <span class="label">{{ item.title }}</span>
          </div>
        </div>
      </div>

      <!-- Global Tree -->
      <div class="sidebar-section collapsible-section">
        <div class="sidebar-section-header" @click="treeCollapsed = !treeCollapsed">
          <span class="collapse-btn">{{ treeCollapsed ? '+' : '-' }}</span>
          <span>Tree</span>
        </div>
        <div v-show="!treeCollapsed" class="sidebar-tree">
          <SidebarTreeItem
            v-for="node in sidebarTree"
            :key="node.id"
            :node="node"
            :level="0"
            :current-container-id="currentContainerId"
            :expanded-ids="expandedIds"
            @enter="emit('enter', $event)"
            @context-menu="(e, n) => emit('context-menu', e, n)"
            @toggle-expand="emit('toggle-expand', $event)"
          />
        </div>
      </div>

      <!-- Tags -->
      <div v-if="allTags.length > 0" class="sidebar-section collapsible-section">
        <div class="sidebar-section-header" @click="tagsCollapsed = !tagsCollapsed">
          <span class="collapse-btn">{{ tagsCollapsed ? '+' : '-' }}</span>
          <span>Tags</span>
          <span class="section-count">{{ allTags.length }}</span>
        </div>
        <div v-show="!tagsCollapsed" class="sidebar-tags">
          <div
            v-for="tag in allTags"
            :key="'tag-' + tag"
            class="sidebar-item tag-item"
            @click="emit('select-tag', tag)"
          >
            <span class="tag-hash">#</span>
            <span class="label">{{ tag }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="sidebar-legend">
      <div class="legend-title">Node Types</div>
      <div class="legend-items">
        <div v-for="t in nodeTypes" :key="t" class="legend-item">
          <span
            class="legend-badge"
            :style="{ background: typeConfig[t]?.bg, color: typeConfig[t]?.text }"
            v-html="getTypeIcon(t)"
          ></span>
          {{ typeConfig[t]?.label || t }}
        </div>
      </div>
      <div v-if="appVersion" class="app-version">v{{ appVersion }}</div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-legend {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}

.legend-title {
  display: none;
}

.legend-items {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--text-secondary);
}

.legend-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  font-size: 10px;
  flex-shrink: 0;
}

.legend-badge :deep(svg) {
  width: 13px;
  height: 13px;
}

.app-version {
  margin-top: 12px;
  font-size: 10px;
  color: var(--text-tertiary, #888);
  text-align: center;
}
</style>
