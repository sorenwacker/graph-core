<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useOllama } from '../composables/useOllama.js'
import { useSettings } from '../composables/useSettings.js'
import OllamaPromptModal from './OllamaPromptModal.vue'
import OllamaDiffPreview from './OllamaDiffPreview.vue'

const props = defineProps({
  notes: { type: String, default: '' },
  nodeId: { type: [Number, String], required: true },
  getSelection: { type: Function, default: null }
})

const emit = defineEmits(['apply-improvement'])

const { aiEnabled } = useSettings()
const { isGenerating, error, presetPrompts, improveNotes } = useOllama()

const showDropdown = ref(false)
const showCustomPromptModal = ref(false)
const showDiffPreview = ref(false)
const originalContent = ref('')
const improvedContent = ref('')
const usedPrompt = ref('')
const selectionRange = ref(null) // { from, to } when improving selection only

const buttonRef = ref(null)
const dropdownStyle = ref({})

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
  if (showDropdown.value) {
    nextTick(updateDropdownPosition)
  }
}

function updateDropdownPosition() {
  if (!buttonRef.value) return
  const rect = buttonRef.value.getBoundingClientRect()
  dropdownStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 4}px`,
    left: `${rect.left}px`,
    zIndex: 9999
  }
}

function closeDropdown() {
  showDropdown.value = false
}

async function handlePresetAction(preset) {
  closeDropdown()
  await generateImprovement(preset.prompt, preset.label)
}

function handleCustomPrompt() {
  closeDropdown()
  showCustomPromptModal.value = true
}

async function handleCustomPromptSubmit(prompt) {
  showCustomPromptModal.value = false
  await generateImprovement(prompt, 'Custom')
}

async function generateImprovement(prompt, label) {
  usedPrompt.value = label

  // Check for text selection
  let textToImprove = props.notes || ''
  selectionRange.value = null

  if (props.getSelection) {
    const selection = props.getSelection()
    if (selection && selection.text && selection.text.length > 0) {
      // User has selected text - improve only the selection
      textToImprove = selection.text
      selectionRange.value = { from: selection.from, to: selection.to }
    }
  }

  originalContent.value = textToImprove

  const result = await improveNotes(textToImprove, prompt)

  if (result) {
    improvedContent.value = result
    showDiffPreview.value = true
  }
}

function handleAcceptImprovement(finalContent) {
  showDiffPreview.value = false
  emit('apply-improvement', {
    nodeId: props.nodeId,
    oldNotes: originalContent.value,
    newNotes: finalContent,
    prompt: usedPrompt.value,
    selectionRange: selectionRange.value, // { from, to } if selection-only improvement
    fullNotes: props.notes || '' // Pass full notes for correct selection splicing
  })
}

function handleRejectImprovement() {
  showDiffPreview.value = false
  improvedContent.value = ''
  originalContent.value = ''
  selectionRange.value = null
}
</script>

<template>
  <div class="ai-toolbar" v-if="aiEnabled">
    <div class="toolbar-wrapper">
      <button
        ref="buttonRef"
        class="ai-btn"
        :class="{ active: showDropdown, loading: isGenerating }"
        @click="toggleDropdown"
        :disabled="isGenerating"
        title="AI actions"
      >
        <svg v-if="!isGenerating" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/>
          <path d="M2 17l10 5 10-5"/>
          <path d="M2 12l10 5 10-5"/>
        </svg>
        <span v-else class="spinner"></span>
        <span>{{ isGenerating ? 'Running...' : 'AI' }}</span>
        <svg class="chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      <Teleport to="body">
        <div v-if="showDropdown" class="dropdown" :style="dropdownStyle" @mouseleave="closeDropdown">
          <button
            v-for="preset in presetPrompts"
            :key="preset.id"
            class="dropdown-item"
            :title="preset.prompt"
            @click="handlePresetAction(preset)"
          >
            {{ preset.label }}
          </button>
          <div class="dropdown-divider"></div>
          <button class="dropdown-item" @click="handleCustomPrompt" title="Enter your own AI instruction">
            Custom prompt...
          </button>
        </div>
      </Teleport>
    </div>

    <span v-if="error" class="error-message">{{ error }}</span>

    <OllamaPromptModal
      v-if="showCustomPromptModal"
      :is-loading="isGenerating"
      @submit="handleCustomPromptSubmit"
      @close="showCustomPromptModal = false"
    />

    <OllamaDiffPreview
      v-if="showDiffPreview"
      :original-content="originalContent"
      :improved-content="improvedContent"
      :prompt-used="usedPrompt"
      @accept="handleAcceptImprovement"
      @reject="handleRejectImprovement"
    />
  </div>
</template>

<style scoped>
.ai-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-wrapper {
  position: relative;
}

.ai-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  font-size: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;
}

.ai-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent-color);
}

.ai-btn.active {
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
}

.ai-btn.loading {
  cursor: wait;
  background: var(--accent-subtle);
  border-color: var(--accent-color);
  color: var(--accent-color);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.ai-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.chevron {
  margin-left: 2px;
  transition: transform 0.15s;
}

.ai-btn.active .chevron {
  transform: rotate(180deg);
}

.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--text-tertiary);
  border-top-color: var(--accent-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.dropdown {
  min-width: 150px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dropdown-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.8rem;
  text-align: left;
  border: none;
  background: none;
  color: var(--text-primary);
  cursor: pointer;
}

.dropdown-item:hover {
  background: var(--bg-hover);
}

.dropdown-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.error-message {
  font-size: 0.75rem;
  color: #ef4444;
}
</style>
