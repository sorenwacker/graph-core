<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import tippy from 'tippy.js'
import ViewSwitcher from './ViewSwitcher.vue'
import SettingsPanel from './SettingsPanel.vue'
import { useTheme } from '../composables/useTheme.js'

const { currentTheme, resolvedTheme, cycleTheme } = useTheme()

// Refs for tooltip targets
const sortBtn = ref(null)
const hideCompletedBtn = ref(null)
const undoBtn = ref(null)
const redoBtn = ref(null)
const settingsBtn = ref(null)
const themeBtn = ref(null)
const settingsDropdownRef = ref(null)

const themeTooltip = computed(() => {
  const labels = { light: 'Light', dark: 'Dark', system: 'System' }
  return `Theme: ${labels[currentTheme.value]} (click to change)`
})

let tippyInstances = []

onMounted(() => {
  const buttons = [
    { el: sortBtn.value, content: 'Sort A-Z' },
    { el: hideCompletedBtn.value, content: 'Toggle completed visibility' },
    { el: undoBtn.value, content: 'Undo (Cmd+Z)' },
    { el: redoBtn.value, content: 'Redo (Cmd+Shift+Z)' },
    { el: themeBtn.value, content: () => themeTooltip.value },
    { el: settingsBtn.value, content: 'Settings' }
  ]

  buttons.forEach(({ el, content }) => {
    if (el) {
      const instance = tippy(el, {
        content,
        placement: 'bottom',
        delay: [200, 0],
        duration: [150, 100],
        theme: 'toolbar'
      })
      tippyInstances.push(instance)
    }
  })

  // Add click outside listener for settings dropdown
  document.addEventListener('click', onDocumentClick)
})

// Handle click outside for settings dropdown
function onDocumentClick(e) {
  if (props.showSettings && settingsDropdownRef.value && !settingsDropdownRef.value.contains(e.target) && !e.target.closest('.settings-panel')) {
    emit('update:showSettings', false)
  }
}

onUnmounted(() => {
  tippyInstances.forEach(instance => instance.destroy())
  tippyInstances = []
  document.removeEventListener('click', onDocumentClick)
})

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
  // AI settings
  aiEnabled: { type: Boolean, default: true },
  aiProvider: { type: String, default: 'ollama' },
  // Ollama settings
  ollamaEndpoint: { type: String, default: 'http://localhost:11434' },
  ollamaModel: { type: String, default: 'llama3.2' },
  ollamaContextSize: { type: Number, default: 32768 },
  // OpenAI settings
  openaiEndpoint: { type: String, default: 'https://api.openai.com/v1' },
  openaiApiKey: { type: String, default: '' },
  openaiModel: { type: String, default: 'gpt-4o-mini' },
  // Legacy
  ollamaEnabled: { type: Boolean, default: false }
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
  'update:aiEnabled',
  'update:aiProvider',
  'update:ollamaEndpoint',
  'update:ollamaModel',
  'update:ollamaContextSize',
  'update:openaiEndpoint',
  'update:openaiApiKey',
  'update:openaiModel',
  'update:ollamaEnabled',
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan'
])
</script>

<template>
  <div class="toolbar">
    <ViewSwitcher
      :model-value="viewMode"
      @update:model-value="emit('update:viewMode', $event)"
    />
    <span class="toolbar-separator"></span>
    <button
      ref="sortBtn"
      :class="{ active: sortAlphabetically }"
      @click="emit('update:sortAlphabetically', !sortAlphabetically)"
      aria-label="Sort alphabetically"
      :aria-pressed="sortAlphabetically"
    >
      A-Z
    </button>
    <span class="toolbar-separator"></span>
    <button
      ref="hideCompletedBtn"
      class="icon-btn"
      :class="{ active: hideCompleted }"
      @click="emit('toggle-completed')"
      aria-label="Toggle completed items visibility"
      :aria-pressed="hideCompleted"
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
      ref="undoBtn"
      class="icon-btn"
      :disabled="!canUndo"
      @click="emit('undo')"
      aria-label="Undo"
    >
      &#x21A9;
    </button>
    <button
      ref="redoBtn"
      class="icon-btn"
      :disabled="!canRedo"
      @click="emit('redo')"
      aria-label="Redo"
    >
      &#x21AA;
    </button>
    <span class="toolbar-separator"></span>
    <button
      ref="themeBtn"
      class="icon-btn theme-btn"
      @click="cycleTheme"
      aria-label="Toggle theme"
    >
      <!-- Sun icon for light mode -->
      <svg v-if="resolvedTheme === 'light'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>
      <!-- Moon icon for dark mode -->
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </button>
    <div ref="settingsDropdownRef" class="settings-dropdown">
      <button
        ref="settingsBtn"
        class="settings-btn"
        @click="emit('update:showSettings', !showSettings)"
        aria-label="Open settings menu"
        :aria-expanded="showSettings"
      >
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
          :ai-enabled="aiEnabled"
          :ai-provider="aiProvider"
          :ollama-endpoint="ollamaEndpoint"
          :ollama-model="ollamaModel"
          :ollama-context-size="ollamaContextSize"
          :openai-endpoint="openaiEndpoint"
          :openai-api-key="openaiApiKey"
          :openai-model="openaiModel"
          :ollama-enabled="ollamaEnabled"
          @update:graph-detail-threshold="emit('update:graphDetailThreshold', $event)"
          @update:graph-max-depth="emit('update:graphMaxDepth', $event)"
          @update:graph-root-max-depth="emit('update:graphRootMaxDepth', $event)"
          @update:open-detail-fullscreen="emit('update:openDetailFullscreen', $event)"
          @update:hover-preview-enabled="emit('update:hoverPreviewEnabled', $event)"
          @update:ai-enabled="emit('update:aiEnabled', $event)"
          @update:ai-provider="emit('update:aiProvider', $event)"
          @update:ollama-endpoint="emit('update:ollamaEndpoint', $event)"
          @update:ollama-model="emit('update:ollamaModel', $event)"
          @update:ollama-context-size="emit('update:ollamaContextSize', $event)"
          @update:openai-endpoint="emit('update:openaiEndpoint', $event)"
          @update:openai-api-key="emit('update:openaiApiKey', $event)"
          @update:openai-model="emit('update:openaiModel', $event)"
          @update:ollama-enabled="emit('update:ollamaEnabled', $event)"
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
