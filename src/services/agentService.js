/**
 * Agent service for research tasks with tool calling.
 * Implements a simple agent loop that can search and read Wikipedia articles.
 */

import { wikipediaService } from './wikipediaService.js'
import { ollamaService } from './ollamaService.js'
import { openaiService } from './openaiService.js'

const MAX_ITERATIONS = 5

const RESEARCH_SYSTEM_PROMPT = `You are a research assistant with access to Wikipedia.

When asked about a topic:
1. Use wikipedia_search to find relevant articles
2. Use wikipedia_get_content to read the most relevant article
3. Write a clear, informative summary based on the information

Always cite Wikipedia as your source. Be concise but thorough.
If you cannot find information, say so clearly.

Important: After gathering information, provide a final written response without calling any more tools.`

/**
 * Tool definitions for the agent
 */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'wikipedia_search',
      description:
        'Search Wikipedia for articles matching a query. Returns titles and descriptions of matching articles.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to find Wikipedia articles',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'wikipedia_get_content',
      description:
        'Get the content of a Wikipedia article by its exact title. Use this after searching to read article details.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The exact title of the Wikipedia article to retrieve',
          },
        },
        required: ['title'],
      },
    },
  },
]

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
  const { prompt, provider, model, endpoint, apiKey, contextSize } = options

  const messages = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'user', content: prompt },
  ]

  const tools = TOOLS

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let response

    if (provider === 'openai') {
      response = await openaiService.generateWithTools({
        messages,
        tools,
        model,
        endpoint,
        apiKey,
      })
    } else {
      response = await ollamaService.generateWithTools({
        messages,
        tools,
        model,
        endpoint,
        contextSize,
      })
    }

    // Check if we have tool calls
    if (response.tool_calls && response.tool_calls.length > 0) {
      // Add assistant message with tool calls
      messages.push({
        role: 'assistant',
        content: response.content || '',
        tool_calls: response.tool_calls,
      })

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        const toolName = toolCall.function?.name || toolCall.name
        const toolArgs = parseToolArgs(toolCall.function?.arguments || toolCall.arguments)
        const toolId = toolCall.id || `call_${i}_${toolName}`

        const result = await executeTool(toolName, toolArgs)

        // Add tool result to messages
        messages.push({
          role: 'tool',
          tool_call_id: toolId,
          content: result,
        })
      }
    } else {
      // No tool calls - this is the final response
      return response.content || 'No response generated.'
    }
  }

  // Max iterations reached - ask for final response without tools
  const finalResponse =
    provider === 'openai'
      ? await openaiService.generate({
          prompt: 'Based on the information gathered, provide a final summary.',
          content: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          model,
          endpoint,
          apiKey,
        })
      : await ollamaService.generate({
          prompt: 'Based on the information gathered, provide a final summary.',
          content: messages.map(m => `${m.role}: ${m.content}`).join('\n'),
          model,
          endpoint,
          contextSize,
        })

  return finalResponse
}

export const agentService = {
  research,
}
