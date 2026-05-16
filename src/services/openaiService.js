/**
 * Service for interacting with OpenAI-compatible APIs.
 * Supports OpenAI, Azure OpenAI, and other compatible endpoints.
 */

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1'
const DEFAULT_MODEL = 'gpt-4o-mini'

/**
 * Handle connection errors with user-friendly messages
 */
function handleConnectionError(error) {
  if (error.message === 'Failed to fetch' || error.code === 'ECONNREFUSED') {
    throw new Error('Cannot connect to API endpoint. Check the URL and your network connection.')
  }
  throw error
}

/**
 * Handle API response errors
 */
async function handleResponseError(response) {
  try {
    const data = await response.json()
    if (data.error) {
      throw new Error(data.error.message || data.error)
    }
  } catch (e) {
    if (e.message && !e.message.includes('API error')) throw e
  }
  throw new Error(`API error: ${response.status} ${response.statusText}`)
}

export const openaiService = {
  /**
   * Generate improved text using OpenAI-compatible API
   * @param {Object} options
   * @param {string} options.prompt - The instruction prompt
   * @param {string} options.content - The content to improve
   * @param {string} options.apiKey - API key for authentication
   * @param {string} [options.model] - Model name (default: gpt-4o-mini)
   * @param {string} [options.endpoint] - API endpoint URL
   * @returns {Promise<string>} Generated text
   */
  async generate({ prompt, content, apiKey, model = DEFAULT_MODEL, endpoint = DEFAULT_ENDPOINT }) {
    if (!apiKey) {
      throw new Error('API key is required for OpenAI-compatible endpoints')
    }

    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: content },
    ]

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
        }),
      })

      if (!response.ok) {
        await handleResponseError(response)
      }

      const data = await response.json()
      return data.choices?.[0]?.message?.content || ''
    } catch (error) {
      handleConnectionError(error)
    }
  },

  /**
   * Generate with tool/function calling support
   * @param {Object} options
   * @param {Array} options.messages - Chat messages array
   * @param {Array} options.tools - Tool definitions in OpenAI format
   * @param {string} options.apiKey - API key for authentication
   * @param {string} [options.model] - Model name (default: gpt-4o-mini)
   * @param {string} [options.endpoint] - API endpoint URL
   * @returns {Promise<{content: string|null, tool_calls: Array|null}>}
   */
  async generateWithTools({ messages, tools, apiKey, model = DEFAULT_MODEL, endpoint = DEFAULT_ENDPOINT }) {
    if (!apiKey) {
      throw new Error('API key is required for OpenAI-compatible endpoints')
    }

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          tools,
          stream: false,
        }),
      })

      if (!response.ok) {
        await handleResponseError(response)
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message || {}

      return {
        content: message.content || null,
        tool_calls: message.tool_calls || null,
      }
    } catch (error) {
      handleConnectionError(error)
    }
  },

  /**
   * Test connection to OpenAI-compatible API
   * @param {string} endpoint - API endpoint URL
   * @param {string} apiKey - API key for authentication
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async testConnection(endpoint = DEFAULT_ENDPOINT, apiKey) {
    if (!apiKey) {
      return { success: false, error: 'API key is required' }
    }

    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        if (response.status === 401) {
          return { success: false, error: 'Invalid API key' }
        }
        return {
          success: false,
          error: `API error: ${response.status} ${response.statusText}`,
        }
      }

      await response.json()
      return { success: true }
    } catch (error) {
      if (error.message === 'Failed to fetch' || error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: 'Cannot connect to API endpoint',
        }
      }
      return {
        success: false,
        error: error.message,
      }
    }
  },

  /**
   * List available models from OpenAI-compatible API
   * @param {string} endpoint - API endpoint URL
   * @param {string} apiKey - API key for authentication
   * @returns {Promise<string[]>} List of model names
   */
  async listModels(endpoint = DEFAULT_ENDPOINT, apiKey) {
    if (!apiKey) {
      throw new Error('API key is required')
    }

    try {
      const response = await fetch(`${endpoint}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return (data.data || []).map(m => m.id).sort()
    } catch (error) {
      handleConnectionError(error)
    }
  },
}
