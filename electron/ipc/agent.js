/**
 * Agent IPC Handlers
 *
 * Registers AGENT_RESEARCH handler and related functions for AI research capabilities.
 */

const wikipedia = require('../wikipedia')
const { AGENT_TOOLS, RESEARCH_SYSTEM_PROMPT, MAX_AGENT_ITERATIONS, isGarbageResponse } = require('../agentConfig')
const { AGENT_RESEARCH } = require('../ipcChannels')
const { ollamaRequest } = require('./ollama')
const { openaiRequest } = require('./openai')

/**
 * Execute an agent tool by name.
 * @param {Function} httpRequest - HTTP request function
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<string>} Tool result
 */
async function executeAgentTool(httpRequest, name, args) {
  try {
    switch (name) {
      case 'wikipedia_search': {
        const results = await wikipedia.search(httpRequest, args.query, 3)
        if (results.length === 0) {
          return 'No Wikipedia articles found for this query.'
        }
        return JSON.stringify(results, null, 2)
      }
      case 'wikipedia_get_content': {
        const content = await wikipedia.getContent(httpRequest, args.title)
        return `Title: ${content.title}\n\n${content.content}`
      }
      default:
        return `Unknown tool: ${name}`
    }
  } catch (error) {
    return `Tool error: ${error.message}`
  }
}

/**
 * Fallback research using direct Wikipedia fetch + summarization.
 * Used when the model doesn't support tool calling.
 * @param {Function} httpRequest - HTTP request function
 * @param {string} query - Research query
 * @param {string} provider - LLM provider ('openai' or 'ollama')
 * @param {string} model - Model name
 * @param {string} endpoint - API endpoint
 * @param {string} apiKey - API key (for OpenAI)
 * @param {number} contextSize - Context size for Ollama
 * @returns {Promise<string>} Research result
 */
async function fallbackResearch(httpRequest, query, provider, model, endpoint, apiKey, contextSize) {
  // Search Wikipedia directly
  const searchResults = await wikipedia.search(httpRequest, query, 3)

  if (searchResults.length === 0) {
    return `No Wikipedia articles found for "${query}".`
  }

  // Get content from the top result
  const topResult = searchResults[0]
  let content
  try {
    content = await wikipedia.getContent(httpRequest, topResult.title)
  } catch (err) {
    return `Found article "${topResult.title}" but could not retrieve content: ${err.message}`
  }

  // Ask model to summarize the content
  const summaryPrompt = `Based on the following Wikipedia article, write a clear and informative summary about "${query}".

Article: ${topResult.title}

${content.content}

Write a concise summary (2-4 paragraphs) that answers the user's question. Cite Wikipedia as your source.`

  if (provider === 'openai') {
    const result = await openaiRequest(httpRequest, endpoint, '/chat/completions', apiKey, {
      method: 'POST',
      body: {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful research assistant. Summarize information clearly and accurately.',
          },
          { role: 'user', content: summaryPrompt },
        ],
        stream: false,
      },
    })
    return result.choices?.[0]?.message?.content || 'Could not generate summary.'
  } else {
    const result = await ollamaRequest(httpRequest, endpoint, '/api/chat', {
      method: 'POST',
      body: {
        model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful research assistant. Summarize information clearly and accurately.',
          },
          { role: 'user', content: summaryPrompt },
        ],
        stream: false,
        options: { num_ctx: contextSize || 32768 },
      },
    })
    return result.message?.content || 'Could not generate summary.'
  }
}

/**
 * Register agent IPC handlers.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Function} httpRequest - HTTP request function
 */
function registerAgentHandlers(ipcMain, httpRequest) {
  ipcMain.handle(AGENT_RESEARCH, async (_event, options) => {
    const { prompt, provider, model, endpoint, apiKey, contextSize } = options

    const messages = [
      { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ]

    for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
      let response

      try {
        if (provider === 'openai') {
          const result = await openaiRequest(httpRequest, endpoint, '/chat/completions', apiKey, {
            method: 'POST',
            body: {
              model,
              messages,
              tools: AGENT_TOOLS,
              stream: false,
            },
          })
          const message = result.choices?.[0]?.message || {}
          response = { content: message.content || null, tool_calls: message.tool_calls || null }
        } else {
          const result = await ollamaRequest(httpRequest, endpoint, '/api/chat', {
            method: 'POST',
            body: {
              model,
              messages,
              tools: AGENT_TOOLS,
              stream: false,
              options: { num_ctx: contextSize || 32768 },
            },
          })
          const message = result.message || {}
          response = { content: message.content || null, tool_calls: message.tool_calls || null }
        }

        // Check if model returned garbage (doesn't support tools)
        if (isGarbageResponse(response.content) && !response.tool_calls) {
          console.log('Model does not support tool calling, using fallback...')
          return await fallbackResearch(httpRequest, prompt, provider, model, endpoint, apiKey, contextSize)
        }

        if (response.tool_calls && response.tool_calls.length > 0) {
          messages.push({
            role: 'assistant',
            content: response.content || '',
            tool_calls: response.tool_calls,
          })

          for (const toolCall of response.tool_calls) {
            const toolName = toolCall.function?.name || toolCall.name
            let toolArgs = toolCall.function?.arguments || toolCall.arguments
            if (typeof toolArgs === 'string') {
              try {
                toolArgs = JSON.parse(toolArgs)
              } catch {
                toolArgs = {}
              }
            }
            const toolId = toolCall.id || `call_${i}_${toolName}`
            const result = await executeAgentTool(httpRequest, toolName, toolArgs || {})

            messages.push({
              role: 'tool',
              tool_call_id: toolId,
              content: result,
            })
          }
        } else {
          return response.content || 'No response generated.'
        }
      } catch (err) {
        // If tool calling fails, try fallback
        console.log('Tool calling failed, using fallback:', err.message)
        return await fallbackResearch(httpRequest, prompt, provider, model, endpoint, apiKey, contextSize)
      }
    }

    // Max iterations - generate final response
    if (provider === 'openai') {
      const finalResult = await openaiRequest(httpRequest, endpoint, '/chat/completions', apiKey, {
        method: 'POST',
        body: {
          model,
          messages: [
            ...messages,
            { role: 'user', content: 'Based on the information gathered, provide a final summary.' },
          ],
          stream: false,
        },
      })
      return finalResult.choices?.[0]?.message?.content || 'No response generated.'
    } else {
      const finalResult = await ollamaRequest(httpRequest, endpoint, '/api/chat', {
        method: 'POST',
        body: {
          model,
          messages: [
            ...messages,
            { role: 'user', content: 'Based on the information gathered, provide a final summary.' },
          ],
          stream: false,
          options: { num_ctx: contextSize || 32768 },
        },
      })
      return finalResult.message?.content || 'No response generated.'
    }
  })
}

module.exports = { registerAgentHandlers, executeAgentTool, fallbackResearch }
