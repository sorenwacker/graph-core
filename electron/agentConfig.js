/**
 * Shared agent configuration for the main process.
 * Tool definitions and system prompts for the research agent.
 */

const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'wikipedia_search',
      description:
        'Search Wikipedia for articles matching a query. Returns titles and descriptions of matching articles.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query to find Wikipedia articles' },
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
          title: { type: 'string', description: 'The exact title of the Wikipedia article to retrieve' },
        },
        required: ['title'],
      },
    },
  },
]

const RESEARCH_SYSTEM_PROMPT = `You are a research assistant with access to Wikipedia.

When asked about a topic:
1. Use wikipedia_search to find relevant articles
2. Use wikipedia_get_content to read the most relevant article
3. Write a clear, informative summary based on the information

Always cite Wikipedia as your source. Be concise but thorough.
If you cannot find information, say so clearly.

Important: After gathering information, provide a final written response without calling any more tools.`

const MAX_AGENT_ITERATIONS = 5

/**
 * Check if response looks like malformed tool output (model doesn't support tools)
 */
function isGarbageResponse(content) {
  if (!content) return false
  return (
    content.includes('<|') ||
    content.includes('|>') ||
    content.includes('<|channel|>') ||
    content.includes('<|constrain|>') ||
    content.includes('```json\n{"') ||
    (content.startsWith('{') && content.includes('"query"'))
  )
}

module.exports = {
  AGENT_TOOLS,
  RESEARCH_SYSTEM_PROMPT,
  MAX_AGENT_ITERATIONS,
  isGarbageResponse,
}
