import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { useGraphSettings } from '../composables/useGraphSettings.js'

describe('useGraphSettings composable', () => {
  let settings

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    })
    settings = useGraphSettings()
  })

  describe('initial state', () => {
    it('should have default layout mode "tree"', () => {
      expect(settings.layoutMode.value).toBe('tree')
    })

    it('should have relaxLocked false by default', () => {
      expect(settings.relaxLocked.value).toBe(false)
    })

    it('should have fitLocked false by default', () => {
      expect(settings.fitLocked.value).toBe(false)
    })

    it('should have showExternalLinks true by default', () => {
      expect(settings.showExternalLinks.value).toBe(true)
    })

    it('should have showRootNode true by default', () => {
      expect(settings.showRootNode.value).toBe(true)
    })

    it('should have all node types visible by default', () => {
      expect(settings.visibleTypes.value).toContain('task')
      expect(settings.visibleTypes.value).toContain('note')
      expect(settings.visibleTypes.value).toContain('project')
    })
  })

  describe('radial layout defaults', () => {
    it('should have default nodeRepulsion', () => {
      expect(settings.radialSettings.nodeRepulsion).toBe(5000)
    })

    it('should have default edgeLength', () => {
      expect(settings.radialSettings.edgeLength).toBe(100)
    })

    it('should have default elasticity', () => {
      expect(settings.radialSettings.elasticity).toBe(0.5)
    })
  })

  describe('restore from localStorage', () => {
    it('should restore layoutMode from localStorage', () => {
      localStorage.getItem.mockReturnValue('radial')
      const s = useGraphSettings()
      expect(s.layoutMode.value).toBe('radial')
    })

    it('should restore relaxLocked from localStorage', () => {
      localStorage.getItem.mockImplementation((key) => {
        if (key === 'graph-relax-locked') return 'true'
        return null
      })
      const s = useGraphSettings()
      expect(s.relaxLocked.value).toBe(true)
    })

    it('should restore type filter from localStorage', () => {
      localStorage.getItem.mockImplementation((key) => {
        if (key === 'graph-type-filter') return JSON.stringify(['task', 'note'])
        return null
      })
      const s = useGraphSettings()
      expect(s.visibleTypes.value).toEqual(['task', 'note'])
    })
  })

  describe('persistence', () => {
    it('should persist layoutMode changes', async () => {
      settings.layoutMode.value = 'radial'
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-layout-mode', 'radial')
    })

    it('should persist relaxLocked changes', async () => {
      settings.relaxLocked.value = true
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-relax-locked', 'true')
    })

    it('should persist visibleTypes changes', async () => {
      settings.visibleTypes.value = ['task']
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-type-filter', JSON.stringify(['task']))
    })
  })

  describe('toggleTypeVisibility', () => {
    it('should remove type if visible', () => {
      settings.toggleTypeVisibility('task')
      expect(settings.visibleTypes.value).not.toContain('task')
    })

    it('should add type if not visible', () => {
      settings.visibleTypes.value = ['note']
      settings.toggleTypeVisibility('task')
      expect(settings.visibleTypes.value).toContain('task')
    })
  })

  describe('resetRadialSettings', () => {
    it('should reset all radial settings to defaults', () => {
      settings.radialSettings.nodeRepulsion = 9999
      settings.radialSettings.edgeLength = 9999

      settings.resetRadialSettings()

      expect(settings.radialSettings.nodeRepulsion).toBe(5000)
      expect(settings.radialSettings.edgeLength).toBe(100)
    })
  })
})
