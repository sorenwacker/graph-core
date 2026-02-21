import { Command } from './Command.js'

/**
 * Command for creating a new node.
 */
export class CreateCommand extends Command {
  constructor({ nodeId, nodeData, parentId, linkedToId = null }) {
    super('create')
    this.nodeId = nodeId
    this.nodeData = nodeData
    this.parentId = parentId
    this.linkedToId = linkedToId
  }

  async execute(api) {
    const created = await api.createNode({
      ...this.nodeData,
      parent_id: this.parentId
    })
    // Update nodeId in case it changed (for subsequent undos)
    this.nodeId = created.id
  }

  async undo(api) {
    // Remove link if it was a person/org that was linked
    if (this.linkedToId) {
      await api.unlinkNodes(this.nodeId, this.linkedToId)
    }
    await api.deleteNode(this.nodeId, true) // Hard delete since just created
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      nodeData: this.nodeData,
      parentId: this.parentId,
      linkedToId: this.linkedToId
    }
  }

  getDescription() {
    const title = this.nodeData?.title || 'item'
    return `Create "${title}"`
  }
}
