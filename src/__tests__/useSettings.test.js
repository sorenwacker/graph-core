import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useSettings } from '../composables/useSettings.js'

describe('useSettings composable', () => {
  let mockStorage = {}

  beforeEach(() => {
    mockStorage = {}
    // Mock localStorage directly on window
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(key => mockStorage[key] ?? null),
        setItem: vi.fn((key, value) => {
          mockStorage[key] = value
        }),
        removeItem: vi.fn(key => {
          delete mockStorage[key]
        }),
      },
      writable: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should use defaults when localStorage is empty', () => {
      const settings = useSettings()
      expect(settings.viewMode.value).toBe('graph')
      expect(settings.hideCompleted.value).toBe(true)
      expect(settings.hideSensitive.value).toBe(false)
      expect(settings.graphDetailThreshold.value).toBe(50)
      expect(settings.graphMaxDepth.value).toBe(0)
      expect(settings.graphRootMaxDepth.value).toBe(5)
      expect(settings.openDetailFullscreen.value).toBe(false)
      expect(settings.hoverPreviewEnabled.value).toBe(true)
      expect(settings.sidebarPinned.value).toBe(true)
      expect(settings.workspace.value).toBe('work')
    })

    it('should restore string values from localStorage', () => {
      mockStorage['graphcore-viewMode'] = 'graph'
      mockStorage['graphcore-workspace'] = 'personal'
      const settings = useSettings()
      expect(settings.viewMode.value).toBe('graph')
      expect(settings.workspace.value).toBe('personal')
    })

    it('should restore boolean values from localStorage', () => {
      mockStorage['graphcore-hideCompleted'] = 'false'
      mockStorage['graphcore-hideSensitive'] = 'true'
      mockStorage['graphcore-sidebarPinned'] = 'true'
      const settings = useSettings()
      expect(settings.hideCompleted.value).toBe(false)
      expect(settings.hideSensitive.value).toBe(true)
      expect(settings.sidebarPinned.value).toBe(true)
    })

    it('should restore number values from localStorage', () => {
      mockStorage['graphcore-graphDetailThreshold'] = '50'
      mockStorage['graphcore-graphMaxDepth'] = '3'
      mockStorage['graphcore-graphRootMaxDepth'] = '5'
      const settings = useSettings()
      expect(settings.graphDetailThreshold.value).toBe(50)
      expect(settings.graphMaxDepth.value).toBe(3)
      expect(settings.graphRootMaxDepth.value).toBe(5)
    })

    it('should handle invalid number values gracefully', () => {
      mockStorage['graphcore-graphDetailThreshold'] = 'invalid'
      const settings = useSettings()
      expect(settings.graphDetailThreshold.value).toBe(50) // Default
    })
  })

  describe('persistence', () => {
    it('should persist viewMode changes', async () => {
      const settings = useSettings()
      settings.viewMode.value = 'timeline'
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-viewMode']).toBe('timeline')
      })
    })

    it('should persist boolean changes', async () => {
      const settings = useSettings()
      settings.hideCompleted.value = false
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-hideCompleted']).toBe('false')
      })
    })

    it('should persist number changes', async () => {
      const settings = useSettings()
      settings.graphDetailThreshold.value = 100
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-graphDetailThreshold']).toBe('100')
      })
    })

    it('should persist workspace changes', async () => {
      const settings = useSettings()
      settings.workspace.value = 'custom'
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-workspace']).toBe('custom')
      })
    })
  })

  describe('AI settings', () => {
    it('should have default AI provider as ollama', () => {
      const settings = useSettings()
      expect(settings.aiProvider.value).toBe('ollama')
    })

    it('should have AI disabled by default', () => {
      const settings = useSettings()
      expect(settings.aiEnabled.value).toBe(false)
    })

    it('should have default OpenAI endpoint', () => {
      const settings = useSettings()
      expect(settings.openaiEndpoint.value).toBe('https://api.openai.com/v1')
    })

    it('should have empty OpenAI API key by default', () => {
      const settings = useSettings()
      expect(settings.openaiApiKey.value).toBe('')
    })

    it('should have default OpenAI model', () => {
      const settings = useSettings()
      expect(settings.openaiModel.value).toBe('gpt-4o-mini')
    })

    it('should persist AI provider changes', async () => {
      const settings = useSettings()
      settings.aiProvider.value = 'openai'
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-aiProvider']).toBe('openai')
      })
    })

    it('should persist OpenAI settings', async () => {
      const settings = useSettings()
      settings.openaiEndpoint.value = 'https://custom.api.com/v1'
      settings.openaiApiKey.value = 'sk-test123'
      settings.openaiModel.value = 'gpt-4o'
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-openaiEndpoint']).toBe('https://custom.api.com/v1')
        expect(mockStorage['graphcore-openaiApiKey']).toBe('sk-test123')
        expect(mockStorage['graphcore-openaiModel']).toBe('gpt-4o')
      })
    })
  })

  describe('containerId', () => {
    it('should default to null', () => {
      const settings = useSettings()
      expect(settings.containerId.value).toBe(null)
    })

    it('should restore from localStorage', () => {
      mockStorage['graphcore-containerId'] = '123'
      const settings = useSettings()
      expect(settings.containerId.value).toBe('123')
    })

    it('should persist changes', async () => {
      const settings = useSettings()
      settings.containerId.value = '456'
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-containerId']).toBe('456')
      })
    })

    it('should remove from localStorage when set to null', async () => {
      mockStorage['graphcore-containerId'] = '123'
      const settings = useSettings()
      settings.containerId.value = null
      await vi.waitFor(() => {
        expect(mockStorage['graphcore-containerId']).toBeUndefined()
      })
    })
  })
})
