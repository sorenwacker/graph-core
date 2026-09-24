import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A failure the user cannot see is a failure they will act on as if it were a
 * success. The project routes user-facing errors through useErrorHandler; these
 * paths logged to the console instead, or dropped the result entirely.
 */

const handleError = vi.fn()
vi.mock('../composables/useErrorHandler.js', () => ({
  handleError: (...a) => handleError(...a),
  useErrorHandler: () => ({ handleError: (...a) => handleError(...a) }),
}))

beforeEach(() => handleError.mockClear())

describe('pasting into the spreadsheet', () => {
  it('reports a clipboard the browser refuses to read', async () => {
    const { pasteSelection } = await import('../composables/useSpreadsheetClipboard.js')
    Object.assign(navigator, {
      clipboard: { readText: vi.fn().mockRejectedValue(new Error('denied')), writeText: vi.fn() },
    })

    await pasteSelection({
      selectionBounds: { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 },
      columns: [{ name: 'A' }],
      rowData: [{ A: '' }],
      gridApi: { refreshCells: vi.fn(), getDisplayedRowAtIndex: () => null },
      emit: vi.fn(),
    })

    expect(handleError).toHaveBeenCalled()
    expect(handleError.mock.calls[0][1]).toMatchObject({ context: expect.stringMatching(/paste|clipboard/i) })
  })
})

/**
 * A CSV round-trip must not quietly unmark a sensitive note. The column was
 * absent from the export, so re-importing produced a plain note whose text
 * every view then showed (docs/guides/import-export.md).
 */
describe('a CSV round-trip', () => {
  it('keeps the sensitive flag', async () => {
    const { mkdtempSync, rmSync } = await import('fs')
    const { tmpdir } = await import('os')
    const { join } = await import('path')
    const Database = (await import('../../electron/database/index.js')).default

    const dir = mkdtempSync(join(tmpdir(), 'gc-csv-'))
    try {
      const db = new Database(join(dir, 'graph.db'))
      await db.ready
      const parent = db.createNode({ type: 'project', title: 'P', workspace_id: 'work' })
      db.createNode({
        type: 'note',
        title: 'Vault',
        notes: 'the secret',
        notes_sensitive: true,
        parent_id: parent.id,
        workspace_id: 'work',
      })

      const csv = db.exportCSV(parent.id).csv
      expect(csv).toContain('notes_sensitive')

      const target = db.createNode({ type: 'project', title: 'Target', workspace_id: 'work' })
      db.importCSV(csv, target.id, 'work')

      // The import keeps the hierarchy, so the note lands under its own parent.
      const reimported = db.getDescendants(target.id).find(n => n.title === 'Vault')
      expect(reimported, 'the note was not reimported').toBeTruthy()
      expect(reimported.notes_sensitive).toBe(true)
      expect(reimported.notes).toBeNull()
      expect(reimported.notes_withheld).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
