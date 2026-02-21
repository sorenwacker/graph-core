import { Command } from './Command.js'

/**
 * Command for deleting multiple nodes.
 */
export class DeleteMultipleCommand extends Command {
  constructor({ nodes }) {
    super('delete-multiple')
    this.nodes = nodes // Array of { id, parent_id, ...nodeData }
  }

  async execute(api) {
    for (const node of this.nodes) {
      await api.deleteNode(node.id, false) // Soft delete
    }
  }

  async undo(api) {
    for (const node of this.nodes) {
      const restored = await api.restoreNode(node.id)
      if (restored && node.parent_id !== restored.parent_id) {
        await api.updateNode(node.id, { parent_id: node.parent_id })
      }
    }
  }

  toJSON() {
    return {
      type: this.type,
      nodes: this.nodes
    }
  }

  getDescription() {
    const count = this.nodes?.length || 0
    return `Delete ${count} items`
  }
}
