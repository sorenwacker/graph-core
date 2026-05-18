/**
 * OpenAI IPC Handlers
 *
 * Registers all OPENAI_* IPC handlers for OpenAI-compatible API integration.
 */

const { OPENAI_GENERATE, OPENAI_TEST_CONNECTION, OPENAI_LIST_MODELS } = require('../ipcChannels')

/**
 * Make HTTP request to OpenAI-compatible API.
 * @param {Function} httpRequest - HTTP request function
 * @param {string} endpoint - API endpoint URL
 * @param {string} path - API path
 * @param {string} apiKey - API key for authentication
 * @param {Object} options - Request options
 * @returns {Promise<Object>} Response data
 */
function openaiRequest(httpRequest, endpoint, path, apiKey, options = {}) {
  return httpRequest(`${endpoint}${path}`, {
    method: options.method,
    body: options.body,
    headers: { Authorization: `Bearer ${apiKey}` },
    skipSslVerification: options.skipSslVerification,
  })
}

/**
 * Register all OpenAI IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Function} httpRequest - HTTP request function
 */
function registerOpenaiHandlers(ipcMain, httpRequest) {
  ipcMain.handle(OPENAI_GENERATE, async (_event, { prompt, content, model, endpoint, apiKey, skipSslVerification }) => {
    if (!apiKey) {
      throw new Error('API key is required')
    }

    try {
      const response = await openaiRequest(httpRequest, endpoint, '/chat/completions', apiKey, {
        method: 'POST',
        body: {
          model,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: content },
          ],
          stream: false,
        },
        skipSslVerification,
      })
      return response.choices?.[0]?.message?.content || ''
    } catch (error) {
      if (error.statusCode === 401) {
        throw new Error('Invalid API key')
      }
      if (error.data?.error?.message) {
        throw new Error(error.data.error.message)
      }
      throw error
    }
  })

  ipcMain.handle(OPENAI_TEST_CONNECTION, async (_event, endpoint, apiKey, skipSslVerification) => {
    if (!apiKey) {
      return { success: false, error: 'API key is required' }
    }
    try {
      await openaiRequest(httpRequest, endpoint, '/models', apiKey, { skipSslVerification })
      return { success: true }
    } catch (error) {
      if (error.statusCode === 401) {
        return { success: false, error: 'Invalid API key' }
      }
      return {
        success: false,
        error: error.message,
      }
    }
  })

  ipcMain.handle(OPENAI_LIST_MODELS, async (_event, endpoint, apiKey, skipSslVerification) => {
    if (!apiKey) {
      throw new Error('API key is required')
    }
    const response = await openaiRequest(httpRequest, endpoint, '/models', apiKey, {
      skipSslVerification,
    })
    return (response.data || []).map(m => m.id).sort()
  })
}

// Export openaiRequest for use by agent module
module.exports = { registerOpenaiHandlers, openaiRequest }
