import { Command } from './Command.js'

/**
 * Command for moving a node to a different parent.
 */
export class MoveCommand extends Command {
  constructor({ nodeId, oldParentId, newParentId }) {
    super('move')
    this.nodeId = nodeId
    this.oldParentId = oldParentId
    this.newParentId = newParentId
  }

  async execute(api) {
    await api.moveNode(this.nodeId, this.newParentId)
  }

  async undo(api) {
    await api.moveNode(this.nodeId, this.oldParentId)
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldParentId: this.oldParentId,
      newParentId: this.newParentId
    }
  }

  getDescription() {
    return 'Move'
  }
}
