/**
 * Provider adapters for AI text generation.
 *
 * Every provider exposes the same surface - isConfigured, config, generate,
 * testConnection, listModels - built over the reactive settings refs, read at
 * call time so settings changes apply immediately. Consumers select an adapter
 * and delegate; they never branch on the provider id. Adding a provider means
 * adding one adapter here and registering it.
 */

import { api } from './api'

export const AI_PROVIDERS = {
  OLLAMA: 'ollama',
  OPENAI: 'openai',
}

function createOllamaAdapter(settings) {
  const { ollamaEndpoint, ollamaModel, ollamaContextSize } = settings
  return {
    id: AI_PROVIDERS.OLLAMA,
    isConfigured: () => Boolean(ollamaEndpoint.value && ollamaModel.value),
    config: () => ({
      provider: AI_PROVIDERS.OLLAMA,
      model: ollamaModel.value,
      endpoint: ollamaEndpoint.value,
      contextSize: ollamaContextSize.value,
    }),
    generate: ({ prompt, content }) =>
      api.ollamaGenerate({
        prompt,
        content,
        model: ollamaModel.value,
        endpoint: ollamaEndpoint.value,
        contextSize: ollamaContextSize.value,
      }),
    testConnection: () => api.ollamaTestConnection(ollamaEndpoint.value),
    listModels: () => api.ollamaListModels(ollamaEndpoint.value),
  }
}

function createOpenaiAdapter(settings) {
  const { openaiEndpoint, openaiApiKey, openaiModel, openaiSkipSslVerification } = settings
  return {
    id: AI_PROVIDERS.OPENAI,
    isConfigured: () => Boolean(openaiEndpoint.value && openaiApiKey.value && openaiModel.value),
    config: () => ({
      provider: AI_PROVIDERS.OPENAI,
      model: openaiModel.value,
      endpoint: openaiEndpoint.value,
      apiKey: openaiApiKey.value,
      skipSslVerification: openaiSkipSslVerification.value,
    }),
    generate: ({ prompt, content }) =>
      api.openaiGenerate({
        prompt,
        content,
        model: openaiModel.value,
        endpoint: openaiEndpoint.value,
        apiKey: openaiApiKey.value,
        skipSslVerification: openaiSkipSslVerification.value,
      }),
    testConnection: () =>
      api.openaiTestConnection(openaiEndpoint.value, openaiApiKey.value, openaiSkipSslVerification.value),
    listModels: () => api.openaiListModels(openaiEndpoint.value, openaiApiKey.value, openaiSkipSslVerification.value),
  }
}

const ADAPTERS = {
  [AI_PROVIDERS.OLLAMA]: createOllamaAdapter,
  [AI_PROVIDERS.OPENAI]: createOpenaiAdapter,
}

/**
 * Create the adapter for a provider id.
 *
 * @param {string} providerId - One of AI_PROVIDERS.
 * @param {Object} settings - Reactive settings refs for all providers.
 * @returns {Object} The provider adapter.
 */
export function createAiProvider(providerId, settings) {
  const factory = ADAPTERS[providerId]
  if (!factory) {
    throw new Error(`Unknown AI provider: ${providerId}`)
  }
  return factory(settings)
}
