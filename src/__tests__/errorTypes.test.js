import { describe, it, expect } from 'vitest'
import {
  ErrorCategory,
  AppError,
  NetworkError,
  ApiError,
  NotFoundError,
  ValidationError,
  AuthError,
  AIError,
  DatabaseError,
  wrapError,
  isRetryable,
  getUserMessage,
} from '../utils/errorTypes.js'

describe('errorTypes', () => {
  describe('ErrorCategory', () => {
    it('should define all error categories', () => {
      expect(ErrorCategory.NETWORK).toBe('network')
      expect(ErrorCategory.API).toBe('api')
      expect(ErrorCategory.VALIDATION).toBe('validation')
      expect(ErrorCategory.NOT_FOUND).toBe('not_found')
      expect(ErrorCategory.AUTH).toBe('auth')
      expect(ErrorCategory.AI).toBe('ai')
      expect(ErrorCategory.DATABASE).toBe('database')
      expect(ErrorCategory.UNKNOWN).toBe('unknown')
    })
  })

  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('AppError')
      expect(error.category).toBe(ErrorCategory.UNKNOWN)
      expect(error.retryable).toBe(false)
      expect(error.context).toBeNull()
      expect(error.originalError).toBeNull()
    })

    it('should create error with custom options', () => {
      const originalError = new Error('Original')
      const error = new AppError('Test error', {
        category: ErrorCategory.NETWORK,
        context: 'Loading data',
        retryable: true,
        originalError,
      })

      expect(error.category).toBe(ErrorCategory.NETWORK)
      expect(error.context).toBe('Loading data')
      expect(error.retryable).toBe(true)
      expect(error.originalError).toBe(originalError)
    })

    it('should check category correctly', () => {
      const error = new AppError('Test', { category: ErrorCategory.API })

      expect(error.isCategory(ErrorCategory.API)).toBe(true)
      expect(error.isCategory(ErrorCategory.NETWORK)).toBe(false)
    })
  })

  describe('NetworkError', () => {
    it('should create with network category', () => {
      const error = new NetworkError('Connection failed')

      expect(error.name).toBe('NetworkError')
      expect(error.category).toBe(ErrorCategory.NETWORK)
      expect(error.retryable).toBe(true)
    })

    it('should allow overriding retryable', () => {
      const error = new NetworkError('Connection failed', { retryable: false })

      expect(error.retryable).toBe(false)
    })
  })

  describe('ApiError', () => {
    it('should create with api category and status', () => {
      const error = new ApiError('Server error', { status: 500, statusText: 'Internal Server Error' })

      expect(error.name).toBe('ApiError')
      expect(error.category).toBe(ErrorCategory.API)
      expect(error.status).toBe(500)
      expect(error.statusText).toBe('Internal Server Error')
      expect(error.retryable).toBe(false)
    })
  })

  describe('NotFoundError', () => {
    it('should create with not_found category', () => {
      const error = new NotFoundError('Node not found', { resourceType: 'Node', resourceId: 123 })

      expect(error.name).toBe('NotFoundError')
      expect(error.category).toBe(ErrorCategory.NOT_FOUND)
      expect(error.resourceType).toBe('Node')
      expect(error.resourceId).toBe(123)
      expect(error.retryable).toBe(false)
    })
  })

  describe('ValidationError', () => {
    it('should create with validation category', () => {
      const error = new ValidationError('Invalid email', { field: 'email', value: 'invalid' })

      expect(error.name).toBe('ValidationError')
      expect(error.category).toBe(ErrorCategory.VALIDATION)
      expect(error.field).toBe('email')
      expect(error.value).toBe('invalid')
      expect(error.retryable).toBe(false)
    })
  })

  describe('AuthError', () => {
    it('should create with auth category', () => {
      const error = new AuthError('Invalid credentials')

      expect(error.name).toBe('AuthError')
      expect(error.category).toBe(ErrorCategory.AUTH)
      expect(error.retryable).toBe(false)
    })
  })

  describe('AIError', () => {
    it('should create with ai category', () => {
      const error = new AIError('Model not available', { provider: 'ollama', model: 'llama2' })

      expect(error.name).toBe('AIError')
      expect(error.category).toBe(ErrorCategory.AI)
      expect(error.provider).toBe('ollama')
      expect(error.model).toBe('llama2')
      expect(error.retryable).toBe(true)
    })
  })

  describe('DatabaseError', () => {
    it('should create with database category', () => {
      const error = new DatabaseError('Query failed', { operation: 'INSERT' })

      expect(error.name).toBe('DatabaseError')
      expect(error.category).toBe(ErrorCategory.DATABASE)
      expect(error.operation).toBe('INSERT')
      expect(error.retryable).toBe(false)
    })
  })

  describe('wrapError', () => {
    it('should return AppError as-is', () => {
      const error = new AppError('Test')
      const wrapped = wrapError(error)

      expect(wrapped).toBe(error)
    })

    it('should wrap ECONNREFUSED errors as NetworkError', () => {
      const error = new Error('ECONNREFUSED')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(NetworkError)
      expect(wrapped.originalError).toBe(error)
    })

    it('should wrap failed to fetch errors as NetworkError', () => {
      const error = new Error('Failed to fetch')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(NetworkError)
    })

    it('should wrap 401 errors as AuthError', () => {
      const error = new Error('401 unauthorized')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AuthError)
    })

    it('should wrap 403 errors as AuthError', () => {
      const error = new Error('403 forbidden')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AuthError)
    })

    it('should wrap invalid API key errors as AuthError', () => {
      const error = new Error('Invalid API key')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AuthError)
    })

    it('should wrap Ollama API errors as AIError', () => {
      const error = new Error('Ollama API error: connection refused')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AIError)
    })

    it('should wrap OpenAI API errors as AIError', () => {
      const error = new Error('OpenAI API error: rate limited')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AIError)
    })

    it('should wrap unknown errors as AppError with UNKNOWN category', () => {
      const error = new Error('Something went wrong')
      const wrapped = wrapError(error)

      expect(wrapped).toBeInstanceOf(AppError)
      expect(wrapped.category).toBe(ErrorCategory.UNKNOWN)
    })

    it('should preserve original message', () => {
      const error = new Error('Custom error message')
      const wrapped = wrapError(error)

      expect(wrapped.message).toBe('Custom error message')
    })
  })

  describe('isRetryable', () => {
    it('should return true for NetworkError', () => {
      const error = new NetworkError('Connection failed')

      expect(isRetryable(error)).toBe(true)
    })

    it('should return false for ValidationError', () => {
      const error = new ValidationError('Invalid input')

      expect(isRetryable(error)).toBe(false)
    })

    it('should return true for AIError by default', () => {
      const error = new AIError('Model unavailable')

      expect(isRetryable(error)).toBe(true)
    })

    it('should return false for AuthError', () => {
      const error = new AuthError('Invalid credentials')

      expect(isRetryable(error)).toBe(false)
    })

    it('should detect timeout errors by message', () => {
      const error = new Error('Request timeout')

      expect(isRetryable(error)).toBe(true)
    })

    it('should detect ECONNREFUSED errors by message', () => {
      const error = new Error('ECONNREFUSED')

      expect(isRetryable(error)).toBe(true)
    })

    it('should return false for generic errors', () => {
      const error = new Error('Something went wrong')

      expect(isRetryable(error)).toBe(false)
    })
  })

  describe('getUserMessage', () => {
    it('should return friendly message for NetworkError', () => {
      const error = new NetworkError('ECONNREFUSED')

      expect(getUserMessage(error)).toBe('Connection error. Please check your network and try again.')
    })

    it('should return friendly message for AuthError', () => {
      const error = new AuthError('Invalid token')

      expect(getUserMessage(error)).toBe('Authentication required. Please check your credentials.')
    })

    it('should return resource-specific message for NotFoundError', () => {
      const error = new NotFoundError('Not found', { resourceType: 'Node' })

      expect(getUserMessage(error)).toBe('Node not found.')
    })

    it('should return custom message for ValidationError', () => {
      const error = new ValidationError('Email is required')

      expect(getUserMessage(error)).toBe('Email is required')
    })

    it('should include provider in AIError message', () => {
      const error = new AIError('Model unavailable', { provider: 'OpenAI' })

      expect(getUserMessage(error)).toContain('OpenAI')
    })

    it('should return default message for unknown errors', () => {
      const error = new Error('Unknown')

      expect(getUserMessage(error)).toBe('Unknown')
    })

    it('should handle null/undefined', () => {
      expect(getUserMessage(null)).toBe('An unexpected error occurred.')
      expect(getUserMessage(undefined)).toBe('An unexpected error occurred.')
    })
  })
})
