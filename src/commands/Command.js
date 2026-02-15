/**
 * Base interface for all undoable commands.
 * Commands encapsulate both execute (redo) and undo operations.
 */
export class Command {
  /**
   * @param {string} type - Command type identifier
   */
  constructor(type) {
    this.type = type
  }

  /**
   * Execute the command (for redo operations)
   * @param {Object} api - API service
   * @returns {Promise<void>}
   */
  async execute(_api) {
    throw new Error('execute() must be implemented')
  }

  /**
   * Undo the command
   * @param {Object} api - API service
   * @returns {Promise<void>}
   */
  async undo(_api) {
    throw new Error('undo() must be implemented')
  }

  /**
   * Serialize command to plain object
   * @returns {Object}
   */
  toJSON() {
    return { type: this.type }
  }
}
