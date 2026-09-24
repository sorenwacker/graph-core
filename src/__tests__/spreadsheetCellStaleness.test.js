import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Turning a cell from a formula into a literal, or back, has to clear the field
 * it stopped using. setCells merges a payload with the stored row on purpose,
 * so a field the payload never names survives; saveCell named only the field it
 * was setting. The in-memory copy cleared the other one, so the sheet looked
 * right until it was reloaded from the database.
 */

const setCells = vi.fn(async () => ({ success: true }))
vi.mock('../services/api', () => ({ api: { setCells: (...a) => setCells(...a) } }))

const { useNodeTable } = await import('../composables/useNodeTable.js')

const payload = () => setCells.mock.calls.at(-1)[1][0]

beforeEach(() => setCells.mockClear())

describe('saving a cell', () => {
  it('clears the formula when the cell becomes a literal', async () => {
    const t = useNodeTable()
    await t.saveCell(1, 0, 0, '=A1+B1', true)
    await t.saveCell(1, 0, 0, '5', false)

    expect(payload()).toMatchObject({ row_index: 0, col_index: 0, value: '5', formula: null })
  })

  it('clears the value when the cell becomes a formula', async () => {
    const t = useNodeTable()
    await t.saveCell(1, 1, 1, '5', false)
    await t.saveCell(1, 1, 1, '=A1+B1', true)

    expect(payload()).toMatchObject({ value: null, formula: '=A1+B1' })
  })

  it('names both fields every time, so neither can be left behind', async () => {
    const t = useNodeTable()
    await t.saveCell(1, 2, 2, 'x', false)

    expect('value' in payload()).toBe(true)
    expect('formula' in payload()).toBe(true)
  })

  it('keeps the in-memory cell agreeing with what was sent', async () => {
    const t = useNodeTable()
    await t.saveCell(1, 3, 3, '=SUM(A1:A2)', true)
    await t.saveCell(1, 3, 3, 'plain', false)

    const cell = t.cells.value.find(c => c.row_index === 3 && c.col_index === 3)
    expect(cell.value).toBe('plain')
    expect(cell.formula ?? null).toBeNull()
    expect(payload().formula).toBeNull()
  })
})
