/**
 * Brave fallback provider — independent index (private, 669ms).
 * GET https://api.search.brave.com/res/v1/web/search with X-Subscription-Token.
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';
import { fetchWithRetry } from '../../utils/HttpRetry.js';
import { SearchProvider } from './Provider.js';

export class BraveProvider implements SearchProvider {
  readonly name = 'brave' as const;

  isConfigured(): boolean {
    return Boolean(process.env.BRAVE_API_KEY);
  }

  async search(query: string, type: SearchType, opts: Partial<SearchOptions>): Promise<SerperAPIResponse> {
    const apiKey = process.env.BRAVE_API_KEY ?? '';
    const params = new URLSearchParams({
      q: query,
      count: String(Math.min(opts.num_results ?? 10, 20)),
    });
    const res = await fetchWithRetry(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      { headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' } },
      { timeoutMs: 30_000, retries: 1, errorPrefix: 'Brave error' }
    );
    const data = await res.json() as {
      web?: { results?: Array<{ title: string; url: string; description: string }> };
    };
    return {
      searchParameters: { q: query, type },
      organic: (data.web?.results ?? []).map((r, i) => ({
        title: r.title, link: r.url, snippet: r.description, position: i + 1,
      })),
      provider: 'brave',
    };
  }
}
