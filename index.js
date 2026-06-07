#!/usr/bin/env node
/**
 * Serper Search MCP Server — SMLabs AI
 * Zero-build JavaScript entry point (works with npx, Docker, direct node)
 * github.com/smjahid012/serper-search-mcp-server
 */

'use strict';

const { version } = require('./package.json');
const { Server }  = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} = require('@modelcontextprotocol/sdk/types.js');

// ── Serper per-type endpoints ─────────────────────────────────────────────────

const ENDPOINTS = {
  web:      'https://google.serper.dev/search',
  images:   'https://google.serper.dev/images',
  videos:   'https://google.serper.dev/videos',
  news:     'https://google.serper.dev/news',
  shopping: 'https://google.serper.dev/shopping',
  places:   'https://google.serper.dev/places',
};

const TOOL_TYPE_MAP = {
  search_web:      'web',
  search_images:   'images',
  search_videos:   'videos',
  search_news:     'news',
  search_shopping: 'shopping',
  search_places:   'places',
};

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'search_web',
    description:
      'Google web search via Serper API. Returns organic results plus Knowledge Graph, ' +
      'Answer Box, "People Also Ask" questions, and related searches when available.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Search query (max 400 chars / 50 words).' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:     { type: 'string',  description: 'Country code e.g. "US", "GB". Default: "US".' },
        search_lang: { type: 'string',  description: 'Language code e.g. "en", "de". Default: "en".' },
        ui_lang:     { type: 'string',  description: 'UI language e.g. "en-US". Default: "en".' },
        freshness:   { type: 'string',  description: '"pd" past day, "pw" past week, "pm" past month, "py" past year.', enum: ['pd','pw','pm','py'] },
        safesearch:  { type: 'string',  description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' },
        autocorrect: { type: 'boolean', description: 'Auto-correct query spelling. Default: true.', default: true },
        summary:     { type: 'boolean', description: 'Request Serper AI summary. Default: false.', default: false },
        page:        { type: 'number',  description: 'Pagination page (starts at 1). Default: 1.', minimum: 1, default: 1 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_images',
    description: 'Google Image search via Serper API. Returns image URLs, dimensions, and source pages.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Image search query.' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:     { type: 'string',  description: 'Country code. Default: "US".' },
        search_lang: { type: 'string',  description: 'Language code. Default: "en".' },
        safesearch:  { type: 'string',  description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_videos',
    description: 'Google Video search via Serper API. Returns titles, channels, durations, and links.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Video search query.' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:     { type: 'string',  description: 'Country code. Default: "US".' },
        freshness:   { type: 'string',  description: 'Time filter.', enum: ['pd','pw','pm','py'] },
        safesearch:  { type: 'string',  description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_news',
    description: 'Google News search via Serper API. Returns headlines, sources, and publication dates.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'News search query.' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:     { type: 'string',  description: 'Country code. Default: "US".' },
        freshness:   { type: 'string',  description: 'Default "pd" (past day).', enum: ['pd','pw','pm','py'], default: 'pd' },
        safesearch:  { type: 'string',  description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_shopping',
    description: 'Google Shopping search via Serper API. Returns products with prices, ratings, and delivery info.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Product or shopping query.' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:     { type: 'string',  description: 'Country code. Default: "US".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_places',
    description:
      'Google Places / Maps search via Serper API. Returns local businesses and POIs with ' +
      'address, phone, rating, opening hours, and coordinates. Perfect for "near me" queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Place or business query, e.g. "coffee shops in Tokyo".' },
        num_results: { type: 'number',  description: 'Results to return (1–20, default 5).', minimum: 1, maximum: 20, default: 5 },
        country:     { type: 'string',  description: 'Country code. Default: "US".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'deep_research',
    description:
      'AI-powered deep research. Breaks your question into sub-queries, runs multiple Google searches, ' +
      'then synthesizes a cited report using your LLM. Requires OPENROUTER_API_KEY or GEMINI_API_KEY.',
    inputSchema: {
      type: 'object',
      properties: {
        query:   { type: 'string', description: 'Research question or topic.' },
        depth:   { type: 'string', description: '"basic" (fast) | "standard" (balanced) | "deep" (exhaustive). Default: "standard".', enum: ['basic','standard','deep'], default: 'standard' },
        country: { type: 'string', description: 'Country code for search. Default: "US".' },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_rag_context',
    description:
      'Returns Google search results as clean chunked text with metadata — optimized for embedding pipelines ' +
      'and vector databases. No LLM required.',
    inputSchema: {
      type: 'object',
      properties: {
        query:           { type: 'string',  description: 'Search query.' },
        num_results:     { type: 'number',  description: 'Results to fetch (1–20, default 10).', minimum: 1, maximum: 20, default: 10 },
        country:         { type: 'string',  description: 'Country code. Default: "US".' },
        freshness:       { type: 'string',  description: 'Time filter.', enum: ['pd','pw','pm','py'] },
        max_chunk_words: { type: 'number',  description: 'Max words per chunk (default 200).', minimum: 50, maximum: 1000, default: 200 },
        include_paa:     { type: 'boolean', description: 'Include People Also Ask chunks. Default: true.', default: true },
        output_format:   { type: 'string',  description: '"json" (vector DB) or "text" (prompt use). Default: "json".', enum: ['json','text'], default: 'json' },
      },
      required: ['query'],
    },
  },
];

// ── API call ─────────────────────────────────────────────────────────────────

async function serperSearch(query, searchType, opts = {}, apiKey) {
  const url = ENDPOINTS[searchType] ?? ENDPOINTS.web;
  const body = {
    q: query,
    num: Math.min(opts.num_results ?? 10, 20),
    gl: (opts.country ?? 'US').toLowerCase(),
    hl: opts.ui_lang ?? 'en',
    autocorrect: opts.autocorrect ?? true,
  };
  if (opts.freshness)  body.tbs     = `qdr:${opts.freshness}`;
  if (opts.safesearch === 'strict') body.safe = 'active';
  if (opts.safesearch === 'off')    body.safe = 'off';
  if (opts.summary)    body.summary = true;
  if (opts.page > 1)   body.page    = opts.page;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`Serper API ${res.status}: ${msg}`);
  }
  return res.json();
}

// ── Formatter ────────────────────────────────────────────────────────────────

function formatResults(data, maxResults, searchType) {
  const q = data.searchParameters?.q ?? '';
  const labels = { web:'🌐 Web', images:'🖼️ Image', videos:'🎬 Video', news:'📰 News', shopping:'🛒 Shopping', places:'📍 Places' };
  const lines = [`## ${labels[searchType] ?? searchType} Search Results${q ? ` — "${q}"` : ''}\n`];

  // Answer Box
  if (searchType === 'web' && data.answerBox) {
    const ab = data.answerBox;
    lines.push('### 🎯 Answer Box\n');
    if (ab.title)   lines.push(`**${ab.title}**`);
    if (ab.snippet) lines.push(ab.snippet);
    if (ab.link)    lines.push(`[Source](${ab.link})`);
    lines.push('');
  }

  // Knowledge Graph
  if (searchType === 'web' && data.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    lines.push('### 🧠 Knowledge Graph\n');
    if (kg.title)       lines.push(`**${kg.title}**${kg.type ? ` · ${kg.type}` : ''}`);
    if (kg.description) lines.push(kg.description);
    if (kg.website)     lines.push(`[Website](${kg.website})`);
    if (kg.rating)      lines.push(`⭐ ${kg.rating}${kg.reviewsCount ? ` (${kg.reviewsCount.toLocaleString()} reviews)` : ''}`);
    lines.push('');
  }

  // Main results
  const RESULT_KEYS = { web:'organic', images:'images', videos:'videos', news:'news', shopping:'shopping', places:'places' };
  const key   = RESULT_KEYS[searchType] ?? 'organic';
  const items = (data[key] ?? []).slice(0, maxResults);

  if (!items.length) {
    lines.push(`*No ${searchType} results found.*`);
  } else {
    items.forEach((r, i) => {
      const n = i + 1;
      switch (searchType) {
        case 'web':
          lines.push(`#### ${n}. [${r.title}](${r.link})`);
          if (r.date)    lines.push(`*${r.date}*`);
          if (r.snippet) lines.push(r.snippet);
          if (r.sitelinks?.length) lines.push('**Sitelinks:** ' + r.sitelinks.map(s => `[${s.title}](${s.link})`).join(' · '));
          break;
        case 'images':
          lines.push(`#### ${n}. ${r.title}`);
          lines.push(`- **Image:** ${r.imageUrl}`);
          if (r.imageWidth && r.imageHeight) lines.push(`- **Size:** ${r.imageWidth}×${r.imageHeight}`);
          if (r.domain) lines.push(`- **Domain:** ${r.domain}`);
          if (r.link)   lines.push(`- **Page:** ${r.link}`);
          break;
        case 'videos':
          lines.push(`#### ${n}. ${r.link ? `[${r.title}](${r.link})` : r.title}`);
          if (r.channel)  lines.push(`- **Channel:** ${r.channel}`);
          if (r.duration) lines.push(`- **Duration:** ${r.duration}`);
          if (r.date)     lines.push(`- **Date:** ${r.date}`);
          break;
        case 'news':
          lines.push(`#### ${n}. [${r.title}](${r.link})`);
          const meta = [r.source, r.date].filter(Boolean).join(' · ');
          if (meta)      lines.push(`*${meta}*`);
          if (r.snippet) lines.push(r.snippet);
          break;
        case 'shopping':
          lines.push(`#### ${n}. ${r.link ? `[${r.title}](${r.link})` : r.title}`);
          if (r.price)       lines.push(`- **Price:** ${r.price}`);
          if (r.source)      lines.push(`- **Seller:** ${r.source}`);
          if (r.rating)      lines.push(`- **Rating:** ⭐ ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()})` : ''}`);
          if (r.delivery)    lines.push(`- **Delivery:** ${r.delivery}`);
          break;
        case 'places':
          lines.push(`#### ${n}. ${r.title}`);
          if (r.category)     lines.push(`*${r.category}*`);
          if (r.address)      lines.push(`- **Address:** ${r.address}`);
          if (r.phoneNumber)  lines.push(`- **Phone:** ${r.phoneNumber}`);
          if (r.website)      lines.push(`- **Website:** [${r.website}](${r.website})`);
          if (r.rating)       lines.push(`- **Rating:** ⭐ ${r.rating}${r.ratingCount ? ` (${r.ratingCount.toLocaleString()} reviews)` : ''}`);
          if (r.openingHours?.length) lines.push(`- **Hours:** ${r.openingHours[0]}`);
          if (r.latitude && r.longitude) lines.push(`- **Map:** [View](https://www.google.com/maps?q=${r.latitude},${r.longitude})`);
          break;
      }
      lines.push('');
    });
  }

  // People Also Ask
  if (searchType === 'web' && data.peopleAlsoAsk?.length) {
    lines.push('\n### 💬 People Also Ask\n');
    data.peopleAlsoAsk.slice(0, 4).forEach(paa => {
      lines.push(`**Q: ${paa.question}**`);
      lines.push(paa.snippet);
      lines.push(`[Read more](${paa.link})\n`);
    });
  }

  // Related Searches
  if (searchType === 'web' && data.relatedSearches?.length) {
    lines.push('\n### 🔗 Related Searches\n');
    lines.push(data.relatedSearches.slice(0, 6).map(r => `- ${r.query}`).join('\n'));
  }

  if (data.credits !== undefined) {
    lines.push(`\n\n---\n*Serper credits used: ${data.credits}*`);
  }

  return lines.join('\n');
}

// ── Server ───────────────────────────────────────────────────────────────────

class SerperMCPServer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.server = new Server(
      { name: 'serper-search-mcp', version },
      { capabilities: { tools: {} } }
    );
    this._setup();
  }

  _setup() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;
      const searchType = TOOL_TYPE_MAP[name];
      if (!searchType && name !== 'deep_research' && name !== 'search_rag_context') {
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }

      const query = args?.query;
      if (!query || typeof query !== 'string' || !query.trim()) {
        throw new McpError(ErrorCode.InvalidParams, 'query is required and must be a non-empty string');
      }
      if (query.length > 400) throw new McpError(ErrorCode.InvalidParams, 'query exceeds 400 characters');

      try {
        if (name === 'deep_research') {
          const text = await deepResearch(
            args?.query, args?.depth ?? 'standard', args?.country ?? 'US', this.apiKey
          );
          return { content: [{ type: 'text', text }] };
        }

        if (name === 'search_rag_context') {
          const text = await buildRAGContext(args?.query, args ?? {}, this.apiKey);
          return { content: [{ type: 'text', text }] };
        }

        const data = await serperSearch(query.trim(), searchType, args, this.apiKey);
        const defaultNum = searchType === 'places' ? 5 : 10;
        const text = formatResults(data, args?.num_results ?? defaultNum, searchType);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        throw new McpError(ErrorCode.InternalError, `Search failed: ${err.message}`);
      }
    });

    this.server.onerror = (err) => console.error('[MCP error]', err);
    process.on('SIGINT',  () => this.server.close().then(() => process.exit(0)));
    process.on('SIGTERM', () => this.server.close().then(() => process.exit(0)));
  }

  async run() {
    await this.server.connect(new StdioServerTransport());
    console.error(`Serper Search MCP Server v${version} — SMLabs AI`);
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      out[argv[i].slice(2)] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return out;
}

if (require.main === module) {
  const flags = parseArgs();

  if ('help' in flags) {
    console.log(`
Serper Search MCP Server v${version} — SMLabs AI

Usage: npx serper-search-mcp [options]

Options:
  --api-key <key>    Serper API key (or SERPER_API_KEY env)
  --help             Show this help

Tools: search_web · search_images · search_videos · search_news · search_shopping · search_places · deep_research · search_rag_context

Get a free API key at https://serper.dev
Docs: https://github.com/smjahid012/serper-search-mcp-server
`);
    process.exit(0);
  }

  const apiKey = flags['api-key'] || process.env.SERPER_API_KEY;
  if (!apiKey) {
    console.error('Error: SERPER_API_KEY is required');
    process.exit(1);
  }

  new SerperMCPServer(apiKey).run().catch(err => {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}

module.exports = { SerperMCPServer };

// ═══════════════════════════════════════════════════════════════════════════════
// DEEP RESEARCH — appended to index.js (zero-build version)
// ═══════════════════════════════════════════════════════════════════════════════

// ── LLM detection ────────────────────────────────────────────────────────────

function detectLLM() {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      provider: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL || 'google/gemini-3.1-flash-lite:free',
    };
  }
  if (process.env.GEMINI_API_KEY) {
    return {
      provider: 'gemini',
      apiKey: process.env.GEMINI_API_KEY,
      model: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
    };
  }
  return null;
}

async function callLLM(prompt) {
  const cfg = detectLLM();
  if (!cfg) throw new Error('No LLM key. Set OPENROUTER_API_KEY or GEMINI_API_KEY.');

  if (cfg.provider === 'openrouter') {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/smjahid012/serper-search-mcp-server',
        'X-Title': 'Serper Search MCP',
      },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content: prompt }], max_tokens: 4096 }),
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    const d = await res.json();
    return { content: d.choices?.[0]?.message?.content ?? '', provider: cfg.provider, model: cfg.model };
  } else {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${cfg.model}:generateContent?key=${cfg.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: 4096 } }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    const d = await res.json();
    return { content: d.candidates?.[0]?.content?.parts?.[0]?.text ?? '', provider: cfg.provider, model: cfg.model };
  }
}

// ── Deep Research ─────────────────────────────────────────────────────────────

const DEPTH_CONFIG = { basic: { n: 3, r: 3 }, standard: { n: 5, r: 5 }, deep: { n: 8, r: 7 } };

async function generateSubQueries(query, count) {
  const prompt = `Break this research question into ${count} focused search queries. Return ONLY a JSON array of strings, no markdown, no explanation.\n\nQuestion: "${query}"`;
  const { content } = await callLLM(prompt);
  try {
    const clean = content.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim();
    const arr = JSON.parse(clean);
    if (Array.isArray(arr)) return arr.slice(0, count);
  } catch {}
  const matches = content.match(/"([^"]+)"/g);
  if (matches) return matches.slice(0, count).map(m => m.replace(/"/g, ''));
  return [query, `${query} overview`, `${query} research`].slice(0, count);
}

async function deepResearch(query, depth = 'standard', country = 'US', apiKey) {
  const llm = detectLLM();
  if (!llm) throw new Error('deep_research requires OPENROUTER_API_KEY or GEMINI_API_KEY.');

  const { n, r } = DEPTH_CONFIG[depth] ?? DEPTH_CONFIG.standard;
  const subQueries = await generateSubQueries(query, n);

  // Parallel searches
  const searches = await Promise.all(
    subQueries.map(async sq => {
      try {
        const res = await serperSearch(sq, 'web', { num_results: r, country }, apiKey);
        return { sq, results: res.organic ?? [] };
      } catch { return { sq, results: [] }; }
    })
  );

  // Build context
  let sourceCount = 0;
  const contextParts = [];
  for (const { sq, results } of searches) {
    if (!results.length) continue;
    contextParts.push(`### Sub-query: "${sq}"\n`);
    for (const res of results) {
      sourceCount++;
      contextParts.push(`**[${sourceCount}] ${res.title}**\nURL: ${res.link}${res.snippet ? `\nSnippet: ${res.snippet}` : ''}${res.date ? `\nDate: ${res.date}` : ''}\n`);
    }
  }

  if (!sourceCount) throw new Error('No search results found. Try broadening the query.');

  const depthInstructions = {
    basic: 'Write a concise summary (3–4 paragraphs).',
    standard: 'Write a comprehensive analysis (5–7 paragraphs) with clear sections.',
    deep: 'Write an exhaustive report with executive summary, detailed sections, key findings, and conclusions.',
  };

  const prompt = `You are an expert research analyst. Using ONLY the search results below, answer the research question with a well-structured report. Cite sources as [1], [2], etc. End with a "## Sources" section listing cited references.\n\nQuestion: "${query}"\n\n${depthInstructions[depth]}\n\n--- SEARCH RESULTS ---\n${contextParts.join('\n')}\n--- END ---\n\nWrite the report now:`;

  const { content: report, provider, model } = await callLLM(prompt);

  const header = [
    '## 🔬 Deep Research Report',
    `**Query:** ${query}`,
    `**Depth:** ${depth} | **Sources:** ${sourceCount} | **LLM:** ${model} (${provider})`,
    `**Sub-queries:**\n${subQueries.map((q, i) => `${i+1}. ${q}`).join('\n')}`,
    '', '---', '',
  ].join('\n');

  return header + report;
}

// ── RAG Context ───────────────────────────────────────────────────────────────

function cleanText(raw) {
  return raw
    .replace(/\*\*|__|~~|\[|\]|\(.*?\)/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

async function buildRAGContext(query, opts, apiKey) {
  const {
    num_results = 10, country = 'US', freshness,
    max_chunk_words = 200, include_paa = true, output_format = 'json',
  } = opts;

  const data = await serperSearch(query, 'web', { num_results, country, freshness, autocorrect: true }, apiKey);
  const organic = data.organic ?? [];

  const chunks = [];
  let ci = 0;

  for (let si = 0; si < organic.length; si++) {
    const r = organic[si];
    const text = [cleanText(r.title), r.snippet ? cleanText(r.snippet) : ''].filter(Boolean).join(' ').trim();
    if (!text) continue;
    const words = text.split(/\s+/);
    for (let start = 0; start < words.length; start += max_chunk_words) {
      const slice = words.slice(start, start + max_chunk_words).join(' ');
      chunks.push({ chunk_index: ci++, source_index: si + 1, title: r.title, url: r.link, domain: extractDomain(r.link), date: r.date ?? null, text: slice, word_count: slice.split(/\s+/).length, char_count: slice.length });
    }
  }

  if (include_paa && data.peopleAlsoAsk?.length) {
    for (const paa of data.peopleAlsoAsk.slice(0, 4)) {
      const text = `Q: ${paa.question} A: ${cleanText(paa.snippet)}`;
      chunks.push({ chunk_index: ci++, source_index: 0, title: paa.question, url: paa.link, domain: extractDomain(paa.link), date: null, text, word_count: text.split(/\s+/).length, char_count: text.length });
    }
  }

  const totalWords = chunks.reduce((s, c) => s + c.word_count, 0);
  const result = { query, total_sources: organic.length, total_chunks: chunks.length, total_words: totalWords, chunks };

  if (output_format === 'text') {
    const lines = [`# RAG Context: "${query}"`, `Sources: ${result.total_sources} | Chunks: ${result.total_chunks} | Words: ${result.total_words}`, ''];
    for (const c of chunks) {
      lines.push(`--- Chunk ${c.chunk_index + 1} | Source ${c.source_index || 'PAA'} | ${c.domain}${c.date ? ` | ${c.date}` : ''} ---`);
      lines.push(`Title: ${c.title}\nURL: ${c.url}\n${c.text}\n`);
    }
    return lines.join('\n');
  }

  return JSON.stringify(result, null, 2);
}
