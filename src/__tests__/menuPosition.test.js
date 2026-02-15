import { describe, it, expect, beforeEach } from 'vitest'
import { calculateMenuPosition } from '../utils/menuPosition.js'

describe('Menu Position Utility', () => {
  // Mock window dimensions
  const mockWindow = (width, height) => {
    Object.defineProperty(window, 'innerWidth', { value: width, writable: true })
    Object.defineProperty(window, 'innerHeight', { value: height, writable: true })
  }

  beforeEach(() => {
    // Default viewport size
    mockWindow(1920, 1080)
  })

  describe('calculateMenuPosition', () => {
    it('should return click position when plenty of space', () => {
      const result = calculateMenuPosition(500, 500)
      expect(result.x).toBe(500)
      expect(result.y).toBe(500)
    })

    it('should flip horizontally when near right edge', () => {
      // Click at x=1800, menu width=260, window=1920
      // 1800 + 260 + 10 (padding) = 2070 > 1920, so flip
      const result = calculateMenuPosition(1800, 500, 260, 520)
      expect(result.x).toBe(1800 - 260) // 1540
    })

    it('should flip vertically when near bottom edge', () => {
      // Click at y=800, menu height=520, window=1080
      // 800 + 520 + 10 = 1330 > 1080, so flip
      const result = calculateMenuPosition(500, 800, 260, 520)
      expect(result.y).toBe(800 - 520) // 280
    })

    it('should flip both directions when in corner', () => {
      const result = calculateMenuPosition(1800, 800, 260, 520)
      expect(result.x).toBe(1800 - 260)
      expect(result.y).toBe(800 - 520)
    })

    it('should enforce minimum padding from left edge', () => {
      // If x would go negative after flip, clamp to padding
      mockWindow(300, 1080)
      const result = calculateMenuPosition(50, 500, 260, 520)
      // 50 + 260 + 10 = 320 > 300, flip to 50 - 260 = -210
      // Clamp to padding (10)
      expect(result.x).toBe(10)
    })

    it('should enforce minimum padding from top edge', () => {
      mockWindow(1920, 300)
      const result = calculateMenuPosition(500, 50, 260, 520)
      // 50 + 520 + 10 = 580 > 300, flip to 50 - 520 = -470
      // Clamp to padding (10)
      expect(result.y).toBe(10)
    })

    it('should use default menu dimensions', () => {
      // Default width=260, height=520
      const result = calculateMenuPosition(100, 100)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })

    it('should use custom menu dimensions', () => {
      const result = calculateMenuPosition(100, 100, 400, 600)
      expect(result.x).toBe(100)
      expect(result.y).toBe(100)
    })

    it('should handle small viewport', () => {
      mockWindow(400, 300)
      const result = calculateMenuPosition(200, 150, 260, 200)
      // Check it doesn't crash and returns valid position
      expect(result.x).toBeGreaterThanOrEqual(10)
      expect(result.y).toBeGreaterThanOrEqual(10)
    })

    it('should handle edge case: click at origin', () => {
      const result = calculateMenuPosition(0, 0)
      expect(result.x).toBe(10) // Minimum padding
      expect(result.y).toBe(10)
    })

    it('should handle edge case: click at exact edge', () => {
      mockWindow(1920, 1080)
      // Click exactly where menu would fit
      const result = calculateMenuPosition(1920 - 260 - 10, 1080 - 520 - 10, 260, 520)
      expect(result.x).toBe(1920 - 260 - 10)
      expect(result.y).toBe(1080 - 520 - 10)
    })
  })
})
