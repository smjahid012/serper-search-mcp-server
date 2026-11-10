/**
 * Deep Research — multi-step search + LLM synthesis
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 *
 * Flow:
 *  1. Generate focused sub-queries from the main question (LLM)
 *  2. Run parallel Serper web searches for each sub-query
 *  3. Synthesize all results into a cited research report (LLM)
 */

import { SerperAPI } from '../api/SerperAPI.js';
import { callLLM, getLLMProvider } from '../api/LLMClient.js';
import { mapWithConcurrency, RESEARCH_CONCURRENCY } from '../utils/Concurrency.js';
import { OrganicResult } from '../types/index.js';
import { countGotoLinks, isGotoLink } from '../utils/LinkResolution.js';

export type ResearchDepth = 'basic' | 'standard' | 'deep';

interface SubQueryResult {
  subQuery: string;
  results: OrganicResult[];
  resolveError?: string;
}

interface ResearchResult {
  query: string;
  depth: ResearchDepth;
  report: string;
  subQueries: string[];
  sourceCount: number;
  provider: string;
  model: string;
  /** Cited sources whose URL is still a google.com/goto redirect. */
  gotoSources: Array<{ n: number; link: string }>;
  /** Distinct /resolve errors, if resolving failed. */
  resolveErrors: string[];
}

const DEPTH_CONFIG: Record<ResearchDepth, { subQueries: number; resultsPerQuery: number }> = {
  basic:    { subQueries: 3, resultsPerQuery: 3 },
  standard: { subQueries: 5, resultsPerQuery: 5 },
  deep:     { subQueries: 8, resultsPerQuery: 5 },
};

// Token/credit budget: truncate aggregated LLM context so deep research
// stays bounded (~12k chars). Keeps report quality, caps LLM tokens.
const MAX_RESEARCH_CONTEXT_CHARS = 12_000;

// ── Step 1: generate sub-queries ──────────────────────────────────────────────

async function generateSubQueries(query: string, count: number): Promise<string[]> {
  const prompt = `You are a research assistant. Break the following research question into ${count} focused, specific search queries that together cover the topic comprehensively.

Research question: "${query}"

Return ONLY a JSON array of strings, no explanation, no markdown, no code fences. Example: ["query one","query two","query three"]`;

  const { content } = await callLLM(prompt);

  try {
    const clean = content.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.every((q) => typeof q === 'string')) {
      return parsed.slice(0, count);
    }
  } catch {
    // fallback: extract quoted strings
    const matches = content.match(/"([^"]+)"/g);
    if (matches) return matches.slice(0, count).map((m) => m.replace(/"/g, ''));
  }

  // last resort: use the original query with simple variations
  return [query, `${query} overview`, `${query} latest research`].slice(0, count);
}

// ── Step 2: run searches ──────────────────────────────────────────────────────

async function runSearches(
  subQueries: string[],
  resultsPerQuery: number,
  api: SerperAPI,
  country: string
): Promise<SubQueryResult[]> {
  const searches = subQueries.map((sq) => async () => {
    try {
      const data = await api.search(sq, 'web', { num_results: resultsPerQuery, country });
      let results = (data.organic ?? []).slice(0, resultsPerQuery);
      let resolveError: string | undefined;
      // Resolve Google redirect links before the URLs go into the prompt (free).
      if (countGotoLinks(results)) {
        try {
          const r = await api.resolve({ links: results.map((x) => x.link) });
          const links = r.data['links'] as unknown[];
          results = results.map((x, i) => (typeof links[i] === 'string' ? { ...x, link: links[i] as string } : x));
        } catch (err) {
          resolveError = err instanceof Error ? err.message : String(err);
        }
      }
      return { subQuery: sq, results, resolveError } as SubQueryResult;
    } catch {
      return { subQuery: sq, results: [] } as SubQueryResult;
    }
  });

  return mapWithConcurrency(searches, RESEARCH_CONCURRENCY, (fn) => fn());
}

// ── Step 3: build context string for LLM ─────────────────────────────────────

function buildContext(searchResults: SubQueryResult[]): {
  context: string;
  sourceCount: number;
  truncated: boolean;
  gotoSources: Array<{ n: number; link: string }>;
} {
  const sections: string[] = [];
  const gotoSources: Array<{ n: number; link: string }> = [];
  let sourceCount = 0;

  for (const { subQuery, results } of searchResults) {
    if (!results.length) continue;
    sections.push(`### Sub-query: "${subQuery}"\n`);
    for (const r of results) {
      sourceCount++;
      if (isGotoLink(r.link)) gotoSources.push({ n: sourceCount, link: r.link });
      sections.push(`**[${sourceCount}] ${r.title}**`);
      sections.push(`URL: ${r.link}`);
      if (r.snippet) sections.push(`Snippet: ${r.snippet}`);
      if (r.date) sections.push(`Date: ${r.date}`);
      sections.push('');
    }
  }

  let context = sections.join('\n');
  let truncated = false;
  if (context.length > MAX_RESEARCH_CONTEXT_CHARS) {
    context = context.slice(0, MAX_RESEARCH_CONTEXT_CHARS) + '\n\n…[context truncated to 12k chars]';
    truncated = true;
  }

  return { context, sourceCount, truncated, gotoSources };
}

// ── Step 4: synthesize report ─────────────────────────────────────────────────

async function synthesizeReport(
  query: string,
  context: string,
  depth: ResearchDepth
): Promise<{ report: string; provider: string; model: string }> {
  const depthInstructions: Record<ResearchDepth, string> = {
    basic:    'Write a concise summary (3–4 paragraphs).',
    standard: 'Write a comprehensive analysis (5–7 paragraphs) with clear sections.',
    deep:     'Write an exhaustive research report with an executive summary, detailed sections, key findings, and conclusions.',
  };

  const prompt = `You are an expert research analyst. Using ONLY the search results provided below, answer the research question with a well-structured report. Cite sources using their reference numbers [1], [2], etc. Do not invent facts not present in the sources.

Research question: "${query}"

${depthInstructions[depth]}

Always end with a "## Sources" section listing all cited references with their URLs.

--- SEARCH RESULTS ---
${context}
--- END OF SEARCH RESULTS ---

Write the research report now:`;

  const { content, provider, model } = await callLLM(prompt);
  return { report: content, provider, model };
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function runDeepResearch(
  query: string,
  depth: ResearchDepth = 'standard',
  country = 'US',
  api: SerperAPI
): Promise<ResearchResult> {
  const llmConfig = getLLMProvider();
  if (!llmConfig) {
    throw new Error(
      'Deep research requires an LLM API key.\n' +
      'Set OPENROUTER_API_KEY (free models available at openrouter.ai)\n' +
      'or GEMINI_API_KEY (free at aistudio.google.com) in your environment.'
    );
  }

  const { subQueries: subQueryCount, resultsPerQuery } = DEPTH_CONFIG[depth] ?? DEPTH_CONFIG.standard;

  // Step 1
  const subQueries = await generateSubQueries(query, subQueryCount);

  // Step 2
  const searchResults = await runSearches(subQueries, resultsPerQuery, api, country);

  // Step 3
  const { context, sourceCount, gotoSources } = buildContext(searchResults);
  const resolveErrors = [...new Set(searchResults.map((s) => s.resolveError).filter((e): e is string => Boolean(e)))];

  if (!sourceCount) {
    throw new Error('No search results found for this query. Try broadening your research question.');
  }

  // Step 4
  const { report, provider, model } = await synthesizeReport(query, context, depth);

  return {
    query,
    depth,
    report,
    subQueries,
    sourceCount,
    provider,
    model,
    gotoSources,
    resolveErrors,
  };
}

/** Footer listing cited sources whose URL is still a Google redirect. Empty when there are none. */
export function deepResearchLinkFooter(result: Pick<ResearchResult, 'gotoSources' | 'resolveErrors'>): string {
  const { gotoSources, resolveErrors } = result;
  if (!gotoSources.length) return '';
  return [
    '', '', '---',
    `> ⚠️ **${gotoSources.length} source URL(s) are still Google redirects** (\`google.com/goto?…\`), not real URLs: ` +
      gotoSources.map((s) => `[${s.n}]`).join(', ') + '.',
    ...resolveErrors.map((e) => `> /resolve failed: ${e}`),
    '> Call `resolve_links` with these links to get the real URLs:',
    ...gotoSources.map((s) => `> - [${s.n}] ${s.link}`),
  ].join('\n');
}
