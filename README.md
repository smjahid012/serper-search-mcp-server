<div align="center">

# 🔍 Serper Search MCP Server v4.0

**The First Universal Search Gateway for AI Agents — Google (Serper), Tavily, Brave, Exa, and Firecrawl with auto-failover, 14 tools, and token-smart verbosity.**

[![npm version](https://img.shields.io/npm/v/serper-search-mcp?color=blue&logo=npm)](https://www.npmjs.com/package/serper-search-mcp)
[![npm downloads](https://img.shields.io/npm/dt/serper-search-mcp?color=brightgreen&label=npm%20downloads)](https://www.npmjs.com/package/serper-search-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/smjahid/server-serper-search?logo=docker)](https://hub.docker.com/r/smjahid/server-serper-search)
[![GitHub stars](https://img.shields.io/github/stars/smjahid012/serper-search-mcp-server?style=social)](https://github.com/smjahid012/serper-search-mcp-server)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Protocol-MCP-purple)](https://modelcontextprotocol.io)

</div>

---

## What this does

This MCP server wraps the [Serper API](https://serper.dev) (Google Search results) and exposes **14 tools** that any MCP-compatible AI client (Claude, Cursor, Windsurf, KiloCode, n8n, etc.) can call in real time — including web, image, video, news, shopping, places, scholar, patents, autocomplete, full-page scraping, and batch search.

| Tool | What you get |
|---|---|
| `search` ⭐ | Unified search `{type, provider, verbosity}` — 1 schema (~700 tokens vs ~7k for all) |
| `search_web` | Organic results + **Knowledge Graph** + **Answer Box** + "People Also Ask" + Related Searches |
| `search_images` | Image URLs, thumbnails, dimensions, source pages + `gallery` layout + `size/orientation/color/site` |
| `search_videos` | Titles, channels, durations, links |
| `search_news` | Headlines, sources, dates — freshness-filtered |
| `search_shopping` | Products, prices, ratings, delivery info (always rich) |
| `search_places` | Local businesses & POIs with address, phone, **full 7-day hours**, GPS + Directions (always rich) |
| `search_scholar` 🆕 | Academic papers with authors, journal, year, and citation counts |
| `search_patents` 🆕 | Patents with publication number, assignee, inventor, dates |
| `autocomplete` 🆕 | Query completions — cheap, no LLM needed |
| `scrape` 🆕 | Full page content as markdown — read articles found via search |
| `search_many` 🆕 | 1–10 parallel web searches with automatic cross-query dedupe |
| `deep_research` | Multi-step research: auto sub-queries → parallel searches → LLM-synthesized cited report |
| `search_rag_context` | Clean chunked text with metadata for embedding pipelines & vector DBs — no LLM needed |
| `resolve_links` 🆕 | Turn `google.com/goto` redirect links from a search into real URLs (free, 0 credits) |

### Verbosity (token-smart, auto by default)

| Mode | Who | What | Tokens |
|---|---|---|---|
| `auto` (default) | server picks | dev→compact, chat→standard, scholar/research→full, places/shopping/images→always rich | varies |
| `compact` | dev coding | title+URL+1-line snippet, no KG/PAA/Related | ~800 |
| `standard` | normal chat | KG + Answer Box + 10 organic | ~4k |
| `full` | researcher | everything + citations | ~5k |

> Credit rule: `compact` fetches `num=5` (never fetch-10-show-3). 1 search = 1 credit, cache hit = 0, scrape ≈ 2. `deep_research`: basic 3cr / standard 5cr / deep 8cr.

### Providers (universal gateway — auto-failover)

| Provider | Cost per 1k | When to use |
|---|---|---|
| **Serper** (default) | $3-5, 2500 free/mo | Cheapest Google truth — keep first |
| **Tavily** fallback | $8-16 | AI-reranked, finance/news topics |
| **Brave** fallback | $5 | Independent index, private, 669ms |
| **Exa** fallback | $4-7 | Neural semantic when keywords fail |
| **Firecrawl** fallback | ~$3-4 eff | JS-rendered scraping & search upgrade |

```bash
SEARCH_PROVIDER_ORDER=serper,tavily,brave,exa  # failover chain
SEARCH_FALLBACK=true                           # on 402/429/5xx/empty
```

### CLI (dev power-tool — 4-32x cheaper than MCP schemas)

```bash
npx serper-search-mcp search "react server components" --compact --limit 5
npx serper-search-mcp scrape https://example.com --max-chars 8000
npx serper-search-mcp research "RAG limits" --depth basic
npx serper-search-mcp rag "transformer" --format json
npx serper-search-mcp providers --status
```

> **Free to start:** Serper gives you 2,500 free queries/month. No credit card required.

---

## Quick start

### 🔑 Provider Keys & Universal Gateway Configuration

This server functions as a **Universal Search Gateway**. Only `SERPER_API_KEY` is required. You can add any combination of the other 4 search providers and LLM keys to enable automatic multi-provider failover, semantic search, and scraping upgrades:

| Variable | Provider / Purpose | Default / Priority |
|---|---|---|
| `SERPER_API_KEY` | **Serper** (Google Search baseline) | **Required** ([serper.dev](https://serper.dev)) |
| `TAVILY_API_KEY` | **Tavily** (AI-reranked fallback) | Optional ([tavily.com](https://tavily.com)) |
| `BRAVE_API_KEY` | **Brave** (Independent web index fallback) | Optional ([brave.com/search/api](https://brave.com/search/api)) |
| `EXA_API_KEY` | **Exa** (Neural semantic search fallback) | Optional ([exa.ai](https://exa.ai)) |
| `FIRECRAWL_API_KEY` | **Firecrawl** (JS-rendered scraping & search upgrade) | Optional ([firecrawl.dev](https://firecrawl.dev)) |
| `OPENROUTER_API_KEY` | LLM for `deep_research` | Optional (takes priority over Gemini) |
| `GEMINI_API_KEY` | LLM for `deep_research` | Optional (used when OpenRouter is absent) |

#### Failover Control:
```bash
SEARCH_PROVIDER_ORDER=serper,tavily,brave,exa  # custom failover priority chain
SEARCH_FALLBACK=true                           # auto-failover on 402/429/5xx/empty (default: true)
```

---

### Option 1 — npx (MCP Client Configuration)

Add this to your MCP client config file (Claude Desktop, Cursor, Windsurf, KiloCode).

#### 🌟 Full Universal Gateway Config (All 5 Providers + Failover):
```json
{
  "mcpServers": {
    "serper-search": {
      "command": "npx",
      "args": ["-y", "serper-search-mcp"],
      "env": {
        "SERPER_API_KEY": "${SERPER_API_KEY}",
        "TAVILY_API_KEY": "${TAVILY_API_KEY}",
        "BRAVE_API_KEY": "${BRAVE_API_KEY}",
        "EXA_API_KEY": "${EXA_API_KEY}",
        "FIRECRAWL_API_KEY": "${FIRECRAWL_API_KEY}",
        "OPENROUTER_API_KEY": "${OPENROUTER_API_KEY}",
        "SEARCH_PROVIDER_ORDER": "serper,tavily,brave,exa",
        "SEARCH_FALLBACK": "true"
      }
    }
  }
}
```

*(You can omit any provider keys you don't use; the server automatically detects configured providers and skips unconfigured ones).*

#### Minimal Config (Serper Only):
```json
{
  "mcpServers": {
    "serper-search": {
      "command": "npx",
      "args": ["-y", "serper-search-mcp"],
      "env": {
        "SERPER_API_KEY": "your_serper_key_here"
      }
    }
  }
}
```

---

### Option 2 — Docker

```bash
docker run -i --rm \
  -e SERPER_API_KEY \
  -e TAVILY_API_KEY \
  -e BRAVE_API_KEY \
  -e EXA_API_KEY \
  -e FIRECRAWL_API_KEY \
  -e OPENROUTER_API_KEY \
  smjahid/server-serper-search:4
```

For HTTP mode (remote server or cloud):
```bash
docker run --rm -p 8080:8080 \
  -e SERPER_API_KEY \
  -e SERPER_MCP_TRANSPORT=http \
  -e SERPER_MCP_HOST=0.0.0.0 \
  -e SERPER_MCP_AUTH_TOKEN="your_secure_bearer_token" \
  smjahid/server-serper-search:4
```

---

### Option 3 — Shell & CLI (PowerShell / Bash / CMD)

**PowerShell (Windows):**
```powershell
$env:SERPER_API_KEY = "your_key"
$env:TAVILY_API_KEY = "your_key"      # optional
$env:OPENROUTER_API_KEY = "your_key"  # optional
node index.js
```

**Bash / macOS / Linux:**
```bash
export SERPER_API_KEY="your_key"
export TAVILY_API_KEY="your_key"      # optional
export OPENROUTER_API_KEY="your_key"  # optional
node index.js
```

**Windows Command Prompt:**
```bat
set SERPER_API_KEY=your_key
node index.js
```

> **💡 AI-powered research is free.** `deep_research` uses Gemini's free tier by default. Set `GEMINI_API_KEY` above to unlock it.

---

## Config file locations

| Client | Config path |
|---|---|
| **Claude Desktop (Mac)** | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop (Win)** | `%APPDATA%\Claude\claude_desktop_config.json` |
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **KiloCode** | `~/.config/kilo/kilo.json` (global) or `<project>/kilo.json` (project) |
| **n8n** | MCP Client node → Server URL |

---

## Tool reference

### `search_web`

Google web search with the full SERP breakdown.

```jsonc
{
  "query":       "best mechanical keyboards 2025",   // required
  "num_results": 10,        // 1–20, default 10
  "country":     "US",      // ISO 3166-1 alpha-2
  "search_lang": "en",      // language code
  "freshness":   "pw",      // "pd" day · "pw" week · "pm" month · "py" year
  "safesearch":  "moderate",// "off" · "moderate" · "strict"
  "autocorrect": true,
  "summary":     false,     // Serper AI summary
  "page":        1,         // pagination
  "link_resolution": "auto" // "auto" · "all" · "none" — see Google redirect links below
}
```

**Response includes:**
- 🎯 **Answer Box** — direct answer when available
- 🧠 **Knowledge Graph** — entity info (type, description, rating, website, attributes)
- 🌐 **Organic results** — title, URL, snippet, sitelinks, date
- 💬 **People Also Ask** — up to 4 follow-up questions with answers
- 🔗 **Related Searches** — up to 6 suggestions

---

### `search_images`

```jsonc
{
  "query":       "minimalist desk setup",
  "num_results": 10,
  "country":     "US",
  "safesearch":  "moderate"
}
```

Returns: image URL, thumbnail, dimensions (width × height), source domain, source page URL.

---

### `search_videos`

```jsonc
{
  "query":       "react server components tutorial",
  "num_results": 5,
  "freshness":   "pm"
}
```

Returns: title, channel, duration, publish date, video URL.

---

### `search_news`

```jsonc
{
  "query":       "OpenAI GPT-5 release",
  "num_results": 10,
  "freshness":   "pd",   // default is past day for news
  "country":     "US"
}
```

Returns: headline, source publication, date, snippet, URL.

---

### `search_shopping`

```jsonc
{
  "query":       "Sony WH-1000XM5 headphones",
  "num_results": 8,
  "country":     "US"
}
```

Returns: product name, price, seller, star rating + review count, delivery info, product URL.

---

### `search_places` ⭐ unique to this server

```jsonc
{
  "query":       "ramen restaurants in Shibuya Tokyo",
  "num_results": 5,
  "country":     "JP"
}
```

Returns: business name, category, address, phone, website, star rating + review count, opening hours, GPS coordinates + Google Maps link.

**Example use cases:**
- "Find the top-rated coffee shops near Times Square"
- "What dentists are open on Sundays in Austin TX?"
- "List coworking spaces in Dhaka"

---

### `search_scholar` 🆕 v4.0.0

Google Scholar search for academic literature.

```jsonc
{
  "query":       "attention is all you need",
  "num_results": 10,
  "country":     "US"
}
```

Returns: title, link, authors/journal/year (`publicationInfo`), snippet, and citation count.

---

### `scrape` 🆕 v4.0.0

Fetch the full contents of a single URL (Serper Scrape API — `scrape.serper.dev`).

```jsonc
{
  "url":              "https://example.com/article",  // required
  "include_markdown": true,       // default true — markdown rendering
  "include_images":   false,
  "include_links":    false,
  "include_videos":   false,
  "max_chars":        50000       // 1000–200000, default 50000
}
```

Returns the page as markdown (falls back to plain text), truncated for context safety. Costs ~2 credits per page — typical flow is `search_web` → `scrape` the best result.

---

### `search_many` 🆕 v4.0.0

Run 1–10 web searches in one call, in parallel.

```jsonc
{
  "queries":     ["react server components", "vue server components", "sveltekit ssr"],
  "num_results": 5,
  "country":     "US"
}
```

Duplicate URLs across queries are removed automatically; per-query failures are reported inline without failing the batch. One credit per query.

---

### Google redirect links & `resolve_links` 🆕

Since 2026-10-30, Serper may return Google result links beyond the top 3 as `https://www.google.com/goto?url=…` redirects. Opening one right after the search lands on Google's "Verifying your request" page instead of the site. Serper's free `/resolve` endpoint turns them back into real URLs ([serper.dev/google-links](https://serper.dev/google-links)).

`search`, `search_web`, `search_images`, `search_videos`, `search_news`, `search_shopping` and `search_rag_context` take a `link_resolution` parameter:

| Mode | Behaviour |
|---|---|
| `auto` (default) | Serper's default: top 3 resolved. If the shown results still contain redirect links, the output says how many and gives a `search_id`. |
| `all` | Also calls `/resolve` before returning. Free, but adds ~20–30 s when redirect links are present. |
| `none` | Sends `resolveLinks: false`: fastest, links exactly as Google returns them. |

`resolve_links` resolves a search later by `search_id` (the last 50 searches with redirect links are kept in memory) or from a list of goto links:

```jsonc
{ "search_id": "Xq3v…" }                                 // re-renders that search with real URLs
{ "links": ["https://www.google.com/goto?url=…"], "max_wait_seconds": 60 }
```

Links that are not ready yet stay goto links and Serper suggests a wait (often 90 s); it is honoured only if it fits in `max_wait_seconds`. `/resolve` failures never fail a search: the original results are kept and the error is shown. `deep_research` resolves its sources before building the prompt and lists any citation that is still a redirect.

---

## Environment variables

### Search Providers & Universal Gateway

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERPER_API_KEY` | ✅ | — | Primary search provider key ([serper.dev](https://serper.dev) — 2,500 free queries/mo) |
| `TAVILY_API_KEY` | ❌ | — | Tavily fallback provider key ([tavily.com](https://tavily.com) — AI-reranked search) |
| `BRAVE_API_KEY` | ❌ | — | Brave Search fallback provider key ([brave.com/search/api](https://brave.com/search/api) — independent index) |
| `EXA_API_KEY` | ❌ | — | Exa neural search fallback key ([exa.ai](https://exa.ai) — semantic search & highlights) |
| `FIRECRAWL_API_KEY` | ❌ | — | Firecrawl JS-rendered scraping & search upgrade key ([firecrawl.dev](https://firecrawl.dev)) |
| `SEARCH_PROVIDER_ORDER` | ❌ | `serper,tavily,brave` | Comma-separated failover priority chain (`serper,tavily,brave,exa,firecrawl`) |
| `SEARCH_FALLBACK` | ❌ | `true` | Auto-failover on 402/429/5xx/empty response (`true` or `false`) |

### Server & Transport

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERPER_MCP_TRANSPORT` | ❌ | `stdio` | MCP transport mode: `stdio` (local AI clients) or `http` (stateless Streamable HTTP) |
| `SERPER_MCP_PORT` | ❌ | `8080` | Port for HTTP transport mode (1–65535) |
| `SERPER_MCP_HOST` | ❌ | `0.0.0.0` | Host interface to bind for HTTP mode |
| `SERPER_MCP_AUTH_TOKEN` | ❌ | — | If set, HTTP `/mcp` requires `Authorization: Bearer <token>` |
| `SERPER_MCP_LOG_LEVEL` | ❌ | `info` | Logging verbosity: `error` · `warn` · `info` · `debug` · `silent` |

### Cache & Resilience Tuning

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERPER_CACHE_TTL_MS` | ❌ | `600000` | Search-result cache TTL in ms (`0` disables the cache) |
| `SERPER_CACHE_MAX` | ❌ | `200` | Maximum cached responses (LRU eviction) |
| `SERPER_TIMEOUT_MS` | ❌ | `30000` | Per-request timeout for Serper calls in ms |
| `SERPER_RETRIES` | ❌ | `2` | Retries on 429 / 5xx / network errors (honors `Retry-After`) |
| `SERPER_RETRY_BASE_MS` | ❌ | `500` | Base backoff delay in ms (exponential backoff + jitter) |
| `SERPER_LINK_RESOLUTION` | ❌ | `auto` | Default `link_resolution` mode: `auto` · `all` · `none` |
| `SERPER_RESOLVE_MAX_WAIT` | ❌ | `60` | Seconds `/resolve` may keep retrying when Serper says to wait |

### Deep Research LLM Synthesis

| Variable | Required | Default | Description |
|---|---|---|---|
| `OPENROUTER_API_KEY` | ❌ | — | LLM key for `deep_research` synthesis (free tier at [openrouter.ai](https://openrouter.ai)) |
| `OPENROUTER_MODEL` | ❌ | `google/gemini-3.1-flash-lite:free` | OpenRouter model override |
| `GEMINI_API_KEY` | ❌ | — | LLM key for `deep_research` synthesis (free tier at [ai.google.dev](https://ai.google.dev)) |
| `GEMINI_MODEL` | ❌ | `gemini-3.1-flash-lite` | Gemini model override |
| `SERPER_LLM_TIMEOUT_MS` | ❌ | `120000` | Per-request timeout for LLM synthesis calls in ms |
| `SERPER_LLM_RETRIES` | ❌ | `2` | Retries for LLM calls on rate-limit or network errors |

---

## HTTP transport (remote / Docker)

Run as a stateless Streamable HTTP server (this is also how the Docker image runs):

```bash
npx serper-search-mcp --transport http --port 8080
# or via env: SERPER_MCP_TRANSPORT=http SERPER_MCP_PORT=8080 npx serper-search-mcp
```

- MCP endpoint: `POST http://localhost:8080/mcp`
- Health probe: `GET http://localhost:8080/health`

Point any Streamable HTTP capable MCP client at `http://<host>:8080/mcp`.

### Optional bearer auth

Set `SERPER_MCP_AUTH_TOKEN` (or `--auth-token`) to require authentication on `/mcp`:

```bash
SERPER_MCP_AUTH_TOKEN=secret npx serper-search-mcp --transport http --port 8080
```

```bash
curl -X POST http://localhost:8080/mcp \
  -H "Authorization: Bearer secret" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Requests without the token get `401`. `/health` stays unauthenticated for load balancers and reports `auth_required`.

---

## Example prompts

Once connected to any MCP client:

```
Search for the latest news about Claude 4 and summarize the key points.

Find me 5 Italian restaurants in Warsaw with their ratings and phone numbers.

What is the current price of the MacBook Pro M4 on Google Shopping?

Search for YouTube tutorials on building agentic AI systems published this month.

Find images of brutalist architecture in Eastern Europe.
```

---

---

## `deep_research`

Runs multi-step AI research using your own LLM key. No LLM data leaves your environment.

**Requires:** `OPENROUTER_API_KEY` (free models at [openrouter.ai](https://openrouter.ai)) or `GEMINI_API_KEY` (free at [aistudio.google.com](https://aistudio.google.com))

```jsonc
{
  "query": "What are the real-world limitations of RAG systems in production?",
  "depth": "standard",  // "basic" | "standard" | "deep"
  "country": "US"
}
```

| Depth | Sub-queries | Results each | Best for |
|---|---|---|---|
| `basic` | 3 | 3 | Quick overviews |
| `standard` | 5 | 5 | Most use cases |
| `deep` | 8 | 7 | Exhaustive research |

**Output:** Structured markdown report with inline citations + Sources section.

**Supported LLMs via env (all vars documented in the [table above](#environment-variables)):**

| Provider | Variable | Default |
|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` | — |
| | `OPENROUTER_MODEL` | `google/gemini-3.1-flash-lite:free` |
| Google Gemini | `GEMINI_API_KEY` | — |
| | `GEMINI_MODEL` | `gemini-3.1-flash-lite` |

---

## `search_rag_context`

Turns Google search results into embedding-ready chunks. No LLM needed — pure text processing.

```jsonc
{
  "query":           "transformer architecture explained",
  "num_results":     10,
  "max_chunk_words": 200,
  "include_paa":     true,
  "output_format":   "json"   // "json" or "text"
}
```

**JSON output** (for vector DB ingestion):
```json
{
  "query": "transformer architecture explained",
  "total_sources": 10,
  "total_chunks": 24,
  "total_words": 4231,
  "chunks": [
    {
      "chunk_index": 0,
      "source_index": 1,
      "title": "Attention Is All You Need",
      "url": "https://arxiv.org/abs/1706.03762",
      "domain": "arxiv.org",
      "date": "2024-01-15",
      "text": "The transformer architecture uses self-attention mechanisms...",
      "word_count": 198,
      "char_count": 1124
    }
  ]
}
```

**Text output** (for direct prompt injection):
```
--- Chunk 1 | Source 1 | arxiv.org | 2024-01-15 ---
Title: Attention Is All You Need
URL: https://arxiv.org/abs/1706.03762
The transformer architecture uses self-attention...
```

**Use cases:**
- Feed into Chroma, Pinecone, Qdrant, pgvector
- Ground prompts with fresh web data
- Build search-augmented RAG pipelines

---

## Architecture

```
serper-search-mcp-server/
├── index.js                    ← Zero-build JS entry (npx / Docker) — generated from src/ via `npm run bundle`; never edit by hand
├── src/
│   ├── index.ts                ← TypeScript CLI entry
│   ├── api/
│   │   ├── SerperAPI.ts        ← HTTP client (per-type endpoints, retry, timeout, TTL cache, scrape)
│   │   └── LLMClient.ts        ← OpenRouter + Gemini client
│   ├── server/
│   │   └── SerperMCPServer.ts  ← MCP server, stdio + HTTP transport, bearer auth
│   ├── tools/
│   │   ├── SearchTools.ts      ← All 15 tool definitions + validation
│   │   ├── BatchSearch.ts      ← search_many (parallel + dedupe)
│   │   ├── DeepResearch.ts     ← Multi-step research orchestration
│   │   ├── RAGContext.ts       ← Chunk + metadata formatter
│   │   └── ResolveLinks.ts     ← link_resolution modes + resolve_links (Serper /resolve)
│   ├── types/
│   │   └── index.ts            ← Full TypeScript types
│   └── utils/
│       ├── ResultFormatter.ts  ← Markdown formatting
│       ├── HttpRetry.ts        ← Timeout + retry/backoff
│       ├── TtlCache.ts         ← TTL + LRU cache
│       ├── Logger.ts           ← Leveled stderr logger (+ request-id)
│       ├── errors.ts           ← Typed error hierarchy
│       ├── Metrics.ts          ← /health counters
│       └── EnvCheck.ts         ← Boot-time env validation
├── scripts/
│   └── bundle.mjs              ← Builds index.js from src/ (`--check` mode for CI)
├── tests/                      ← node:test suite (58 tests)
└── .github/workflows/ci.yml    ← Node 18/20/22: build + bundle check + tests
```

**Dual-file design:** `index.js` runs without any build step (ideal for `npx` and Docker) and is generated from `src/` — the TS tree is the only source of truth. `npm run check:bundle` fails CI if they drift.

---

## Get a Serper API key

1. Go to [serper.dev](https://serper.dev)
2. Sign up (free — no credit card)
3. Copy your API key from the dashboard
4. You get **2,500 free queries/month**

---

## Version evolution

| Feature | v1.0.0 | v2.0.1 | v3.0.0 | v4.0.0 |
|---|---|---|---|---|
| **Total tools** | 5 | 5 | 8 | 14 |
| `search` (unified) | ❌ | ❌ | ❌ | ✅ auto-verbosity + provider failover |
| `search_web` | ✅ organic only | ✅ organic only | ✅ + Answer Box, Knowledge Graph, PAA, Related | ✅ |
| `search_images` | ✅ | ✅ | ✅ + dimensions, domain | ✅ + gallery layout |
| `search_videos` | ✅ | ✅ | ✅ + date field | ✅ |
| `search_news` | ✅ | ✅ | ✅ cleaner formatting | ✅ + past-day default |
| `search_shopping` | ✅ | ✅ | ✅ + delivery, offers | ✅ (always rich) |
| `search_places` | ❌ | ❌ | ✅ address, phone, hours, GPS, Maps link | ✅ + full 7-day hours, directions |
| `search_scholar` | ❌ | ❌ | ❌ | ✅ papers + citation counts |
| `search_patents` | ❌ | ❌ | ❌ | ✅ publication, assignee, dates |
| `autocomplete` | ❌ | ❌ | ❌ | ✅ fast query completions |
| `scrape` | ❌ | ❌ | ❌ | ✅ full page → markdown |
| `search_many` | ❌ | ❌ | ❌ | ✅ batch + cross-query dedupe |
| `deep_research` | ❌ | ❌ | ✅ sub-queries → parallel search → LLM report | ✅ |
| `search_rag_context` | ❌ | ❌ | ✅ chunked text + metadata, JSON/text output | ✅ |
| **API endpoints** | all hitting `/search` with `tbm` param | all hitting `/search` with `tbm` param | ✅ correct per-type endpoints | ✅ + scholar + scrape host |
| **Answer Box / KG / PAA** | ❌ | ❌ | ✅ full SERP extraction | ✅ |
| **Pagination** | ❌ | ❌ | ✅ `page` param | ✅ |
| **Autocorrect param** | ❌ | ❌ | ✅ | ✅ |
| **LLM support** | ❌ | ❌ | ✅ OpenRouter + Gemini (user's own key) | ✅ |
| **LLM-free RAG output** | ❌ | ❌ | ✅ JSON + plain text | ✅ |
| **TypeScript types** | partial (heavy `any`) | partial (heavy `any`) | ✅ full types for every result shape | ✅ + scholar/scrape |
| **MCP SDK version** | ^0.5.0 | ^0.5.0 or ^1.0.0 | ^1.0.0 | ^1.0.0 |
| **Node requirement** | >=16 | >=16 | >=18 (native `fetch`, no axios) | >=18 |
| **HTTP transport** | ❌ | ✅ | ✅ | ✅ stateless Streamable HTTP |
| **HTTP bearer auth** | ❌ | ❌ | ❌ | ✅ optional |
| **Retry + timeout** | ❌ | ❌ | ❌ | ✅ 429/5xx/network |
| **Response cache** | ❌ | ❌ | ❌ | ✅ TTL + LRU |
| **Log levels** | ❌ | ❌ | ❌ | ✅ error/warn/info/debug/silent |
| **Tests + CI** | ❌ | ❌ | ❌ | ✅ node:test + GitHub Actions |
| **Docker** | ❌ | ✅ | ✅ | ✅ |
| **npx** | ❌ | ✅ | ✅ | ✅ |
| **Client configs** | Claude Desktop only | Claude Desktop + a few | Claude Desktop + Cursor + Windsurf + KiloCode + n8n | ✅ |
| **Telemetry** | ❌ none | ❌ none | ❌ none (intentional — privacy win) | ❌ none |

---

## Changelog

### v4.0.0 — Universal Search Gateway (Multi-Provider, 14 Tools, CLI, Resilience, Tests)
- ➕ **Universal Multi-Provider Gateway** — failover chain: Serper → Tavily → Brave (+ Exa/Firecrawl) with `provider=all` reciprocal-rank fusion
- ➕ **14 MCP Tools** — including unified `search` (token-smart auto-verbosity), `search_scholar`, `search_patents`, `autocomplete`, `scrape`, `search_many`
- ➕ **Developer CLI** — `search`, `scrape`, `research`, `rag`, `providers`, `status` subcommands
- ➕ **`search_scholar` tool** — Google Scholar with authors, journal, year, citation counts
- ➕ **`scrape` tool** — full page content as markdown via `scrape.serper.dev` (truncation-safe)
- ➕ **`search_many` tool** — 1–10 parallel web searches, cross-query URL dedupe, per-query failure isolation
- ➕ **Retry + timeout** — 429/5xx/network retries with exponential backoff + jitter (Retry-After honored)
- ➕ **Response cache** — in-memory TTL + LRU (`SERPER_CACHE_TTL_MS=0` disables)
- ➕ **Optional HTTP bearer auth** — `SERPER_MCP_AUTH_TOKEN` guards `/mcp`; `/health` stays open
- ➕ **Real log levels** — `SERPER_MCP_LOG_LEVEL` now controls error/warn/info/debug/silent
- ➕ **Test suite + CI** — 58 `node:test` tests (no extra deps, incl. real-HTTP e2e) + GitHub Actions matrix (Node 18/20/22)
- 🔧 HTTP transport now works on Node 18 — WebCrypto shim for the MCP SDK (`crypto.randomUUID`); Docker base image bumped to `node:20-alpine`
- 🔧 `search_lang` is now correctly mapped to Serper's `hl` (was previously ignored)
- 🔧 News results default to past-day freshness as documented
- 🔧 `max_chunk_words` clamped 50–1000 (fixes a hang on zero/negative values)
- 🔧 Unknown `depth` falls back to `standard` in `deep_research`
- 🔧 Unknown tools return `MethodNotFound` instead of `InternalError`
- 🔧 `--api-key` without a value no longer breaks startup
- 🔧 `index.js` is generated from `src/` via esbuild; `npm run check:bundle` guards drift
- 🔧 Windows-compatible npm scripts; `npm audit` reports 0 vulnerabilities

### v3.0.0 — Places + Deep Research + RAG
- ➕ **`search_places` tool** — local businesses with address, phone, hours, GPS
- ➕ **Knowledge Graph** extraction in web search
- ➕ **Answer Box** extraction in web search
- ➕ **People Also Ask** + Related Searches in web results
- ➕ **Pagination** support (`page` param)
- ➕ **`autocorrect`** param on web search
- 🔧 Corrected per-type Serper endpoints (images/videos/news/shopping now use dedicated endpoints)
- 🔧 Full TypeScript types for all result shapes
- ➕ **`deep_research` tool** — multi-step research with LLM synthesis (OpenRouter / Gemini)
- ➕ **`search_rag_context` tool** — embedding-ready chunks with metadata (no LLM needed)
- 🔧 Node ≥ 18 requirement (native `fetch`)

### v2.0.1
- HTTP/SSE transport mode
- Docker Compose support
- CLI flags

### v1.0.0
- Initial release: web, images, videos, news, shopping

---

## Contributing

PRs and issues are welcome. Please open an issue before large changes.

```bash
git clone https://github.com/smjahid012/serper-search-mcp-server.git
cd serper-search-mcp-server
npm install
export SERPER_API_KEY="your_key"
node index.js   # test immediately, no build required
```

---

## License

Apache 2.0 — see [LICENSE](LICENSE)

---

<div align="center">

**Built by [SMLabs AI](https://smlabsai.com) · [smjahid012](https://github.com/smjahid012)**  
If this saved you time, a ⭐ on GitHub helps others find it.

</div>
