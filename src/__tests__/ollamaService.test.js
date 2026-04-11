import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ollamaService } from '../services/ollamaService.js'

describe('ollamaService', () => {
  let mockFetch

  beforeEach(() => {
    mockFetch = vi.fn()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('generate()', () => {
    it('should format API request correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Improved text' }),
      })

      await ollamaService.generate({
        prompt: 'Improve this text',
        content: 'Original text',
        model: 'llama3.2',
        endpoint: 'http://localhost:11434',
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.2',
          prompt: 'Improve this text\n\n---\n\nOriginal text',
          stream: false,
        }),
      })
    })

    it('should return generated text on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Improved text here' }),
      })

      const result = await ollamaService.generate({
        prompt: 'Improve',
        content: 'Test',
        model: 'llama3.2',
        endpoint: 'http://localhost:11434',
      })

      expect(result).toBe('Improved text here')
    })

    it('should throw error when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(
        ollamaService.generate({
          prompt: 'Improve',
          content: 'Test',
          model: 'llama3.2',
          endpoint: 'http://localhost:11434',
        })
      ).rejects.toThrow('Ollama API error: 500 Internal Server Error')
    })

    it('should throw error when model not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ error: 'model "badmodel" not found' }),
      })

      await expect(
        ollamaService.generate({
          prompt: 'Improve',
          content: 'Test',
          model: 'badmodel',
          endpoint: 'http://localhost:11434',
        })
      ).rejects.toThrow('Model not available. Run: ollama pull badmodel')
    })

    it('should throw connection error when fetch fails', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      await expect(
        ollamaService.generate({
          prompt: 'Improve',
          content: 'Test',
          model: 'llama3.2',
          endpoint: 'http://localhost:11434',
        })
      ).rejects.toThrow('Ollama is not running. Start with: ollama serve')
    })

    it('should use default endpoint if not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' }),
      })

      await ollamaService.generate({
        prompt: 'Test',
        content: 'Content',
        model: 'llama3.2',
      })

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/generate', expect.any(Object))
    })

    it('should use default model if not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ response: 'Result' }),
      })

      await ollamaService.generate({
        prompt: 'Test',
        content: 'Content',
        endpoint: 'http://localhost:11434',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"model":"llama3.2"'),
        })
      )
    })
  })

  describe('testConnection()', () => {
    it('should return true when Ollama is running', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      const result = await ollamaService.testConnection('http://localhost:11434')

      expect(result).toEqual({ success: true })
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    })

    it('should return false with error message when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      const result = await ollamaService.testConnection('http://localhost:11434')

      expect(result).toEqual({
        success: false,
        error: 'Ollama is not running. Start with: ollama serve',
      })
    })

    it('should return false when response is not ok', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      })

      const result = await ollamaService.testConnection('http://localhost:11434')

      expect(result).toEqual({
        success: false,
        error: 'Ollama API error: 500 Internal Server Error',
      })
    })

    it('should use default endpoint if not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      await ollamaService.testConnection()

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    })
  })

  describe('listModels()', () => {
    it('should return list of model names', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'llama3.2:latest', size: 1234567 },
              { name: 'mistral:latest', size: 2345678 },
            ],
          }),
      })

      const result = await ollamaService.listModels('http://localhost:11434')

      expect(result).toEqual(['llama3.2:latest', 'mistral:latest'])
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    })

    it('should return empty array when no models', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      const result = await ollamaService.listModels('http://localhost:11434')

      expect(result).toEqual([])
    })

    it('should throw error when connection fails', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      await expect(ollamaService.listModels('http://localhost:11434')).rejects.toThrow(
        'Ollama is not running. Start with: ollama serve'
      )
    })

    it('should use default endpoint if not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      })

      await ollamaService.listModels()

      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/tags')
    })
  })
})
