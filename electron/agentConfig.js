/**
 * Agent configuration for the main process.
 * Imports shared config and adds runtime utilities.
 */

const sharedConfig = require('../shared/agentConfig.json')

const AGENT_TOOLS = sharedConfig.tools
const RESEARCH_SYSTEM_PROMPT = sharedConfig.systemPrompt
const MAX_AGENT_ITERATIONS = sharedConfig.maxIterations

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
  RESEARCH_SYSTEM_PROMPT,
  MAX_AGENT_ITERATIONS,
  isGarbageResponse,
}
