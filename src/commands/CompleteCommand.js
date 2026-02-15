import { Command } from './Command.js'

/**
 * Command for toggling node completion status.
 */
export class CompleteCommand extends Command {
  constructor({ nodeId, oldCompleted, newCompleted }) {
    super('complete')
    this.nodeId = nodeId
    this.oldCompleted = oldCompleted
    this.newCompleted = newCompleted
  }

  async execute(api) {
    await api.updateNode(this.nodeId, { completed: this.newCompleted })
  }

  async undo(api) {
    await api.updateNode(this.nodeId, { completed: this.oldCompleted })
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldCompleted: this.oldCompleted,
      newCompleted: this.newCompleted
    }
  }
}
