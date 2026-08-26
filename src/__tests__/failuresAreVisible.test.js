import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A failed edit has to say so. These operations reported every failure with
 * `silent: true`, which suppresses the toast, and then stored the message in an
 * `error` ref that no component reads. The write simply did not happen and
 * nothing on screen changed.
 *
 * Background refreshes stay quiet: the user did not ask for them, and a toast
 * for each would be noise.
 */

const handleError = vi.fn()
vi.mock('../composables/useErrorHandler.js', () => ({
  handleError: (...args) => handleError(...args),
  useErrorHandler: () => ({ handleError: (...args) => handleError(...args) }),
}))

const api = {
  getNodeTable: vi.fn(),
  createNodeTable: vi.fn(),
  updateNodeTable: vi.fn(),
  deleteNodeTable: vi.fn(),
  getTableCells: vi.fn(async () => []),
  setCells: vi.fn(),
  deleteTableColumn: vi.fn(),
}
vi.mock('../services/api', () => ({ api }))

const { useNodeTable } = await import('../composables/useNodeTable.js')

const boom = () => Promise.reject(new Error('database is locked'))

beforeEach(() => {
  handleError.mockClear()
  Object.values(api).forEach(fn => fn.mockReset?.())
  api.getTableCells.mockResolvedValue([])
})

const lastOptions = () => handleError.mock.calls.at(-1)[1]

describe('a failed table edit', () => {
  it('tells the user when creating fails', async () => {
    api.createNodeTable.mockImplementation(boom)
    await useNodeTable().createTable(1, { name: 'T' })

    expect(handleError).toHaveBeenCalled()
    expect(lastOptions().silent).toBeFalsy()
  })

  it('tells the user when updating fails', async () => {
    api.updateNodeTable.mockImplementation(boom)
    await useNodeTable().updateTable(1, { name: 'T' })

    expect(lastOptions().silent).toBeFalsy()
  })

  it('tells the user when deleting fails', async () => {
    api.deleteNodeTable.mockImplementation(boom)
    await useNodeTable().deleteTable(1)

    expect(lastOptions().silent).toBeFalsy()
  })

  it('tells the user when a cell will not save', async () => {
    api.setCells.mockImplementation(boom)
    await useNodeTable().saveCell(1, 0, 0, 'typed')

    expect(lastOptions().silent).toBeFalsy()
  })
})

describe('a background table load', () => {
  it('stays quiet, because the user did not ask for it', async () => {
    api.getNodeTable.mockImplementation(boom)
    await useNodeTable().loadTable(1)

    expect(lastOptions().silent).toBe(true)
  })
})

describe('the composable surface', () => {
  it('exposes no error state that nothing reads', () => {
    // The error ref was written on every path and read by no component, so the
    // failure was invisible twice over. Reporting is the error handler's job.
    expect(Object.keys(useNodeTable())).not.toContain('error')
  })
})

describe('cutting cells when the clipboard refuses', () => {
  it('keeps the cells rather than deleting content nothing captured', async () => {
    const { copySelection, cutSelection } = await import('../composables/useSpreadsheetClipboard.js')
    const emit = vi.fn()
    const options = {
      selectionBounds: { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 },
      columns: [{ name: 'A' }],
      rowData: [{ A: 'precious' }],
      gridApi: { applyTransaction: vi.fn(), refreshCells: vi.fn(), getRowNode: () => ({ setDataValue: vi.fn() }) },
      emit,
    }

    navigator.clipboard = { writeText: vi.fn().mockRejectedValue(new Error('denied')) }
    await cutSelection(options)

    // A cut that deleted without copying would destroy the only copy.
    expect(emit).not.toHaveBeenCalledWith('cell-change', expect.anything())
    expect(handleError).toHaveBeenCalled()

    // The same options copy fine when the clipboard works.
    navigator.clipboard = { writeText: vi.fn().mockResolvedValue(undefined) }
    await expect(copySelection(options)).resolves.toBe(true)
  })
})
