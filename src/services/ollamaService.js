/**
 * Service for interacting with the Ollama API.
 * Provides methods for generating text, testing connection, and listing models.
 */

const DEFAULT_ENDPOINT = 'http://localhost:11434'
const DEFAULT_MODEL = 'llama3.2'

/**
 * Handle connection errors with user-friendly messages
 */
function handleConnectionError(error, _model = null) {
  if (error.message === 'Failed to fetch' || error.code === 'ECONNREFUSED') {
    throw new Error('Ollama is not running. Start with: ollama serve')
  }
  throw error
}

/**
 * Handle API response errors
 */
async function handleResponseError(response, model = null) {
  if (response.status === 404 && model) {
    try {
      const data = await response.json()
      if (data.error && data.error.includes('not found')) {
        throw new Error(`Model not available. Run: ollama pull ${model}`)
      }
    } catch (e) {
      if (e.message.includes('Model not available')) throw e
    }
  }
  throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
}

export const ollamaService = {
  /**
   * Generate improved text using Ollama
   * @param {Object} options
   * @param {string} options.prompt - The instruction prompt
   * @param {string} options.content - The content to improve
   * @param {string} [options.model] - Model name (default: llama3.2)
   * @param {string} [options.endpoint] - Ollama endpoint URL
   * @returns {Promise<string>} Generated text
   */
  async generate({ prompt, content, model = DEFAULT_MODEL, endpoint = DEFAULT_ENDPOINT }) {
    const fullPrompt = `${prompt}\n\n---\n\n${content}`

    try {
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: fullPrompt,
          stream: false,
        }),
      })

      if (!response.ok) {
        await handleResponseError(response, model)
      }

      const data = await response.json()
      return data.response
    } catch (error) {
      handleConnectionError(error, model)
    }
  },

  /**
   * Generate with tool/function calling support (requires llama3.1+)
   * @param {Object} options
   * @param {Array} options.messages - Chat messages array
   * @param {Array} options.tools - Tool definitions
   * @param {string} [options.model] - Model name (default: llama3.2)
   * @param {string} [options.endpoint] - Ollama endpoint URL
   * @param {number} [options.contextSize] - Context window size (num_ctx)
   * @returns {Promise<{content: string|null, tool_calls: Array|null}>}
   */
  async generateWithTools({ messages, tools, model = DEFAULT_MODEL, endpoint = DEFAULT_ENDPOINT, contextSize }) {
    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false,
          options: { num_ctx: contextSize || 32768 },
        }),
      })

      if (!response.ok) {
        await handleResponseError(response, model)
      }

      const data = await response.json()
      const message = data.message || {}

      return {
        content: message.content || null,
        tool_calls: message.tool_calls || null,
      }
    } catch (error) {
      handleConnectionError(error, model)
    }
  },

  /**
   * Test connection to Ollama server
   * @param {string} [endpoint] - Ollama endpoint URL
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection(endpoint = DEFAULT_ENDPOINT) {
    try {
      const response = await fetch(`${endpoint}/api/tags`)

      if (!response.ok) {
        return {
          success: false,
          error: `Ollama API error: ${response.status} ${response.statusText}`,
        }
      }

      await response.json()
      return { success: true }
    } catch (error) {
      if (error.message === 'Failed to fetch' || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Ollama is not running. Start with: ollama serve',
        }
      }
      return {
        success: false,
        error: error.message,
      }
    }
  },

  /**
   * List available models from Ollama
   * @param {string} [endpoint] - Ollama endpoint URL
   * @returns {Promise<string[]>} List of model names
   */
  async listModels(endpoint = DEFAULT_ENDPOINT) {
    try {
      const response = await fetch(`${endpoint}/api/tags`)

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return (data.models || []).map(m => m.name)
    } catch (error) {
      handleConnectionError(error)
    }
  },
}
