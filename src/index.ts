#!/usr/bin/env node
/**
 * Entry point — Serper Search MCP Server
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 */

import { SerperMCPServer } from './server/SerperMCPServer.js';
import { validateEnv } from './utils/EnvCheck.js';
import { version } from '../package.json';

export { SerperMCPServer };

function parseArgs(): { flags: Record<string, string>; positional: string[] } {
  const argv = process.argv.slice(2);
  const flags: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i] as string;
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(tok);
    }
  }
  return { flags, positional };
}

// ── CLI subcommands (v4.0): thin wrappers over SerperAPI + ResultFormatter ──

async function runCliCommand(cmd: string, rest: string[], flags: Record<string, string>): Promise<void> {
  const apiKey = flags['api-key'] === 'true' || !flags['api-key'] ? process.env.SERPER_API_KEY ?? '' : flags['api-key'];
  if (!apiKey && cmd !== 'providers' && cmd !== 'status') {
    console.error('Fatal: SERPER_API_KEY is required (or --api-key <key>)');
    process.exit(1);
  }
  const { SerperAPI } = await import('./api/SerperAPI.js');
  const { ProviderRouter } = await import('./api/providers/Router.js');
  const { ResultFormatter } = await import('./utils/ResultFormatter.js');
  const api = new SerperAPI(apiKey);
  const router = new ProviderRouter(api);
  const limit = flags['limit'] ? Math.max(1, Math.min(parseInt(flags['limit'], 10) || 5, 20)) : 5;
  const compact = flags['compact'] === 'true' || flags['compact'] === '';
  const asJson = flags['json'] === 'true' || flags['json'] === '';
  const provider = flags['provider'] ?? 'auto';
  const verbosity = compact ? 'compact' : 'standard';

  if (cmd === 'providers' || cmd === 'status') {
    const rows = [
      { name: 'serper', configured: Boolean(apiKey), note: 'default, $3-5/1k, 2500 free' },
      { name: 'tavily', configured: Boolean(process.env.TAVILY_API_KEY), note: '$8-16/1k, reranked' },
      { name: 'brave', configured: Boolean(process.env.BRAVE_API_KEY), note: '$5/1k, independent' },
      { name: 'exa', configured: Boolean(process.env.EXA_API_KEY), note: '$4-7/1k, neural' },
      { name: 'firecrawl', configured: Boolean(process.env.FIRECRAWL_API_KEY), note: '~$3-4/1k eff, JS render' },
    ];
    if (asJson) console.log(JSON.stringify({ order: process.env.SEARCH_PROVIDER_ORDER ?? 'serper,tavily,brave', fallback: process.env.SEARCH_FALLBACK ?? 'true', providers: rows }, null, 2));
    else {
      console.log('Providers (order: ' + (process.env.SEARCH_PROVIDER_ORDER ?? 'serper,tavily,brave') + ', fallback: ' + (process.env.SEARCH_FALLBACK ?? 'true') + ')');
      for (const r of rows) console.log(`  ${r.configured ? '✅' : '❌'} ${r.name} — ${r.note}`);
    }
    return;
  }

  if (cmd === 'search' || cmd === 'scrape' || cmd === 'research' || cmd === 'rag') {
    const query = rest.join(' ').trim();
    if (!query && cmd !== 'scrape') {
      console.error(`Usage: serper-search-mcp ${cmd} "<query>" [--compact --limit 5 --provider auto --json]`);
      process.exit(1);
    }
    if (cmd === 'search') {
      const type = (flags['type'] ?? 'web') as import('./types/index.js').SearchType;
      const validTypes = ['web', 'images', 'videos', 'news', 'shopping', 'places', 'scholar', 'patents', 'autocomplete'];
      if (!validTypes.includes(type)) {
        console.error(`Invalid search type: "${type}". Must be one of: ${validTypes.join(', ')}`);
        process.exit(1);
      }
      const data = await router.search(query, type, { num_results: limit, provider });
      if (asJson) console.log(JSON.stringify(data, null, 2));
      else console.log(ResultFormatter.format(data, limit, type, { verbosity }));
      return;
    }
    if (cmd === 'scrape') {
      const url = rest[0] ?? flags['url'] ?? '';
      const maxChars = Number(flags['max-chars']) || 8000;
      const data = await api.scrape(url);
      if (asJson) console.log(JSON.stringify(data, null, 2));
      else console.log(ResultFormatter.formatScrape(data, url, maxChars));
      return;
    }
    if (cmd === 'rag') {
      const { buildRAGContext } = await import('./tools/RAGContext.js');
      const format = (flags['format'] === 'text' ? 'text' : 'json') as 'text' | 'json';
      console.log(await buildRAGContext(query, { num_results: limit, output_format: format }, api));
      return;
    }
    if (cmd === 'research') {
      const { runDeepResearch } = await import('./tools/DeepResearch.js');
      const depth = (flags['depth'] ?? 'basic') as import('./tools/DeepResearch.js').ResearchDepth;
      const result = await runDeepResearch(query, depth, 'US', api);
      if (asJson) console.log(JSON.stringify(result, null, 2));
      else console.log(result.report);
      return;
    }
  }
  console.error(`Unknown command: ${cmd}. Try: search|scrape|research|rag|providers|status`);
  process.exit(1);
}

async function main() {
  const { flags, positional } = parseArgs();

  // ── Boot-time env validation: surface typos before they silently fall back ──
  for (const warning of validateEnv()) {
    console.error(`[serper-mcp] config warning: ${warning}`);
  }

  if ('help' in flags || positional[0] === 'help') {
    console.log(`
Serper Search MCP Server v${version} — SMLabs AI

Usage (MCP server):
  npx serper-search-mcp [options]

Usage (CLI — dev power-tool):
  npx serper-search-mcp search "react server components" --compact --limit 5
  npx serper-search-mcp scrape https://example.com --max-chars 8000
  npx serper-search-mcp research "RAG limits" --depth basic
  npx serper-search-mcp rag "transformer" --format json
  npx serper-search-mcp providers --status

Options:
  --api-key <key>          Serper API key (or set SERPER_API_KEY env)
  --transport <stdio|http> Transport mode (default: stdio)
  --port <number>          HTTP port (default: 8080)
  --host <string>          HTTP host (default: 0.0.0.0)
  --auth-token <token>     Require bearer token on HTTP /mcp (or SERPER_MCP_AUTH_TOKEN)
  --log-level <level>      error | warn | info | debug | silent (default: info)
  --compact                CLI: compact output (~800 tokens)
  --limit <n>              CLI: results 1-20 (default: 5)
  --provider <name>        CLI: auto|serper|tavily|brave|exa|firecrawl|all
  --json                   CLI: raw JSON output
  --help                   Show this help

Environment variables:
  SERPER_API_KEY           Required — get one free at https://serper.dev
  SERPER_MCP_TRANSPORT     stdio | http
  SERPER_MCP_PORT          HTTP port
  SERPER_MCP_HOST          HTTP host
  SERPER_MCP_AUTH_TOKEN    Optional bearer token required on HTTP /mcp
  SERPER_MCP_LOG_LEVEL     error | warn | info | debug | silent
  SERPER_CACHE_TTL_MS      Search-result cache TTL (default 600000, 0 = disabled)
  SERPER_TIMEOUT_MS        Per-request timeout (default 30000)
  SERPER_RETRIES           Retries on 429/5xx/network errors (default 2)
  TAVILY_API_KEY           Fallback provider 1 (reranked)
  BRAVE_API_KEY            Fallback provider 2 (independent index)
  EXA_API_KEY              Fallback provider 3 (neural)
  FIRECRAWL_API_KEY        Scrape upgrade (JS render)
  SEARCH_PROVIDER_ORDER    Failover chain (default: serper,tavily,brave)
  SEARCH_FALLBACK          auto-failover on 402/429/5xx/empty (default: true)
  OPENROUTER_API_KEY       LLM key for deep_research
  GEMINI_API_KEY           LLM key for deep_research

Tools provided:
  search             Unified search {type, provider, verbosity} — 1 schema (~700 tokens)
  search_web         Google web search with Knowledge Graph + Answer Box
  search_images      Google Image search (+ gallery layout, size/orientation/color/site)
  search_videos      Google Video search
  search_news        Google News search
  search_shopping    Google Shopping search (always rich)
  search_places      Google Places / Maps search (full hours, open_now, min_rating, sort)
  search_scholar     Google Scholar — academic papers with citation counts
  search_patents     Google Patents
  autocomplete       Query completions
  scrape             Fetch full page content as markdown
  search_many        Batch: 1–10 parallel searches with dedupe (max_credits guard)
  deep_research      Multi-step research: sub-queries, parallel search, LLM report (basic 3cr / standard 5cr / deep 8cr)
  search_rag_context Clean chunked text + metadata for RAG/embedding pipelines
`);
    process.exit(0);
  }

  // CLI subcommand mode: search|scrape|research|rag|providers|status
  const subcommands = ['search', 'scrape', 'research', 'rag', 'providers', 'status'];
  if (positional.length && subcommands.includes(positional[0] as string)) {
    await runCliCommand(positional[0] as string, positional.slice(1), flags);
    return;
  }

  try {
    const apiKey = flags['api-key'] === 'true' ? undefined : flags['api-key'];
    const authToken = flags['auth-token'] === 'true' ? undefined : flags['auth-token'];
    const server = new SerperMCPServer({
      apiKey,
      transport: flags['transport'] === 'http' ? 'http' : undefined,
      port: flags['port'] ? parseInt(flags['port'], 10) : undefined,
      host: flags['host'],
      authToken,
      logLevel: flags['log-level'],
    });
    await server.run();
  } catch (err) {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Only start the server when executed directly (not when require()'d as a library)
if (require.main === module) {
  main();
}
