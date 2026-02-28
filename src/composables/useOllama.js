import { ref, computed } from 'vue'
import { api } from '../services/api.js'
import { useSettings } from './useSettings.js'

/**
 * Default prompts for common note improvement actions
 */
const defaultPrompts = [
  {
    id: 'improve',
    label: 'Improve',
    prompt: `You are editing personal notes. Improve clarity and flow while keeping the same meaning and length. Preserve all facts, names, dates, and technical terms exactly. Output only the improved text, nothing else.`
  },
  {
    id: 'summarize',
    label: 'Summarize',
    prompt: `Summarize these notes into key points. Keep names, dates, and important details. Use 2-4 sentences maximum. Output only the summary, nothing else.`
  },
  {
    id: 'expand',
    label: 'Expand',
    prompt: `Expand these notes with relevant details, context, or examples. Stay on topic and match the existing style. Output only the expanded text, nothing else.`
  },
  {
    id: 'fix-grammar',
    label: 'Fix Grammar',
    prompt: `Fix only spelling and grammar errors. Do not change wording, style, or meaning. Keep all original formatting. Output only the corrected text, nothing else.`
  },
  {
    id: 'simplify',
    label: 'Simplify',
    prompt: `Rewrite in plain language using short sentences and common words. Keep all key information. Output only the simplified text, nothing else.`
  },
  {
    id: 'bullet-points',
    label: 'Bullet Points',
    prompt: `Convert to a markdown bullet list using - for each point. Group related items. Keep all information. Output only the bullet points, nothing else.`
  },
  {
    id: 'action-items',
    label: 'Action Items',
    prompt: `Extract tasks and action items as a markdown checklist. Use - [ ] format. Include who, what, and when if mentioned. If no action items exist, output "No action items found." Output only the checklist, nothing else.`
  },
  {
    id: 'continue',
    label: 'Continue',
    prompt: `Continue writing in the same style and topic. Add 1-2 relevant paragraphs. Output the original text followed by your continuation, nothing else.`
  }
]

/**
 * Composable for Ollama LLM integration.
 * Provides methods for generating improved notes and managing generation state.
 *
 * @returns {Object} Ollama state and methods
 */
export function useOllama() {
  const { ollamaEnabled, ollamaEndpoint, ollamaModel, ollamaContextSize, ollamaCustomPrompts } = useSettings()

  const isGenerating = ref(false)
  const error = ref(null)
  const generatedContent = ref('')

  /**
   * Check if Ollama is properly configured
   */
  const isConfigured = computed(() => {
    return ollamaEnabled.value &&
      ollamaEndpoint.value &&
      ollamaModel.value
  })

  /**
   * Merged prompts: defaults + custom, with custom overriding defaults by id
   * Custom prompts with _deleted: true are filtered out
   */
  const presetPrompts = computed(() => {
    const custom = ollamaCustomPrompts.value || []
    const deletedIds = new Set(custom.filter(p => p._deleted).map(p => p.id))
    const customById = new Map(custom.filter(p => !p._deleted).map(p => [p.id, p]))

    // Start with defaults that aren't deleted or overridden
    const result = defaultPrompts
      .filter(p => !deletedIds.has(p.id))
      .map(p => customById.has(p.id) ? customById.get(p.id) : p)

    // Add custom prompts that aren't overriding defaults
    const defaultIds = new Set(defaultPrompts.map(p => p.id))
    custom
      .filter(p => !p._deleted && !defaultIds.has(p.id))
      .forEach(p => result.push(p))

    return result
  })

  /**
   * Add or update a custom prompt
   */
  function savePrompt(prompt) {
    const custom = [...(ollamaCustomPrompts.value || [])]
    const idx = custom.findIndex(p => p.id === prompt.id)
    if (idx >= 0) {
      custom[idx] = { ...prompt, _deleted: false }
    } else {
      custom.push({ ...prompt })
    }
    ollamaCustomPrompts.value = custom
  }

  /**
   * Delete a prompt (marks default prompts as deleted, removes custom ones)
   */
  function deletePrompt(id) {
    const custom = [...(ollamaCustomPrompts.value || [])]
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
    ollamaCustomPrompts.value = custom
  }

  /**
   * Reset a prompt to its default (removes custom override)
   */
  function resetPrompt(id) {
    const custom = [...(ollamaCustomPrompts.value || [])]
    const idx = custom.findIndex(p => p.id === id)
    if (idx >= 0) {
      custom.splice(idx, 1)
      ollamaCustomPrompts.value = custom
    }
  }

  /**
   * Check if a prompt is modified from default
   */
  function isPromptModified(id) {
    const custom = ollamaCustomPrompts.value || []
    return custom.some(p => p.id === id && !p._deleted)
  }

  /**
   * Check if a prompt is a default one
   */
  function isDefaultPrompt(id) {
    return defaultPrompts.some(p => p.id === id)
  }

  /**
   * Improve notes using Ollama
   * @param {string} originalContent - The original notes content
   * @param {string} prompt - The improvement prompt
   * @returns {Promise<string|null>} Generated content or null on error
   */
  async function improveNotes(originalContent, prompt) {
    isGenerating.value = true
    error.value = null
    generatedContent.value = ''

    try {
      const result = await api.ollamaGenerate({
        prompt,
        content: originalContent,
        model: ollamaModel.value,
        endpoint: ollamaEndpoint.value,
        contextSize: ollamaContextSize.value
      })

      generatedContent.value = result
      return result
    } catch (e) {
      error.value = e.message
      return null
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Test connection to Ollama server
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async function testConnection() {
    return api.ollamaTestConnection(ollamaEndpoint.value)
  }

  return {
    // State
    isGenerating,
    error,
    generatedContent,

    // Computed
    isConfigured,
    presetPrompts,

    // Constants
    defaultPrompts,

    // Methods
    improveNotes,
    testConnection,
    savePrompt,
    deletePrompt,
    resetPrompt,
    isPromptModified,
    isDefaultPrompt
  }
}
