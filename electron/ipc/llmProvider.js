/**
 * LLM Provider Abstraction
 *
 * Strategy pattern implementation for LLM providers (OpenAI, Ollama).
 * Eliminates duplicate if/else branches throughout the codebase.
 */

const { ollamaRequest } = require('./ollama')
const { openaiRequest } = require('./openai')

/**
 * Create a provider-specific chat request.
 * @param {Function} httpRequest - HTTP request function
 * @param {Object} options - Request options
 * @param {string} options.provider - 'openai' or 'ollama'
 * @param {string} options.endpoint - API endpoint
 * @param {string} options.model - Model name
 * @param {Array} options.messages - Chat messages
 * @param {string} options.apiKey - API key (OpenAI only)
 * @param {number} options.contextSize - Context size (Ollama only)
 * @param {Array} options.tools - Tool definitions (optional)
 * @param {boolean} options.skipSslVerification - Skip SSL verification (OpenAI only)
 * @returns {Promise<Object>} Response with content and optional tool_calls
 */
async function chatRequest(httpRequest, options) {
  const { provider, endpoint, model, messages, apiKey, contextSize, tools, skipSslVerification } = options

  if (provider === 'openai') {
    const body = {
      model,
      messages,
      stream: false,
    }
    if (tools) body.tools = tools

    const result = await openaiRequest(httpRequest, endpoint, '/chat/completions', apiKey, {
      method: 'POST',
      body,
      skipSslVerification,
    })
    const message = result.choices?.[0]?.message || {}
    return {
      content: message.content || null,
      tool_calls: message.tool_calls || null,
    }
  } else {
    const body = {
      model,
      messages,
      stream: false,
      options: { num_ctx: contextSize || 32768 },
    }
    if (tools) body.tools = tools

    const result = await ollamaRequest(httpRequest, endpoint, '/api/chat', {
      method: 'POST',
      body,
    })
    const message = result.message || {}
    return {
      content: message.content || null,
      tool_calls: message.tool_calls || null,
    }
  }
}

module.exports = { chatRequest }
