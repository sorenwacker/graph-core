import { describe, it, expect } from 'vitest'
import {
  parseCellStyle,
  getCellStyleFromData,
  selectionHasStyle,
  getSelectionColor,
  toAgGridCellStyle,
  createCellStyleCallback,
} from '../utils/spreadsheetCellStyles.js'

describe('spreadsheetCellStyles', () => {
  describe('parseCellStyle', () => {
    it('should return null for cell without style', () => {
      expect(parseCellStyle(null)).toBeNull()
      expect(parseCellStyle({})).toBeNull()
      expect(parseCellStyle({ value: 'test' })).toBeNull()
    })

    it('should parse JSON string style', () => {
      const cell = { style: '{"bold": true, "color": "#ff0000"}' }
      expect(parseCellStyle(cell)).toEqual({ bold: true, color: '#ff0000' })
    })

    it('should return object style as-is', () => {
      const style = { italic: true }
      const cell = { style }
      expect(parseCellStyle(cell)).toBe(style)
    })

    it('should return null for invalid JSON', () => {
      const cell = { style: 'invalid json' }
      expect(parseCellStyle(cell)).toBeNull()
    })
  })

  describe('getCellStyleFromData', () => {
    it('should find and parse cell style', () => {
      const cellData = [
        { row_index: 0, col_index: 0, style: '{"bold": true}' },
        { row_index: 0, col_index: 1, value: 'test' },
      ]
      expect(getCellStyleFromData(cellData, 0, 0)).toEqual({ bold: true })
    })

    it('should return null when cell not found', () => {
      const cellData = [{ row_index: 0, col_index: 0, value: 'test' }]
      expect(getCellStyleFromData(cellData, 1, 1)).toBeNull()
    })

    it('should return null for cell without style', () => {
      const cellData = [{ row_index: 0, col_index: 0, value: 'test' }]
      expect(getCellStyleFromData(cellData, 0, 0)).toBeNull()
    })
  })

  describe('selectionHasStyle', () => {
    it('should return false for null bounds', () => {
      expect(selectionHasStyle(null, [], 'bold')).toBe(false)
    })

    it('should return true if any cell has the style', () => {
      const bounds = { minRow: 0, maxRow: 1, minCol: 0, maxCol: 1 }
      const cellData = [
        { row_index: 0, col_index: 0, value: 'test' },
        { row_index: 1, col_index: 1, style: '{"bold": true}' },
      ]
      expect(selectionHasStyle(bounds, cellData, 'bold')).toBe(true)
    })

    it('should return false if no cell has the style', () => {
      const bounds = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 }
      const cellData = [{ row_index: 0, col_index: 0, style: '{"italic": true}' }]
      expect(selectionHasStyle(bounds, cellData, 'bold')).toBe(false)
    })
  })

  describe('getSelectionColor', () => {
    it('should return null for null bounds', () => {
      expect(getSelectionColor(null, [])).toBeNull()
    })

    it('should return common color for all cells', () => {
      const bounds = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 }
      const cellData = [
        { row_index: 0, col_index: 0, style: '{"color": "#ff0000"}' },
        { row_index: 0, col_index: 1, style: '{"color": "#ff0000"}' },
      ]
      expect(getSelectionColor(bounds, cellData)).toBe('#ff0000')
    })

    it('should return null for different colors', () => {
      const bounds = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 1 }
      const cellData = [
        { row_index: 0, col_index: 0, style: '{"color": "#ff0000"}' },
        { row_index: 0, col_index: 1, style: '{"color": "#00ff00"}' },
      ]
      expect(getSelectionColor(bounds, cellData)).toBeNull()
    })

    it('should return null for cells without color', () => {
      const bounds = { minRow: 0, maxRow: 0, minCol: 0, maxCol: 0 }
      const cellData = [{ row_index: 0, col_index: 0, value: 'test' }]
      expect(getSelectionColor(bounds, cellData)).toBeNull()
    })
  })

  describe('toAgGridCellStyle', () => {
    it('should return null for null style', () => {
      expect(toAgGridCellStyle(null)).toBeNull()
    })

    it('should convert bold style', () => {
      expect(toAgGridCellStyle({ bold: true })).toEqual({
        fontWeight: '700',
        fontStyle: 'normal',
        color: null,
      })
    })

    it('should convert italic style', () => {
      expect(toAgGridCellStyle({ italic: true })).toEqual({
        fontWeight: 'normal',
        fontStyle: 'italic',
        color: null,
      })
    })

    it('should convert color style', () => {
      expect(toAgGridCellStyle({ color: '#ff0000' })).toEqual({
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#ff0000',
      })
    })

    it('should convert combined styles', () => {
      expect(toAgGridCellStyle({ bold: true, italic: true, color: '#00ff00' })).toEqual({
        fontWeight: '700',
        fontStyle: 'italic',
        color: '#00ff00',
      })
    })
  })

  describe('createCellStyleCallback', () => {
    it('should create a callback function', () => {
      const callback = createCellStyleCallback([])
      expect(typeof callback).toBe('function')
    })

    it('should return null when colIndex is undefined', () => {
      const callback = createCellStyleCallback([])
      const params = {
        colDef: { context: {} },
        node: { rowIndex: 0 },
      }
      expect(callback(params)).toBeNull()
    })

    it('should return style for matching cell', () => {
      const cellData = [{ row_index: 0, col_index: 1, style: '{"bold": true}' }]
      const callback = createCellStyleCallback(cellData)
      const params = {
        colDef: { context: { colIndex: 1 } },
        node: { rowIndex: 0 },
      }
      expect(callback(params)).toEqual({
        fontWeight: '700',
        fontStyle: 'normal',
        color: null,
      })
    })

    it('should return null when cell has no style', () => {
      const cellData = [{ row_index: 0, col_index: 1, value: 'test' }]
      const callback = createCellStyleCallback(cellData)
      const params = {
        colDef: { context: { colIndex: 1 } },
        node: { rowIndex: 0 },
      }
      expect(callback(params)).toBeNull()
    })
  })
})
