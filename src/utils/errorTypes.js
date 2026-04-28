/**
 * Error type categories for standardized error handling.
 * Use these to create typed errors that can be handled differently
 * based on their category (e.g., show different messages, retry logic).
 */

export const ErrorCategory = {
  NETWORK: 'network',
  API: 'api',
  VALIDATION: 'validation',
  NOT_FOUND: 'not_found',
  AUTH: 'auth',
  AI: 'ai',
  DATABASE: 'database',
  UNKNOWN: 'unknown',
}

/**
 * Base application error with category support.
 */
export class AppError extends Error {
  constructor(message, options = {}) {
    super(message)
    this.name = 'AppError'
    this.category = options.category || ErrorCategory.UNKNOWN
    this.context = options.context || null
    this.retryable = options.retryable ?? false
    this.originalError = options.originalError || null
  }

  /**
   * Check if this error is of a specific category.
   * @param {string} category - Category to check
   * @returns {boolean}
   */
  isCategory(category) {
    return this.category === category
  }
}

/**
 * Network-related errors (connection issues, timeouts).
 */
export class NetworkError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.NETWORK,
      retryable: options.retryable ?? true,
    })
    this.name = 'NetworkError'
  }
}

/**
 * API response errors (non-2xx responses).
 */
export class ApiError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.API,
      retryable: options.retryable ?? false,
    })
    this.name = 'ApiError'
    this.status = options.status || null
    this.statusText = options.statusText || null
  }
}

/**
 * Resource not found errors.
 */
export class NotFoundError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.NOT_FOUND,
      retryable: false,
    })
    this.name = 'NotFoundError'
    this.resourceType = options.resourceType || null
    this.resourceId = options.resourceId || null
  }
}

/**
 * Validation errors (invalid input, business logic violations).
 */
export class ValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.VALIDATION,
      retryable: false,
    })
    this.name = 'ValidationError'
    this.field = options.field || null
    this.value = options.value
  }
}

/**
 * Authentication/authorization errors.
 */
export class AuthError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.AUTH,
      retryable: false,
    })
    this.name = 'AuthError'
  }
}

/**
 * AI service errors (Ollama, OpenAI).
 */
export class AIError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.AI,
      retryable: options.retryable ?? true,
    })
    this.name = 'AIError'
    this.provider = options.provider || null
    this.model = options.model || null
  }
}

/**
 * Database errors.
 */
export class DatabaseError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      ...options,
      category: ErrorCategory.DATABASE,
      retryable: options.retryable ?? false,
    })
    this.name = 'DatabaseError'
    this.operation = options.operation || null
  }
}

/**
 * Create an appropriate error type from a generic error.
 * Only wraps errors if they're not already AppError instances.
 * The wrapped error preserves the original message.
 * @param {Error} error - Original error
 * @param {Object} options - Additional options
 * @returns {AppError}
 */
export function wrapError(error, options = {}) {
  if (error instanceof AppError) {
    return error
  }

  const message = error?.message || String(error)
  const lowerMessage = message.toLowerCase()

  // Try to detect error type from message patterns
  // These are specific patterns that indicate infrastructure/system errors
  if (
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('network request failed') ||
    lowerMessage.includes('failed to fetch')
  ) {
    return new NetworkError(message, { ...options, originalError: error })
  }

  if (lowerMessage.includes('401') || lowerMessage.includes('403')) {
    return new AuthError(message, { ...options, originalError: error })
  }

  if (lowerMessage.includes('invalid api key') || lowerMessage.includes('api key is required')) {
    return new AuthError(message, { ...options, originalError: error })
  }

  if (lowerMessage.includes('ollama api error') || lowerMessage.includes('openai api error')) {
    return new AIError(message, { ...options, originalError: error })
  }

  // Default: wrap as generic AppError without changing category
  return new AppError(message, { ...options, originalError: error })
}

/**
 * Check if an error is retryable.
 * @param {Error} error - Error to check
 * @returns {boolean}
 */
export function isRetryable(error) {
  if (error instanceof AppError) {
    return error.retryable
  }
  // Network errors are generally retryable
  const message = error?.message?.toLowerCase() || ''
  return message.includes('network') || message.includes('timeout') || message.includes('econnrefused')
}

/**
 * Get user-friendly message for an error.
 * @param {Error} error - Error to get message for
 * @returns {string}
 */
export function getUserMessage(error) {
  if (error instanceof NetworkError) {
    return 'Connection error. Please check your network and try again.'
  }
  if (error instanceof AuthError) {
    return 'Authentication required. Please check your credentials.'
  }
  if (error instanceof NotFoundError) {
    const resource = error.resourceType || 'Resource'
    return `${resource} not found.`
  }
  if (error instanceof ValidationError) {
    return error.message || 'Invalid input. Please check your data.'
  }
  if (error instanceof AIError) {
    const provider = error.provider ? ` (${error.provider})` : ''
    return `AI service error${provider}. Please try again later.`
  }
  if (error instanceof DatabaseError) {
    return 'Database error. Please try again.'
  }
  return error?.message || 'An unexpected error occurred.'
}
