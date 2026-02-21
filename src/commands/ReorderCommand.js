import { Command } from './Command.js'

/**
 * Command for reordering a node among its siblings.
 */
export class ReorderCommand extends Command {
  constructor({ nodeId, oldTargetId, oldPosition, newTargetId, newPosition }) {
    super('reorder')
    this.nodeId = nodeId
    this.oldTargetId = oldTargetId
    this.oldPosition = oldPosition
    this.newTargetId = newTargetId
    this.newPosition = newPosition
  }

  async execute(api) {
    await api.reorderNode(this.nodeId, this.newTargetId, this.newPosition)
  }

  async undo(api) {
    await api.reorderNode(this.nodeId, this.oldTargetId, this.oldPosition)
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldTargetId: this.oldTargetId,
      oldPosition: this.oldPosition,
      newTargetId: this.newTargetId,
      newPosition: this.newPosition
    }
  }

  getDescription() {
    return 'Reorder'
  }
}
