<script setup>
import { getTypeIcon } from '../utils/constants.js'

const props = defineProps({
  node: { type: Object, required: true },
  level: { type: Number, default: 0 },
  currentContainerId: [Number, String],
  expandedIds: { type: Set, default: () => new Set() },
  maxLevel: { type: Number, default: 10 },
})

const emit = defineEmits(['enter', 'context-menu', 'toggle-expand'])

const INDENT_PX = 16

function getIndentStyle() {
  if (props.level === 0) return {}
  return { paddingLeft: `calc(var(--spacing-md) + ${props.level * INDENT_PX}px)` }
}
</script>

<template>
  <div
    class="sidebar-tree-item"
    :class="{ active: currentContainerId === node.id }"
    :style="getIndentStyle()"
    @contextmenu.prevent="emit('context-menu', $event, node)"
  >
    <button
      v-if="node.children?.length"
      class="tree-expand-btn"
      @click.stop="emit('toggle-expand', node.id)"
      :title="expandedIds.has(node.id) ? 'Collapse' : 'Expand'"
    >
      {{ expandedIds.has(node.id) ? '−' : '+' }}
    </button>
    <span v-else class="tree-spacer"></span>
    <span class="type-icon" :class="node.type"><span v-html="getTypeIcon(node.type)"></span></span>
    <span class="label" @click="emit('enter', node)">{{ node.title }}</span>
  </div>

  <!-- Recursively render children -->
  <template v-if="expandedIds.has(node.id) && node.children?.length && level < maxLevel">
    <SidebarTreeItem
      v-for="child in node.children"
      :key="child.id"
      :node="child"
      :level="level + 1"
      :current-container-id="currentContainerId"
      :expanded-ids="expandedIds"
      :max-level="maxLevel"
      @enter="emit('enter', $event)"
      @context-menu="(e, n) => emit('context-menu', e, n)"
      @toggle-expand="emit('toggle-expand', $event)"
    />
  </template>
</template>
