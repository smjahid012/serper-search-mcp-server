/**
 * fetchWithRetry — SMLabs AI
 *
 * fetch wrapper with AbortSignal timeout and retry/backoff for transient failures:
 *   - retries network errors, HTTP 429 and 5xx
 *   - honors Retry-After on 429/5xx (capped)
 *   - exponential backoff + jitter between attempts
 *   - throws immediately on other non-2xx statuses (4xx)
 */

import { logger } from './Logger.js';

export interface RetryOptions {
  /** Per-attempt timeout in milliseconds. Default: 30000. */
  timeoutMs?: number;
  /** Extra attempts after the first one. Default: 2. */
  retries?: number;
  /** Base backoff delay in milliseconds. Default: 500. */
  baseDelayMs?: number;
  /** Prefix for thrown error messages, e.g. "Serper API error". */
  errorPrefix?: string;
}

const MAX_DELAY_MS = 10_000;
const JITTER_MS = 250;

const isRetryableStatus = (status: number) => status === 429 || status >= 500;

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) {
    return Math.min(Math.max(seconds * 1000, 0), MAX_DELAY_MS);
  }

  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.min(Math.max(date - Date.now(), 0), MAX_DELAY_MS);
  }

  return null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: RetryOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = Math.max(0, options.retries ?? 2);
  const baseDelayMs = options.baseDelayMs ?? 500;
  const prefix = options.errorPrefix ?? 'HTTP error';

  let lastError: Error = new Error(`${prefix}: request failed`);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | null = null;
    let failure: Error | null = null;
    let retryAfterMs: number | null = null;

    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      const aborted = err instanceof Error && err.name === 'AbortError';
      failure = new Error(
        aborted
          ? `${prefix}: request timed out after ${timeoutMs}ms`
          : `${prefix}: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      clearTimeout(timer);
    }

    if (response) {
      if (response.ok) return response;

      const msg = await response.text().catch(() => response.statusText);
      failure = new Error(`${prefix} ${response.status}: ${msg}`) as Error & { status?: number };
      (failure as Error & { status?: number }).status = response.status;

      if (!isRetryableStatus(response.status)) throw failure;
      retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    }

    lastError = failure as Error;

    if (attempt < retries) {
      const delay = retryAfterMs ?? Math.min(baseDelayMs * 2 ** attempt, MAX_DELAY_MS);
      const jitter = Math.floor(Math.random() * JITTER_MS);
      logger.warn(
        `${lastError.message} — retrying in ${delay + jitter}ms ` +
        `(attempt ${attempt + 2}/${retries + 1})`
      );
      await sleep(delay + jitter);
    }
  }

  throw lastError;
}
