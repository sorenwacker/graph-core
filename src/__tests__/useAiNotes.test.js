import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useAiNotes } from '../composables/useAiNotes.js'

// Mock the api service
vi.mock('../services/api.js', () => ({
  api: {
    ollamaGenerate: vi.fn(),
    ollamaTestConnection: vi.fn(),
    ollamaListModels: vi.fn(),
    openaiGenerate: vi.fn(),
    openaiTestConnection: vi.fn(),
    openaiListModels: vi.fn(),
  },
}))

// Mock useSettings
import { ref } from 'vue'
vi.mock('../composables/useSettings.js', () => ({
  useSettings: () => ({
    // New AI settings
    aiProvider: ref('ollama'),
    aiEnabled: ref(true),
    aiCustomPrompts: ref([]),
    // Ollama settings
    ollamaEndpoint: ref('http://localhost:11434'),
    ollamaModel: ref('llama3.2'),
    ollamaContextSize: ref(32768),
    // OpenAI settings
    openaiEndpoint: ref('https://api.openai.com/v1'),
    openaiApiKey: ref('sk-test'),
    openaiModel: ref('gpt-4o-mini'),
    // Legacy
    ollamaEnabled: ref(true),
    ollamaCustomPrompts: ref([]),
  }),
}))

import { api } from '../services/api.js'

describe('useAiNotes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('initial state', () => {
    it('should have isGenerating false initially', () => {
      const { isGenerating } = useAiNotes()
      expect(isGenerating.value).toBe(false)
    })

    it('should have error null initially', () => {
      const { error } = useAiNotes()
      expect(error.value).toBe(null)
    })

    it('should have generatedContent empty initially', () => {
      const { generatedContent } = useAiNotes()
      expect(generatedContent.value).toBe('')
    })
  })

  describe('isConfigured', () => {
    it('should return truthy when Ollama is enabled with endpoint and model', () => {
      const { isConfigured } = useAiNotes()
      expect(isConfigured.value).toBeTruthy()
    })
  })

  describe('presetPrompts', () => {
    it('should provide preset prompt options', () => {
      const { presetPrompts } = useAiNotes()

      expect(presetPrompts.value).toBeInstanceOf(Array)
      expect(presetPrompts.value.length).toBeGreaterThan(0)

      // Check that each preset has required properties
      presetPrompts.value.forEach(preset => {
        expect(preset).toHaveProperty('id')
        expect(preset).toHaveProperty('label')
        expect(preset).toHaveProperty('prompt')
      })
    })

    it('should include Improve preset', () => {
      const { presetPrompts } = useAiNotes()
      const improve = presetPrompts.value.find(p => p.id === 'improve')

      expect(improve).toBeDefined()
      expect(improve.label).toBe('Improve')
      expect(improve.prompt).toContain('clarity')
    })

    it('should include Summarize preset', () => {
      const { presetPrompts } = useAiNotes()
      const summarize = presetPrompts.value.find(p => p.id === 'summarize')

      expect(summarize).toBeDefined()
      expect(summarize.label).toBe('Summarize')
      expect(summarize.prompt).toContain('Summarize')
    })

    it('should include Expand preset', () => {
      const { presetPrompts } = useAiNotes()
      const expand = presetPrompts.value.find(p => p.id === 'expand')

      expect(expand).toBeDefined()
      expect(expand.label).toBe('Expand')
      expect(expand.prompt).toContain('Expand')
    })

    it('should include Fix Grammar preset', () => {
      const { presetPrompts } = useAiNotes()
      const fixGrammar = presetPrompts.value.find(p => p.id === 'fix-grammar')

      expect(fixGrammar).toBeDefined()
      expect(fixGrammar.label).toBe('Fix Grammar')
      expect(fixGrammar.prompt).toContain('grammar')
    })

    it('should include Simplify preset', () => {
      const { presetPrompts } = useAiNotes()
      const simplify = presetPrompts.value.find(p => p.id === 'simplify')

      expect(simplify).toBeDefined()
      expect(simplify.label).toBe('Simplify')
    })

    it('should include Bullet Points preset', () => {
      const { presetPrompts } = useAiNotes()
      const bulletPoints = presetPrompts.value.find(p => p.id === 'bullet-points')

      expect(bulletPoints).toBeDefined()
      expect(bulletPoints.label).toBe('Bullet Points')
    })

    it('should include Action Items preset', () => {
      const { presetPrompts } = useAiNotes()
      const actionItems = presetPrompts.value.find(p => p.id === 'action-items')

      expect(actionItems).toBeDefined()
      expect(actionItems.label).toBe('Action Items')
    })

    it('should include Continue preset', () => {
      const { presetPrompts } = useAiNotes()
      const continuePreset = presetPrompts.value.find(p => p.id === 'continue')

      expect(continuePreset).toBeDefined()
      expect(continuePreset.label).toBe('Continue')
    })
  })

  describe('improveNotes()', () => {
    it('should set isGenerating to true while generating', async () => {
      let resolveGenerate
      api.ollamaGenerate.mockImplementation(
        () =>
          new Promise(resolve => {
            resolveGenerate = resolve
          })
      )

      const { isGenerating, improveNotes } = useAiNotes()

      const promise = improveNotes('Original content', 'Improve this')
      await nextTick()

      expect(isGenerating.value).toBe(true)

      resolveGenerate('Improved content')
      await promise

      expect(isGenerating.value).toBe(false)
    })

    it('should set generatedContent on success', async () => {
      api.ollamaGenerate.mockResolvedValueOnce('Improved content')

      const { generatedContent, improveNotes } = useAiNotes()

      await improveNotes('Original content', 'Improve this')

      expect(generatedContent.value).toBe('Improved content')
    })

    it('should call api with correct parameters', async () => {
      api.ollamaGenerate.mockResolvedValueOnce('Result')

      const { improveNotes } = useAiNotes()

      await improveNotes('Original content', 'Improve this')

      expect(api.ollamaGenerate).toHaveBeenCalledWith({
        prompt: 'Improve this',
        content: 'Original content',
        model: 'llama3.2',
        endpoint: 'http://localhost:11434',
        contextSize: 32768,
      })
    })

    it('should set error on failure', async () => {
      api.ollamaGenerate.mockRejectedValueOnce(new Error('Connection failed'))

      const { error, improveNotes } = useAiNotes()

      await improveNotes('Original content', 'Improve this')

      expect(error.value).toBe('Connection failed')
    })

    it('should clear error before new request', async () => {
      api.ollamaGenerate.mockRejectedValueOnce(new Error('First error'))

      const { error, improveNotes } = useAiNotes()

      await improveNotes('Content', 'Prompt')
      expect(error.value).toBe('First error')

      api.ollamaGenerate.mockResolvedValueOnce('Success')
      await improveNotes('Content', 'Prompt')

      expect(error.value).toBe(null)
    })

    it('should return generated content on success', async () => {
      api.ollamaGenerate.mockResolvedValueOnce('Improved content')

      const { improveNotes } = useAiNotes()

      const result = await improveNotes('Original', 'Improve')

      expect(result).toBe('Improved content')
    })

    it('should return null on failure', async () => {
      api.ollamaGenerate.mockRejectedValueOnce(new Error('Failed'))

      const { improveNotes } = useAiNotes()

      const result = await improveNotes('Original', 'Improve')

      expect(result).toBe(null)
    })
  })

  describe('testConnection()', () => {
    it('should return success result from api', async () => {
      api.ollamaTestConnection.mockResolvedValueOnce({ success: true })

      const { testConnection } = useAiNotes()

      const result = await testConnection()

      expect(result).toEqual({ success: true })
      expect(api.ollamaTestConnection).toHaveBeenCalledWith('http://localhost:11434')
    })

    it('should return error result from api', async () => {
      api.ollamaTestConnection.mockResolvedValueOnce({
        success: false,
        error: 'Connection refused',
      })

      const { testConnection } = useAiNotes()

      const result = await testConnection()

      expect(result).toEqual({
        success: false,
        error: 'Connection refused',
      })
    })
  })

  describe('AI_PROVIDERS', () => {
    it('should export AI provider constants', () => {
      const { AI_PROVIDERS } = useAiNotes()
      expect(AI_PROVIDERS).toBeDefined()
      expect(AI_PROVIDERS.OLLAMA).toBe('ollama')
      expect(AI_PROVIDERS.OPENAI).toBe('openai')
    })
  })

  describe('provider state', () => {
    it('should expose provider ref', () => {
      const { provider } = useAiNotes()
      expect(provider.value).toBe('ollama')
    })

    it('should expose isEnabled ref', () => {
      const { isEnabled } = useAiNotes()
      expect(isEnabled.value).toBe(true)
    })
  })
})
