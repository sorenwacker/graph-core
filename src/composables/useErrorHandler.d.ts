/**
 * Type declarations for useErrorHandler composable.
 */

import type { Ref } from 'vue'

/**
 * App error instance with category information.
 */
export interface AppError extends Error {
  category?: string
  originalError?: Error
  context?: string
}

/**
 * Options for error handling.
 */
export interface ErrorHandlerOptions {
  /** Context prefix (e.g., "Loading sidebar") */
  context?: string
  /** Toast duration in ms (default: 5000) */
  duration?: number
  /** If true, don't show toast */
  silent?: boolean
  /** Callback to run after handling */
  onError?: (error: AppError) => void
  /** Override error category */
  category?: string
}

/**
 * Options for retry logic.
 */
export interface RetryOptions {
  /** Maximum retry attempts (default: 3) */
  maxAttempts?: number
  /** Base delay in ms (default: 1000) */
  baseDelay?: number
  /** Maximum delay in ms (default: 10000) */
  maxDelay?: number
  /** Function to determine if should retry */
  shouldRetry?: (error: Error) => boolean
  /** Callback called before each retry */
  onRetry?: (info: { attempt: number; maxAttempts: number; delay: number; error: Error }) => void
}

/**
 * Error history entry.
 */
export interface ErrorHistoryEntry {
  error: AppError
  message: string
  timestamp: number
  context?: string
}

/**
 * Return type for useErrorHandler composable.
 */
export interface UseErrorHandlerReturn {
  handleError: (error: Error | string | null | undefined, options?: ErrorHandlerOptions) => AppError
  lastError: Ref<AppError | null>
  errorHistory: Ref<ErrorHistoryEntry[]>
  clearError: () => void
  clearHistory: () => void
  wrapAsync: <T>(fn: () => Promise<T>, options?: ErrorHandlerOptions) => Promise<T | undefined>
  wrapAsyncWithRetry: <T>(fn: () => Promise<T>, options?: ErrorHandlerOptions & RetryOptions) => Promise<T | undefined>
  withRetry: <T>(fn: () => Promise<T>, options?: RetryOptions) => Promise<T>
  isErrorCategory: (category: string) => boolean
  canRetry: () => boolean
  ErrorCategory: Record<string, string>
}

export function useErrorHandler(): UseErrorHandlerReturn
export function handleError(error: Error | string | null | undefined, options?: ErrorHandlerOptions): AppError
export function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>
export function clearLastError(): void
export function clearErrorHistory(): void
