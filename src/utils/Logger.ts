/**
 * Leveled logger — SMLabs AI
 *
 * Writes to stderr only: stdout is reserved for the MCP stdio protocol.
 * Level is controlled by SERPER_MCP_LOG_LEVEL (error | warn | info | debug | silent).
 * Request correlation: setRequestId() stamps a short id onto every subsequent
 * log line ([serper-mcp][reqId]) until cleared — threaded through the HTTP
 * request handler so concurrent requests are traceable end-to-end.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'silent';

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: -1,
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function normalizeLevel(value: string | undefined): LogLevel {
  const v = (value ?? '').toLowerCase();
  return v in LEVEL_ORDER ? (v as LogLevel) : 'info';
}

let current: LogLevel = normalizeLevel(process.env.SERPER_MCP_LOG_LEVEL);
let requestId = '';

export function setLogLevel(level: string | undefined): void {
  current = normalizeLevel(level);
}

export function getLogLevel(): LogLevel {
  return current;
}

/** Stamp subsequent log lines with a request id (empty string = unstamped). */
export function setRequestId(id: string): void {
  requestId = id;
}

export function getRequestId(): string {
  return requestId;
}

function emit(level: Exclude<LogLevel, 'silent'>, args: unknown[]): void {
  if (LEVEL_ORDER[level] > LEVEL_ORDER[current]) return;
  const prefix = requestId ? `[serper-mcp][${requestId}]` : '[serper-mcp]';
  console.error(prefix, ...args);
}

export const logger = {
  error: (...args: unknown[]) => emit('error', args),
  warn: (...args: unknown[]) => emit('warn', args),
  info: (...args: unknown[]) => emit('info', args),
  debug: (...args: unknown[]) => emit('debug', args),
};
