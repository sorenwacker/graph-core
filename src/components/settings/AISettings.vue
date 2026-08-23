<script setup>
import { ref, computed, toRef } from 'vue'
import { useAiNotes } from '../../composables/useAiNotes.js'
import { useAIProviderConnection } from '../../composables/useAIProviderConnection.js'
import { useSettings } from '../../composables/useSettings'

const {
  presetPrompts,
  savePrompt,
  deletePrompt,
  resetPrompt,
  isPromptModified,
  isDefaultPrompt,
  movePromptUp,
  movePromptDown,
} = useAiNotes()
const { aiEnabledTools } = useSettings()

// Available agent tools
const availableTools = [{ id: 'wikipedia', label: 'Wikipedia', description: 'Search and read Wikipedia articles' }]

function isToolEnabled(toolId) {
  return aiEnabledTools.value.includes(toolId)
}

function toggleTool(toolId) {
  const enabled = aiEnabledTools.value
  if (enabled.includes(toolId)) {
    aiEnabledTools.value = enabled.filter(t => t !== toolId)
  } else {
    aiEnabledTools.value = [...enabled, toolId]
  }
}

const props = defineProps({
  aiEnabled: { type: Boolean, default: true },
  aiProvider: { type: String, default: 'ollama' },
  ollamaEndpoint: { type: String, default: 'http://localhost:11434' },
  ollamaModel: { type: String, default: 'llama3.2' },
  ollamaContextSize: { type: Number, default: 32768 },
  openaiEndpoint: { type: String, default: 'https://api.openai.com/v1' },
  openaiApiKey: { type: String, default: '' },
  openaiModel: { type: String, default: 'gpt-4o-mini' },
  openaiSkipSslVerification: { type: Boolean, default: false },
  ollamaEnabled: { type: Boolean, default: false },
})

const emit = defineEmits([
  'update:aiEnabled',
  'update:aiProvider',
  'update:ollamaEndpoint',
  'update:ollamaModel',
  'update:ollamaContextSize',
  'update:openaiEndpoint',
  'update:openaiApiKey',
  'update:openaiModel',
  'update:openaiSkipSslVerification',
  'update:ollamaEnabled',
])

// Computed for current provider's enabled state
const isAiEnabled = computed(() => props.aiEnabled ?? props.ollamaEnabled)

// AI provider connection management
const {
  ollamaConnectionStatus,
  ollamaConnectionError,
  ollamaModels,
  ollamaModelsLoading,
  openaiConnectionStatus,
  openaiConnectionError,
  openaiModels,
  openaiModelsLoading,
  testOllamaConnection,
  testOpenaiConnection,
  fetchOllamaModels,
  fetchOpenaiModels,
  setupWatchers: setupAIWatchers,
  initOnMount: initAIOnMount,
} = useAIProviderConnection({
  getAiEnabled: () => isAiEnabled.value,
  getAiProvider: () => props.aiProvider,
  getOllamaEndpoint: () => props.ollamaEndpoint,
  getOpenaiEndpoint: () => props.openaiEndpoint,
  getOpenaiApiKey: () => props.openaiApiKey,
  getOpenaiSkipSsl: () => props.openaiSkipSslVerification,
})

// Prompt management
const showPromptEditor = ref(false)
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

function onAiEnabledChange(event) {
  emit('update:aiEnabled', event.target.checked)
  emit('update:ollamaEnabled', event.target.checked)
}

// Set up AI watchers for settings changes
setupAIWatchers({
  ollamaEndpoint: toRef(props, 'ollamaEndpoint'),
  openaiEndpoint: toRef(props, 'openaiEndpoint'),
  openaiApiKey: toRef(props, 'openaiApiKey'),
  openaiSkipSsl: toRef(props, 'openaiSkipSslVerification'),
  aiProvider: toRef(props, 'aiProvider'),
  aiEnabled: isAiEnabled,
})

// Initialize AI provider connection on mount
initAIOnMount()
</script>

<template>
  <!-- AI Settings -->
  <section class="settings-section">
    <h3 class="section-title">AI</h3>
    <div class="settings-item">
      <label>
        <input type="checkbox" :checked="isAiEnabled" @change="onAiEnabledChange" />
        Enable AI
      </label>
      <span class="settings-hint">Use LLM to improve notes</span>
    </div>

    <div v-if="isAiEnabled" class="ai-settings">
      <div class="settings-item">
        <label>Provider</label>
        <select :value="aiProvider" @change="emit('update:aiProvider', $event.target.value)" class="settings-select">
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
          <span class="settings-hint"
            >For local endpoints (localhost, 127.0.0.1, *.local) with certificate issues (self-signed or untrusted CA).
            Certificates for remote hosts are always verified.</span
          >
          <span v-if="openaiSkipSslVerification" class="ssl-warning">
            Warning: Disabling SSL verification exposes data to potential interception. Only use on trusted networks.
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
          <span v-if="openaiModels.length > 0" class="settings-hint">{{ openaiModels.length }} models available</span>
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

  <!-- Agent Tools -->
  <section v-if="isAiEnabled" class="settings-section">
    <h3 class="section-title">Agent Tools</h3>
    <div class="tool-list">
      <div v-for="tool in availableTools" :key="tool.id" class="settings-item tool-item">
        <label>
          <input type="checkbox" :checked="isToolEnabled(tool.id)" @change="toggleTool(tool.id)" />
          {{ tool.label }}
        </label>
        <span class="settings-hint">{{ tool.description }}</span>
      </div>
    </div>
  </section>

  <!-- AI Prompts -->
  <section v-if="isAiEnabled" class="settings-section">
    <h3 class="section-title">AI Prompts</h3>
    <div class="settings-item">
      <div class="snapshot-actions">
        <button class="snapshot-btn" @click="openPromptEditor()" title="Create a new custom prompt">
          Add New Prompt
        </button>
      </div>
    </div>

    <div class="prompt-list">
      <div v-for="(prompt, index) in presetPrompts" :key="prompt.id" class="prompt-item">
        <div class="prompt-info">
          <span class="prompt-label">{{ prompt.label }}</span>
          <span v-if="isPromptModified(prompt.id)" class="prompt-modified">(modified)</span>
        </div>
        <div class="prompt-actions">
          <button
            class="snapshot-restore-btn move-btn"
            @click="movePromptUp(prompt.id)"
            :disabled="index === 0"
            title="Move up"
          >
            ▲
          </button>
          <button
            class="snapshot-restore-btn move-btn"
            @click="movePromptDown(prompt.id)"
            :disabled="index === presetPrompts.length - 1"
            title="Move down"
          >
            ▼
          </button>
          <button class="snapshot-restore-btn" @click="openPromptEditor(prompt)" title="Edit">Edit</button>
          <button
            v-if="isPromptModified(prompt.id) && isDefaultPrompt(prompt.id)"
            class="snapshot-restore-btn"
            @click="handleResetPrompt(prompt.id)"
            title="Reset to default"
          >
            Reset
          </button>
          <button class="snapshot-restore-btn danger" @click="handleDeletePrompt(prompt.id)" title="Delete">Del</button>
        </div>
      </div>
    </div>
  </section>

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
</template>
