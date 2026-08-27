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
   * Whether this command may be written to sessionStorage with the rest of the
   * stack. Commands carrying note text override this to false: sessionStorage
   * is disk-backed, and a sensitive note is decrypted only into memory for an
   * unlocked session (docs/architecture/sensitive-notes.md). A non-persistable
   * command still undoes and redoes normally within the session.
   * @returns {boolean}
   */
  isPersistable() {
    return true
  }

  /**
   * Get human-readable description of the command
   * @returns {string}
   */
  getDescription() {
    return this.type
  }
}
