/**
 * Typed error hierarchy — SMLabs AI
 *
 * Lets callers (Router failover, MCP error mapping, CLI) distinguish failure
 * classes without string-matching error messages.
 *   ValidationError — bad tool arguments / unknown enum value → MCP InvalidParams
 *   AuthError       — missing credentials at boot
 *   ProviderError   — an upstream search provider failed; carries attribution
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ProviderError extends Error {
  /** Which provider failed ('serper' | 'tavily' | 'brave' | 'exa' | 'firecrawl'). */
  readonly provider?: string;
  /** HTTP status when known (402/429/5xx are failover-worthy). */
  readonly status?: number;
  /** Original error, preserved for logs/debugging (own field — ES2020 target has no Error.cause typing). */
  readonly cause?: unknown;

  constructor(
    message: string,
    options: { provider?: string; status?: number; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'ProviderError';
    this.provider = options.provider;
    this.status = options.status;
    this.cause = options.cause;
  }
}