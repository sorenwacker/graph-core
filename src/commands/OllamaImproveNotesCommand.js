import { Command } from './Command.js'

/**
 * Command for applying AI-generated improvements to node notes.
 * Supports undo/redo to restore original notes.
 */
export class OllamaImproveNotesCommand extends Command {
  constructor({ nodeId, oldNotes, newNotes, prompt }) {
    super('ollama-improve-notes')
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
