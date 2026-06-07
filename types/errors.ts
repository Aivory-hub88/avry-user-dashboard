/**
 * Error handling types and utilities for consistent error responses
 * across all API routes in the VPS Bridge Production Integration.
 */

/**
 * Standard error response format used across all API routes
 */
export interface ErrorResponse {
  /** Error type or category (e.g., 'ValidationError', 'NetworkError') */
  error: string
  /** Human-readable error message */
  message: string
  /** Optional additional error details (e.g., field-level validation errors) */
  details?: any
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string
}

/**
 * Creates a standardized error response object
 * 
 * @param error - Error type or category
 * @param message - Human-readable error message
 * @param details - Optional additional error details
 * @returns ErrorResponse object with consistent structure
 * 
 * @example
 * ```typescript
 * // Basic error
 * const error = createErrorResponse('ValidationError', 'Organization ID is required')
 * 
 * // Error with details
 * const error = createErrorResponse(
 *   'ValidationError',
 *   'Multiple validation errors',
 *   { fields: ['organization_id', 'diagnostic_data'] }
 * )
 * ```
 */
export function createErrorResponse(
  error: string,
  message: string,
  details?: any
): ErrorResponse {
  return {
    error,
    message,
    details,
    timestamp: new Date().toISOString()
  }
}
