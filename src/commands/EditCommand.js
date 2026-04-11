import { Command } from './Command.js'

/**
 * Command for editing node properties.
 */
export class EditCommand extends Command {
  constructor({ nodeId, oldValues, newValues }) {
    super('edit')
    this.nodeId = nodeId
    this.oldValues = oldValues
    this.newValues = newValues
  }

  async execute(api) {
    await api.updateNode(this.nodeId, this.newValues)
  }

  async undo(api) {
    await api.updateNode(this.nodeId, this.oldValues)
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldValues: this.oldValues,
      newValues: this.newValues,
    }
  }

  getDescription() {
    const fields = Object.keys(this.newValues || {})
    if (fields.length === 1) {
      return `Edit ${fields[0]}`
    }
    return 'Edit'
  }
}
