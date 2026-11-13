/**
 * search_many — batch web search with cross-query dedupe
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 *
 * Runs up to 10 web searches in parallel (concurrency-limited),
 * removes duplicate URLs across queries, and returns one merged
 * markdown result set. Individual query failures do not fail the
 * whole batch — they are reported inline.
 */

import { ProviderRouter } from '../api/providers/Router.js';
import { OrganicResult, SearchOptions } from '../types/index.js';
import { mapWithConcurrency, RESEARCH_CONCURRENCY } from '../utils/Concurrency.js';

interface BatchQueryResult {
  query: string;
  results: OrganicResult[];
  error?: string;
}

const MAX_CONCURRENCY = RESEARCH_CONCURRENCY;

export { mapWithConcurrency };

export async function runBatchSearch(
  queries: string[],
  options: {
    num_results?: number;
    country?: string;
    search_lang?: string;
    ui_lang?: string;
    freshness?: SearchOptions['freshness'];
    safesearch?: SearchOptions['safesearch'];
  },
  router: ProviderRouter
): Promise<string> {
  const numResults = Math.min(20, Math.max(1, Math.floor(Number(options.num_results)) || 5));

  const perQuery = await mapWithConcurrency(queries, MAX_CONCURRENCY, async (query) => {
    try {
      const data = await router.search(query, 'web', {
        num_results: numResults,
        country:     options.country,
        search_lang: options.search_lang,
        ui_lang:     options.ui_lang,
        freshness:   options.freshness,
        safesearch:  options.safesearch,
        autocorrect: true,
      });
      return { query, results: (data.organic ?? []).slice(0, numResults) } as BatchQueryResult;
    } catch (err) {
      return {
        query,
        results: [],
        error: err instanceof Error ? err.message : String(err),
      } as BatchQueryResult;
    }
  });

  const seen = new Set<string>();
  let dedupedCount = 0;

  const lines: string[] = [`## 🔀 Batch Search — ${perQuery.length} ${perQuery.length === 1 ? 'query' : 'queries'}\n`];

  for (const [i, r] of perQuery.entries()) {
    if (r.error) {
      lines.push(`### ${i + 1}. "${r.query}" — ⚠️ failed`);
      lines.push(`⚠️ ${r.error}`);
      lines.push('');
      continue;
    }

    lines.push(`### ${i + 1}. "${r.query}" — ${r.results.length} results\n`);
    if (!r.results.length) {
      lines.push('*No results found.*\n');
      continue;
    }

    let shown = 0;
    for (const res of r.results) {
      if (res.link && seen.has(res.link)) {
        dedupedCount++;
        continue;
      }
      if (res.link) seen.add(res.link);
      shown++;
      lines.push(`**${shown}. [${res.title}](${res.link})**`);
      if (res.date) lines.push(`*${res.date}*`);
      if (res.snippet) lines.push(res.snippet);
      lines.push('');
    }

    if (!shown) lines.push('*All results were duplicates of earlier queries.*\n');
  }

  if (dedupedCount > 0) {
    lines.push(`---\n*Removed ${dedupedCount} duplicate URL${dedupedCount === 1 ? '' : 's'} across queries.*`);
  }

  return lines.join('\n');
}
