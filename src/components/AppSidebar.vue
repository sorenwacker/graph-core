<script setup>
import { ref, computed, watch } from 'vue'
import { getTypeIcon, getTypePlural, typeConfig, nodeTypes, getGraphColors } from '../utils/constants.js'
import { typeListingId } from '../utils/typeListings'
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
  /** [{ type, count }] for the types the workspace holds nodes of */
  typeCounts: { type: Array, default: () => [] },
  expandedIds: { type: Set, default: () => new Set() },
})

const emit = defineEmits([
  'toggle-pin',
  'enter',
  'context-menu',
  'toggle-expand',
  'select-tag',
  'navigate-tag',
  'navigate-type',
  'delete-tag',
  'navigate-root',
  'mouseenter',
  'mouseleave',
])

// Every type is also a tag: the legend doubles as the list of types, and a
// type with nodes opens the listing of all of them (utils/typeListings.ts).
// Tags keep their own section, so the tag entry stays a plain legend row.
const countByType = computed(() => Object.fromEntries(props.typeCounts.map(c => [c.type, c.count])))
const legendEntries = computed(() =>
  nodeTypes.map(t => {
    const count = countByType.value[t] || 0
    return {
      type: t,
      count,
      listable: t !== 'tag' && count > 0,
      active: props.currentContainerId === typeListingId(t),
    }
  })
)

function getTagColor(tagId) {
  const colors = getGraphColors('tag', tagId)
  return colors.border
}

// Local collapse state - persisted to localStorage
const treeCollapsed = ref(localStorage.getItem('sidebar-tree-collapsed') === 'true')
const favoritesCollapsed = ref(localStorage.getItem('sidebar-favorites-collapsed') === 'true')
const tagsCollapsed = ref(localStorage.getItem('sidebar-tags-collapsed') === 'true')
const legendCollapsed = ref(localStorage.getItem('sidebar-legend-collapsed') === 'true')

// Persist collapse state changes
watch(treeCollapsed, val => localStorage.setItem('sidebar-tree-collapsed', String(val)))
watch(favoritesCollapsed, val => localStorage.setItem('sidebar-favorites-collapsed', String(val)))
watch(tagsCollapsed, val => localStorage.setItem('sidebar-tags-collapsed', String(val)))
watch(legendCollapsed, val => localStorage.setItem('sidebar-legend-collapsed', String(val)))
</script>

<template>
  <aside
    class="sidebar"
    role="navigation"
    aria-label="Main navigation"
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
          :aria-label="pinned ? 'Unpin sidebar' : 'Pin sidebar'"
          :aria-pressed="pinned"
        >
          <span v-html="pinned ? '&#128205;' : '&#128204;'"></span>
        </button>
      </div>
    </div>

    <div class="sidebar-content">
      <!-- Favorites -->
      <div v-if="favoriteItems.length > 0" class="sidebar-section collapsible-section">
        <div class="sidebar-section-header" @click="favoritesCollapsed = !favoritesCollapsed">
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
          <span>Tags</span>
          <span class="section-count">{{ allTags.length }}</span>
        </div>
        <div v-show="!tagsCollapsed" class="sidebar-tags">
          <div
            v-for="tag in allTags"
            :key="'tag-' + (tag.id || tag)"
            class="sidebar-item tag-item"
            :class="{ active: tag.id && currentContainerId === tag.id }"
            @click="tag.id ? emit('navigate-tag', tag) : emit('select-tag', tag)"
          >
            <span v-if="tag.id" class="tag-dot" :style="{ backgroundColor: getTagColor(tag.id) }"></span>
            <span v-else class="tag-hash">#</span>
            <span class="label">{{ tag.title || tag }}</span>
            <button
              v-if="tag.id"
              class="tag-delete-btn"
              title="Delete tag everywhere"
              @click.stop="emit('delete-tag', tag)"
            >
              &times;
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="sidebar-legend collapsible-section">
      <div class="sidebar-section-header" @click="legendCollapsed = !legendCollapsed">
        <span>Legend</span>
      </div>
      <div v-show="!legendCollapsed" class="legend-items">
        <button
          v-for="entry in legendEntries"
          :key="entry.type"
          type="button"
          class="legend-item"
          :class="{ listable: entry.listable, active: entry.active }"
          :disabled="!entry.listable"
          :title="entry.listable ? `Show all ${getTypePlural(entry.type).toLowerCase()}` : undefined"
          :aria-label="entry.listable ? `Show all ${getTypePlural(entry.type).toLowerCase()}` : undefined"
          @click="entry.listable && emit('navigate-type', entry.type)"
        >
          <span
            class="legend-badge"
            :style="{ background: typeConfig[entry.type]?.bg, color: typeConfig[entry.type]?.text }"
            v-html="getTypeIcon(entry.type)"
          ></span>
          <span class="legend-label">{{ typeConfig[entry.type]?.label || entry.type }}</span>
          <span v-if="entry.count" class="legend-count">{{ entry.count }}</span>
        </button>
      </div>
      <div v-if="appVersion" class="app-version">v{{ appVersion }}</div>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-legend {
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}

.sidebar-legend .sidebar-section-header {
  padding: 8px 16px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.sidebar-legend .sidebar-section-header:hover {
  color: var(--text-secondary);
}

.sidebar-legend .legend-items {
  padding: 0 16px 12px;
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
  /* A button so a listing can be opened from the keyboard; styled as the row it was */
  border: none;
  background: transparent;
  padding: 2px 4px;
  margin: 0 -4px;
  border-radius: 4px;
  font: inherit;
  font-size: 11px;
  text-align: left;
  min-width: 0;
}

.legend-item:disabled {
  cursor: default;
}

.legend-item.listable {
  cursor: pointer;
}

.legend-item.listable:hover,
.legend-item.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.legend-item:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: -2px;
}

.legend-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-count {
  font-size: 0.65rem;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 1px 5px;
  border-radius: 8px;
  flex-shrink: 0;
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
  margin: 12px 16px;
  padding: 4px 8px;
  font-size: 10px;
  color: var(--text-tertiary, #888);
  text-align: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-item .label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-item.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.tag-delete-btn {
  flex-shrink: 0;
  visibility: hidden;
  border: none;
  background: transparent;
  color: var(--text-tertiary);
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  cursor: pointer;
  border-radius: 4px;
}

.tag-item:hover .tag-delete-btn {
  visibility: visible;
}

.tag-delete-btn:hover {
  color: var(--danger-color, #e74c3c);
  background: var(--bg-hover);
}
</style>
