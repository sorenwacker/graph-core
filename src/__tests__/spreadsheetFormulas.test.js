import { describe, it, expect } from 'vitest'
import { isFormula, getColumnName, parseCellReference, toCellReference } from '../utils/spreadsheetFormulas.js'

describe('spreadsheetFormulas', () => {
  describe('isFormula', () => {
    it('should return true for strings starting with =', () => {
      expect(isFormula('=SUM(A1:A5)')).toBe(true)
      expect(isFormula('=5+5')).toBe(true)
      expect(isFormula('=')).toBe(true)
    })

    it('should return false for regular strings', () => {
      expect(isFormula('Hello')).toBe(false)
      expect(isFormula('123')).toBe(false)
      expect(isFormula(' =formula')).toBe(false)
    })

    it('should return false for non-string values', () => {
      expect(isFormula(123)).toBe(false)
      expect(isFormula(null)).toBe(false)
      expect(isFormula(undefined)).toBe(false)
      expect(isFormula({})).toBe(false)
    })

    it('should return false for empty string', () => {
      expect(isFormula('')).toBe(false)
    })
  })

  describe('getColumnName', () => {
    it('should return A for index 0', () => {
      expect(getColumnName(0)).toBe('A')
    })

    it('should return B for index 1', () => {
      expect(getColumnName(1)).toBe('B')
    })

    it('should return Z for index 25', () => {
      expect(getColumnName(25)).toBe('Z')
    })

    it('should return AA for index 26', () => {
      expect(getColumnName(26)).toBe('AA')
    })

    it('should return AB for index 27', () => {
      expect(getColumnName(27)).toBe('AB')
    })

    it('should return AZ for index 51', () => {
      expect(getColumnName(51)).toBe('AZ')
    })

    it('should return BA for index 52', () => {
      expect(getColumnName(52)).toBe('BA')
    })
  })

  describe('parseCellReference', () => {
    it('should parse single letter column reference', () => {
      expect(parseCellReference('A1')).toEqual({ row: 0, col: 0 })
      expect(parseCellReference('B2')).toEqual({ row: 1, col: 1 })
      expect(parseCellReference('Z10')).toEqual({ row: 9, col: 25 })
    })

    it('should parse double letter column reference', () => {
      expect(parseCellReference('AA1')).toEqual({ row: 0, col: 26 })
      expect(parseCellReference('AB5')).toEqual({ row: 4, col: 27 })
    })

    it('should handle lowercase letters', () => {
      expect(parseCellReference('a1')).toEqual({ row: 0, col: 0 })
      expect(parseCellReference('Ab1')).toEqual({ row: 0, col: 27 })
    })

    it('should return null for invalid references', () => {
      expect(parseCellReference('')).toBeNull()
      expect(parseCellReference('1A')).toBeNull()
      expect(parseCellReference('A')).toBeNull()
      expect(parseCellReference('1')).toBeNull()
      expect(parseCellReference('A0')).toBeNull()
    })

    it('should return null for non-string inputs', () => {
      expect(parseCellReference(null)).toBeNull()
      expect(parseCellReference(undefined)).toBeNull()
      expect(parseCellReference(123)).toBeNull()
    })
  })

  describe('toCellReference', () => {
    it('should convert row and col to reference', () => {
      expect(toCellReference(0, 0)).toBe('A1')
      expect(toCellReference(1, 1)).toBe('B2')
      expect(toCellReference(9, 25)).toBe('Z10')
    })

    it('should handle double letter columns', () => {
      expect(toCellReference(0, 26)).toBe('AA1')
      expect(toCellReference(4, 27)).toBe('AB5')
    })
  })
})
