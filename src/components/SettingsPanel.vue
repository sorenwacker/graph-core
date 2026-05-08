<script setup>
import { ref, onMounted } from 'vue'
import { api } from '../services/api.js'
import { useErrorHandler } from '../composables/useErrorHandler.js'
import { demoWorkspaceExists } from '../utils/demoData.js'
import GeneralSettings from './settings/GeneralSettings.vue'
import AISettings from './settings/AISettings.vue'
import DataSettings from './settings/DataSettings.vue'
import AboutSettings from './settings/AboutSettings.vue'

const { handleError } = useErrorHandler()

const props = defineProps({
  graphDetailThreshold: { type: Number, required: true },
  graphMaxDepth: { type: Number, required: true },
  graphRootMaxDepth: { type: Number, required: true },
  graphNotesPreviewLength: { type: Number, default: 200 },
  openDetailFullscreen: { type: Boolean, required: true },
  hoverPreviewEnabled: { type: Boolean, required: true },
  inheritColors: { type: Boolean, default: true },
  showHintBar: { type: Boolean, default: true },
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
  openaiSkipSslVerification: { type: Boolean, default: false },
  // Legacy
  ollamaEnabled: { type: Boolean, default: false },
  // Import
  currentWorkspace: { type: String, default: 'work' },
})

const emit = defineEmits([
  'update:graphDetailThreshold',
  'update:graphMaxDepth',
  'update:graphRootMaxDepth',
  'update:graphNotesPreviewLength',
  'update:openDetailFullscreen',
  'update:hoverPreviewEnabled',
  'update:inheritColors',
  'update:showHintBar',
  // AI settings
  'update:aiEnabled',
  'update:aiProvider',
  'update:ollamaEndpoint',
  'update:ollamaModel',
  'update:ollamaContextSize',
  'update:openaiEndpoint',
  'update:openaiApiKey',
  'update:openaiModel',
  'update:openaiSkipSslVerification',
  // Legacy
  'update:ollamaEnabled',
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan',
  'close',
  'import-complete',
  'show-onboarding',
  'create-demo',
  'reset-demo',
])

// Tab navigation
const activeTab = ref('general')

// App version
const appVersion = ref('--')

// Demo workspace status
const demoExists = ref(false)

// Data storage path
const dataPath = ref('')

// Fetch app info on mount
onMounted(async () => {
  // Fetch app version
  try {
    appVersion.value = await api.getVersion()
  } catch (e) {
    handleError(e, { context: 'Fetching app version', silent: true })
    appVersion.value = 'Unknown'
  }

  // Check if demo workspace exists
  demoExists.value = await demoWorkspaceExists(api)

  // Get data storage path
  try {
    dataPath.value = await api.getDataPath()
  } catch (e) {
    handleError(e, { context: 'Fetching data path', silent: true })
    dataPath.value = ''
  }
})
</script>

<template>
  <div class="settings-panel" @click.stop>
    <div class="settings-container">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="close-btn" @click="emit('close')" title="Close settings">&times;</button>
      </div>

      <div class="settings-tabs">
        <button class="settings-tab" :class="{ active: activeTab === 'general' }" @click="activeTab = 'general'">
          General
        </button>
        <button class="settings-tab" :class="{ active: activeTab === 'ai' }" @click="activeTab = 'ai'">AI</button>
        <button class="settings-tab" :class="{ active: activeTab === 'data' }" @click="activeTab = 'data'">Data</button>
        <button class="settings-tab" :class="{ active: activeTab === 'about' }" @click="activeTab = 'about'">
          About
        </button>
      </div>

      <!-- Tab content - each wrapped in template for v-if since child components have multiple roots -->
      <div v-if="activeTab === 'general'" class="settings-grid">
        <GeneralSettings
          :graph-detail-threshold="graphDetailThreshold"
          :graph-max-depth="graphMaxDepth"
          :graph-root-max-depth="graphRootMaxDepth"
          :graph-notes-preview-length="graphNotesPreviewLength"
          :open-detail-fullscreen="openDetailFullscreen"
          :hover-preview-enabled="hoverPreviewEnabled"
          :inherit-colors="inheritColors"
          :show-hint-bar="showHintBar"
          @update:graph-detail-threshold="emit('update:graphDetailThreshold', $event)"
          @update:graph-max-depth="emit('update:graphMaxDepth', $event)"
          @update:graph-root-max-depth="emit('update:graphRootMaxDepth', $event)"
          @update:graph-notes-preview-length="emit('update:graphNotesPreviewLength', $event)"
          @update:open-detail-fullscreen="emit('update:openDetailFullscreen', $event)"
          @update:hover-preview-enabled="emit('update:hoverPreviewEnabled', $event)"
          @update:inherit-colors="emit('update:inheritColors', $event)"
          @update:show-hint-bar="emit('update:showHintBar', $event)"
        />
      </div>

      <div v-if="activeTab === 'ai'" class="settings-grid">
        <AISettings
          :ai-enabled="aiEnabled"
          :ai-provider="aiProvider"
          :ollama-endpoint="ollamaEndpoint"
          :ollama-model="ollamaModel"
          :ollama-context-size="ollamaContextSize"
          :openai-endpoint="openaiEndpoint"
          :openai-api-key="openaiApiKey"
          :openai-model="openaiModel"
          :openai-skip-ssl-verification="openaiSkipSslVerification"
          :ollama-enabled="ollamaEnabled"
          @update:ai-enabled="emit('update:aiEnabled', $event)"
          @update:ai-provider="emit('update:aiProvider', $event)"
          @update:ollama-endpoint="emit('update:ollamaEndpoint', $event)"
          @update:ollama-model="emit('update:ollamaModel', $event)"
          @update:ollama-context-size="emit('update:ollamaContextSize', $event)"
          @update:openai-endpoint="emit('update:openaiEndpoint', $event)"
          @update:openai-api-key="emit('update:openaiApiKey', $event)"
          @update:openai-model="emit('update:openaiModel', $event)"
          @update:openai-skip-ssl-verification="emit('update:openaiSkipSslVerification', $event)"
          @update:ollama-enabled="emit('update:ollamaEnabled', $event)"
        />
      </div>

      <div v-if="activeTab === 'data'" class="settings-grid">
        <DataSettings
          :snapshot-message="snapshotMessage"
          :show-snapshot-list="showSnapshotList"
          :available-snapshots="availableSnapshots"
          :show-lost-found="showLostFound"
          :orphaned-nodes="orphanedNodes"
          :data-path="dataPath"
          :current-workspace="currentWorkspace"
          @create-snapshot="emit('create-snapshot')"
          @toggle-snapshots="emit('toggle-snapshots')"
          @restore-snapshot="emit('restore-snapshot', $event)"
          @reload-database="emit('reload-database')"
          @toggle-lost-found="emit('toggle-lost-found')"
          @move-to-root="emit('move-to-root', $event)"
          @delete-orphan="emit('delete-orphan', $event)"
          @import-complete="emit('import-complete', $event)"
        />
      </div>

      <div v-if="activeTab === 'about'" class="settings-grid">
        <AboutSettings
          :app-version="appVersion"
          :demo-exists="demoExists"
          @show-onboarding="emit('show-onboarding')"
          @create-demo="emit('create-demo')"
          @reset-demo="emit('reset-demo')"
        />
      </div>
    </div>
  </div>
</template>

<style src="./SettingsPanel.css"></style>
