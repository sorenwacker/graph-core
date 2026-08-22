/**
 * Ollama IPC Handlers
 *
 * Registers all OLLAMA_* IPC handlers for Ollama LLM integration.
 */

const { OLLAMA_GENERATE, OLLAMA_TEST_CONNECTION, OLLAMA_LIST_MODELS } = require('../ipcChannels')

/**
 * Make HTTP request to Ollama API.
 * @param {Function} httpRequest - HTTP request function
 * @param {string} endpoint - Ollama API endpoint URL
 * @param {string} path - API path
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response data
 */
function ollamaRequest(httpRequest, endpoint, path, options = {}) {
  return httpRequest(`${endpoint}${path}`, {
    method: options.method,
    body: options.body,
    errorPrefix: 'Ollama API',
    connectionError: 'Ollama is not running. Start with: ollama serve',
  })
}

/**
 * Register all Ollama IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Function} httpRequest - HTTP request function
 */
function registerOllamaHandlers(ipcMain, httpRequest) {
  ipcMain.handle(OLLAMA_GENERATE, async (_event, { prompt, content, model, endpoint, contextSize }) => {
    const fullPrompt = `${prompt}\n\n---\n\n${content}`

    try {
      const response = await ollamaRequest(httpRequest, endpoint, '/api/generate', {
        method: 'POST',
        body: {
          model,
          prompt: fullPrompt,
          stream: false,
          options: {
            num_ctx: contextSize || 32768,
          },
        },
      })
      return response.response
    } catch (error) {
      if (error.statusCode === 404 && error.data?.error?.includes('not found')) {
        throw new Error(`Model not available. Run: ollama pull ${model}`, { cause: error })
      }
      throw error
    }
  })

  ipcMain.handle(OLLAMA_TEST_CONNECTION, async (_event, endpoint) => {
    try {
      await ollamaRequest(httpRequest, endpoint, '/api/tags')
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  })

  ipcMain.handle(OLLAMA_LIST_MODELS, async (_event, endpoint) => {
    const response = await ollamaRequest(httpRequest, endpoint, '/api/tags')
    return (response.models || []).map(m => m.name)
  })
}

// Export ollamaRequest for use by agent module
module.exports = { registerOllamaHandlers, ollamaRequest }
