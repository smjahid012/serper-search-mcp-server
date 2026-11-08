---
name: serper-search-mcp
description: Universal search gateway for AI agents — token-efficient web, places, shopping, scholar, patents, scrape, and deep research across 5 search providers (Serper, Tavily, Brave, Exa, Firecrawl).
---

# Serper Search MCP — Agent Skill

> Progressive disclosure: load this (~60 tokens) instead of all 14 tool schemas (~7k tokens).

## When to use
- **Dev coding:** `search` with `verbosity=compact`, `type=web`, `num_results=5`.
- **Chat/research:** omit verbosity (`auto` → standard/full with KG + Answer Box + PAA).
- **Places / shopping / images / scholar / patents:** ALWAYS rich — never compact.
- **Reading web pages:** `scrape` with markdown extraction.

## Minimal calls (MCP Tools)
```json
search { "query": "...", "type": "web", "verbosity": "compact", "provider": "auto" }
scrape { "url": "https://..." }
search { "query": "...", "type": "places" }            // full 7-day hours + Maps + Directions
search { "query": "...", "type": "images", "layout": "gallery" }
search { "query": "...", "type": "scholar" }           // papers + citation counts
deep_research { "query": "...", "depth": "standard" }  // basic 3cr / standard 5cr / deep 8cr
search_many { "queries": ["..."], "max_credits": 5 }
search_rag_context { "query": "...", "output_format": "json" }
```

## CLI Fast Path (Shell Execution)
```bash
npx serper-search-mcp search "query" --compact --limit 5
npx serper-search-mcp scrape "https://example.com"
```

## Credit & Failover Rules
- 1 search = 1 credit. Cache hit = 0. Scrape ≈ 2.
- Never fetch-10-show-3: `compact` automatically requests `num=5`.
- Providers: `auto` fails over Serper → Tavily → Brave on 402/429/5xx/empty response.
- `provider=all` fans out in parallel + Reciprocal Rank Fusion (RRF) + dedupe.

## Output Contract
Every response ends with: `Provider: X · Cache: hit|miss · Credits: N · Tokens: ~Y`.
Escalate `compact → full` when the agent needs citations, prices, hours, or images.
