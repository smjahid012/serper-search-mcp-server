<div align="center">

# 🔍 Serper Search MCP Server

**Give your AI agent real Google search — web, images, videos, news, shopping, and places.**

[![npm version](https://img.shields.io/npm/v/serper-search-mcp?color=blue&logo=npm)](https://www.npmjs.com/package/serper-search-mcp)
[![npm downloads](https://img.shields.io/npm/dm/serper-search-mcp?color=green)](https://www.npmjs.com/package/serper-search-mcp)
[![Docker Pulls](https://img.shields.io/docker/pulls/smjahid/server-serper-search?logo=docker)](https://hub.docker.com/r/smjahid/server-serper-search)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/Protocol-MCP-purple)](https://modelcontextprotocol.io)

Built by [SMLabs AI](https://smlabsai.com) · [smjahid012](https://github.com/smjahid012)

</div>

---

## What this does

This MCP server wraps the [Serper API](https://serper.dev) (Google Search results) and exposes **8 search tools** that any MCP-compatible AI client (Claude, Cursor, Windsurf, KiloCode, n8n, etc.) can call in real time.

| Tool | What you get |
|---|---|
| `search_web` | Organic results + **Knowledge Graph** + **Answer Box** + "People Also Ask" + Related Searches |
| `search_images` | Image URLs, dimensions, source pages |
| `search_videos` | Titles, channels, durations, links |
| `search_news` | Headlines, sources, dates — freshness-filtered |
| `search_shopping` | Products, prices, ratings, delivery info |
| `search_places` | Local businesses & POIs with address, phone, hours, GPS coords |
| `deep_research` | Multi-step research: auto sub-queries → parallel searches → LLM-synthesized cited report |
| `search_rag_context` | Clean chunked text with metadata for embedding pipelines & vector DBs — no LLM needed |

> **Free to start:** Serper gives you 2,500 free queries/month. No credit card required.

---

## Quick start

### Option 1 — npx (zero install)

```json
{
  "mcpServers": {
    "serper-search": {
      "command": "npx",
      "args": ["-y", "serper-search-mcp"],
      "env": {
        "SERPER_API_KEY": "${SERPER_API_KEY}",
        "GEMINI_API_KEY": "${GEMINI_API_KEY}"
      }
    }
  }
}
```

Add this to your MCP client config (paths listed below), then restart.

### Option 2 — Docker

```json
{
  "mcpServers": {
    "serper-search": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "SERPER_API_KEY", "-e", "GEMINI_API_KEY", "smjahid/server-serper-search:3"],
      "env": {
        "SERPER_API_KEY": "your_key_here",
        "GEMINI_API_KEY": "your_gemini_key_here"
      }
    }
  }
}
```

Or run directly:
```bash
docker run -i --rm \
  -e SERPER_API_KEY=your_key \
  -e GEMINI_API_KEY=your_gemini_key \
  smjahid/server-serper-search:3
```

### Option 3 — Local clone

```bash
git clone https://github.com/smjahid012/serper-search-mcp-server.git
cd serper-search-mcp-server
npm install
export SERPER_API_KEY="your_key"
export GEMINI_API_KEY="your_gemini_key"
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
  "page":        1          // pagination
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

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERPER_API_KEY` | ✅ | — | Your Serper API key |
| `SERPER_MCP_TRANSPORT` | ❌ | `stdio` | `stdio` or `http` |
| `SERPER_MCP_PORT` | ❌ | `8080` | HTTP port |
| `SERPER_MCP_HOST` | ❌ | `0.0.0.0` | HTTP host |
| `SERPER_MCP_LOG_LEVEL` | ❌ | `info` | Logging verbosity |
| `OPENROUTER_API_KEY` | ❌ | — | LLM key for `deep_research` (free at openrouter.ai) |
| `OPENROUTER_MODEL` | ❌ | `google/gemini-3.1-flash-lite:free` | OpenRouter model override |
| `GEMINI_API_KEY` | ❌ | — | LLM key for `deep_research` (free at ai.google.dev) |
| `GEMINI_MODEL` | ❌ | `gemini-3.1-flash-lite` | Gemini model override |

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
├── index.js                    ← Zero-build JS entry (npx / Docker)
└── src/
    ├── index.ts                ← TypeScript CLI entry
    ├── api/
    │   ├── SerperAPI.ts        ← HTTP client (per-type endpoints)
    │   └── LLMClient.ts        ← OpenRouter + Gemini client
    ├── server/
    │   └── SerperMCPServer.ts  ← MCP Server + tool routing
    ├── tools/
    │   ├── SearchTools.ts      ← All 8 tool definitions + validation
    │   ├── DeepResearch.ts     ← Multi-step research orchestration
    │   └── RAGContext.ts       ← Chunk + metadata formatter
    ├── types/
    │   └── index.ts            ← Full TypeScript types
    └── utils/
        └── ResultFormatter.ts  ← Markdown formatting
```

**Dual-file design:** `index.js` runs without any build step (ideal for `npx` and Docker). The TypeScript `src/` tree is for contributors who want type safety and IDE support.

---

## Get a Serper API key

1. Go to [serper.dev](https://serper.dev)
2. Sign up (free — no credit card)
3. Copy your API key from the dashboard
4. You get **2,500 free queries/month**

---

## Version evolution

| Feature | v1.0.0 | v2.0.1 | v3.0.0 |
|---|---|---|---|
| **Total tools** | 5 | 5 | 8 |
| `search_web` | ✅ organic only | ✅ organic only | ✅ + Answer Box, Knowledge Graph, PAA, Related |
| `search_images` | ✅ | ✅ | ✅ + dimensions, domain |
| `search_videos` | ✅ | ✅ | ✅ + date field |
| `search_news` | ✅ | ✅ | ✅ cleaner formatting |
| `search_shopping` | ✅ | ✅ | ✅ + delivery, offers |
| `search_places` | ❌ | ❌ | ✅ address, phone, hours, GPS, Maps link |
| `deep_research` | ❌ | ❌ | ✅ sub-queries → parallel search → LLM report |
| `search_rag_context` | ❌ | ❌ | ✅ chunked text + metadata, JSON/text output |
| **API endpoints** | all hitting `/search` with `tbm` param | all hitting `/search` with `tbm` param | ✅ correct per-type endpoints |
| **Answer Box / KG / PAA** | ❌ | ❌ | ✅ full SERP extraction |
| **Pagination** | ❌ | ❌ | ✅ `page` param |
| **Autocorrect param** | ❌ | ❌ | ✅ |
| **LLM support** | ❌ | ❌ | ✅ OpenRouter + Gemini (user's own key) |
| **LLM-free RAG output** | ❌ | ❌ | ✅ JSON + plain text |
| **TypeScript types** | partial (heavy `any`) | partial (heavy `any`) | ✅ full types for every result shape |
| **MCP SDK version** | ^0.5.0 | ^0.5.0 or ^1.0.0 | ^1.0.0 |
| **Node requirement** | >=16 | >=16 | >=18 (native `fetch`, no axios) |
| **HTTP/SSE transport** | ❌ | ✅ | ✅ |
| **Docker** | ❌ | ✅ | ✅ |
| **npx** | ❌ | ✅ | ✅ |
| **Client configs** | Claude Desktop only | Claude Desktop + a few | Claude Desktop + Cursor + Windsurf + KiloCode + n8n |
| **Telemetry** | ❌ none | ❌ none | ❌ none (intentional — privacy win) |

---

## Changelog

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

MIT — see [LICENSE](LICENSE)

---

<div align="center">

**Built by [SMLabs AI](https://smlabsai.com)**

If this saved you time, a ⭐ on GitHub helps others find it.

</div>
