import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('../services/api.js', () => ({
  api: {
    ollamaGenerate: vi.fn().mockResolvedValue('ollama-out'),
    ollamaTestConnection: vi.fn().mockResolvedValue({ success: true }),
    ollamaListModels: vi.fn().mockResolvedValue(['llama3.2']),
    openaiGenerate: vi.fn().mockResolvedValue('openai-out'),
    openaiTestConnection: vi.fn().mockResolvedValue({ success: true }),
    openaiListModels: vi.fn().mockResolvedValue(['gpt-4o']),
  },
}))

import { api } from '../services/api.js'
import { createAiProvider, AI_PROVIDERS } from '../services/aiProviders.js'

/**
 * Every AI provider is wrapped in an adapter with one shared interface, so
 * useAiNotes selects an adapter instead of branching per provider at every
 * call site. Adding a provider must mean one new adapter, not an edit hunt.
 */

function ollamaSettings() {
  return {
    ollamaEndpoint: ref('http://localhost:11434'),
    ollamaModel: ref('llama3.2'),
    ollamaContextSize: ref(8192),
  }
}

function openaiSettings() {
  return {
    openaiEndpoint: ref('https://api.example.com/v1'),
    openaiApiKey: ref('sk-test'),
    openaiModel: ref('gpt-4o'),
    openaiSkipSslVerification: ref(false),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('adapter interface', () => {
  it.each([AI_PROVIDERS.OLLAMA, AI_PROVIDERS.OPENAI])('%s exposes the shared surface', id => {
    const adapter = createAiProvider(id, { ...ollamaSettings(), ...openaiSettings() })
    expect(adapter.id).toBe(id)
    for (const method of ['isConfigured', 'config', 'generate', 'testConnection', 'listModels']) {
      expect(typeof adapter[method], method).toBe('function')
    }
  })

  it('rejects an unknown provider id instead of silently defaulting', () => {
    expect(() => createAiProvider('claude', {})).toThrow(/unknown/i)
  })
})

describe('ollama adapter', () => {
  const adapter = () => createAiProvider(AI_PROVIDERS.OLLAMA, ollamaSettings())

  it('is configured with endpoint and model', () => {
    const settings = ollamaSettings()
    expect(createAiProvider(AI_PROVIDERS.OLLAMA, settings).isConfigured()).toBe(true)
    settings.ollamaModel.value = ''
    expect(createAiProvider(AI_PROVIDERS.OLLAMA, settings).isConfigured()).toBe(false)
  })

  it('generates through the ollama api with its settings', async () => {
    const result = await adapter().generate({ prompt: 'p', content: 'c' })
    expect(result).toBe('ollama-out')
    expect(api.ollamaGenerate).toHaveBeenCalledWith({
      prompt: 'p',
      content: 'c',
      model: 'llama3.2',
      endpoint: 'http://localhost:11434',
      contextSize: 8192,
    })
  })

  it('reads settings live, not at construction time', async () => {
    const settings = ollamaSettings()
    const a = createAiProvider(AI_PROVIDERS.OLLAMA, settings)
    settings.ollamaModel.value = 'mistral'
    await a.generate({ prompt: 'p', content: 'c' })
    expect(api.ollamaGenerate).toHaveBeenCalledWith(expect.objectContaining({ model: 'mistral' }))
  })

  it('tests connection and lists models through the ollama api', async () => {
    await adapter().testConnection()
    expect(api.ollamaTestConnection).toHaveBeenCalledWith('http://localhost:11434')
    await adapter().listModels()
    expect(api.ollamaListModels).toHaveBeenCalledWith('http://localhost:11434')
  })

  it('reports the research config shape used by agentResearch', () => {
    expect(adapter().config()).toEqual({
      provider: 'ollama',
      model: 'llama3.2',
      endpoint: 'http://localhost:11434',
      contextSize: 8192,
    })
  })
})

describe('openai adapter', () => {
  const adapter = () => createAiProvider(AI_PROVIDERS.OPENAI, openaiSettings())

  it('requires endpoint, key and model to be configured', () => {
    const settings = openaiSettings()
    expect(createAiProvider(AI_PROVIDERS.OPENAI, settings).isConfigured()).toBe(true)
    settings.openaiApiKey.value = ''
    expect(createAiProvider(AI_PROVIDERS.OPENAI, settings).isConfigured()).toBe(false)
  })

  it('generates through the openai api with its settings', async () => {
    const result = await adapter().generate({ prompt: 'p', content: 'c' })
    expect(result).toBe('openai-out')
    expect(api.openaiGenerate).toHaveBeenCalledWith({
      prompt: 'p',
      content: 'c',
      model: 'gpt-4o',
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      skipSslVerification: false,
    })
  })

  it('tests connection and lists models with key and ssl flag', async () => {
    await adapter().testConnection()
    expect(api.openaiTestConnection).toHaveBeenCalledWith('https://api.example.com/v1', 'sk-test', false)
    await adapter().listModels()
    expect(api.openaiListModels).toHaveBeenCalledWith('https://api.example.com/v1', 'sk-test', false)
  })

  it('reports the research config shape used by agentResearch', () => {
    expect(adapter().config()).toEqual({
      provider: 'openai',
      model: 'gpt-4o',
      endpoint: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      skipSslVerification: false,
    })
  })
})

describe('no per-provider branching left in useAiNotes', () => {
  it('the composable contains no provider equality checks', async () => {
    const { readFileSync } = await import('fs')
    const source = readFileSync('src/composables/useAiNotes.js', 'utf-8')
    expect(source).not.toMatch(/provider\.value\s*===/)
  })
})
