/**
 * Wikipedia lookup IPC handler (docs/guides/ai-notes.md, "Wikipedia lookup").
 *
 * Runs a tool-calling loop in which the model searches and reads Wikipedia, and
 * a fallback for models that cannot call tools. Wikipedia is the only source.
 */

const wikipedia = require('../wikipedia')
const {
  AGENT_TOOLS,
  MAX_AGENT_ITERATIONS,
  articleCharBudget,
  buildLookupMessages,
  isGarbageResponse,
} = require('../agentConfig')
const { AGENT_WIKIPEDIA_LOOKUP } = require('../ipcChannels')
const { chatRequest } = require('./llmProvider')

// Map tool names to their tool group (e.g., wikipedia_search -> wikipedia)
const TOOL_GROUPS = {
  wikipedia_search: 'wikipedia',
  wikipedia_get_content: 'wikipedia',
}

// How many of the top search hits the fallback reads in full.
const FALLBACK_ARTICLE_COUNT = 2

/**
 * Filter tools based on enabled tool groups
 * @param {string[]} enabledTools - Array of enabled tool group IDs
 * @returns {Array} Filtered tools array
 */
function getEnabledTools(enabledTools) {
  if (!enabledTools || enabledTools.length === 0) {
    return []
  }
  return AGENT_TOOLS.filter(tool => {
    const toolName = tool.function?.name
    const group = TOOL_GROUPS[toolName]
    return group && enabledTools.includes(group)
  })
}

/**
 * Lookup options passed to agent functions.
 * @typedef {Object} LookupOptions
 * @property {string} question - What the user asked
 * @property {string} [instructions] - The preset's prompt, possibly edited; blank means the default
 * @property {Object} [node] - Node context (title, type, parentTitle); never note text
 * @property {string} provider - LLM provider ('openai' or 'ollama')
 * @property {string} model - Model name
 * @property {string} endpoint - API endpoint
 * @property {string} apiKey - API key (for OpenAI)
 * @property {number} contextSize - Context size for Ollama
 * @property {boolean} [skipSslVerification] - Skip SSL verification (OpenAI only)
 */

/**
 * Render an article for the model, with the URL it needs for the source list.
 * @param {{title: string, content: string, url: string}} article - The article
 * @returns {string} Title, URL and text
 */
function formatArticle(article) {
  return `Title: ${article.title}\nURL: ${article.url}\n\n${article.content}`
}

/**
 * Execute an agent tool by name.
 * @param {Function} httpRequest - HTTP request function
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @param {number} [maxChars] - Character budget for one article
 * @returns {Promise<string>} Tool result
 */
async function executeAgentTool(httpRequest, name, args, maxChars) {
  try {
    switch (name) {
      case 'wikipedia_search': {
        const results = await wikipedia.search(httpRequest, args.query)
        if (results.length === 0) {
          return 'No Wikipedia articles found for this query.'
        }
        return JSON.stringify(results, null, 2)
      }
      case 'wikipedia_get_content':
        return formatArticle(await wikipedia.getContent(httpRequest, args.title, { maxChars }))
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
 * @param {number} [maxChars] - Character budget for one article
 */
async function processToolCalls(httpRequest, toolCalls, messages, iterationIndex, maxChars) {
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name || toolCall.name
    const toolArgs = parseToolArgs(toolCall)
    const toolId = toolCall.id || `call_${iterationIndex}_${toolName}`
    const result = await executeAgentTool(httpRequest, toolName, toolArgs, maxChars)

    messages.push({
      role: 'tool',
      tool_call_id: toolId,
      content: result,
    })
  }
}

/**
 * Lookup for models that cannot call tools: the app searches with the question,
 * reads the top articles in full, and asks the model to answer from them under
 * the same instructions as the tool-calling path.
 * @param {Function} httpRequest - HTTP request function
 * @param {LookupOptions} options - Lookup options
 * @returns {Promise<string>} Lookup result
 */
async function fallbackLookup(httpRequest, options) {
  const { question, instructions, node, provider, model, endpoint, apiKey, contextSize, skipSslVerification } = options

  const searchResults = await wikipedia.search(httpRequest, question)
  if (searchResults.length === 0) {
    return `No Wikipedia articles found for "${question}".`
  }

  const maxChars = articleCharBudget(contextSize)
  const articles = []
  for (const hit of searchResults.slice(0, FALLBACK_ARTICLE_COUNT)) {
    try {
      articles.push(await wikipedia.getContent(httpRequest, hit.title, { maxChars }))
    } catch {
      // A hit that cannot be read is skipped; the next one may still answer.
    }
  }
  if (articles.length === 0) {
    return `Found "${searchResults[0].title}" on Wikipedia but could not retrieve its content.`
  }

  const [system, user] = buildLookupMessages({ question, instructions, node, withTools: false })
  const articleText = articles.map(formatArticle).join('\n\n---\n\n')

  const response = await chatRequest(httpRequest, {
    provider,
    endpoint,
    model,
    apiKey,
    contextSize,
    skipSslVerification,
    messages: [system, { role: 'user', content: `${user.content}\n\n${articleText}` }],
  })

  return response.content || 'Could not generate an answer.'
}

/**
 * Run the agent iteration loop.
 * @param {Function} httpRequest - HTTP request function
 * @param {Array} messages - Initial messages array
 * @param {LookupOptions} options - Lookup options
 * @param {Array} tools - Tools to use
 * @returns {Promise<string>} Final response content
 */
async function runAgentLoop(httpRequest, messages, options, tools) {
  const { provider, model, endpoint, apiKey, contextSize, skipSslVerification } = options
  const maxChars = articleCharBudget(contextSize)

  for (let i = 0; i < MAX_AGENT_ITERATIONS; i++) {
    const response = await chatRequest(httpRequest, {
      provider,
      endpoint,
      model,
      apiKey,
      contextSize,
      skipSslVerification,
      messages,
      tools,
    })

    // Check if model returned garbage (doesn't support tools)
    if (isGarbageResponse(response.content) && !response.tool_calls) {
      console.log('Model does not support tool calling, using fallback...')
      return await fallbackLookup(httpRequest, options)
    }

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      })

      await processToolCalls(httpRequest, response.tool_calls, messages, i, maxChars)
    } else {
      return response.content || 'No response generated.'
    }
  }

  // Max iterations reached - ask for the answer without offering tools again
  const finalResponse = await chatRequest(httpRequest, {
    provider,
    endpoint,
    model,
    apiKey,
    contextSize,
    skipSslVerification,
    messages: [
      ...messages,
      { role: 'user', content: 'Stop calling tools. Answer the question now from the articles you have read.' },
    ],
  })

  return finalResponse.content || 'No response generated.'
}

/**
 * Register the Wikipedia lookup IPC handler.
 * @param {Electron.IpcMain} ipcMain - Electron IPC main module
 * @param {Function} httpRequest - HTTP request function
 */
function registerAgentHandlers(ipcMain, httpRequest) {
  ipcMain.handle(AGENT_WIKIPEDIA_LOOKUP, async (_event, options) => {
    const tools = getEnabledTools(options.enabledTools)
    if (tools.length === 0) {
      return 'The Wikipedia tool is disabled. Enable it in Settings > AI > Agent Tools to use the Wikipedia lookup.'
    }

    const { question, instructions, node } = options
    const messages = buildLookupMessages({ question, instructions, node })

    try {
      return await runAgentLoop(httpRequest, messages, options, tools)
    } catch (err) {
      // If tool calling fails, try fallback
      console.log('Tool calling failed, using fallback:', err.message)
      return await fallbackLookup(httpRequest, options)
    }
  })
}

module.exports = { registerAgentHandlers, executeAgentTool, fallbackLookup, runAgentLoop }
