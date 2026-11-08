/**
 * Provider interface — universal search gateway (v4.0).
 * Serper stays default (cheapest Google truth); Tavily/Brave/Exa/Firecrawl
 * plug in as failover backends with the same response shape.
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';

export type ProviderName = 'serper' | 'tavily' | 'brave' | 'exa' | 'firecrawl';

export interface SearchProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  search(query: string, type: SearchType, opts: Partial<SearchOptions>): Promise<SerperAPIResponse>;
  scrape?(url: string): Promise<Record<string, unknown>>;
}

export function providerOrderFromEnv(): ProviderName[] {
  const raw = (process.env.SEARCH_PROVIDER_ORDER ?? 'serper,tavily,brave').toLowerCase();
  const valid: ProviderName[] = ['serper', 'tavily', 'brave', 'exa', 'firecrawl'];
  const list = raw.split(',').map((s) => s.trim()).filter((s): s is ProviderName => (valid as string[]).includes(s));
  return list.length ? list : ['serper'];
}

export function isFallbackEnabled(): boolean {
  const raw = (process.env.SEARCH_FALLBACK ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}
