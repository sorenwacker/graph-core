import { ref, computed } from 'vue'
import { api } from '../services/api.js'
import { useSettings } from './useSettings'
import { handleError } from './useErrorHandler.js'
import { createAiProvider, AI_PROVIDERS } from '../services/aiProviders.js'
import sharedAgentConfig from '../../shared/agentConfig.json'

const WIKIPEDIA_PRESET_ID = 'wikipedia'
// The id the preset had while it was labelled Research.
const LEGACY_LOOKUP_PRESET_ID = 'research'

/**
 * Carry settings saved under the preset's old id over to the new one. An edited
 * prompt is dropped - its text never reached the model and its label would
 * bring the old name back - while a deletion and a place in the order are kept.
 *
 * @param {import('vue').Ref<Array>} promptsRef - Stored prompt overrides
 * @param {import('vue').Ref<string[]>} [orderRef] - Stored prompt order
 */
function migrateLegacyLookupPreset(promptsRef, orderRef) {
  const stored = promptsRef?.value || []
  if (stored.some(p => p.id === LEGACY_LOOKUP_PRESET_ID)) {
    promptsRef.value = stored
      .filter(p => p.id !== LEGACY_LOOKUP_PRESET_ID || p._deleted)
      .map(p => (p.id === LEGACY_LOOKUP_PRESET_ID ? { id: WIKIPEDIA_PRESET_ID, _deleted: true } : p))
  }
  const order = orderRef?.value || []
  if (order.includes(LEGACY_LOOKUP_PRESET_ID)) {
    orderRef.value = order.map(id => (id === LEGACY_LOOKUP_PRESET_ID ? WIKIPEDIA_PRESET_ID : id))
  }
}

export { AI_PROVIDERS }

/**
 * Default prompts for common note improvement actions
 */
const defaultPrompts = [
  {
    id: 'improve',
    label: 'Improve',
    prompt: `Edit these personal notes for clarity and readability. Fix awkward phrasing, improve sentence flow, and tighten wordy passages. Preserve the original voice, meaning, length, and all specific details (names, dates, numbers, technical terms). Keep the same structure and formatting. Output only the improved text.`,
  },
  {
    id: 'summarize',
    label: 'Summarize',
    prompt: `Summarize these notes concisely. Capture the main points, key decisions, and important details. Preserve names, dates, and specific facts. Length should be proportional to content: 1-2 sentences for short notes, up to a paragraph for longer content. Output only the summary.`,
  },
  {
    id: 'expand',
    label: 'Expand',
    prompt: `Expand these notes with relevant context, explanations, or examples that add value. Elaborate on concepts that seem incomplete. Match the existing tone and style. Do not pad with filler or repeat information. Output only the expanded text.`,
  },
  {
    id: 'fix-grammar',
    label: 'Fix Grammar',
    prompt: `Fix spelling, grammar, and punctuation errors only. Do not rephrase, restructure, or change word choices. Preserve all original formatting, line breaks, and markdown. Output only the corrected text.`,
  },
  {
    id: 'simplify',
    label: 'Simplify',
    prompt: `Rewrite in plain language. Use short sentences, common words, and active voice. Break down complex ideas into digestible parts. Remove jargon unless essential. Keep all key information. Output only the simplified text.`,
  },
  {
    id: 'bullet-points',
    label: 'Bullet Points',
    prompt: `Convert to a markdown bullet list. Use - for items, indent with two spaces for sub-items. Group related points together. Each bullet should be a complete thought. Preserve all information. Output only the bullet list.`,
  },
  {
    id: 'action-items',
    label: 'Action Items',
    prompt: `Extract actionable tasks as a markdown checklist using - [ ] format. Include assignee and deadline if mentioned. Order by priority or sequence if apparent. If no action items exist, respond with "No action items found." Output only the checklist.`,
  },
  {
    id: 'continue',
    label: 'Continue',
    prompt: `Continue writing from where the text ends. Match the style, tone, and topic. Add 1-2 paragraphs of relevant content that flows naturally from the existing text. Do not summarize or repeat what was already written. Output the original text followed by your continuation.`,
  },
  {
    // The Wikipedia lookup (docs/guides/ai-notes.md). Its prompt is the model's
    // instructions for the lookup, so editing it in Settings has an effect.
    id: WIKIPEDIA_PRESET_ID,
    label: 'Wikipedia',
    prompt: sharedAgentConfig.lookupPrompt,
    isAgent: true,
  },
]

/**
 * Composable for AI LLM integration (Ollama and OpenAI-compatible).
 * Provides methods for generating improved notes and managing generation state.
 *
 * @returns {Object} AI state and methods
 */
export function useAiNotes() {
  const {
    aiProvider,
    aiEnabled,
    aiCustomPrompts,
    aiPromptOrder,
    aiEnabledTools,
    ollamaEndpoint,
    ollamaModel,
    ollamaContextSize,
    openaiEndpoint,
    openaiApiKey,
    openaiModel,
    openaiSkipSslVerification,
    // Legacy settings for backwards compatibility
    ollamaEnabled,
    ollamaCustomPrompts,
  } = useSettings()

  migrateLegacyLookupPreset(aiCustomPrompts ?? ollamaCustomPrompts, aiPromptOrder)

  // Use new settings if available, fall back to legacy
  const isEnabled = computed(() => aiEnabled?.value ?? ollamaEnabled.value)
  const customPrompts = computed(() => aiCustomPrompts?.value ?? ollamaCustomPrompts.value)
  const provider = computed(() => aiProvider?.value ?? AI_PROVIDERS.OLLAMA)

  // The active provider adapter carries every provider-specific detail;
  // everything below delegates instead of branching on the provider id.
  const providerSettings = {
    ollamaEndpoint,
    ollamaModel,
    ollamaContextSize,
    openaiEndpoint,
    openaiApiKey,
    openaiModel,
    openaiSkipSslVerification,
  }
  const activeProvider = computed(() => createAiProvider(provider.value, providerSettings))

  const isGenerating = ref(false)
  const error = ref(null)
  const generatedContent = ref('')

  /**
   * Provider configuration for the Wikipedia lookup call.
   */
  function getProviderConfig() {
    return activeProvider.value.config()
  }

  /**
   * Check if AI is properly configured
   */
  const isConfigured = computed(() => isEnabled.value && activeProvider.value.isConfigured())

  /**
   * Merged prompts: defaults + custom, with custom overriding defaults by id
   * Custom prompts with _deleted: true are filtered out
   * Respects custom ordering from aiPromptOrder setting
   */
  const presetPrompts = computed(() => {
    const custom = customPrompts.value || []
    const deletedIds = new Set(custom.filter(p => p._deleted).map(p => p.id))
    const customById = new Map(custom.filter(p => !p._deleted).map(p => [p.id, p]))

    // Start with defaults that aren't deleted or overridden
    const result = defaultPrompts
      .filter(p => !deletedIds.has(p.id))
      .map(p => (customById.has(p.id) ? customById.get(p.id) : p))

    // Add custom prompts that aren't overriding defaults
    const defaultIds = new Set(defaultPrompts.map(p => p.id))
    custom.filter(p => !p._deleted && !defaultIds.has(p.id)).forEach(p => result.push(p))

    // Apply custom ordering if available
    const order = aiPromptOrder?.value
    if (order && order.length > 0) {
      const orderMap = new Map(order.map((id, idx) => [id, idx]))
      result.sort((a, b) => {
        const aIdx = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity
        const bIdx = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity
        return aIdx - bIdx
      })
    }

    return result
  })

  /**
   * Get the ref to write custom prompts to (prefers new setting, falls back to legacy)
   */
  function getCustomPromptsRef() {
    return aiCustomPrompts ?? ollamaCustomPrompts
  }

  /**
   * Add or update a custom prompt
   */
  function savePrompt(prompt) {
    const ref = getCustomPromptsRef()
    const custom = [...(ref.value || [])]
    const idx = custom.findIndex(p => p.id === prompt.id)
    if (idx >= 0) {
      custom[idx] = { ...prompt, _deleted: false }
    } else {
      custom.push({ ...prompt })
    }
    ref.value = custom
  }

  /**
   * Delete a prompt (marks default prompts as deleted, removes custom ones)
   */
  function deletePrompt(id) {
    const ref = getCustomPromptsRef()
    const custom = [...(ref.value || [])]
    const isDefault = defaultPrompts.some(p => p.id === id)

    if (isDefault) {
      // Mark as deleted
      const idx = custom.findIndex(p => p.id === id)
      if (idx >= 0) {
        custom[idx] = { ...custom[idx], _deleted: true }
      } else {
        custom.push({ id, _deleted: true })
      }
    } else {
      // Remove entirely
      const idx = custom.findIndex(p => p.id === id)
      if (idx >= 0) {
        custom.splice(idx, 1)
      }
    }
    ref.value = custom
  }

  /**
   * Reset a prompt to its default (removes custom override)
   */
  function resetPrompt(id) {
    const ref = getCustomPromptsRef()
    const custom = [...(ref.value || [])]
    const idx = custom.findIndex(p => p.id === id)
    if (idx >= 0) {
      custom.splice(idx, 1)
      ref.value = custom
    }
  }

  /**
   * Check if a prompt is modified from default
   */
  function isPromptModified(id) {
    const custom = customPrompts.value || []
    return custom.some(p => p.id === id && !p._deleted)
  }

  /**
   * Check if a prompt is a default one
   */
  function isDefaultPrompt(id) {
    return defaultPrompts.some(p => p.id === id)
  }

  /**
   * Get or initialize the prompt order array
   */
  function getPromptOrder() {
    if (aiPromptOrder?.value && aiPromptOrder.value.length > 0) {
      return [...aiPromptOrder.value]
    }
    // Initialize with current prompt order
    return presetPrompts.value.map(p => p.id)
  }

  /**
   * Move a prompt up in the list
   */
  function movePromptUp(id) {
    const order = getPromptOrder()
    const idx = order.indexOf(id)
    if (idx > 0) {
      ;[order[idx - 1], order[idx]] = [order[idx], order[idx - 1]]
      aiPromptOrder.value = order
    }
  }

  /**
   * Move a prompt down in the list
   */
  function movePromptDown(id) {
    const order = getPromptOrder()
    const idx = order.indexOf(id)
    if (idx >= 0 && idx < order.length - 1) {
      ;[order[idx], order[idx + 1]] = [order[idx + 1], order[idx]]
      aiPromptOrder.value = order
    }
  }

  /**
   * Improve notes using the configured AI provider
   * @param {string} originalContent - The original notes content
   * @param {string} prompt - The improvement prompt
   * @returns {Promise<string|null>} Generated content or null on error
   */
  async function improveNotes(originalContent, prompt) {
    isGenerating.value = true
    error.value = null
    generatedContent.value = ''

    try {
      const result = await activeProvider.value.generate({ prompt, content: originalContent })

      generatedContent.value = result
      return result
    } catch (e) {
      handleError(e, { context: 'AI note improvement', silent: true })
      error.value = e.message
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Describe the node a lookup is started from: its title, type and parent
   * title. Note text is deliberately left out.
   * @param {number|string|null} nodeId - The node
   * @returns {Promise<Object|undefined>} Node context, or undefined when unknown
   */
  async function lookupNodeContext(nodeId) {
    if (typeof nodeId !== 'number') return undefined
    const node = await api.getNode(nodeId)
    if (!node) return undefined
    const parent = node.parent_id ? await api.getNode(node.parent_id) : null
    return { title: node.title, type: node.type, parentTitle: parent?.title }
  }

  /**
   * Look a question up on Wikipedia, its only source.
   * @param {string} question - What the user wants to know
   * @param {number|string|null} [nodeId] - The node the lookup is started from
   * @returns {Promise<string|null>} The result, or null on error
   */
  async function lookUpOnWikipedia(question, nodeId = null) {
    isGenerating.value = true
    error.value = null
    generatedContent.value = ''

    try {
      const config = getProviderConfig()
      const preset = presetPrompts.value.find(p => p.id === WIKIPEDIA_PRESET_ID)
      const result = await api.wikipediaLookup({
        question,
        instructions: preset?.prompt ?? sharedAgentConfig.lookupPrompt,
        node: await lookupNodeContext(nodeId),
        // Spread to plain array to avoid IPC cloning issues with Vue proxies
        enabledTools: [...aiEnabledTools.value],
        ...config,
      })

      generatedContent.value = result
      return result
    } catch (e) {
      handleError(e, { context: 'Wikipedia lookup', silent: true })
      error.value = e.message
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Test connection to AI provider
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function testConnection() {
    return activeProvider.value.testConnection()
  }

  /**
   * List available models from the configured provider
   * @returns {Promise<string[]>}
   */
  async function listModels() {
    return activeProvider.value.listModels()
  }

  return {
    // State
    isGenerating,
    error,
    generatedContent,

    // Computed
    isConfigured,
    isEnabled,
    provider,
    presetPrompts,

    // Constants
    defaultPrompts,
    AI_PROVIDERS,

    // Methods
    improveNotes,
    lookUpOnWikipedia,
    testConnection,
    listModels,
    savePrompt,
    deletePrompt,
    resetPrompt,
    isPromptModified,
    isDefaultPrompt,
    movePromptUp,
    movePromptDown,
  }
}
