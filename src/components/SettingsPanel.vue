<script setup>
import { ref, computed } from 'vue'
import { api } from '../services/api.js'
import { useOllama } from '../composables/useOllama.js'

const {
  presetPrompts,
  defaultPrompts,
  savePrompt,
  deletePrompt,
  resetPrompt,
  isPromptModified,
  isDefaultPrompt
} = useOllama()

const props = defineProps({
  graphDetailThreshold: { type: Number, required: true },
  graphMaxDepth: { type: Number, required: true },
  graphRootMaxDepth: { type: Number, required: true },
  openDetailFullscreen: { type: Boolean, required: true },
  hoverPreviewEnabled: { type: Boolean, required: true },
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
  'update:graphDetailThreshold',
  'update:graphMaxDepth',
  'update:graphRootMaxDepth',
  'update:openDetailFullscreen',
  'update:hoverPreviewEnabled',
  // AI settings
  'update:aiEnabled',
  'update:aiProvider',
  'update:ollamaEndpoint',
  'update:ollamaModel',
  'update:ollamaContextSize',
  'update:openaiEndpoint',
  'update:openaiApiKey',
  'update:openaiModel',
  // Legacy
  'update:ollamaEnabled',
  'create-snapshot',
  'toggle-snapshots',
  'restore-snapshot',
  'reload-database',
  'toggle-lost-found',
  'move-to-root',
  'delete-orphan',
  'close'
])

const ollamaConnectionStatus = ref(null) // null, 'testing', 'success', 'error'
const ollamaConnectionError = ref('')
const ollamaModels = ref([])

const openaiConnectionStatus = ref(null)
const openaiConnectionError = ref('')
const openaiModels = ref([])

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
    prompt: promptForm.value.prompt.trim()
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
    const result = await api.openaiTestConnection(props.openaiEndpoint, props.openaiApiKey)
    if (result.success) {
      openaiConnectionStatus.value = 'success'
      // Also fetch available models
      try {
        openaiModels.value = await api.openaiListModels(props.openaiEndpoint, props.openaiApiKey)
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
</script>

<template>
  <div class="settings-panel" @click.stop>
    <div class="settings-container">
      <div class="settings-header">
        <span class="settings-title">Settings</span>
        <button class="close-btn" @click="emit('close')" title="Close settings">&times;</button>
      </div>

      <div class="settings-grid">
        <!-- Graph Settings -->
        <section class="settings-section">
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
            <label>Max depth <span class="slider-value">{{ graphMaxDepth === 0 ? 'All' : graphMaxDepth }}</span></label>
            <input
              type="range"
              :value="graphMaxDepth"
              min="0"
              max="20"
              step="1"
              class="settings-slider"
              @input="emit('update:graphMaxDepth', Number($event.target.value))"
            />
            <span class="settings-hint">{{ graphMaxDepth === 0 ? 'Show all levels' : `Show up to ${graphMaxDepth} levels` }}</span>
          </div>
          <div class="settings-item">
            <label>Root depth <span class="slider-value">{{ graphRootMaxDepth === 0 ? 'All' : graphRootMaxDepth }}</span></label>
            <input
              type="range"
              :value="graphRootMaxDepth"
              min="0"
              max="10"
              step="1"
              class="settings-slider"
              @input="emit('update:graphRootMaxDepth', Number($event.target.value))"
            />
            <span class="settings-hint">{{ graphRootMaxDepth === 0 ? 'Show all levels at root' : `Show ${graphRootMaxDepth} levels at root` }}</span>
          </div>
        </section>

        <!-- Display Settings -->
        <section class="settings-section">
          <h3 class="section-title">Display</h3>
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
        </section>

        <!-- AI Settings -->
        <section class="settings-section">
          <h3 class="section-title">AI</h3>
          <div class="settings-item">
            <label>
              <input
                type="checkbox"
                :checked="isAiEnabled"
                @change="emit('update:aiEnabled', $event.target.checked); emit('update:ollamaEnabled', $event.target.checked)"
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
                <label>Model</label>
                <div class="model-input-row">
                  <input
                    type="text"
                    :value="ollamaModel"
                    @input="emit('update:ollamaModel', $event.target.value)"
                    placeholder="llama3.2"
                    list="ollama-models"
                    class="text-input"
                  />
                  <datalist id="ollama-models">
                    <option v-for="model in ollamaModels" :key="model" :value="model" />
                  </datalist>
                </div>
                <span class="settings-hint">Run: ollama pull {{ ollamaModel }} to download</span>
              </div>

              <div class="settings-item">
                <label>Context Size <span class="slider-value">{{ (ollamaContextSize / 1024).toFixed(0) }}K</span></label>
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
                <span v-if="ollamaConnectionStatus === 'success'" class="connection-status success">
                  Connected
                </span>
                <span v-else-if="ollamaConnectionStatus === 'error'" class="connection-status error">
                  {{ ollamaConnectionError }}
                </span>
              </div>

              <div v-if="ollamaModels.length > 0" class="settings-item">
                <span class="settings-hint">Available: {{ ollamaModels.join(', ') }}</span>
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
                <label>Model</label>
                <div class="model-input-row">
                  <input
                    type="text"
                    :value="openaiModel"
                    @input="emit('update:openaiModel', $event.target.value)"
                    placeholder="gpt-4o-mini"
                    list="openai-models"
                    class="text-input"
                  />
                  <datalist id="openai-models">
                    <option v-for="model in openaiModels" :key="model" :value="model" />
                  </datalist>
                </div>
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
                <span v-if="openaiConnectionStatus === 'success'" class="connection-status success">
                  Connected
                </span>
                <span v-else-if="openaiConnectionStatus === 'error'" class="connection-status error">
                  {{ openaiConnectionError }}
                </span>
              </div>

              <div v-if="openaiModels.length > 0" class="settings-item">
                <span class="settings-hint">Available: {{ openaiModels.slice(0, 10).join(', ') }}{{ openaiModels.length > 10 ? '...' : '' }}</span>
              </div>
            </template>
          </div>
        </section>

        <!-- AI Prompts -->
        <section v-if="isAiEnabled" class="settings-section">
          <h3 class="section-title">AI Prompts</h3>
          <div class="settings-item">
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="showPromptList = !showPromptList" title="Show or hide AI prompts">
                {{ showPromptList ? 'Hide' : 'Show' }} Prompts
              </button>
              <button class="snapshot-btn" @click="openPromptEditor()" title="Create a new custom prompt">Add New</button>
            </div>
          </div>

          <div v-if="showPromptList" class="prompt-list">
            <div
              v-for="prompt in presetPrompts"
              :key="prompt.id"
              class="prompt-item"
            >
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
                >Reset</button>
                <button
                  v-if="!isDefaultPrompt(prompt.id)"
                  class="snapshot-restore-btn danger"
                  @click="handleDeletePrompt(prompt.id)"
                  title="Delete"
                >Del</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Data Management -->
        <section class="settings-section">
          <h3 class="section-title">Data</h3>
          <div class="settings-item">
            <label>Snapshots</label>
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="emit('create-snapshot')" title="Create a backup snapshot">Create</button>
              <button class="snapshot-btn" @click="emit('toggle-snapshots')" title="Show available snapshots">
                {{ showSnapshotList ? 'Hide' : 'Show' }}
              </button>
            </div>
            <span v-if="snapshotMessage" class="settings-hint snapshot-message">{{ snapshotMessage }}</span>
          </div>
          <div v-if="showSnapshotList && availableSnapshots.length > 0" class="snapshot-list">
            <div
              v-for="snapshot in availableSnapshots.slice(0, 10)"
              :key="snapshot.path"
              class="snapshot-item"
            >
              <span class="snapshot-date">{{ formatSnapshotDate(snapshot.created) }}</span>
              <button class="snapshot-restore-btn" @click="emit('restore-snapshot', snapshot.path)" title="Restore this snapshot">Restore</button>
            </div>
          </div>
          <div v-else-if="showSnapshotList" class="settings-hint">No snapshots available</div>

          <div class="settings-item">
            <button class="snapshot-btn reload-btn" @click="emit('reload-database')" title="Reload database from disk">
              Reload Database
            </button>
            <span class="settings-hint">Reload from disk (picks up external changes)</span>
          </div>
        </section>

        <!-- Lost & Found -->
        <section class="settings-section">
          <h3 class="section-title">Lost & Found</h3>
          <div class="settings-item">
            <div class="snapshot-actions">
              <button class="snapshot-btn" @click="emit('toggle-lost-found')" title="Show orphaned nodes without parents">
                {{ showLostFound ? 'Hide' : 'Show' }} ({{ orphanedNodes.length }})
              </button>
            </div>
          </div>
          <div v-if="showLostFound && orphanedNodes.length > 0" class="snapshot-list">
            <div
              v-for="node in orphanedNodes"
              :key="node.id"
              class="snapshot-item"
            >
              <span class="snapshot-date">{{ node.title }} <span class="orphan-type">({{ node.type }})</span></span>
              <div class="lost-actions">
                <button class="snapshot-restore-btn" @click="emit('move-to-root', node)" title="Move to root">Root</button>
                <button class="snapshot-restore-btn danger" @click="emit('delete-orphan', node)" title="Delete permanently">Del</button>
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
              <input
                v-model="promptForm.label"
                type="text"
                class="text-input"
                placeholder="e.g., Make Formal"
              />
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
            >Save</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--bg-primary);
  padding: 24px;
  overflow-y: auto;
  z-index: 1100;
}

.settings-container {
  max-width: 1200px;
  margin: 0 auto;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.settings-section {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
}

.section-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.reload-btn {
  background: #e67e22 !important;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.settings-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary);
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.close-btn:hover {
  color: var(--text-primary);
}

.settings-item {
  margin-bottom: 12px;
}

.settings-item label {
  display: block;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.settings-item input[type="number"] {
  width: 70px;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.settings-item input[type="checkbox"] {
  margin-right: 6px;
  cursor: pointer;
}

.text-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
}

.text-input:focus {
  outline: none;
  border-color: var(--accent-color);
}

.model-input-row {
  display: flex;
  gap: 8px;
}

.ollama-settings {
  margin-top: 8px;
}

.test-btn {
  min-width: 110px;
}

.test-btn.testing {
  opacity: 0.7;
  cursor: wait;
}

.connection-status {
  display: inline-block;
  margin-left: 8px;
  font-size: 0.8rem;
  font-weight: 500;
}

.connection-status.success {
  color: #22c55e;
}

.connection-status.error {
  color: #ef4444;
}

.settings-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.settings-slider {
  width: 100%;
  margin-top: 4px;
}

.slider-value {
  font-weight: normal;
  color: var(--accent-color);
}


.snapshot-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.snapshot-btn {
  padding: 4px 12px;
  font-size: 0.8rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.snapshot-btn:hover {
  background: var(--bg-hover);
}

.snapshot-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.snapshot-message {
  color: var(--accent-color);
  font-weight: 500;
}

.snapshot-list {
  margin-top: 8px;
  max-height: 150px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.snapshot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.snapshot-item:last-child {
  border-bottom: none;
}

.snapshot-date {
  color: var(--text-secondary);
}

.snapshot-restore-btn {
  padding: 2px 8px;
  font-size: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  cursor: pointer;
}

.snapshot-restore-btn:hover {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
}

.snapshot-restore-btn.danger:hover {
  background: #fee2e2;
  border-color: #ef4444;
  color: #ef4444;
}

.orphan-type {
  color: var(--text-tertiary);
  font-size: 0.7rem;
}

.lost-actions {
  display: flex;
  gap: 4px;
}

/* Prompt Management */
.prompt-list {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.prompt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8rem;
}

.prompt-item:last-child {
  border-bottom: none;
}

.prompt-info {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prompt-label {
  color: var(--text-primary);
}

.prompt-modified {
  font-size: 0.7rem;
  color: var(--accent-color);
}

.prompt-actions {
  display: flex;
  gap: 4px;
}

.prompt-editor-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1200;
}

.prompt-editor {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  width: 480px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.prompt-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
}

.prompt-editor-body {
  padding: 16px;
}

.prompt-editor-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
}

.prompt-textarea {
  resize: vertical;
  min-height: 80px;
  font-family: inherit;
}

.snapshot-btn.primary {
  background: var(--accent-color);
  color: white;
  border-color: var(--accent-color);
}

.snapshot-btn.primary:hover {
  opacity: 0.9;
}

.snapshot-btn.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
