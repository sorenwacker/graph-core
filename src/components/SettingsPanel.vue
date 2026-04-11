<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '../services/api.js'
import { useOllama } from '../composables/useOllama.js'
import { useTheme } from '../composables/useTheme.js'

const { presetPrompts, savePrompt, deletePrompt, resetPrompt, isPromptModified, isDefaultPrompt } = useOllama()

const { currentTheme, setTheme, themes } = useTheme()

const props = defineProps({
  graphDetailThreshold: { type: Number, required: true },
  graphMaxDepth: { type: Number, required: true },
  graphRootMaxDepth: { type: Number, required: true },
  graphNotesPreviewLength: { type: Number, default: 200 },
  openDetailFullscreen: { type: Boolean, required: true },
  hoverPreviewEnabled: { type: Boolean, required: true },
  inheritColors: { type: Boolean, default: true },
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
])

const ollamaConnectionStatus = ref(null) // null, 'testing', 'success', 'error'
const ollamaConnectionError = ref('')
const ollamaModels = ref([])
const ollamaModelsLoading = ref(false)

const openaiConnectionStatus = ref(null)
const openaiConnectionError = ref('')
const openaiModels = ref([])
const openaiModelsLoading = ref(false)

// Debounce timeout refs
let ollamaFetchTimeout = null
let openaiFetchTimeout = null

// Tab navigation
const activeTab = ref('general')

// Prompt management
const showPromptEditor = ref(false)
const showPromptList = ref(false)
const editingPrompt = ref(null)
const promptForm = ref({ id: '', label: '', prompt: '' })

function openPromptEditor(prompt = null) {
  if (prompt) {
    editingPrompt.value = prompt.id
    promptForm.value = { ...prompt }
  } else {
    editingPrompt.value = null
    promptForm.value = { id: '', label: '', prompt: '' }
  }
  showPromptEditor.value = true
}

function closePromptEditor() {
  showPromptEditor.value = false
  editingPrompt.value = null
  promptForm.value = { id: '', label: '', prompt: '' }
}

function handleSavePrompt() {
  if (!promptForm.value.label.trim() || !promptForm.value.prompt.trim()) return

  const id = editingPrompt.value || promptForm.value.label.toLowerCase().replace(/\s+/g, '-')
  savePrompt({
    id,
    label: promptForm.value.label.trim(),
    prompt: promptForm.value.prompt.trim(),
  })
  closePromptEditor()
}

function handleDeletePrompt(id) {
  deletePrompt(id)
}

function handleResetPrompt(id) {
  resetPrompt(id)
}

function formatSnapshotDate(timestamp) {
  if (!timestamp) return 'Unknown'
  const d = new Date(timestamp)
  return d.toLocaleString()
}

// Import functionality
const importFileInput = ref(null)
const importType = ref('json')
const importAccept = computed(() => (importType.value === 'json' ? '.json' : '.csv'))

function triggerImport(type) {
  importType.value = type
  // Need to wait for accept attribute to update
  setTimeout(() => {
    importFileInput.value?.click()
  }, 0)
}

async function handleImportFile(e) {
  const file = e.target.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    let result

    if (importType.value === 'json') {
      const data = JSON.parse(text)
      result = await api.importJSON(data, null, props.currentWorkspace)
    } else {
      result = await api.importCSV(text, null, props.currentWorkspace)
    }

    emit('import-complete', result)
    alert(`Imported ${result.nodesImported} nodes${result.linksCreated ? ` and ${result.linksCreated} links` : ''}`)
  } catch (err) {
    alert(`Import failed: ${err.message}`)
  }

  // Reset file input
  e.target.value = ''
}

async function testOllamaConnection() {
  ollamaConnectionStatus.value = 'testing'
  ollamaConnectionError.value = ''

  try {
    const result = await api.ollamaTestConnection(props.ollamaEndpoint)
    if (result.success) {
      ollamaConnectionStatus.value = 'success'
      // Also fetch available models
      try {
        ollamaModels.value = await api.ollamaListModels(props.ollamaEndpoint)
      } catch {
        ollamaModels.value = []
      }
    } else {
      ollamaConnectionStatus.value = 'error'
      ollamaConnectionError.value = result.error || 'Connection failed'
    }
  } catch (error) {
    ollamaConnectionStatus.value = 'error'
    ollamaConnectionError.value = error.message || 'Connection failed'
  }
}

async function testOpenaiConnection() {
  openaiConnectionStatus.value = 'testing'
  openaiConnectionError.value = ''

  try {
    const result = await api.openaiTestConnection(
      props.openaiEndpoint,
      props.openaiApiKey,
      props.openaiSkipSslVerification
    )
    if (result.success) {
      openaiConnectionStatus.value = 'success'
      // Also fetch available models
      try {
        openaiModels.value = await api.openaiListModels(
          props.openaiEndpoint,
          props.openaiApiKey,
          props.openaiSkipSslVerification
        )
      } catch {
        openaiModels.value = []
      }
    } else {
      openaiConnectionStatus.value = 'error'
      openaiConnectionError.value = result.error || 'Connection failed'
    }
  } catch (error) {
    openaiConnectionStatus.value = 'error'
    openaiConnectionError.value = error.message || 'Connection failed'
  }
}

// Computed for current provider's enabled state
const isAiEnabled = computed(() => props.aiEnabled ?? props.ollamaEnabled)

// Fetch Ollama models without full connection test
async function fetchOllamaModels() {
  if (!props.ollamaEndpoint) return

  ollamaModelsLoading.value = true
  try {
    ollamaModels.value = await api.ollamaListModels(props.ollamaEndpoint)
    // If we got models, connection is working
    if (ollamaModels.value.length > 0) {
      ollamaConnectionStatus.value = 'success'
      ollamaConnectionError.value = ''
    }
  } catch {
    ollamaModels.value = []
  } finally {
    ollamaModelsLoading.value = false
  }
}

// Fetch OpenAI models without full connection test
async function fetchOpenaiModels() {
  if (!props.openaiEndpoint || !props.openaiApiKey) return

  openaiModelsLoading.value = true
  openaiConnectionError.value = ''
  try {
    openaiModels.value = await api.openaiListModels(
      props.openaiEndpoint,
      props.openaiApiKey,
      props.openaiSkipSslVerification
    )
    // If we got models, connection is working
    if (openaiModels.value.length > 0) {
      openaiConnectionStatus.value = 'success'
      openaiConnectionError.value = ''
    }
  } catch (error) {
    openaiModels.value = []
    openaiConnectionStatus.value = 'error'
    openaiConnectionError.value = error.message || 'Failed to fetch models'
  } finally {
    openaiModelsLoading.value = false
  }
}

// Debounced fetch for Ollama endpoint changes
function debouncedFetchOllamaModels() {
  if (ollamaFetchTimeout) clearTimeout(ollamaFetchTimeout)
  ollamaFetchTimeout = setTimeout(fetchOllamaModels, 500)
}

// Debounced fetch for OpenAI settings changes
function debouncedFetchOpenaiModels() {
  if (openaiFetchTimeout) clearTimeout(openaiFetchTimeout)
  openaiFetchTimeout = setTimeout(fetchOpenaiModels, 500)
}

// Watch for settings changes to auto-fetch models
watch(
  () => props.ollamaEndpoint,
  () => {
    if (props.aiProvider === 'ollama' && isAiEnabled.value) {
      debouncedFetchOllamaModels()
    }
  }
)

watch(
  () => props.openaiEndpoint,
  () => {
    if (props.aiProvider === 'openai' && isAiEnabled.value) {
      debouncedFetchOpenaiModels()
    }
  }
)

watch(
  () => props.openaiApiKey,
  () => {
    if (props.aiProvider === 'openai' && isAiEnabled.value) {
      debouncedFetchOpenaiModels()
    }
  }
)

watch(
  () => props.openaiSkipSslVerification,
  () => {
    if (props.aiProvider === 'openai' && isAiEnabled.value && props.openaiApiKey) {
      debouncedFetchOpenaiModels()
    }
  }
)

watch(
  () => props.aiProvider,
  newProvider => {
    if (!isAiEnabled.value) return
    if (newProvider === 'ollama') {
      fetchOllamaModels()
    } else if (newProvider === 'openai') {
      fetchOpenaiModels()
    }
  }
)

watch(
  () => isAiEnabled.value,
  enabled => {
    if (enabled) {
      if (props.aiProvider === 'ollama') {
        fetchOllamaModels()
      } else if (props.aiProvider === 'openai') {
        fetchOpenaiModels()
      }
    }
  }
)

// Fetch models on mount
onMounted(() => {
  if (isAiEnabled.value) {
    if (props.aiProvider === 'ollama') {
      fetchOllamaModels()
    } else if (props.aiProvider === 'openai') {
      fetchOpenaiModels()
    }
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
      </div>

      <div class="settings-grid">
        <!-- Graph Settings -->
        <section v-show="activeTab === 'general'" class="settings-section">
          <h3 class="section-title">Graph</h3>
          <div class="settings-item">
            <label>Detail threshold</label>
            <input
              type="number"
              :value="graphDetailThreshold"
              min="5"
              max="100"
              @input="emit('update:graphDetailThreshold', Number($event.target.value))"
            />
            <span class="settings-hint">Show details when &le; {{ graphDetailThreshold }} nodes</span>
          </div>
          <div class="settings-item">
            <label
              >Max depth <span class="slider-value">{{ graphMaxDepth === 0 ? 'All' : graphMaxDepth }}</span></label
            >
            <input
              type="range"
              :value="graphMaxDepth"
              min="0"
              max="20"
              step="1"
              class="settings-slider"
              @input="emit('update:graphMaxDepth', Number($event.target.value))"
            />
            <span class="settings-hint">{{
              graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels`
            }}</span>
          </div>
          <div class="settings-item">
            <label
              >Root depth
              <span class="slider-value">{{ graphRootMaxDepth === 0 ? 'All' : graphRootMaxDepth }}</span></label
            >
            <input
              type="range"
              :value="graphRootMaxDepth"
              min="0"
              max="10"
              step="1"
              class="settings-slider"
              @input="emit('update:graphRootMaxDepth', Number($event.target.value))"
            />
            <span class="settings-hint">{{
              graphRootMaxDepth === 0 ? 'Show all levels at root' : `Show ${graphRootMaxDepth} levels at root`
            }}</span>
          </div>
          <div class="settings-item">
            <label
              >Notes preview <span class="slider-value">{{ graphNotesPreviewLength }}</span></label
            >
            <input
              type="range"
              :value="graphNotesPreviewLength"
              min="50"
              max="500"
              step="10"
              class="settings-slider"
              @input="emit('update:graphNotesPreviewLength', Number($event.target.value))"
            />
            <span class="settings-hint">Max characters shown in node notes preview</span>
          </div>
        </section>

        <!-- Display Settings -->
        <section v-show="activeTab === 'general'" class="settings-section">
          <h3 class="section-title">Display</h3>
          <div class="settings-item">
            <label>Theme</label>
            <div class="theme-switcher">
              <button
                v-for="theme in themes"
                :key="theme"
                class="theme-btn"
                :class="{ active: currentTheme === theme }"
                @click="setTheme(theme)"
              >
                <span class="theme-icon">
                  {{ theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'auto' }}
                </span>
                <span class="theme-label">{{ theme.charAt(0).toUpperCase() + theme.slice(1) }}</span>
              </button>
            </div>
            <span class="settings-hint">Choose light, dark, or follow system preference</span>
          </div>
          <div class="settings-item">
            <label>
              <input
                type="checkbox"
                :checked="openDetailFullscreen"
                @change="emit('update:openDetailFullscreen', $event.target.checked)"
              />
              Open details fullscreen
            </label>
            <span class="settings-hint">Open detail panel in fullscreen mode by default</span>
          </div>
          <div class="settings-item">
            <label>
              <input
                type="checkbox"
                :checked="hoverPreviewEnabled"
                @change="emit('update:hoverPreviewEnabled', $event.target.checked)"
              />
              Hover preview
            </label>
            <span class="settings-hint">Show preview tooltip when hovering over nodes</span>
          </div>
          <div class="settings-item">
            <label>
              <input
                type="checkbox"
                :checked="inheritColors"
                @change="emit('update:inheritColors', $event.target.checked)"
              />
              Inherit colors
            </label>
            <span class="settings-hint">Child nodes inherit colors from parent nodes</span>
          </div>
        </section>

        <!-- AI Settings -->
        <section v-show="activeTab === 'ai'" class="settings-section">
          <h3 class="section-title">AI</h3>
          <div class="settings-item">
            <label>
              <input
                type="checkbox"
                :checked="isAiEnabled"
                @change="
                  emit('update:aiEnabled', $event.target.checked)
                  emit('update:ollamaEnabled', $event.target.checked)
                "
              />
              Enable AI
            </label>
            <span class="settings-hint">Use LLM to improve notes</span>
          </div>

          <div v-if="isAiEnabled" class="ai-settings">
            <div class="settings-item">
              <label>Provider</label>
              <select
                :value="aiProvider"
                @change="emit('update:aiProvider', $event.target.value)"
                class="settings-select"
              >
                <option value="ollama">Ollama (Local)</option>
                <option value="openai">OpenAI-compatible</option>
              </select>
            </div>

            <!-- Ollama Settings -->
            <template v-if="aiProvider === 'ollama'">
              <div class="settings-item">
                <label>Endpoint</label>
                <input
                  type="text"
                  :value="ollamaEndpoint"
                  @input="emit('update:ollamaEndpoint', $event.target.value)"
                  placeholder="http://localhost:11434"
                  class="text-input"
                />
              </div>

              <div class="settings-item">
                <label>
                  Model
                  <span v-if="ollamaModelsLoading" class="loading-indicator">loading...</span>
                </label>
                <div class="model-input-row">
                  <select
                    v-if="ollamaModels.length > 0"
                    :value="ollamaModel"
                    @change="emit('update:ollamaModel', $event.target.value)"
                    class="settings-select"
                  >
                    <option v-for="model in ollamaModels" :key="model" :value="model">{{ model }}</option>
                    <option v-if="!ollamaModels.includes(ollamaModel)" :value="ollamaModel">
                      {{ ollamaModel }} (not installed)
                    </option>
                  </select>
                  <input
                    v-else
                    type="text"
                    :value="ollamaModel"
                    @input="emit('update:ollamaModel', $event.target.value)"
                    placeholder="llama3.2"
                    class="text-input"
                  />
                  <button
                    class="refresh-btn"
                    @click="fetchOllamaModels"
                    :disabled="ollamaModelsLoading"
                    title="Refresh model list"
                  >
                    refresh
                  </button>
                </div>
                <span class="settings-hint">
                  <template v-if="ollamaModels.length > 0">{{ ollamaModels.length }} models available</template>
                  <template v-else>Run: ollama pull {{ ollamaModel }} to download</template>
                </span>
              </div>

              <div class="settings-item">
                <label
                  >Context Size <span class="slider-value">{{ (ollamaContextSize / 1024).toFixed(0) }}K</span></label
                >
                <input
                  type="range"
                  :value="ollamaContextSize"
                  min="4096"
                  max="131072"
                  step="4096"
                  class="settings-slider"
                  @input="emit('update:ollamaContextSize', Number($event.target.value))"
                />
                <span class="settings-hint">Larger context for longer notes (requires more RAM)</span>
              </div>

              <div class="settings-item">
                <button
                  class="snapshot-btn test-btn"
                  :class="{ testing: ollamaConnectionStatus === 'testing' }"
                  @click="testOllamaConnection"
                  :disabled="ollamaConnectionStatus === 'testing'"
                >
                  <span v-if="ollamaConnectionStatus === 'testing'">Testing...</span>
                  <span v-else>Test Connection</span>
                </button>
                <span v-if="ollamaConnectionStatus === 'success'" class="connection-status success"> Connected </span>
                <span v-else-if="ollamaConnectionStatus === 'error'" class="connection-status error">
                  {{ ollamaConnectionError }}
                </span>
              </div>
            </template>

            <!-- OpenAI Settings -->
            <template v-else-if="aiProvider === 'openai'">
              <div class="settings-item">
                <label>Endpoint</label>
                <input
                  type="text"
                  :value="openaiEndpoint"
                  @input="emit('update:openaiEndpoint', $event.target.value)"
                  placeholder="https://api.openai.com/v1"
                  class="text-input"
                />
                <span class="settings-hint">OpenAI or compatible API endpoint</span>
              </div>

              <div class="settings-item">
                <label>API Key</label>
                <input
                  type="password"
                  :value="openaiApiKey"
                  @input="emit('update:openaiApiKey', $event.target.value)"
                  placeholder="sk-..."
                  class="text-input"
                />
              </div>

              <div class="settings-item">
                <label>
                  <input
                    type="checkbox"
                    :checked="openaiSkipSslVerification"
                    @change="emit('update:openaiSkipSslVerification', $event.target.checked)"
                  />
                  Skip SSL verification
                </label>
                <span class="settings-hint">For endpoints with certificate issues (self-signed or untrusted CA)</span>
                <span v-if="openaiSkipSslVerification" class="ssl-warning">
                  Warning: Disabling SSL verification exposes data to potential interception. Only use on trusted
                  networks.
                </span>
              </div>

              <div class="settings-item">
                <label>
                  Model
                  <span v-if="openaiModelsLoading" class="loading-indicator">loading...</span>
                </label>
                <div class="model-input-row">
                  <select
                    v-if="openaiModels.length > 0"
                    :value="openaiModel"
                    @change="emit('update:openaiModel', $event.target.value)"
                    class="settings-select"
                  >
                    <option v-for="model in openaiModels" :key="model" :value="model">{{ model }}</option>
                    <option v-if="!openaiModels.includes(openaiModel)" :value="openaiModel">{{ openaiModel }}</option>
                  </select>
                  <input
                    v-else
                    type="text"
                    :value="openaiModel"
                    @input="emit('update:openaiModel', $event.target.value)"
                    placeholder="gpt-4o-mini"
                    class="text-input"
                  />
                  <button
                    class="refresh-btn"
                    @click="fetchOpenaiModels"
                    :disabled="openaiModelsLoading || !openaiApiKey"
                    title="Refresh model list"
                  >
                    refresh
                  </button>
                </div>
                <span v-if="openaiModels.length > 0" class="settings-hint"
                  >{{ openaiModels.length }} models available</span
                >
              </div>

              <div class="settings-item">
                <button
                  class="snapshot-btn test-btn"
                  :class="{ testing: openaiConnectionStatus === 'testing' }"
                  @click="testOpenaiConnection"
                  :disabled="openaiConnectionStatus === 'testing' || !openaiApiKey"
                >
                  <span v-if="openaiConnectionStatus === 'testing'">Testing...</span>
                  <span v-else>Test Connection</span>
                </button>
                <span v-if="openaiConnectionStatus === 'success'" class="connection-status success"> Connected </span>
                <span v-else-if="openaiConnectionStatus === 'error'" class="connection-status error">
                  {{ openaiConnectionError }}
                </span>
              </div>
            </template>
          </div>
        </section>

        <!-- AI Prompts -->
        <section v-show="activeTab === 'ai' && isAiEnabled" class="settings-section">
          <h3 class="section-title">AI Prompts</h3>
          <div class="settings-item">
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="showPromptList = !showPromptList" title="Show or hide AI prompts">
                {{ showPromptList ? 'Hide' : 'Show' }} Prompts
              </button>
              <button class="snapshot-btn" @click="openPromptEditor()" title="Create a new custom prompt">
                Add New
              </button>
            </div>
          </div>

          <div v-if="showPromptList" class="prompt-list">
            <div v-for="prompt in presetPrompts" :key="prompt.id" class="prompt-item">
              <div class="prompt-info">
                <span class="prompt-label">{{ prompt.label }}</span>
                <span v-if="isPromptModified(prompt.id)" class="prompt-modified">(modified)</span>
              </div>
              <div class="prompt-actions">
                <button class="snapshot-restore-btn" @click="openPromptEditor(prompt)" title="Edit">Edit</button>
                <button
                  v-if="isPromptModified(prompt.id) && isDefaultPrompt(prompt.id)"
                  class="snapshot-restore-btn"
                  @click="handleResetPrompt(prompt.id)"
                  title="Reset to default"
                >
                  Reset
                </button>
                <button
                  v-if="!isDefaultPrompt(prompt.id)"
                  class="snapshot-restore-btn danger"
                  @click="handleDeletePrompt(prompt.id)"
                  title="Delete"
                >
                  Del
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- Data Management -->
        <section v-show="activeTab === 'data'" class="settings-section">
          <h3 class="section-title">Data</h3>
          <div class="settings-item">
            <label>Snapshots</label>
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="emit('create-snapshot')" title="Create a backup snapshot">
                Create
              </button>
              <button class="snapshot-btn" @click="emit('toggle-snapshots')" title="Show available snapshots">
                {{ showSnapshotList ? 'Hide' : 'Show' }}
              </button>
            </div>
            <span v-if="snapshotMessage" class="settings-hint snapshot-message">{{ snapshotMessage }}</span>
          </div>
          <div v-if="showSnapshotList && availableSnapshots.length > 0" class="snapshot-list">
            <div v-for="snapshot in availableSnapshots.slice(0, 10)" :key="snapshot.path" class="snapshot-item">
              <span class="snapshot-date">{{ formatSnapshotDate(snapshot.created) }}</span>
              <button
                class="snapshot-restore-btn"
                @click="emit('restore-snapshot', snapshot.path)"
                title="Restore this snapshot"
              >
                Restore
              </button>
            </div>
          </div>
          <div v-else-if="showSnapshotList" class="settings-hint">No snapshots available</div>

          <div class="settings-item">
            <button class="snapshot-btn reload-btn" @click="emit('reload-database')" title="Reload database from disk">
              Reload Database
            </button>
            <span class="settings-hint">Reload from disk (picks up external changes)</span>
          </div>

          <div class="settings-item">
            <label>Import</label>
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="triggerImport('json')" title="Import JSON export file">JSON</button>
              <button class="snapshot-btn" @click="triggerImport('csv')" title="Import CSV file">CSV</button>
            </div>
            <span class="settings-hint">Import data into current workspace root</span>
            <input
              ref="importFileInput"
              type="file"
              :accept="importAccept"
              style="display: none"
              @change="handleImportFile"
            />
          </div>
        </section>

        <!-- Lost & Found -->
        <section v-show="activeTab === 'data'" class="settings-section">
          <h3 class="section-title">Lost & Found</h3>
          <div class="settings-item">
            <div class="snapshot-actions">
              <button
                class="snapshot-btn"
                @click="emit('toggle-lost-found')"
                title="Show orphaned nodes without parents"
              >
                {{ showLostFound ? 'Hide' : 'Show' }} ({{ orphanedNodes.length }})
              </button>
            </div>
          </div>
          <div v-if="showLostFound && orphanedNodes.length > 0" class="snapshot-list">
            <div v-for="node in orphanedNodes" :key="node.id" class="snapshot-item">
              <span class="snapshot-date"
                >{{ node.title }} <span class="orphan-type">({{ node.type }})</span></span
              >
              <div class="lost-actions">
                <button class="snapshot-restore-btn" @click="emit('move-to-root', node)" title="Move to root">
                  Root
                </button>
                <button
                  class="snapshot-restore-btn danger"
                  @click="emit('delete-orphan', node)"
                  title="Delete permanently"
                >
                  Del
                </button>
              </div>
            </div>
          </div>
          <div v-else-if="showLostFound" class="settings-hint">No orphaned nodes</div>
        </section>
      </div>

      <!-- Prompt Editor Modal -->
      <div v-if="showPromptEditor" class="prompt-editor-overlay" @click.self="closePromptEditor">
        <div class="prompt-editor">
          <div class="prompt-editor-header">
            <span>{{ editingPrompt ? 'Edit Prompt' : 'New Prompt' }}</span>
            <button class="close-btn" @click="closePromptEditor">&times;</button>
          </div>
          <div class="prompt-editor-body">
            <div class="settings-item">
              <label>Label</label>
              <input v-model="promptForm.label" type="text" class="text-input" placeholder="e.g., Make Formal" />
            </div>
            <div class="settings-item">
              <label>Prompt</label>
              <textarea
                v-model="promptForm.prompt"
                class="text-input prompt-textarea"
                placeholder="Instructions for the AI..."
                rows="4"
              ></textarea>
            </div>
          </div>
          <div class="prompt-editor-footer">
            <button class="snapshot-btn" @click="closePromptEditor">Cancel</button>
            <button
              class="snapshot-btn primary"
              @click="handleSavePrompt"
              :disabled="!promptForm.label.trim() || !promptForm.prompt.trim()"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped src="./SettingsPanel.css"></style>
