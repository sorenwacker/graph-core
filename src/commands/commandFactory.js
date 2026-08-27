import { CreateCommand } from './CreateCommand.js'
import { DeleteCommand } from './DeleteCommand.js'
import { DeleteMultipleCommand } from './DeleteMultipleCommand.js'
import { EditCommand } from './EditCommand.js'
import { MoveCommand } from './MoveCommand.js'
import { CompleteCommand } from './CompleteCommand.js'
import { MoveMultipleCommand } from './MoveMultipleCommand.js'
import { LinkCommand } from './LinkCommand.js'
import { UnlinkCommand } from './UnlinkCommand.js'
import { ReorderCommand } from './ReorderCommand.js'
import { ApplyNotesEditCommand } from './ApplyNotesEditCommand.js'

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
  'move-multiple': MoveMultipleCommand,
  link: LinkCommand,
  unlink: UnlinkCommand,
  reorder: ReorderCommand,
  'apply-notes-edit': ApplyNotesEditCommand,
  // Legacy type string from before the command was renamed; undo stacks in
  // sessionStorage survive reloads, so old entries must still deserialize.
  'ollama-improve-notes': ApplyNotesEditCommand,
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
  const { type: _type, ...params } = json
  return new CommandClass(params)
}

/**
 * Serialize an array of commands to JSON.
 * @param {Command[]} commands - Array of command instances
 * @returns {Object[]} - Array of serialized command data
 */
export function serializeStack(commands) {
  // Commands carrying note text are never written to storage. Keep only the
  // commands after the last one of those: undo pops from the end, so the
  // suffix is undoable without the command that was dropped, while anything
  // before it is not.
  let start = 0
  for (let i = 0; i < commands.length; i++) {
    if (typeof commands[i].isPersistable === 'function' && !commands[i].isPersistable()) start = i + 1
  }
  return commands.slice(start).map(cmd => cmd.toJSON())
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
