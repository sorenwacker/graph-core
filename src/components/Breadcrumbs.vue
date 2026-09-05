<script setup>
import { ref } from 'vue'
import { ROOT_DROP_ACTIVE_CLASS, nodeIdFromDragEvent } from '../utils/rootDropTarget.js'

defineProps({
  breadcrumbs: { type: Array, default: () => [] },
})

const emit = defineEmits(['navigate', 'drop-to-root'])

// Cards view drags with native drag-and-drop, so the crumb handles those drops
// itself. Graph and table view track the pointer instead and mark this element
// through rootDropTarget.js, which is why the class name is shared.
const dropActive = ref(false)

function onDragEnter(e) {
  e.preventDefault()
  dropActive.value = true
}

function onDragOver(e) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dropActive.value = true
}

function onDragLeave() {
  dropActive.value = false
}

function onDrop(e) {
  e.preventDefault()
  dropActive.value = false
  const nodeId = nodeIdFromDragEvent(e)
  if (nodeId !== null) emit('drop-to-root', nodeId)
}
</script>

<template>
  <nav class="header-breadcrumbs" aria-label="Breadcrumb navigation">
    <div class="breadcrumb-path">
      <span
        class="crumb home-crumb"
        :class="{ [ROOT_DROP_ACTIVE_CLASS]: dropActive }"
        title="Drop a node here to move it to the top level"
        @click="emit('navigate', -1)"
        @dragenter="onDragEnter"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
      </span>
      <template v-for="(crumb, index) in breadcrumbs" :key="crumb.id">
        <span class="crumb-sep">/</span>
        <span
          class="crumb"
          :class="{ current: index === breadcrumbs.length - 1 }"
          @click="index < breadcrumbs.length - 1 ? emit('navigate', index) : null"
        >
          {{ crumb.title }}
        </span>
      </template>
    </div>
    <div id="view-controls-target"></div>
  </nav>
</template>

<style scoped>
.header-breadcrumbs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px 8px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  min-height: 36px;
}

.breadcrumb-path {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 1rem;
  overflow: hidden;
}

.crumb {
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s;
  white-space: nowrap;
  padding: 4px 8px;
  border-radius: 4px;
}

.crumb:hover {
  color: var(--accent-color);
  background: var(--bg-hover);
}

.crumb.current {
  color: var(--text-primary);
  font-weight: 500;
  cursor: default;
}

.crumb.current:hover {
  color: var(--text-primary);
}

.crumb-sep {
  color: var(--text-tertiary);
}

.home-crumb {
  position: relative;
  display: inline-flex;
  align-items: center;
  transition:
    color 0.15s,
    background 0.15s,
    box-shadow 0.15s,
    transform 0.15s;
}

/* Applied by this component for native drops, and by rootDropTarget.js for the
   graph and table drags that are tracked by pointer position. The glow matches
   the graph's node highlight rather than a flat outline. No label: the table
   ghost already names the action, and anything drawn below the icon sits under
   the cursor. */
.home-crumb.drop-target {
  color: var(--accent-color);
  background: color-mix(in srgb, var(--accent-color) 22%, transparent);
  box-shadow:
    inset 0 0 0 1.5px var(--accent-color),
    0 0 0 4px color-mix(in srgb, var(--accent-color) 22%, transparent),
    0 0 16px color-mix(in srgb, var(--accent-color) 60%, transparent);
  transform: scale(1.18);
}

/* The icon carries the accent while it is a live target. */
.home-crumb.drop-target svg {
  stroke-width: 2.4;
}

@media (prefers-reduced-motion: reduce) {
  .home-crumb,
  .home-crumb.drop-target {
    transition: none;
    transform: none;
  }
}
</style>
