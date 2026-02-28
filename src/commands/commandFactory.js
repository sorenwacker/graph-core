import { CreateCommand } from './CreateCommand.js'
import { DeleteCommand } from './DeleteCommand.js'
import { DeleteMultipleCommand } from './DeleteMultipleCommand.js'
import { EditCommand } from './EditCommand.js'
import { MoveCommand } from './MoveCommand.js'
import { CompleteCommand } from './CompleteCommand.js'
import { LinkCommand } from './LinkCommand.js'
import { UnlinkCommand } from './UnlinkCommand.js'
import { ReorderCommand } from './ReorderCommand.js'
import { OllamaImproveNotesCommand } from './OllamaImproveNotesCommand.js'

/**
 * Registry of command types to their constructors.
 */
const commandRegistry = {
  create: CreateCommand,
  delete: DeleteCommand,
  'delete-multiple': DeleteMultipleCommand,
  edit: EditCommand,
  move: MoveCommand,
  complete: CompleteCommand,
  link: LinkCommand,
  unlink: UnlinkCommand,
  reorder: ReorderCommand,
  'ollama-improve-notes': OllamaImproveNotesCommand
}

/**
 * Deserialize a command from its JSON representation.
 * @param {Object} json - Serialized command data (from toJSON())
 * @returns {Command|null} - Reconstructed command instance or null if invalid
 */
export function fromJSON(json) {
  if (!json || !json.type) return null

  const CommandClass = commandRegistry[json.type]
  if (!CommandClass) {
    console.warn(`Unknown command type: ${json.type}`)
    return null
  }

  // Each command's constructor takes a single options object
  // The toJSON() output matches the constructor parameters
  const { type, ...params } = json
  return new CommandClass(params)
}

/**
 * Serialize an array of commands to JSON.
 * @param {Command[]} commands - Array of command instances
 * @returns {Object[]} - Array of serialized command data
 */
export function serializeStack(commands) {
  return commands.map(cmd => cmd.toJSON())
}

/**
 * Deserialize an array of commands from JSON.
 * @param {Object[]} jsonArray - Array of serialized command data
 * @returns {Command[]} - Array of reconstructed command instances
 */
export function deserializeStack(jsonArray) {
  if (!Array.isArray(jsonArray)) return []
  return jsonArray.map(fromJSON).filter(cmd => cmd !== null)
}
