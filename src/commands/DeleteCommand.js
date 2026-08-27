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

  /** Not persisted when it carries note text; see Command.isPersistable. */
  isPersistable() {
    return !this.nodeData?.notes
  }

  remapNodeId(oldId, newId) {
    if (this.nodeData?.id === oldId) this.nodeData.id = newId
    if (this.nodeData?.parent_id === oldId) this.nodeData.parent_id = newId
  }

  getDescription() {
    const title = this.nodeData?.title || 'item'
    return `Delete "${title}"`
  }
}
