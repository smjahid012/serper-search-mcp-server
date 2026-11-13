/**
 * Serper API Client — SMLabs AI
 * Supports: web · images · videos · news · shopping · places · scholar · scrape
 *
 * Resilience: per-request timeout + retry/backoff on 429/5xx/network errors.
 * Caching: in-memory TTL + LRU for successful responses (SERPER_CACHE_TTL_MS=0 disables).
 * Disk persistence is opt-in (SERPER_CACHE_PERSIST=true, dir SERPER_CACHE_DIR),
 * written 0600/0700 and scoped per API key.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {
  ScrapeOptions,
  SearchOptions,
  SearchType,
  SerperAPIResponse,
} from '../types/index.js';
import { fetchWithRetry } from '../utils/HttpRetry.js';
import { checkResolveShape, countGotoLinks, defaultResolveMaxWaitS } from '../utils/LinkResolution.js';
import { TtlCache } from '../utils/TtlCache.js';
import { logger } from '../utils/Logger.js';
import { increment } from '../utils/Metrics.js';

const ENDPOINT_MAP: Record<SearchType, string> = {
  web: 'https://google.serper.dev/search',
  images: 'https://google.serper.dev/images',
  videos: 'https://google.serper.dev/videos',
  news: 'https://google.serper.dev/news',
  shopping: 'https://google.serper.dev/shopping',
  places: 'https://google.serper.dev/places',
  scholar: 'https://google.serper.dev/scholar',
  patents: 'https://google.serper.dev/patents',
  autocomplete: 'https://google.serper.dev/autocomplete',
};

// Scrape lives on its own host (not google.serper.dev)
const SCRAPE_ENDPOINT = 'https://scrape.serper.dev';

// Turns google.com/goto redirect links back into real URLs (0 credits).
// One call takes ~20–30 s right after a search, so it gets a longer timeout.
const RESOLVE_ENDPOINT = 'https://google.serper.dev/resolve';
const RESOLVE_TIMEOUT_MS = 120_000;

export interface ResolveResult {
  /** The reply, with links replaced where Serper could resolve them. */
  data: Record<string, unknown>;
  /** goto links still present anywhere in `data`. */
  unresolved: number;
  /** Serper's suggested wait (s) before retrying, when links remain. */
  retryAfter: number | null;
  /** /resolve calls made. */
  attempts: number;
}

/** Fields this server adds to a response; never sent to /resolve. */
const LOCAL_FIELDS = ['retryAfter', 'credits', 'provider', 'cache_hit'];

export interface SerperAPIOptions {
  timeoutMs?: number;
  retries?: number;
  baseDelayMs?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
}

function numberFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

const PERSIST_TRUE = new Set(['true', '1', 'yes']);

function getPersistPath(name: string): string | undefined {
  const raw = (process.env.SERPER_CACHE_PERSIST ?? '').toLowerCase();
  if (!PERSIST_TRUE.has(raw)) return undefined;
  const dir = process.env.SERPER_CACHE_DIR || path.join(os.homedir(), '.serper-cache');
  return path.join(dir, `${name}.json`);
}

function buildSearchBody(query: string, options: Partial<SearchOptions>): Record<string, unknown> {
  const normalizedQuery = query.trim().replace(/\s+/g, ' ');
  // Serper credit guard: 1-10 results costs 1 credit; > 10 costs 2 credits.
  const requestedNum = options.num_results !== undefined && Number.isFinite(options.num_results)
    ? options.num_results
    : 10;
  const num = Math.max(1, Math.min(requestedNum, 20));

  const body: Record<string, unknown> = {
    q: normalizedQuery,
    num,
    gl: (options.country ?? 'US').toLowerCase(),
    hl: options.search_lang ?? options.ui_lang ?? 'en',
    autocorrect: options.autocorrect ?? true,
  };

  // Google tbs quick-date syntax is single-letter (qdr:d/w/m/y) — our public
  // enum is pd/pw/pm/py, so map it. Sending qdr:pd etc. is invalid and Google
  // silently ignores the filter (returns all-time results).
  const TBS_QUICK_DATE: Record<string, string> = { pd: 'd', pw: 'w', pm: 'm', py: 'y' };
  // 'any' = explicit opt-out (no tbs) — needed because search_news defaults to
  // pd when freshness is omitted, making historical news otherwise unreachable.
  if (options.freshness && options.freshness !== 'any') body.tbs = `qdr:${TBS_QUICK_DATE[options.freshness] ?? options.freshness}`;
  if (options.safesearch === 'strict') body.safe = 'active';
  if (options.safesearch === 'off') body.safe = 'off';
  if (options.page && options.page > 1) body.page = options.page;
  if (options.link_resolution === 'none') body.resolveLinks = false;

  return body;
}

export class SerperAPI {
  private apiKey: string;
  private timeoutMs: number;
  private retries: number;
  private baseDelayMs: number;
  private cache: TtlCache<SerperAPIResponse> | null;
  private scrapeCache: TtlCache<Record<string, unknown>> | null;
  private keyScope: string;

  constructor(apiKey: string, options: SerperAPIOptions = {}) {
    this.apiKey = apiKey;
    this.keyScope = createHash('sha256').update(String(apiKey)).digest('hex').slice(0, 12);
    this.timeoutMs  = options.timeoutMs  ?? numberFromEnv('SERPER_TIMEOUT_MS', 30_000);
    this.retries    = options.retries    ?? numberFromEnv('SERPER_RETRIES', 2);
    this.baseDelayMs = options.baseDelayMs ?? numberFromEnv('SERPER_RETRY_BASE_MS', 500);

    const cacheTtlMs = options.cacheTtlMs ?? numberFromEnv('SERPER_CACHE_TTL_MS', 600_000);
    const cacheMax   = options.cacheMaxEntries ?? numberFromEnv('SERPER_CACHE_MAX', 200);

    const persistPath = getPersistPath('search-cache');
    const scrapePersistPath = getPersistPath('scrape-cache');

    this.cache       = cacheTtlMs > 0 ? new TtlCache<SerperAPIResponse>(cacheTtlMs, cacheMax, persistPath) : null;
    this.scrapeCache = cacheTtlMs > 0 ? new TtlCache<Record<string, unknown>>(cacheTtlMs, cacheMax, scrapePersistPath) : null;
  }

  async search(
    query: string,
    searchType: SearchType = 'web',
    options: Partial<SearchOptions> = {}
  ): Promise<SerperAPIResponse> {
    const url = ENDPOINT_MAP[searchType] ?? ENDPOINT_MAP.web;
    const body = buildSearchBody(query, options);

    const cacheQuery = (body.q as string).toLowerCase();
    const cacheKey = `${this.keyScope}:${searchType}:${JSON.stringify({ ...body, q: cacheQuery })}`;
    increment('searches');

    const cached = this.cache?.get(cacheKey);
    if (cached) {
      increment('cache_hits');
      logger.debug(`SerperAPI: cache hit (${searchType})`);
      return { ...cached, cache_hit: true, credits: 0 };
    }
    increment('cache_misses');

    const data = await this.post<SerperAPIResponse>(url, body);
    this.cache?.set(cacheKey, data);
    return data;
  }

  /**
   * Fetch and extract the contents of a single URL.
   * Note: this endpoint lives on scrape.serper.dev, not google.serper.dev.
   */
  async scrape(url: string, options: ScrapeOptions = {}): Promise<Record<string, unknown>> {
    const normalizedUrl = url.trim();
    const body: Record<string, unknown> = {
      url: normalizedUrl,
      includeMarkdown: options.includeMarkdown ?? true,
      includeImages:   options.includeImages ?? false,
      includeLinks:    options.includeLinks ?? false,
      includeVideos:   options.includeVideos ?? false,
    };
    const cacheKey = `${this.keyScope}:scrape:${JSON.stringify(body)}`;

    const cached = this.scrapeCache?.get(cacheKey);
    if (cached) {
      logger.debug('SerperAPI: cache hit (scrape)');
      return { ...cached, cache_hit: true };
    }

    const data = await this.post<Record<string, unknown>>(SCRAPE_ENDPOINT, body);
    this.scrapeCache?.set(cacheKey, data);
    return data;
  }

  /**
   * POST `payload` (a search response or {links:[...]}) to /resolve. If links
   * remain unresolved, wait Serper's `retryAfter` and re-send the partial
   * result, but only while the wait plus another request still fits in
   * `maxWaitS` (Serper has been seen to suggest 90 s, so with the 60 s default
   * this is usually a single call).
   * Throws on HTTP errors or a reply whose result arrays went missing.
   */
  async resolve(payload: Record<string, unknown>, maxWaitS = defaultResolveMaxWaitS()): Promise<ResolveResult> {
    const deadline = Date.now() + maxWaitS * 1000;
    let current = payload;
    for (let attempts = 1; ; attempts++) {
      const body = Object.fromEntries(Object.entries(current).filter(([k]) => !LOCAL_FIELDS.includes(k)));
      const started = Date.now();
      const remaining = Math.max(0, deadline - started);
      const perAttempt = Math.max(1, Math.min(Math.max(this.timeoutMs, RESOLVE_TIMEOUT_MS), Math.max(remaining, this.timeoutMs)));
      const retries = Math.min(this.retries, Math.max(0, Math.floor(remaining / perAttempt) - 1));
      const out: unknown = await this.post(RESOLVE_ENDPOINT, body, {
        timeoutMs: perAttempt,
        retries,
        errorPrefix: 'Serper /resolve error',
      });
      checkResolveShape(body, out);
      const requestMs = Date.now() - started;
      const unresolved = countGotoLinks(out);
      const retryAfter = typeof out.retryAfter === 'number' ? out.retryAfter : null;
      if (!unresolved || retryAfter === null || Date.now() + retryAfter * 1000 + requestMs > deadline) {
        return { data: out, unresolved, retryAfter: unresolved ? retryAfter : null, attempts };
      }
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      current = out;
    }
  }

  private async post<T>(
    url: string,
    body: Record<string, unknown>,
    overrides: { timeoutMs?: number; retries?: number; errorPrefix?: string } = {}
  ): Promise<T> {
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: {
          'X-API-KEY': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      {
        timeoutMs: overrides.timeoutMs ?? this.timeoutMs,
        retries: overrides.retries ?? this.retries,
        baseDelayMs: this.baseDelayMs,
        errorPrefix: overrides.errorPrefix ?? 'Serper API error',
      }
    );

    return response.json() as Promise<T>;
  }
}
