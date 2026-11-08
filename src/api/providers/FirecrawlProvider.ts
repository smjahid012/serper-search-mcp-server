/**
 * Firecrawl provider (v4.0) — JS-render scrape + search upgrade.
 * POST https://api.firecrawl.dev/v2/search | /v2/scrape
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';
import { fetchWithRetry } from '../../utils/HttpRetry.js';
import { SearchProvider } from './Provider.js';

export class FirecrawlProvider implements SearchProvider {
  readonly name = 'firecrawl' as const;

  isConfigured(): boolean {
    return Boolean(process.env.FIRECRAWL_API_KEY);
  }

  async search(query: string, type: SearchType, opts: Partial<SearchOptions>): Promise<SerperAPIResponse> {
    const apiKey = process.env.FIRECRAWL_API_KEY ?? '';
    const res = await fetchWithRetry(
      'https://api.firecrawl.dev/v2/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: Math.min(opts.num_results ?? 10, 20) }),
      },
      { timeoutMs: 30_000, retries: 1, errorPrefix: 'Firecrawl error' }
    );
    const data = await res.json() as { data?: Array<{ title: string; url: string; markdown?: string; description?: string }> };
    return {
      searchParameters: { q: query, type },
      organic: (data.data ?? []).map((r, i) => ({
        title: r.title, link: r.url, snippet: r.markdown?.slice(0, 500) ?? r.description ?? '', position: i + 1,
      })),
      provider: 'firecrawl',
    };
  }

  async scrape(url: string): Promise<Record<string, unknown>> {
    const apiKey = process.env.FIRECRAWL_API_KEY ?? '';
    const res = await fetchWithRetry(
      'https://api.firecrawl.dev/v2/scrape',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'] }),
      },
      { timeoutMs: 60_000, retries: 1, errorPrefix: 'Firecrawl scrape error' }
    );
    return res.json() as Promise<Record<string, unknown>>;
  }
}
