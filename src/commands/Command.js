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

  /**
   * Replace every reference to `oldId` with `newId`.
   *
   * Redoing a creation cannot reuse the original row id, so the commands queued
   * behind it would otherwise name a node that no longer exists. Commands that
   * hold node ids override this; the base is a no-op for those that hold none.
   *
   * @param {number} _oldId - The id that is no longer valid
   * @param {number} _newId - The id that replaced it
   */
  remapNodeId(_oldId, _newId) {}

  /**
   * Get human-readable description of the command
   * @returns {string}
   */
  getDescription() {
    return this.type
  }
}
