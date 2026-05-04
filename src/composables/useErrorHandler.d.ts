/**
 * Type declarations for useErrorHandler composable.
 */

export interface ErrorHandlerOptions {
  context?: string
}

export interface UseErrorHandlerReturn {
  handleError: (error: Error, options?: ErrorHandlerOptions) => void
}

export function useErrorHandler(): UseErrorHandlerReturn
export function handleError(error: Error, options?: ErrorHandlerOptions): void
