/**
 * Serper API Client — SMLabs AI
 * Supports: web · images · videos · news · shopping · places · scholar · scrape
 *
 * Resilience: per-request timeout + retry/backoff on 429/5xx/network errors.
 * Caching: in-memory TTL + LRU for successful responses (SERPER_CACHE_TTL_MS=0 disables).
 */

import {
  ScrapeOptions,
  SearchOptions,
  SearchType,
  SerperAPIResponse,
} from '../types/index.js';
import { fetchWithRetry } from '../utils/HttpRetry.js';
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

function buildSearchBody(query: string, options: Partial<SearchOptions>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    q: query,
    num: Math.max(1, Math.min(options.num_results ?? 10, 20)),
    gl: (options.country ?? 'US').toLowerCase(),
    hl: options.search_lang ?? options.ui_lang ?? 'en',
    autocorrect: options.autocorrect ?? true,
  };

  if (options.freshness) body.tbs = `qdr:${options.freshness}`;
  if (options.safesearch === 'strict') body.safe = 'active';
  if (options.safesearch === 'off') body.safe = 'off';
  if (options.summary) body.summary = true;
  if (options.page && options.page > 1) body.page = options.page;

  return body;
}

export class SerperAPI {
  private apiKey: string;
  private timeoutMs: number;
  private retries: number;
  private baseDelayMs: number;
  private cache: TtlCache<SerperAPIResponse> | null;
  private scrapeCache: TtlCache<Record<string, unknown>> | null;

  constructor(apiKey: string, options: SerperAPIOptions = {}) {
    this.apiKey = apiKey;
    this.timeoutMs  = options.timeoutMs  ?? numberFromEnv('SERPER_TIMEOUT_MS', 30_000);
    this.retries    = options.retries    ?? numberFromEnv('SERPER_RETRIES', 2);
    this.baseDelayMs = options.baseDelayMs ?? numberFromEnv('SERPER_RETRY_BASE_MS', 500);

    const cacheTtlMs = options.cacheTtlMs ?? numberFromEnv('SERPER_CACHE_TTL_MS', 600_000);
    const cacheMax   = options.cacheMaxEntries ?? numberFromEnv('SERPER_CACHE_MAX', 200);

    this.cache       = cacheTtlMs > 0 ? new TtlCache<SerperAPIResponse>(cacheTtlMs, cacheMax) : null;
    this.scrapeCache = cacheTtlMs > 0 ? new TtlCache<Record<string, unknown>>(cacheTtlMs, cacheMax) : null;
  }

  async search(
    query: string,
    searchType: SearchType = 'web',
    options: Partial<SearchOptions> = {}
  ): Promise<SerperAPIResponse> {
    const url = ENDPOINT_MAP[searchType] ?? ENDPOINT_MAP.web;
    const body = buildSearchBody(query, options);
    const cacheKey = `${searchType}:${JSON.stringify(body)}`;
    increment('searches');

    const cached = this.cache?.get(cacheKey);
    if (cached) {
      increment('cache_hits');
      logger.debug(`SerperAPI: cache hit (${searchType})`);
      return cached;
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
    const body: Record<string, unknown> = {
      url,
      includeMarkdown: options.includeMarkdown ?? true,
      includeImages:   options.includeImages ?? false,
      includeLinks:    options.includeLinks ?? false,
      includeVideos:   options.includeVideos ?? false,
    };
    const cacheKey = `scrape:${JSON.stringify(body)}`;

    const cached = this.scrapeCache?.get(cacheKey);
    if (cached) {
      logger.debug('SerperAPI: cache hit (scrape)');
      return cached;
    }

    const data = await this.post<Record<string, unknown>>(SCRAPE_ENDPOINT, body);
    this.scrapeCache?.set(cacheKey, data);
    return data;
  }

  private async post<T>(url: string, body: Record<string, unknown>): Promise<T> {
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
        timeoutMs: this.timeoutMs,
        retries: this.retries,
        baseDelayMs: this.baseDelayMs,
        errorPrefix: 'Serper API error',
      }
    );

    return response.json() as Promise<T>;
  }
}
