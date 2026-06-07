/**
 * Structured Logging Utility for n8n API Routes
 * 
 * Provides consistent, structured logging for all n8n API operations.
 * Logs are output as JSON for easy parsing and integration with logging backends.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface N8nApiLog {
  route: string;
  method: string;
  workflowId?: string;
  statusCode?: number;
  durationMs?: number;
  errorMessage?: string;
  requestId?: string;
  extra?: Record<string, any>;
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Base logging function - outputs structured JSON
 */
function baseLog(level: LogLevel, message: string, data?: Record<string, any>) {
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...data,
  };

  // Output as structured JSON for easy parsing
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

/**
 * Log n8n API events with automatic level detection
 * 
 * @param event - Event details (route, method, status, duration, etc.)
 * 
 * Example:
 * ```
 * logN8nApiEvent({
 *   route: '/api/n8n/workflow/[id]',
 *   method: 'GET',
 *   workflowId: 'abc123',
 *   statusCode: 200,
 *   durationMs: 245,
 * });
 * ```
 */
export function logN8nApiEvent(event: N8nApiLog) {
  const {
    route,
    method,
    workflowId,
    statusCode,
    durationMs,
    errorMessage,
    requestId,
    extra,
  } = event;

  // Determine log level based on status code
  const level: LogLevel =
    statusCode && statusCode >= 500
      ? 'error'
      : statusCode && statusCode >= 400
        ? 'warn'
        : 'info';

  // Construct message
  const message =
    errorMessage && statusCode && statusCode >= 400
      ? `n8n API error on ${method} ${route}`
      : `n8n API call ${method} ${route}`;

  // Build data object
  const data: Record<string, any> = {
    route,
    method,
    workflowId,
    statusCode,
    durationMs,
    requestId,
  };

  if (errorMessage) data.errorMessage = errorMessage;
  if (extra) data.extra = extra;

  baseLog(level, message, data);
}

/**
 * Log debug messages (dev mode only)
 * 
 * @param message - Debug message
 * @param data - Optional additional data
 */
export function logDevDebug(message: string, data?: Record<string, any>) {
  if (!isDev) return;
  baseLog('debug', message, data);
}

/**
 * Generate a request ID for tracking
 * 
 * @returns Unique request ID
 */
export function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
