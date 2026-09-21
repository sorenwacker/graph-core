/**
 * Wikipedia lookup configuration for the main process
 * (docs/guides/ai-notes.md, "Wikipedia lookup").
 * Imports shared config and adds runtime utilities.
 */

const sharedConfig = require('../shared/agentConfig.json')

const AGENT_TOOLS = sharedConfig.tools
const DEFAULT_LOOKUP_PROMPT = sharedConfig.lookupPrompt
const TOOL_PROTOCOL = sharedConfig.toolProtocol
const FALLBACK_PROTOCOL = sharedConfig.fallbackProtocol
const MAX_AGENT_ITERATIONS = sharedConfig.maxIterations

// Used when the provider reports no context size (OpenAI-compatible endpoints).
const DEFAULT_CONTEXT_TOKENS = 16384
// Share of the context window one article may take, so that a second article,
// the instructions and the answer still fit.
const ARTICLE_CONTEXT_SHARE = 0.35
const CHARS_PER_TOKEN = 4

/**
 * How many characters of one article fit the model's context window.
 * @param {number} [contextSize] - Context window in tokens
 * @returns {number} Character budget for one article
 */
function articleCharBudget(contextSize) {
  const tokens = contextSize > 0 ? contextSize : DEFAULT_CONTEXT_TOKENS
  return Math.floor(tokens * CHARS_PER_TOKEN * ARTICLE_CONTEXT_SHARE)
}

/**
 * Describe the node a lookup was started from, so an ambiguous question is
 * read in context. Note text is deliberately not part of it.
 * @param {{title?: string, type?: string, parentTitle?: string}} [node] - The node
 * @returns {string} One line of context, or an empty string
 */
function describeNode(node) {
  if (!node?.title) return ''
  const kind = node.type ? ` (${node.type})` : ''
  const parent = node.parentTitle ? `, which belongs to "${node.parentTitle}"` : ''
  return `Context: the question is asked from a note titled "${node.title}"${kind}${parent}.`
}

/**
 * Build the system and user messages for a lookup.
 *
 * The instructions are the preset's prompt, which the user may edit. The tool
 * protocol is appended by the app and is not editable, so an edited prompt
 * cannot stop the tools from working.
 *
 * @param {Object} options
 * @param {string} options.question - What the user asked
 * @param {string} [options.instructions] - The edited prompt; blank means the default
 * @param {Object} [options.node] - Node context (title, type, parentTitle)
 * @param {boolean} [options.withTools=true] - False when the app reads the articles itself
 * @returns {Array<{role: string, content: string}>} System and user message
 */
function buildLookupMessages({ question, instructions, node, withTools = true }) {
  const prompt = instructions && instructions.trim() ? instructions.trim() : DEFAULT_LOOKUP_PROMPT
  const protocol = withTools ? TOOL_PROTOCOL : FALLBACK_PROTOCOL
  const context = describeNode(node)
  return [
    { role: 'system', content: `${prompt}\n\n${protocol}` },
    { role: 'user', content: context ? `${context}\n\n${question}` : question },
  ]
}

/**
 * Check if response looks like malformed tool output (model doesn't support tools)
 */
function isGarbageResponse(content) {
  if (!content) return false
  const patterns = sharedConfig.garbagePatterns
  for (const pattern of patterns) {
    if (content.includes(pattern)) return true
  }
  // Additional runtime checks
  return content.includes('```json\n{"') || (content.startsWith('{') && content.includes('"query"'))
}

module.exports = {
  AGENT_TOOLS,
  DEFAULT_LOOKUP_PROMPT,
  TOOL_PROTOCOL,
  MAX_AGENT_ITERATIONS,
  articleCharBudget,
  buildLookupMessages,
  isGarbageResponse,
}
