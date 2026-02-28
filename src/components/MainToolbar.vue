<script setup>
import ViewSwitcher from './ViewSwitcher.vue'
import SettingsPanel from './SettingsPanel.vue'

const props = defineProps({
  viewMode: { type: String, required: true },
  sortAlphabetically: { type: Boolean, default: false },
  hideCompleted: { type: Boolean, default: false },
  canUndo: { type: Boolean, default: false },
  canRedo: { type: Boolean, default: false },
  showSettings: { type: Boolean, default: false },
  // Settings panel props
  graphDetailThreshold: { type: Number, default: 0 },
  graphMaxDepth: { type: Number, default: 0 },
  graphRootMaxDepth: { type: Number, default: 1 },
  openDetailFullscreen: { type: Boolean, default: false },
  hoverPreviewEnabled: { type: Boolean, default: true },
  snapshotMessage: { type: String, default: '' },
  showSnapshotList: { type: Boolean, default: false },
  availableSnapshots: { type: Array, default: () => [] },
  showLostFound: { type: Boolean, default: false },
  orphanedNodes: { type: Array, default: () => [] },
  // Ollama settings
  ollamaEnabled: { type: Boolean, default: false },
  ollamaEndpoint: { type: String, default: 'http://localhost:11434' },
  ollamaModel: { type: String, default: 'llama3.2' },
  ollamaContextSize: { type: Number, default: 32768 }
})

const emit = defineEmits([
  'update:viewMode',
  'update:sortAlphabetically',
  'toggle-completed',
  'undo',
  'redo',
  'update:showSettings',
  // Settings panel events
  'update:graphDetailThreshold',
  'update:graphMaxDepth',
  'update:graphRootMaxDepth',
  'update:openDetailFullscreen',
  'update:hoverPreviewEnabled',
  'update:ollamaEnabled',
  'update:ollamaEndpoint',
  'update:ollamaModel',
  'update:ollamaContextSize',
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan'
])

function handleClickOutside(e) {
  if (!e.target.closest('.settings-panel')) {
    emit('update:showSettings', false)
  }
}
</script>

<template>
  <div class="toolbar">
    <ViewSwitcher
      :model-value="viewMode"
      @update:model-value="emit('update:viewMode', $event)"
    />
    <span class="toolbar-separator"></span>
    <button
      :class="{ active: sortAlphabetically }"
      @click="emit('update:sortAlphabetically', !sortAlphabetically)"
      title="Sort current level A-Z"
    >
      A-Z
    </button>
    <span class="toolbar-separator"></span>
    <button
      class="icon-btn"
      :class="{ active: hideCompleted }"
      @click="emit('toggle-completed')"
      title="Toggle completed items visibility"
    >
      <svg v-if="!hideCompleted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      </svg>
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      </svg>
    </button>
    <span class="toolbar-separator"></span>
    <button
      class="icon-btn"
      :disabled="!canUndo"
      @click="emit('undo')"
      title="Undo (Cmd+Z)"
    >
      &#x21A9;
    </button>
    <button
      class="icon-btn"
      :disabled="!canRedo"
      @click="emit('redo')"
      title="Redo (Cmd+Shift+Z)"
    >
      &#x21AA;
    </button>
    <div class="settings-dropdown" v-click-outside="handleClickOutside">
      <button class="settings-btn" @click="emit('update:showSettings', !showSettings)" title="Settings">
        <span>...</span>
      </button>
      <Teleport to="body">
        <SettingsPanel
          v-if="showSettings"
          :graph-detail-threshold="graphDetailThreshold"
          :graph-max-depth="graphMaxDepth"
          :graph-root-max-depth="graphRootMaxDepth"
          :open-detail-fullscreen="openDetailFullscreen"
          :hover-preview-enabled="hoverPreviewEnabled"
          :snapshot-message="snapshotMessage"
          :show-snapshot-list="showSnapshotList"
          :available-snapshots="availableSnapshots"
          :show-lost-found="showLostFound"
          :orphaned-nodes="orphanedNodes"
          :ollama-enabled="ollamaEnabled"
          :ollama-endpoint="ollamaEndpoint"
          :ollama-model="ollamaModel"
          :ollama-context-size="ollamaContextSize"
          @update:graph-detail-threshold="emit('update:graphDetailThreshold', $event)"
          @update:graph-max-depth="emit('update:graphMaxDepth', $event)"
          @update:graph-root-max-depth="emit('update:graphRootMaxDepth', $event)"
          @update:open-detail-fullscreen="emit('update:openDetailFullscreen', $event)"
          @update:hover-preview-enabled="emit('update:hoverPreviewEnabled', $event)"
          @update:ollama-enabled="emit('update:ollamaEnabled', $event)"
          @update:ollama-endpoint="emit('update:ollamaEndpoint', $event)"
          @update:ollama-model="emit('update:ollamaModel', $event)"
          @update:ollama-context-size="emit('update:ollamaContextSize', $event)"
          @create-snapshot="emit('create-snapshot')"
          @toggle-snapshots="emit('toggle-snapshots')"
          @restore-snapshot="emit('restore-snapshot', $event)"
          @reload-database="emit('reload-database')"
          @toggle-lost-found="emit('toggle-lost-found')"
          @move-to-root="emit('move-to-root', $event)"
          @delete-orphan="emit('delete-orphan', $event)"
          @close="emit('update:showSettings', false)"
        />
      </Teleport>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.toolbar button {
  height: 28px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.15s;
}

.toolbar button:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.toolbar button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.toolbar button.active {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.toolbar-separator {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 4px;
}

.icon-btn {
  min-width: 28px;
}

.icon-btn svg {
  width: 16px;
  height: 16px;
}

.settings-dropdown {
  position: relative;
}

.settings-btn {
  min-width: 32px;
  font-weight: bold;
  letter-spacing: 2px;
}
</style>
