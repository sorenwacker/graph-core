/**
 * Agent IPC Handlers
 *
 * Registers AGENT_RESEARCH handler and related functions for AI research capabilities.
 */

const wikipedia = require('../wikipedia')
const { AGENT_TOOLS, RESEARCH_SYSTEM_PROMPT, MAX_AGENT_ITERATIONS, isGarbageResponse } = require('../agentConfig')
const { AGENT_RESEARCH } = require('../ipcChannels')
const { chatRequest } = require('./llmProvider')

/**
 * Research options passed to agent functions.
 * @typedef {Object} ResearchOptions
 * @property {string} prompt - User's research query
 * @property {string} provider - LLM provider ('openai' or 'ollama')
 * @property {string} model - Model name
 * @property {string} endpoint - API endpoint
 * @property {string} apiKey - API key (for OpenAI)
 * @property {number} contextSize - Context size for Ollama
 */

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
 * Parse tool arguments from various formats.
 * @param {Object} toolCall - Tool call object from LLM response
 * @returns {Object} Parsed arguments
 */
function parseToolArgs(toolCall) {
  let args = toolCall.function?.arguments || toolCall.arguments
  if (typeof args === 'string') {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }
  return args || {}
}

/**
 * Process tool calls from an LLM response.
 * @param {Function} httpRequest - HTTP request function
 * @param {Array} toolCalls - Tool calls from response
 * @param {Array} messages - Message history to append to
 * @param {number} iterationIndex - Current iteration index (for generating IDs)
 */
async function processToolCalls(httpRequest, toolCalls, messages, iterationIndex) {
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name || toolCall.name
    const toolArgs = parseToolArgs(toolCall)
    const toolId = toolCall.id || `call_${iterationIndex}_${toolName}`
    const result = await executeAgentTool(httpRequest, toolName, toolArgs)

    messages.push({
      role: 'tool',
      tool_call_id: toolId,
      content: result,
    })
  }
}

/**
 * Fallback research using direct Wikipedia fetch + summarization.
 * Used when the model doesn't support tool calling.
 * @param {Function} httpRequest - HTTP request function
 * @param {ResearchOptions} options - Research options
 * @returns {Promise<string>} Research result
 */
async function fallbackResearch(httpRequest, options) {
  const { prompt, provider, model, endpoint, apiKey, contextSize } = options

  // Search Wikipedia directly
  const searchResults = await wikipedia.search(httpRequest, prompt, 3)

  if (searchResults.length === 0) {
    return `No Wikipedia articles found for "${prompt}".`
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
  const summaryPrompt = `Based on the following Wikipedia article, write a clear and informative summary about "${prompt}".

Article: ${topResult.title}

${content.content}

Write a concise summary (2-4 paragraphs) that answers the user's question. Cite Wikipedia as your source.`

  const response = await chatRequest(httpRequest, {
    provider,
    endpoint,
    model,
    apiKey,
    contextSize,
    messages: [
      {
        role: 'system',
        content: 'You are a helpful research assistant. Summarize information clearly and accurately.',
      },
      { role: 'user', content: summaryPrompt },
    ],
  })

  return response.content || 'Could not generate summary.'
}

/**
 * Run the agent iteration loop.
 * @param {Function} httpRequest - HTTP request function
 * @param {Array} messages - Initial messages array
 * @param {ResearchOptions} options - Research options
 * @returns {Promise<string>} Final response content
 */
async function runAgentLoop(httpRequest, messages, options) {
  const { provider, model, endpoint, apiKey, contextSize } = options

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await chatRequest(httpRequest, {
      provider,
      endpoint,
      model,
      apiKey,
      contextSize,
      messages,
      tools: AGENT_TOOLS,
    })

    // Check if model returned garbage (doesn't support tools)
    if (isGarbageResponse(response.content) && !response.tool_calls) {
      console.log('Model does not support tool calling, using fallback...')
      return await fallbackResearch(httpRequest, options)
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      })

      await processToolCalls(httpRequest, response.tool_calls, messages, i)
    } else {
      return response.content || 'No response generated.'
    }
  }

  // Max iterations reached - generate final response
  const finalResponse = await chatRequest(httpRequest, {
    provider,
    endpoint,
    model,
    apiKey,
    contextSize,
    messages: [...messages, { role: 'user', content: 'Based on the information gathered, provide a final summary.' }],
  })

  return finalResponse.content || 'No response generated.'
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

    try {
      return await runAgentLoop(httpRequest, messages, { prompt, provider, model, endpoint, apiKey, contextSize })
    } catch (err) {
      // If tool calling fails, try fallback
      console.log('Tool calling failed, using fallback:', err.message)
      return await fallbackResearch(httpRequest, { prompt, provider, model, endpoint, apiKey, contextSize })
    }
  })
}

module.exports = { registerAgentHandlers, executeAgentTool, fallbackResearch, runAgentLoop }
