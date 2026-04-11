import { Command } from './Command.js'

/**
 * Command for deleting a single node.
 */
export class DeleteCommand extends Command {
  constructor({ nodeData }) {
    super('delete')
    this.nodeData = nodeData
  }

  async execute(api) {
    await api.deleteNode(this.nodeData.id, false) // Soft delete
  }

  async undo(api) {
    const restored = await api.restoreNode(this.nodeData.id)
    // Restore original parent if it was changed
    if (restored && this.nodeData.parent_id !== restored.parent_id) {
      await api.updateNode(this.nodeData.id, { parent_id: this.nodeData.parent_id })
    }
  }

  toJSON() {
    return {
      type: this.type,
      nodeData: this.nodeData,
    }
  }

  getDescription() {
    const title = this.nodeData?.title || 'item'
    return `Delete "${title}"`
  }
}
