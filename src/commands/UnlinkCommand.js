import { Command } from './Command.js'

/**
 * Command for removing a link between two nodes.
 */
export class UnlinkCommand extends Command {
  constructor({ sourceId, targetId }) {
    super('unlink')
    this.sourceId = sourceId
    this.targetId = targetId
  }

  async execute(api) {
    await api.unlinkNodes(this.sourceId, this.targetId)
  }

  async undo(api) {
    await api.linkNodes(this.sourceId, this.targetId)
  }

  /**
   * Follow a node that redo recreated under a new id; without this the command
   * still names the row undo deleted.
   * @param {number} oldId - The id the node had before it was recreated
   * @param {number} newId - The id it has now
   */
  remapNodeId(oldId, newId) {
    if (this.sourceId === oldId) this.sourceId = newId
    if (this.targetId === oldId) this.targetId = newId
  }

  toJSON() {
    return {
      type: this.type,
      sourceId: this.sourceId,
      targetId: this.targetId,
    }
  }

  getDescription() {
    return 'Unlink'
  }
}
