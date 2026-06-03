<script setup>
import { ref } from 'vue'

defineProps({
  layoutMode: { type: String, required: true },
  relaxLocked: { type: Boolean, default: false },
  fitLocked: { type: Boolean, default: false },
  showExternalLinks: { type: Boolean, default: true },
  showRootNode: { type: Boolean, default: true },
  maxDepth: { type: Number, default: 0 },
  radialSettings: { type: Object, required: true },
  hasParent: { type: Boolean, default: false },
})

const emit = defineEmits([
  'set-layout',
  'relax-click',
  'fit-click',
  'reset-layout',
  'update:showExternalLinks',
  'update:showRootNode',
  'update:maxDepth',
  'apply-radial-settings',
  'update:radialSettings',
  'show-hotkey-help',
])

const showLayoutSettings = ref(false)
</script>

<template>
  <div class="graph-controls">
    <button
      class="icon-btn"
      @click="emit('set-layout', 'tree')"
      :class="{ active: layoutMode === 'tree' }"
      title="Vertical layout"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="12" y1="5" x2="12" y2="19" />
        <polyline points="19 12 12 19 5 12" />
      </svg>
    </button>
    <button
      class="icon-btn"
      @click="emit('set-layout', 'horizontal')"
      :class="{ active: layoutMode === 'horizontal' }"
      title="Horizontal layout"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </svg>
    </button>
    <button
      class="icon-btn"
      @click="emit('set-layout', 'radial')"
      :class="{ active: layoutMode === 'radial' }"
      title="Radial layout"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
    <button
      class="icon-btn"
      @click="emit('set-layout', 'grid')"
      :class="{ active: layoutMode === 'grid' }"
      title="Grid layout"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
      </svg>
    </button>
    <button
      class="icon-btn"
      @click="emit('set-layout', 'circle')"
      :class="{ active: layoutMode === 'circle' }"
      title="Circle layout"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
      </svg>
    </button>
    <span class="controls-separator"></span>
    <button
      class="icon-btn"
      @click="emit('relax-click')"
      :class="{ 'relax-locked': relaxLocked }"
      title="Relax layout (double-click to lock)"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 12c0-2 2-4 4-2s4-2 4-2 2-2 4 0 4 2 4 2" />
        <path d="M4 18c0-2 2-4 4-2s4-2 4-2 2-2 4 0 4 2 4 2" />
      </svg>
    </button>
    <button class="icon-btn" @click="emit('fit-click')" :class="{ 'fit-locked': fitLocked }" title="Fit to view">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    </button>
    <button class="icon-btn" @click="emit('reset-layout')" title="Reset layout">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>
    <span class="controls-separator"></span>
    <button
      class="icon-btn"
      @click="emit('update:showExternalLinks', !showExternalLinks)"
      :class="{ active: showExternalLinks }"
      title="Show external links"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </button>
    <button
      v-if="hasParent"
      class="icon-btn"
      @click="emit('update:showRootNode', !showRootNode)"
      :class="{ active: showRootNode }"
      title="Show root node"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    </button>
    <span class="controls-separator"></span>
    <div class="depth-control" title="Max depth">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v18M3 12h18M7 7l10 10M17 7l-10 10" />
      </svg>
      <select :value="maxDepth" @change="emit('update:maxDepth', Number($event.target.value))" class="depth-select">
        <option :value="0">All</option>
        <option :value="1">1</option>
        <option :value="2">2</option>
        <option :value="3">3</option>
        <option :value="4">4</option>
        <option :value="5">5</option>
      </select>
    </div>
    <span class="controls-separator"></span>
    <div class="layout-settings-wrapper">
      <button class="icon-btn" @click="showLayoutSettings = !showLayoutSettings" title="Layout settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
      <div v-if="showLayoutSettings" class="layout-settings-dropdown">
        <div class="layout-setting">
          <label>Node Repulsion: {{ radialSettings.nodeRepulsion }}</label>
          <input
            type="range"
            :value="radialSettings.nodeRepulsion"
            @input="emit('update:radialSettings', { ...radialSettings, nodeRepulsion: Number($event.target.value) })"
            min="100"
            max="10000"
            step="100"
          />
        </div>
        <div class="layout-setting">
          <label>Edge Length: {{ radialSettings.edgeLength }}</label>
          <input
            type="range"
            :value="radialSettings.edgeLength"
            @input="emit('update:radialSettings', { ...radialSettings, edgeLength: Number($event.target.value) })"
            min="20"
            max="1000"
            step="10"
          />
        </div>
        <div class="layout-setting">
          <label>Elasticity: {{ radialSettings.elasticity?.toFixed(2) }}</label>
          <input
            type="range"
            :value="radialSettings.elasticity"
            @input="emit('update:radialSettings', { ...radialSettings, elasticity: Number($event.target.value) })"
            min="0.1"
            max="1.5"
            step="0.05"
          />
        </div>
        <div class="layout-setting">
          <label>Gravity: {{ radialSettings.gravity }}</label>
          <input
            type="range"
            :value="radialSettings.gravity"
            @input="emit('update:radialSettings', { ...radialSettings, gravity: Number($event.target.value) })"
            min="0"
            max="50000"
            step="1000"
          />
        </div>
        <div class="layout-setting">
          <label>Iterations: {{ radialSettings.iterations }}</label>
          <input
            type="range"
            :value="radialSettings.iterations"
            @input="emit('update:radialSettings', { ...radialSettings, iterations: Number($event.target.value) })"
            min="1000"
            max="500000"
            step="1000"
          />
        </div>
        <button class="apply-btn" @click="emit('apply-radial-settings')">Apply</button>
      </div>
    </div>
    <span class="controls-separator"></span>
    <button class="icon-btn" @click="emit('show-hotkey-help')" title="Keyboard shortcuts">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/* Styles moved from GraphView.css */
.graph-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-radius: 6px;
  border: 1px solid var(--border-secondary);
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 4px;
  transition:
    background 0.15s,
    color 0.15s;
}

.icon-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.icon-btn.active {
  background: var(--accent-subtle);
  color: var(--accent);
}

.icon-btn.relax-locked,
.icon-btn.fit-locked {
  background: var(--accent-subtle);
  color: var(--accent);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.controls-separator {
  width: 1px;
  height: 20px;
  background: var(--border-secondary);
  margin: 0 4px;
}

.depth-control {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-secondary);
}

.depth-select {
  padding: 2px 4px;
  border: 1px solid var(--border-secondary);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;
}

.layout-settings-wrapper {
  position: relative;
}

.layout-settings-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-secondary);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  min-width: 200px;
}

.layout-setting {
  margin-bottom: 12px;
}

.layout-setting label {
  display: block;
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.layout-setting input[type='range'] {
  width: 100%;
}

.apply-btn {
  width: 100%;
  padding: 6px;
  border: none;
  border-radius: 4px;
  background: var(--accent);
  color: white;
  cursor: pointer;
  font-size: 12px;
}

.apply-btn:hover {
  background: var(--accent-hover);
}
</style>
