/**
 * Provider router — failover chain serper → tavily → brave (+ exa/firecrawl).
 * Failover triggers: 402/429/5xx/empty results. Keeps depth moat (Serper first).
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';
import { SerperAPI } from '../SerperAPI.js';
import { logger } from '../../utils/Logger.js';
import { ProviderError, ValidationError } from '../../utils/errors.js';
import { increment } from '../../utils/Metrics.js';
import { ProviderName, SearchProvider, isFallbackEnabled, providerOrderFromEnv } from './Provider.js';
import { TavilyProvider } from './TavilyProvider.js';
import { BraveProvider } from './BraveProvider.js';
import { ExaProvider } from './ExaProvider.js';
import { FirecrawlProvider } from './FirecrawlProvider.js';

function serperAdapter(api: SerperAPI): SearchProvider {
  return {
    name: 'serper',
    isConfigured: () => true,
    search: (q: string, t: SearchType, o: Partial<SearchOptions>) => api.search(q, t, o),
    scrape: (url: string) => api.scrape(url),
  };
}

const RESULT_FIELD: Record<SearchType, keyof SerperAPIResponse> = {
  web: 'organic',
  images: 'images',
  videos: 'videos',
  news: 'news',
  shopping: 'shopping',
  places: 'places',
  scholar: 'organic',
  patents: 'patents',
  autocomplete: 'suggestions',
};

function resultsOf(data: SerperAPIResponse, type: SearchType): unknown[] {
  const value = type === 'patents' ? (data.patents ?? data.organic) : data[RESULT_FIELD[type]];
  return Array.isArray(value) ? value : [];
}

function isEmptyResults(data: SerperAPIResponse, type: SearchType): boolean {
  return resultsOf(data, type).length === 0;
}

function supportsType(provider: SearchProvider, type: SearchType): boolean {
  return provider.name === 'serper' || type === 'web';
}

function fuseRRF(lists: unknown[][], k = 60): unknown[] {
  const scores = new Map<string, { score: number; item: unknown }>();
  for (const list of lists) {
    list.forEach((item, rank) => {
      const rec = (item ?? {}) as Record<string, unknown>;
      const key = String(rec.link ?? rec.imageUrl ?? rec.title ?? item);
      const prev = scores.get(key);
      const score = (prev?.score ?? 0) + 1 / (k + rank + 1);
      scores.set(key, { score, item });
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((s) => s.item);
}

export class ProviderRouter {
  private providers: SearchProvider[];
  private api: SerperAPI;

  constructor(api: SerperAPI) {
    this.api = api;
    this.providers = [
      serperAdapter(api),
      new TavilyProvider(),
      new BraveProvider(),
      new ExaProvider(),
      new FirecrawlProvider(),
    ];
  }

  resolve(payload: Record<string, unknown>, maxWaitS?: number) {
    return this.api.resolve(payload, maxWaitS);
  }

  providerNames(): ProviderName[] {
    return this.providers.filter((p) => p.isConfigured()).map((p) => p.name);
  }

  async search(
    query: string,
    type: SearchType,
    opts: Partial<SearchOptions> & { provider?: string }
  ): Promise<SerperAPIResponse> {
    const requested = (opts.provider ?? 'auto').toLowerCase();
    const order = providerOrderFromEnv();
    const fallback = isFallbackEnabled();

    // Fan-out mode: parallel + RRF fuse + dedupe
    if (requested === 'all') {
      const active = this.providers.filter((p) => p.isConfigured() && supportsType(p, type));
      const settled = await Promise.allSettled(active.map((p) => p.search(query, type, opts)));
      const ok: unknown[][] = [];
      for (const [i, s] of settled.entries()) {
        if (s.status === 'fulfilled') {
          const rows = resultsOf(s.value, type);
          if (rows.length) ok.push(rows);
        } else {
          increment('provider_errors');
          logger.warn(`Provider ${active[i]?.name} failed in fan-out (${s.reason instanceof Error ? s.reason.message : s.reason}) — excluded from fusion`);
        }
      }
      return {
        searchParameters: { q: query, type },
        [RESULT_FIELD[type]]: fuseRRF(ok),
        provider: 'all',
      } as SerperAPIResponse;
    }

    // Pinned provider (no failover)
    if (requested !== 'auto') {
      const pinned = this.providers.find((p) => p.name === requested);
      if (!pinned) throw new ValidationError(`Unknown provider: ${requested}`);
      if (!supportsType(pinned, type)) {
        throw new ValidationError(`Provider ${requested} supports web only — use serper or auto for ${type} searches`);
      }
      try {
        const data = await pinned.search(query, type, opts);
        return { ...data, provider: pinned.name };
      } catch (err) {
        increment('provider_errors');
        if (err instanceof ProviderError) throw err;
        throw new ProviderError(err instanceof Error ? err.message : String(err), { provider: pinned.name, cause: err });
      }
    }

    // Auto: ordered failover chain
    const chain = order
      .map((n) => this.providers.find((p) => p.name === n))
      .filter((p): p is SearchProvider => Boolean(p && p.isConfigured() && supportsType(p, type)));
    let lastError: unknown = null;
    for (const provider of chain) {
      try {
        const data = await provider.search(query, type, opts);
        if (!fallback) return { ...data, provider: provider.name };
        if (isEmptyResults(data, type) && chain.length > 1) {
          logger.warn(`Provider ${provider.name} returned empty — failing over…`);
          increment('failover_events');
          lastError = new ProviderError(`${provider.name} returned empty results`, { provider: provider.name });
          continue;
        }
        return { ...data, provider: provider.name };
      } catch (err) {
        lastError = err;
        increment('provider_errors');
        if (!fallback || provider === chain[chain.length - 1]) {
          if (err instanceof ProviderError) throw err;
          throw new ProviderError(err instanceof Error ? err.message : String(err), { provider: provider.name, cause: err });
        }
        increment('failover_events');
        logger.warn(`Provider ${provider.name} failed (${err instanceof Error ? err.message : err}) — failing over…`);
      }
    }
    throw lastError instanceof Error ? lastError : new ProviderError('All search providers failed', { provider: 'auto' });
  }
}
