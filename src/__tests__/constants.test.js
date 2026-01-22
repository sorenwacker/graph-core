import { describe, it, expect } from 'vitest'
import {
  nodeTypes,
  typeConfig,
  personIconSvg,
  getPersonColor,
  getTypeIcon,
  getTypeIconHtml,
  getTypeLabel,
  getTypeCssClass,
  getTypeColors,
  getGraphColors,
  importanceLabels,
  getImportanceLabel
} from '../utils/constants.js'

describe('Constants Module', () => {
  describe('nodeTypes', () => {
    it('should be an array of node type strings', () => {
      expect(Array.isArray(nodeTypes)).toBe(true)
      expect(nodeTypes.length).toBeGreaterThan(0)
    })

    it('should contain expected types', () => {
      expect(nodeTypes).toContain('project')
      expect(nodeTypes).toContain('task')
      expect(nodeTypes).toContain('note')
      expect(nodeTypes).toContain('milestone')
      expect(nodeTypes).toContain('person')
      expect(nodeTypes).toContain('event')
      expect(nodeTypes).toContain('group')
      expect(nodeTypes).toContain('topic')
      expect(nodeTypes).toContain('organization')
      expect(nodeTypes).toContain('component')
    })

    it('should have optimized order with common types first', () => {
      expect(nodeTypes[0]).toBe('task')
      expect(nodeTypes[1]).toBe('note')
      expect(nodeTypes[2]).toBe('project')
    })
  })

  describe('typeConfig', () => {
    it('should have config for all node types', () => {
      for (const type of nodeTypes) {
        expect(typeConfig[type]).toBeDefined()
        expect(typeConfig[type].label).toBeDefined()
        expect(typeConfig[type].cssClass).toBeDefined()
        expect(typeConfig[type].bg).toBeDefined()
        expect(typeConfig[type].text).toBeDefined()
        expect(typeConfig[type].icon).toBeDefined()
      }
    })

    it('should have valid color values', () => {
      for (const type of nodeTypes) {
        expect(typeConfig[type].bg).toMatch(/^#[0-9a-f]{6}$/i)
        expect(typeConfig[type].text).toMatch(/^#[0-9a-f]{6}$/i)
      }
    })

    it('should have SVG icons', () => {
      for (const type of nodeTypes) {
        expect(typeConfig[type].icon).toContain('<svg')
        expect(typeConfig[type].icon).toContain('</svg>')
      }
    })
  })

  describe('personIconSvg', () => {
    it('should be the person icon from typeConfig', () => {
      expect(personIconSvg).toBe(typeConfig.person.icon)
    })
  })

  describe('getPersonColor', () => {
    it('should return first color for null/undefined ID', () => {
      const result = getPersonColor(null)
      expect(result).toHaveProperty('bg')
      expect(result).toHaveProperty('text')
    })

    it('should return consistent color for same ID', () => {
      const color1 = getPersonColor(123)
      const color2 = getPersonColor(123)
      expect(color1).toEqual(color2)
    })

    it('should return different colors for different IDs', () => {
      const colors = new Set()
      for (let i = 0; i < 10; i++) {
        colors.add(JSON.stringify(getPersonColor(i)))
      }
      expect(colors.size).toBeGreaterThan(1)
    })

    it('should handle negative IDs', () => {
      const result = getPersonColor(-5)
      expect(result).toHaveProperty('bg')
      expect(result).toHaveProperty('text')
    })
  })

  describe('getTypeIcon', () => {
    it('should return SVG for known types', () => {
      for (const type of nodeTypes) {
        const icon = getTypeIcon(type)
        expect(icon).toContain('<svg')
      }
    })

    it('should return fallback for unknown type', () => {
      const icon = getTypeIcon('unknown')
      expect(icon).toContain('U')
    })

    it('should handle null/undefined type', () => {
      expect(getTypeIcon(null)).toContain('?')
      expect(getTypeIcon(undefined)).toContain('?')
    })
  })

  describe('getTypeIconHtml', () => {
    it('should return same as getTypeIcon', () => {
      for (const type of nodeTypes) {
        expect(getTypeIconHtml(type)).toBe(getTypeIcon(type))
      }
    })
  })

  describe('getTypeLabel', () => {
    it('should return label for known types', () => {
      expect(getTypeLabel('project')).toBe('Project')
      expect(getTypeLabel('task')).toBe('Task')
      expect(getTypeLabel('note')).toBe('Note')
    })

    it('should return type string for unknown types', () => {
      expect(getTypeLabel('unknown')).toBe('unknown')
    })

    it('should return Unknown for null/undefined', () => {
      expect(getTypeLabel(null)).toBe('Unknown')
      expect(getTypeLabel(undefined)).toBe('Unknown')
    })
  })

  describe('getTypeCssClass', () => {
    it('should return cssClass for known types', () => {
      expect(getTypeCssClass('project')).toBe('project')
      expect(getTypeCssClass('task')).toBe('task')
    })

    it('should return task as fallback for unknown types', () => {
      expect(getTypeCssClass('unknown')).toBe('task')
    })
  })

  describe('getTypeColors', () => {
    it('should return bg and text for known types', () => {
      const colors = getTypeColors('project')
      expect(colors).toHaveProperty('bg')
      expect(colors).toHaveProperty('text')
      expect(colors.bg).toBe(typeConfig.project.bg)
      expect(colors.text).toBe(typeConfig.project.text)
    })

    it('should return fallback colors for unknown types', () => {
      const colors = getTypeColors('unknown')
      expect(colors.bg).toBe('#4a4a4a')
      expect(colors.text).toBe('#cccccc')
    })

    it('should use person-specific colors when nodeId provided for person type', () => {
      const colors1 = getTypeColors('person', 1)
      const colors2 = getTypeColors('person', 2)
      // Different IDs should potentially get different colors
      expect(colors1).toHaveProperty('bg')
      expect(colors1).toHaveProperty('text')
      expect(colors2).toHaveProperty('bg')
      expect(colors2).toHaveProperty('text')
    })

    it('should use default person config when no nodeId', () => {
      const colors = getTypeColors('person')
      expect(colors.bg).toBe(typeConfig.person.bg)
      expect(colors.text).toBe(typeConfig.person.text)
    })
  })

  describe('getGraphColors', () => {
    it('should return bg, border, and text for known types', () => {
      const colors = getGraphColors('project')
      expect(colors).toHaveProperty('bg')
      expect(colors).toHaveProperty('border')
      expect(colors).toHaveProperty('text')
      expect(colors.bg).toBe('#0d0d0d')
      expect(colors.border).toBe(typeConfig.project.text)
    })

    it('should return default colors for unknown types', () => {
      const colors = getGraphColors('unknown')
      expect(colors.bg).toBe('#0d0d0d')
      expect(colors.border).toBe('#666666')
      expect(colors.text).toBe('#ffffff')
    })

    it('should use HSL border for person with nodeId', () => {
      const colors = getGraphColors('person', 123)
      expect(colors.border).toMatch(/^hsl\(/)
    })

    it('should use config border for person without nodeId', () => {
      const colors = getGraphColors('person')
      expect(colors.border).toBe(typeConfig.person.text)
    })
  })

  describe('importanceLabels', () => {
    it('should have labels for levels 1-5', () => {
      expect(importanceLabels[1]).toBe('Critical')
      expect(importanceLabels[2]).toBe('High')
      expect(importanceLabels[3]).toBe('Medium')
      expect(importanceLabels[4]).toBe('Low')
      expect(importanceLabels[5]).toBe('Trivial')
    })
  })

  describe('getImportanceLabel', () => {
    it('should return label for valid levels', () => {
      expect(getImportanceLabel(1)).toBe('Critical')
      expect(getImportanceLabel(2)).toBe('High')
      expect(getImportanceLabel(3)).toBe('Medium')
      expect(getImportanceLabel(4)).toBe('Low')
      expect(getImportanceLabel(5)).toBe('Trivial')
    })

    it('should return empty string for invalid levels', () => {
      expect(getImportanceLabel(0)).toBe('')
      expect(getImportanceLabel(6)).toBe('')
      expect(getImportanceLabel(null)).toBe('')
      expect(getImportanceLabel(undefined)).toBe('')
    })
  })
})
