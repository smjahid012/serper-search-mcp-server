/**
 * Tavily fallback provider — AI-reranked search + extract.
 * POST https://api.tavily.com/search with Bearer TVLY key.
 */

import { SearchOptions, SearchType, SerperAPIResponse } from '../../types/index.js';
import { fetchWithRetry } from '../../utils/HttpRetry.js';
import { SearchProvider } from './Provider.js';

export class TavilyProvider implements SearchProvider {
  readonly name = 'tavily' as const;

  isConfigured(): boolean {
    return Boolean(process.env.TAVILY_API_KEY);
  }

  async search(query: string, type: SearchType, opts: Partial<SearchOptions>): Promise<SerperAPIResponse> {
    const apiKey = process.env.TAVILY_API_KEY ?? '';
    const res = await fetchWithRetry(
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          max_results: Math.min(opts.num_results ?? 10, 20),
          search_depth: 'advanced',
          include_answer: type === 'web',
          include_domains: [],
        }),
      },
      { timeoutMs: 30_000, retries: 1, errorPrefix: 'Tavily error' }
    );
    const data = await res.json() as {
      results?: Array<{ title: string; url: string; content: string; published_date?: string }>;
      answer?: string;
    };
    return {
      searchParameters: { q: query, type },
      answerBox: data.answer ? { snippet: data.answer } : undefined,
      organic: (data.results ?? []).map((r, i) => ({
        title: r.title, link: r.url, snippet: r.content, position: i + 1, date: r.published_date,
      })),
      provider: 'tavily',
    };
  }
}
