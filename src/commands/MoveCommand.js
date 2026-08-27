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
      newParentId: this.newParentId,
    }
  }

  remapNodeId(oldId, newId) {
    if (this.nodeId === oldId) this.nodeId = newId
    if (this.oldParentId === oldId) this.oldParentId = newId
    if (this.newParentId === oldId) this.newParentId = newId
  }

  getDescription() {
    return 'Move'
  }
}
