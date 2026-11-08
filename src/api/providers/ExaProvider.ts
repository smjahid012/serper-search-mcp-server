/**
 * Exa provider (v4.0) — neural semantic fallback with highlights + livecrawl.
 * POST https://api.exa.ai/search
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';
import { fetchWithRetry } from '../../utils/HttpRetry.js';
import { SearchProvider } from './Provider.js';

export class ExaProvider implements SearchProvider {
  readonly name = 'exa' as const;

  isConfigured(): boolean {
    return Boolean(process.env.EXA_API_KEY);
  }

  async search(query: string, type: SearchType, opts: Partial<SearchOptions>): Promise<SerperAPIResponse> {
    const apiKey = process.env.EXA_API_KEY ?? '';
    const res = await fetchWithRetry(
      'https://api.exa.ai/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          numResults: Math.min(opts.num_results ?? 10, 20),
          livecrawl: 'preferred',
        }),
      },
      { timeoutMs: 30_000, retries: 1, errorPrefix: 'Exa error' }
    );
    const data = await res.json() as {
      results?: Array<{ title: string; url: string; text?: string; highlights?: string[]; publishedDate?: string }>;
    };
    return {
      searchParameters: { q: query, type },
      organic: (data.results ?? []).map((r, i) => ({
        title: r.title,
        link: r.url,
        snippet: (r.highlights?.[0] ?? r.text ?? '').slice(0, 500),
        position: i + 1,
        date: r.publishedDate,
      })),
      provider: 'exa',
    };
  }
}
