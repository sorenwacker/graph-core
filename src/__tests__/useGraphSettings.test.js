import { describe, it, expect, vi, beforeEach } from 'vitest'
import { nextTick, ref } from 'vue'
import { useGraphSettings } from '../composables/useGraphSettings'

describe('useGraphSettings composable', () => {
  let settings
  let localStorageData

  beforeEach(() => {
    localStorageData = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(key => localStorageData[key] ?? null),
      setItem: vi.fn((key, value) => {
        localStorageData[key] = value
      }),
      removeItem: vi.fn(key => {
        delete localStorageData[key]
      }),
    })
    settings = useGraphSettings({ workspace: ref('work') })
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
    it('should restore layoutMode from localStorage with workspace key', () => {
      localStorageData['graph-layout-mode-work'] = 'radial'
      const s = useGraphSettings({ workspace: ref('work') })
      expect(s.layoutMode.value).toBe('radial')
    })

    it('should restore relaxLocked from localStorage with workspace key', () => {
      localStorageData['graph-relax-locked-work'] = 'true'
      const s = useGraphSettings({ workspace: ref('work') })
      expect(s.relaxLocked.value).toBe(true)
    })

    it('should restore type filter from localStorage with workspace key', () => {
      localStorageData['graph-type-filter-work'] = JSON.stringify(['task', 'note'])
      const s = useGraphSettings({ workspace: ref('work') })
      expect(s.visibleTypes.value).toEqual(['task', 'note'])
    })
  })

  describe('persistence', () => {
    it('should persist layoutMode changes with workspace key', async () => {
      settings.layoutMode.value = 'radial'
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-layout-mode-work', 'radial')
    })

    it('should persist relaxLocked changes with workspace key', async () => {
      settings.relaxLocked.value = true
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-relax-locked-work', 'true')
    })

    it('should persist visibleTypes changes with workspace key', async () => {
      settings.visibleTypes.value = ['task']
      await nextTick()
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-type-filter-work', JSON.stringify(['task']))
    })
  })

  describe('workspace isolation', () => {
    it('should use different storage keys for different workspaces', async () => {
      const workspace1 = ref('work')
      const workspace2 = ref('personal')

      const settings1 = useGraphSettings({ workspace: workspace1 })
      settings1.showExternalLinks.value = false // Toggle from default true to false
      await nextTick()

      const settings2 = useGraphSettings({ workspace: workspace2 })
      settings2.showExternalLinks.value = false
      await nextTick()

      expect(localStorage.setItem).toHaveBeenCalledWith('graph-show-external-links-work', 'false')
      expect(localStorage.setItem).toHaveBeenCalledWith('graph-show-external-links-personal', 'false')
    })

    it('should reload settings when workspace changes', async () => {
      const workspace = ref('work')
      localStorageData['graph-show-external-links-work'] = 'true'
      localStorageData['graph-show-external-links-personal'] = 'false'

      const s = useGraphSettings({ workspace })
      expect(s.showExternalLinks.value).toBe(true)

      workspace.value = 'personal'
      await nextTick()

      expect(s.showExternalLinks.value).toBe(false)
    })

    it('should reload layout mode when workspace changes', async () => {
      const workspace = ref('work')
      localStorageData['graph-layout-mode-work'] = 'tree'
      localStorageData['graph-layout-mode-personal'] = 'radial'

      const s = useGraphSettings({ workspace })
      expect(s.layoutMode.value).toBe('tree')

      workspace.value = 'personal'
      await nextTick()

      expect(s.layoutMode.value).toBe('radial')
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
