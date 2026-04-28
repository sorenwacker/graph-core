/**
 * Composable for AI provider connection testing and model fetching.
 * Abstracts common logic between Ollama and OpenAI-compatible providers.
 */

import { ref, watch, onMounted } from 'vue'
import { api } from '../services/api.js'

/**
 * Create AI provider connection manager.
 * @param {Object} options - Configuration options
 * @param {Function} options.getAiEnabled - Function returning current AI enabled state
 * @param {Function} options.getAiProvider - Function returning current AI provider ('ollama' or 'openai')
 * @param {Function} options.getOllamaEndpoint - Function returning Ollama endpoint URL
 * @param {Function} options.getOpenaiEndpoint - Function returning OpenAI endpoint URL
 * @param {Function} options.getOpenaiApiKey - Function returning OpenAI API key
 * @param {Function} options.getOpenaiSkipSsl - Function returning SSL skip flag
 * @returns {Object} Connection state and methods
 */
export function useAIProviderConnection({
  getAiEnabled,
  getAiProvider,
  getOllamaEndpoint,
  getOpenaiEndpoint,
  getOpenaiApiKey,
  getOpenaiSkipSsl,
}) {
  // Ollama state
  const ollamaConnectionStatus = ref(null) // null, 'testing', 'success', 'error'
  const ollamaConnectionError = ref('')
  const ollamaModels = ref([])
  const ollamaModelsLoading = ref(false)

  // OpenAI state
  const openaiConnectionStatus = ref(null)
  const openaiConnectionError = ref('')
  const openaiModels = ref([])
  const openaiModelsLoading = ref(false)

  // Debounce timeouts
  let ollamaFetchTimeout = null
  let openaiFetchTimeout = null

  /**
   * Test Ollama connection and fetch models on success.
   */
  async function testOllamaConnection() {
    ollamaConnectionStatus.value = 'testing'
    ollamaConnectionError.value = ''

    try {
      const result = await api.ollamaTestConnection(getOllamaEndpoint())
      if (result.success) {
        ollamaConnectionStatus.value = 'success'
        try {
          ollamaModels.value = await api.ollamaListModels(getOllamaEndpoint())
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

  /**
   * Test OpenAI connection and fetch models on success.
   */
  async function testOpenaiConnection() {
    openaiConnectionStatus.value = 'testing'
    openaiConnectionError.value = ''

    try {
      const result = await api.openaiTestConnection(getOpenaiEndpoint(), getOpenaiApiKey(), getOpenaiSkipSsl())
      if (result.success) {
        openaiConnectionStatus.value = 'success'
        try {
          openaiModels.value = await api.openaiListModels(getOpenaiEndpoint(), getOpenaiApiKey(), getOpenaiSkipSsl())
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

  /**
   * Fetch Ollama models without full connection test.
   */
  async function fetchOllamaModels() {
    const endpoint = getOllamaEndpoint()
    if (!endpoint) return

    ollamaModelsLoading.value = true
    try {
      ollamaModels.value = await api.ollamaListModels(endpoint)
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

  /**
   * Fetch OpenAI models without full connection test.
   */
  async function fetchOpenaiModels() {
    const endpoint = getOpenaiEndpoint()
    const apiKey = getOpenaiApiKey()
    if (!endpoint || !apiKey) return

    openaiModelsLoading.value = true
    openaiConnectionError.value = ''
    try {
      openaiModels.value = await api.openaiListModels(endpoint, apiKey, getOpenaiSkipSsl())
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

  /**
   * Debounced fetch for Ollama endpoint changes.
   */
  function debouncedFetchOllamaModels() {
    if (ollamaFetchTimeout) clearTimeout(ollamaFetchTimeout)
    ollamaFetchTimeout = setTimeout(fetchOllamaModels, 500)
  }

  /**
   * Debounced fetch for OpenAI settings changes.
   */
  function debouncedFetchOpenaiModels() {
    if (openaiFetchTimeout) clearTimeout(openaiFetchTimeout)
    openaiFetchTimeout = setTimeout(fetchOpenaiModels, 500)
  }

  /**
   * Fetch models for current provider.
   */
  function fetchCurrentProviderModels() {
    if (!getAiEnabled()) return

    const provider = getAiProvider()
    if (provider === 'ollama') {
      fetchOllamaModels()
    } else if (provider === 'openai') {
      fetchOpenaiModels()
    }
  }

  /**
   * Set up watchers for settings changes.
   * @param {Object} watchTargets - Reactive refs to watch
   */
  function setupWatchers(watchTargets) {
    const { ollamaEndpoint, openaiEndpoint, openaiApiKey, openaiSkipSsl, aiProvider, aiEnabled } = watchTargets

    if (ollamaEndpoint) {
      watch(ollamaEndpoint, () => {
        if (getAiProvider() === 'ollama' && getAiEnabled()) {
          debouncedFetchOllamaModels()
        }
      })
    }

    if (openaiEndpoint) {
      watch(openaiEndpoint, () => {
        if (getAiProvider() === 'openai' && getAiEnabled()) {
          debouncedFetchOpenaiModels()
        }
      })
    }

    if (openaiApiKey) {
      watch(openaiApiKey, () => {
        if (getAiProvider() === 'openai' && getAiEnabled()) {
          debouncedFetchOpenaiModels()
        }
      })
    }

    if (openaiSkipSsl) {
      watch(openaiSkipSsl, () => {
        if (getAiProvider() === 'openai' && getAiEnabled() && getOpenaiApiKey()) {
          debouncedFetchOpenaiModels()
        }
      })
    }

    if (aiProvider) {
      watch(aiProvider, newProvider => {
        if (!getAiEnabled()) return
        if (newProvider === 'ollama') {
          fetchOllamaModels()
        } else if (newProvider === 'openai') {
          fetchOpenaiModels()
        }
      })
    }

    if (aiEnabled) {
      watch(aiEnabled, enabled => {
        if (enabled) {
          fetchCurrentProviderModels()
        }
      })
    }
  }

  /**
   * Initialize on mount - fetch models for current provider.
   */
  function initOnMount() {
    onMounted(() => {
      fetchCurrentProviderModels()
    })
  }

  return {
    // Ollama state
    ollamaConnectionStatus,
    ollamaConnectionError,
    ollamaModels,
    ollamaModelsLoading,

    // OpenAI state
    openaiConnectionStatus,
    openaiConnectionError,
    openaiModels,
    openaiModelsLoading,

    // Methods
    testOllamaConnection,
    testOpenaiConnection,
    fetchOllamaModels,
    fetchOpenaiModels,
    debouncedFetchOllamaModels,
    debouncedFetchOpenaiModels,
    fetchCurrentProviderModels,
    setupWatchers,
    initOnMount,
  }
}
