import { Command } from './Command.js'

/**
 * Command for toggling node completion status.
 */
export class CompleteCommand extends Command {
  /**
   * @param {Object} params
   * @param {number} params.nodeId - Node being toggled
   * @param {boolean} params.oldCompleted - Completion state before the change
   * @param {boolean} params.newCompleted - Completion state after the change
   * @param {string|null} [params.oldEndDate] - end_date before the change
   */
  constructor({ nodeId, oldCompleted, newCompleted, oldEndDate = null }) {
    super('complete')
    this.nodeId = nodeId
    this.oldCompleted = oldCompleted
    this.newCompleted = newCompleted
    // Completing a node stamps end_date. Undo has to restore whatever was there
    // before, or an uncompleted node keeps the date its completion set.
    this.oldEndDate = oldEndDate
  }

  async execute(api) {
    await api.updateNode(this.nodeId, { completed: this.newCompleted })
  }

  async undo(api) {
    await api.updateNode(this.nodeId, { completed: this.oldCompleted, end_date: this.oldEndDate })
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldCompleted: this.oldCompleted,
      newCompleted: this.newCompleted,
      oldEndDate: this.oldEndDate,
    }
  }

  remapNodeId(oldId, newId) {
    if (this.nodeId === oldId) this.nodeId = newId
  }

  getDescription() {
    return this.newCompleted ? 'Complete' : 'Uncomplete'
  }
}
