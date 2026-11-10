/**
 * Earlier versions of a node's title and notes (docs/architecture/database.md,
 * "node_history").
 *
 * A version is the state a write replaced. `updateNode` records it here before
 * it overwrites the row, so every writer - the detail panel, the AI toolbar,
 * undo, an import - leaves versions without doing anything for it. The current
 * state is the node row; restoring a version is an ordinary update, which keeps
 * what it replaces.
 *
 * Notes are copied as stored. For a sensitive note that is the sealed
 * ciphertext, which only an unlocked session can open, so a version's notes
 * leave through `getNodeVersionNotes` under the same rule as `getNodeNotes`
 * (docs/architecture/sensitive-notes.md).
 * @module database/history
 */

const { isEncryptedNote } = require('./sensitiveNotes')

/** A write from the app itself. */
const SOURCE_APP = 'app'
/** An earlier version made current again; its own source, so the state it replaces is always kept. */
const SOURCE_RESTORE = 'restore'

/**
 * Writes from the same source within this many milliseconds of the last kept
 * version extend it rather than adding one. The notes editor autosaves while
 * typing; a version per save would bury the ones worth returning to.
 */
const COALESCE_WINDOW_MS = 10 * 60 * 1000

/** Versions kept per node; beyond this the oldest go. */
const MAX_VERSIONS_PER_NODE = 100

/**
 * The source a renderer write names, or `SOURCE_APP` when it names none or one
 * the history does not know.
 * @param {string|undefined} named - What the caller sent
 * @returns {string} A known source
 */
function historySource(named) {
  return named === SOURCE_RESTORE ? SOURCE_RESTORE : SOURCE_APP
}

/**
 * @param {Object} ctx - Database context (_query, _run, _get, sensitiveSession, clock)
 */
function createHistoryOperations(ctx) {
  const now = () => (typeof ctx.clock === 'function' ? ctx.clock() : Date.now())

  function latest(nodeId) {
    return ctx._get(
      'SELECT id, title, notes, source, saved_at FROM node_history WHERE node_id = ? ORDER BY saved_at DESC, id DESC LIMIT 1',
      [nodeId]
    )
  }

  const ops = {
    /**
     * Keep the version `data` is about to replace. Nothing is kept when the node
     * is unknown, when the write changes neither title nor notes, when the state
     * is already the latest version, or when the latest version is from the same
     * source and younger than the coalescing window.
     * @param {number} nodeId - The node about to be written
     * @param {Object} data - The fields the write carries, as they will be stored
     * @param {string} [source] - Who writes; see historySource
     * @returns {boolean} Whether a version was added
     */
    recordNodeVersion(nodeId, data, source = SOURCE_APP) {
      if (data.title === undefined && data.notes === undefined) return false
      const current = ctx._get('SELECT title, notes FROM nodes WHERE id = ?', [nodeId])
      if (!current) return false

      const titleChanges = data.title !== undefined && data.title !== current.title
      const notesChanges = data.notes !== undefined && (data.notes ?? null) !== (current.notes ?? null)
      if (!titleChanges && !notesChanges) return false

      const savedAt = now()
      const last = latest(nodeId)
      if (last) {
        const alreadyKept = last.title === current.title && (last.notes ?? null) === (current.notes ?? null)
        const sameStretch = last.source === source && savedAt - last.saved_at < COALESCE_WINDOW_MS
        if (alreadyKept || sameStretch) return false
      }

      ctx._run('INSERT INTO node_history (node_id, title, notes, source, saved_at) VALUES (?, ?, ?, ?, ?)', [
        nodeId,
        current.title,
        current.notes ?? null,
        source,
        savedAt,
      ])
      ctx._run(
        `DELETE FROM node_history WHERE node_id = ? AND id NOT IN
           (SELECT id FROM node_history WHERE node_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?)`,
        [nodeId, nodeId, MAX_VERSIONS_PER_NODE]
      )
      return true
    },

    /**
     * Every kept version of a node, newest first. Notes are withheld for a node
     * whose notes a node read withholds; fetch them with getNodeVersionNotes.
     * @param {number} nodeId - Node id
     * @returns {Array<{id: number, node_id: number, title: string, notes: string|null, notes_withheld: boolean, source: string, saved_at: number}>}
     */
    getNodeHistory(nodeId) {
      const node = ctx._get('SELECT notes, notes_sensitive FROM nodes WHERE id = ?', [nodeId])
      if (!node) return []
      const withheld = Boolean(node.notes_sensitive) || isEncryptedNote(node.notes)
      const rows = ctx._query(
        'SELECT id, node_id, title, notes, source, saved_at FROM node_history WHERE node_id = ? ORDER BY saved_at DESC, id DESC',
        [nodeId]
      )
      return rows.map(row => ({
        ...row,
        notes: withheld || isEncryptedNote(row.notes) ? null : row.notes,
        notes_withheld: withheld || isEncryptedNote(row.notes),
      }))
    },

    /**
     * The notes of one version, under the same rule as getNodeNotes: the text
     * when the session can read it, `locked` when it is ciphertext it cannot.
     * @param {number} versionId - Version id
     * @returns {{notes: string|null, locked: boolean}}
     */
    getNodeVersionNotes(versionId) {
      const row = ctx._get('SELECT notes FROM node_history WHERE id = ?', [versionId])
      if (!row || typeof row.notes !== 'string') return { notes: null, locked: false }
      const notes = ctx.sensitiveSession ? ctx.sensitiveSession.decryptForRead(row.notes) : row.notes
      if (isEncryptedNote(notes)) return { notes: null, locked: true }
      return { notes, locked: false }
    },
  }

  return ops
}

module.exports = {
  createHistoryOperations,
  historySource,
  SOURCE_APP,
  SOURCE_RESTORE,
  COALESCE_WINDOW_MS,
  MAX_VERSIONS_PER_NODE,
}
