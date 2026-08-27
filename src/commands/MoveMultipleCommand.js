import { Command } from './Command.js'

/**
 * Command for moving several nodes to a new parent in one step.
 *
 * Moving a selection is one user action, so it is one undo step. Pushing a
 * MoveCommand per node would make undo walk the selection back one node at a
 * time, which no other multi-node operation here does.
 */
export class MoveMultipleCommand extends Command {
  /**
   * @param {Object} params
   * @param {Array<{id: number, oldParentId: number|null}>} params.moves - Each
   *   node and the parent it came from.
   * @param {number|null} params.newParentId - Parent they were moved to.
   */
  constructor({ moves, newParentId }) {
    super('move-multiple')
    this.moves = moves
    this.newParentId = newParentId
  }

  async execute(api) {
    for (const move of this.moves) {
      await api.moveNode(move.id, this.newParentId)
    }
  }

  async undo(api) {
    for (const move of this.moves) {
      await api.moveNode(move.id, move.oldParentId)
    }
  }

  toJSON() {
    return {
      type: this.type,
      moves: this.moves,
      newParentId: this.newParentId,
    }
  }

  remapNodeId(oldId, newId) {
    for (const move of this.moves || []) {
      if (move.id === oldId) move.id = newId
      if (move.oldParentId === oldId) move.oldParentId = newId
    }
    if (this.newParentId === oldId) this.newParentId = newId
  }

  getDescription() {
    const count = this.moves?.length || 0
    return `Move ${count} item${count === 1 ? '' : 's'}`
  }
}
