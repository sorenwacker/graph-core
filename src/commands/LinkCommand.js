import { Command } from './Command.js'

/**
 * Command for creating a link between two nodes.
 */
export class LinkCommand extends Command {
  constructor({ sourceId, targetId }) {
    super('link')
    this.sourceId = sourceId
    this.targetId = targetId
  }

  async execute(api) {
    await api.linkNodes(this.sourceId, this.targetId)
  }

  async undo(api) {
    await api.unlinkNodes(this.sourceId, this.targetId)
  }

  toJSON() {
    return {
      type: this.type,
      sourceId: this.sourceId,
      targetId: this.targetId,
    }
  }

  getDescription() {
    return 'Link'
  }
}
