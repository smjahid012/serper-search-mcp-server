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

const FAILOVER_PATTERNS = [/402/, /429/, /5\d\d/, /payment/i, /quota/i, /rate limit/i, /empty/i];

function isFailoverError(err: unknown, data?: SerperAPIResponse): boolean {
  if (data && !(data.organic?.length || data.images?.length || data.places?.length || data.news?.length)) {
    return true;
  }
  // Typed path: ProviderError with a failover-worthy HTTP status skips regex.
  if (err instanceof ProviderError) {
    if (err.status === 402 || err.status === 429 || (err.status !== undefined && err.status >= 500)) return true;
  }
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return FAILOVER_PATTERNS.some((re) => re.test(msg));
}

// Reciprocal-rank fusion for provider=all fan-out
function fuseRRF(lists: SerperAPIResponse[][], k = 60): SerperAPIResponse['organic'] {
  const scores = new Map<string, { score: number; item: NonNullable<SerperAPIResponse['organic']>[number] }>();
  for (const list of lists) {
    const organic = list[0]?.organic ?? [];
    organic.forEach((item, rank) => {
      const key = item.link || item.title;
      const prev = scores.get(key);
      const score = (prev?.score ?? 0) + 1 / (k + rank + 1);
      scores.set(key, { score, item });
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((s) => s.item);
}

export class ProviderRouter {
  private providers: SearchProvider[];

  constructor(api: SerperAPI) {
    this.providers = [
      serperAdapter(api),
      new TavilyProvider(),
      new BraveProvider(),
      new ExaProvider(),
      new FirecrawlProvider(),
    ];
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
      const active = this.providers.filter((p) => p.isConfigured());
      const settled = await Promise.allSettled(active.map((p) => p.search(query, type, opts)));
      const ok: SerperAPIResponse[][] = [];
      for (const [i, s] of settled.entries()) {
        if (s.status === 'fulfilled') {
          ok.push([s.value]);
        } else {
          increment('provider_errors');
          logger.warn(`Provider ${active[i]?.name} failed in fan-out (${s.reason instanceof Error ? s.reason.message : s.reason}) — excluded from fusion`);
        }
      }
      const fused = fuseRRF(ok);
      return {
        searchParameters: { q: query, type },
        organic: fused,
        provider: 'all',
      };
    }

    // Pinned provider (no failover)
    if (requested !== 'auto') {
      const pinned = this.providers.find((p) => p.name === requested);
      if (!pinned) throw new ValidationError(`Unknown provider: ${requested}`);
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
      .filter((p): p is SearchProvider => Boolean(p && p.isConfigured()));
    let lastError: unknown = null;
    for (const provider of chain) {
      try {
        const data = await provider.search(query, type, opts);
        if (!fallback) return { ...data, provider: provider.name };
        if (isFailoverError(null, data) && chain.length > 1) {
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
