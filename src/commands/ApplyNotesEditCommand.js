import { Command } from './Command.js'

/**
 * Command that replaces a node's notes with new text, keeping the old text for
 * undo. Used to apply AI-generated edits from any provider; the command itself
 * neither calls a model nor knows which one produced the text.
 */
export class ApplyNotesEditCommand extends Command {
  constructor({ nodeId, oldNotes, newNotes, prompt }) {
    super('apply-notes-edit')
    this.nodeId = nodeId
    this.oldNotes = oldNotes
    this.newNotes = newNotes
    this.prompt = prompt
  }

  async execute(api) {
    await api.updateNode(this.nodeId, { notes: this.newNotes })
  }

  async undo(api) {
    await api.updateNode(this.nodeId, { notes: this.oldNotes })
  }

  toJSON() {
    return {
      type: this.type,
      nodeId: this.nodeId,
      oldNotes: this.oldNotes,
      newNotes: this.newNotes,
      prompt: this.prompt,
    }
  }

  /** Carries note text, so it is never written to sessionStorage. */
  isPersistable() {
    return false
  }

  remapNodeId(oldId, newId) {
    if (this.nodeId === oldId) this.nodeId = newId
  }

  getDescription() {
    // Guard against a missing prompt (e.g. reconstructed via fromJSON without one),
    // mirroring the optional-field handling in the sibling commands.
    const prompt = this.prompt || ''
    // Truncate long prompts for display
    const maxPromptLength = 15
    const displayPrompt = prompt.length > maxPromptLength ? prompt.substring(0, maxPromptLength - 3) + '...' : prompt
    return `AI ${displayPrompt} notes`
  }
}
