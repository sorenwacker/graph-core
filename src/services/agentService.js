/**
 * Agent service for research tasks with tool calling.
 * Implements a simple agent loop that can search and read Wikipedia articles.
 */

import { wikipediaService } from './wikipediaService.js'
import { ollamaService } from './ollamaService.js'
import { openaiService } from './openaiService.js'
import sharedConfig from '../../shared/agentConfig.json'

const MAX_ITERATIONS = sharedConfig.maxIterations
const RESEARCH_SYSTEM_PROMPT = sharedConfig.systemPrompt
const TOOLS = sharedConfig.tools

/**
 * Get provider-specific service methods
 * @param {string} provider - 'ollama' or 'openai'
 * @returns {{generateWithTools: Function, generate: Function}}
 */
function getProviderService(provider) {
  return provider === 'openai' ? openaiService : ollamaService
}

/**
 * Build provider-specific options for API calls
 * @param {Object} options - Base options
 * @param {string} provider - Provider name
 * @returns {Object} Provider-specific options
 */
function buildProviderOptions(options, provider) {
  const { model, endpoint, apiKey, contextSize } = options
  if (provider === 'openai') {
    return { model, endpoint, apiKey }
  }
  return { model, endpoint, contextSize }
}

/**
 * Execute a tool call
 * @param {string} name - Tool name
 * @param {Object} args - Tool arguments
 * @returns {Promise<string>} Tool result as string
 */
async function executeTool(name, args) {
  try {
    switch (name) {
      case 'wikipedia_search': {
        const results = await wikipediaService.search(args.query, 3)
        if (results.length === 0) {
          return 'No Wikipedia articles found for this query.'
        }
        return JSON.stringify(results, null, 2)
      }
      case 'wikipedia_get_content': {
        const content = await wikipediaService.getExtract(args.title)
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
 * Parse tool arguments from various formats
 */
function parseToolArgs(args) {
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
 * Process tool calls from LLM response
 * @param {Array} toolCalls - Tool calls from response
 * @param {number} iteration - Current iteration number
 * @returns {Promise<Array>} Tool result messages
 */
async function processToolCalls(toolCalls, iteration) {
  const results = []
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function?.name || toolCall.name
    const toolArgs = parseToolArgs(toolCall.function?.arguments || toolCall.arguments)
    const toolId = toolCall.id || `call_${iteration}_${toolName}`
    const result = await executeTool(toolName, toolArgs)
    results.push({ role: 'tool', tool_call_id: toolId, content: result })
  }
  return results
}

/**
 * Run agent loop until completion or max iterations
 * @param {Array} messages - Conversation messages
 * @param {Object} options - Provider options
 * @returns {Promise<string|null>} Final response or null if max iterations
 */
async function runAgentLoop(messages, options) {
  const { provider } = options
  const service = getProviderService(provider)
  const providerOpts = buildProviderOptions(options, provider)

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await service.generateWithTools({
      messages,
      tools: TOOLS,
      ...providerOpts,
    })

    if (response.tool_calls && response.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      })
      const toolResults = await processToolCalls(response.tool_calls, i)
      messages.push(...toolResults)
    } else {
      return response.content || 'No response generated.'
    }
  }
  return null // Max iterations reached
}

/**
 * Generate final summary when max iterations reached
 * @param {Array} messages - Conversation messages
 * @param {Object} options - Provider options
 * @returns {Promise<string>} Final summary
 */
async function generateFinalSummary(messages, options) {
  const { provider } = options
  const service = getProviderService(provider)
  const providerOpts = buildProviderOptions(options, provider)

  return service.generate({
    prompt: 'Based on the information gathered, provide a final summary.',
    content: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
    ...providerOpts,
  })
}

/**
 * Run research agent with the given prompt
 * @param {Object} options
 * @param {string} options.prompt - User's research question
 * @param {string} options.provider - 'ollama' or 'openai'
 * @param {string} [options.model] - Model name
 * @param {string} [options.endpoint] - API endpoint
 * @param {string} [options.apiKey] - API key (for OpenAI)
 * @param {number} [options.contextSize] - Context size (for Ollama)
 * @returns {Promise<string>} Final research response
 */
export async function research(options) {
  const { prompt } = options

  const messages = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const result = await runAgentLoop(messages, options)
  if (result !== null) {
    return result
  }

  // Max iterations reached - generate final summary
  return generateFinalSummary(messages, options)
}

export const agentService = {
  research,
}
