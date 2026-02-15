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

  toJSON() {
    return {
      type: this.type,
      sourceId: this.sourceId,
      targetId: this.targetId
    }
  }
}
