import { Command } from './Command.js'

/**
 * Command for deleting multiple nodes.
 */
export class DeleteMultipleCommand extends Command {
  constructor({ nodes }) {
    super('delete-multiple')
    this.nodes = nodes // Array of { id, parent_id, ...nodeData }
  }

  /**
   * Order the selection so that children are always handled before their
   * parents. Deleting a parent first reparents its still-live children to the
   * grandparent, flattening the very subtree undo is meant to restore.
   * @param {Object[]} nodes - Nodes to order
   * @returns {Object[]} The nodes, deepest first
   */
  static childrenFirst(nodes) {
    const ids = new Set(nodes.map(n => n.id))
    const depthWithinSelection = node => {
      let depth = 0
      let parentId = node.parent_id
      const seen = new Set([node.id])
      while (parentId != null && ids.has(parentId) && !seen.has(parentId)) {
        seen.add(parentId)
        depth += 1
        parentId = nodes.find(n => n.id === parentId)?.parent_id
      }
      return depth
    }
    return [...nodes].sort((a, b) => depthWithinSelection(b) - depthWithinSelection(a))
  }

  async execute(api) {
    for (const node of DeleteMultipleCommand.childrenFirst(this.nodes)) {
      await api.deleteNode(node.id, false) // Soft delete
    }
  }

  async undo(api) {
    // Restore parents before children, so a child never lands under a parent
    // that is still in the trash.
    for (const node of DeleteMultipleCommand.childrenFirst(this.nodes).reverse()) {
      const restored = await api.restoreNode(node.id)
      if (restored && node.parent_id !== restored.parent_id) {
        await api.updateNode(node.id, { parent_id: node.parent_id })
      }
    }
  }

  toJSON() {
    return {
      type: this.type,
      nodes: this.nodes,
    }
  }

  /** Not persisted when it carries note text; see Command.isPersistable. */
  isPersistable() {
    return !(this.nodes || []).some(node => node?.notes)
  }

  remapNodeId(oldId, newId) {
    for (const node of this.nodes || []) {
      if (node.id === oldId) node.id = newId
      if (node.parent_id === oldId) node.parent_id = newId
    }
  }

  getDescription() {
    const count = this.nodes?.length || 0
    return `Delete ${count} items`
  }
}
