/**
 * Tool definitions — Serper Search MCP Server
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 */

import { ToolDefinition } from '../types/index.js';
import { ValidationError } from '../utils/errors.js';
import { LINK_MODES } from '../utils/LinkResolution.js';
import { LinkResolver } from './ResolveLinks.js';

export class SearchTools {
  static getAllTools(): ToolDefinition[] {
    return [
      this.unifiedSearch(),
      this.webSearch(),
      this.imageSearch(),
      this.videoSearch(),
      this.newsSearch(),
      this.shoppingSearch(),
      this.placesSearch(),
      this.scholarSearch(),
      this.patentsSearch(),
      this.autocompleteTool(),
      this.scrapeTool(),
      this.batchSearch(),
      this.deepResearch(),
      this.ragContext(),
      this.resolveLinksTool(),
    ];
  }

  private static localeParams() {
    return {
      country:     { type: 'string', description: 'ISO 3166-1 alpha-2 country code (e.g. "US", "GB"). Default: "US".' },
      search_lang: { type: 'string', description: 'Language code (e.g. "en", "de"). Default: "en".' },
      ui_lang:     { type: 'string', description: 'UI language (e.g. "en-US"). Default: "en".' },
    };
  }

  private static numResults(max = 20, def = 10) {
    return { num_results: { type: 'number', description: `Results (1–${max}, default ${def}). Note: >10 results uses 2 Serper credits.`, minimum: 1, maximum: max, default: def } };
  }

  private static freshness(def?: string) {
    return { freshness: { type: 'string', description: `Time filter: pd=past day pw=week pm=month py=year any=none (historical). Pass pd/pw/pm/py whenever the user asks for latest/current/recent results ("today", "this week", "latest", current year); omit or "any" for timeless or historical questions. The response footer echoes the filter that was applied.${def ? ` Default: "${def}".` : ''}`, enum: ['pd','pw','pm','py','any'] } };
  }

  private static safesearch() {
    return { safesearch: { type: 'string', description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' } };
  }

  private static verbosityParam() {
    return {
      verbosity: {
        type: 'string',
        description: 'Output density: auto (server picks per audience), compact (~800 tokens, dev fast path), standard (KG+Box+10), full (everything, always for places/shopping/images/scholar). Default: auto.',
        enum: ['auto', 'compact', 'standard', 'full'],
        default: 'auto',
      },
      max_chars: {
        type: 'number',
        description: 'Truncate response to this many characters (0 = no limit).',
        minimum: 0,
      },
      snippets_only: {
        type: 'boolean',
        description: 'Return 1-line snippets only (token-saving for agents). Default: false.',
        default: false,
      },
      provider: {
        type: 'string',
        description: 'Search backend: auto (failover chain), serper, tavily, brave, exa, firecrawl. Default: auto.',
        default: 'auto',
      },
    };
  }

  private static linkResolution() {
    return {
      link_resolution: {
        type: 'string',
        enum: [...LINK_MODES],
        description:
          'Google result links beyond the top 3 may come back as google.com/goto redirects. ' +
          '"auto" (default): top 3 resolved, any leftover goto links get a search_id for resolve_links. ' +
          '"all": also resolve every link now (free, but adds ~30 s when goto links are present). ' +
          '"none": fastest, links exactly as Google returns them.',
      },
    };
  }

  private static unifiedSearch(): ToolDefinition {
    return {
      name: 'search',
      description:
        'Unified search — one tool for all types (loads ~700 tokens instead of ~7k for 11 tools). ' +
        'Pick type=web|images|videos|news|shopping|places|scholar|patents|autocomplete and provider=auto|serper|tavily|brave|exa|firecrawl. ' +
        'Credit budget: basic 3 / standard 5 / deep 8 credits for deep_research; 1 credit per search; cache hits cost 0.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (max 400 chars / 50 words).' },
          type: {
            type: 'string',
            description: 'Result type.',
            enum: ['web', 'images', 'videos', 'news', 'shopping', 'places', 'scholar', 'patents', 'autocomplete'],
            default: 'web',
          },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static webSearch(): ToolDefinition {
    return {
      name: 'search_web',
      description: 'Google web search via Serper API. Returns organic results plus Knowledge Graph, Answer Box, People Also Ask, and related searches. For latest/current results pass freshness (e.g. py=past year). For a synthesized answer in one call, prefer search_rag_context (fast) or deep_research (thorough) instead of search→scrape chains.',
      inputSchema: {
        type: 'object',
        properties: {
          query:       { type: 'string', description: 'Search query (max 400 chars / 50 words).' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          autocorrect: { type: 'boolean', description: 'Auto-correct spelling. Default: true.', default: true },
          page:        { type: 'number',  description: 'Page number for pagination. Default: 1.', minimum: 1, default: 1 },
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static imageSearch(): ToolDefinition {
    return {
      name: 'search_images',
      description: 'Google Image search via Serper API. Returns image URLs, thumbnails, dimensions, and source pages. Use layout=gallery for a renderable visual grid (designers/moodboards). Always rich — never compacted.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Image search query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.safesearch(),
          ...this.verbosityParam(),
          size: { type: 'string', description: 'Filter by pixel dimensions, client-side via W×H (longest side: small <640, medium <1280, large <2000, xlarge ≥2000; images without dimensions are kept).', enum: ['small', 'medium', 'large', 'xlarge'] },
          orientation: { type: 'string', description: 'Aspect filter, client-side via W×H (images without dimensions are kept).', enum: ['landscape', 'portrait', 'square'] },
          site: { type: 'string', description: 'Restrict to domain (e.g. dribbble.com, behance.net, unsplash.com).' },
          layout: { type: 'string', description: 'list (default) or gallery (renderable ![thumb] grid).', enum: ['list', 'gallery'], default: 'list' },
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static videoSearch(): ToolDefinition {
    return {
      name: 'search_videos',
      description: 'Google Video search via Serper API. Returns titles, channels, durations, and links.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Video search query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static newsSearch(): ToolDefinition {
    return {
      name: 'search_news',
      description: 'Google News search via Serper API. Returns headlines, sources, and publication dates. Defaults to past day — pass freshness="any" for historical news, or use after:/before: operators in the query for date ranges.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'News search query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness('pd'),
          ...this.safesearch(),
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static shoppingSearch(): ToolDefinition {
    return {
      name: 'search_shopping',
      description: 'Google Shopping search via Serper API. Returns products with prices, ratings, and delivery info.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Product or shopping query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static placesSearch(): ToolDefinition {
    return {
      name: 'search_places',
      description: 'Google Places / Maps search via Serper API. Returns local businesses with address, phone, full 7-day hours, ratings, GPS + Directions links. Rich by default; verbosity=compact keeps only title/rating/address.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Place or business query (e.g. "coffee shops in Tokyo").' },
          ...this.numResults(20, 5),
          ...this.localeParams(),
          ...this.verbosityParam(),
          min_rating: { type: 'number', description: 'Minimum rating filter (e.g. 4.5).', minimum: 0, maximum: 5 },
          sort_by: { type: 'string', description: 'Sort results.', enum: ['rating', 'reviews'] },
        },
        required: ['query'],
      },
    };
  }

  private static scholarSearch(): ToolDefinition {
    return {
      name: 'search_scholar',
      description: 'Google Scholar search via Serper API. Returns academic publications with authors, journal, year, and citation counts. Ideal for research papers and literature reviews.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Academic search query (max 400 chars / 50 words).' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
        },
        required: ['query'],
      },
    };
  }

  private static patentsSearch(): ToolDefinition {
    return {
      name: 'search_patents',
      description: 'Google Patents search via Serper API. Returns patents with publication number, assignee, inventor, and dates. Always rich.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Patent search query (max 400 chars / 50 words).' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.verbosityParam(),
        },
        required: ['query'],
      },
    };
  }

  private static autocompleteTool(): ToolDefinition {
    return {
      name: 'autocomplete',
      description: 'Google Autocomplete suggestions via Serper API. Returns query completions — cheap, no LLM needed.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Partial query to complete.' },
          ...this.numResults(10, 10),
          ...this.localeParams(),
        },
        required: ['query'],
      },
    };
  }

  private static scrapeTool(): ToolDefinition {
    return {
      name: 'scrape',
      description:
        'Fetch and extract the full contents of a single URL via Serper Scrape API. ' +
        'Returns the page content as markdown (or plain text). ' +
        'Costs 2 credits per page (every scrape; include_images does not change the price — chains multiply). ' +
        'For synthesized answers prefer search_rag_context or deep_research over scraping many pages.',
      inputSchema: {
        type: 'object',
        properties: {
          url:              { type: 'string',  description: 'Absolute URL of the page to scrape (http/https).' },
          include_markdown: { type: 'boolean', description: 'Return a markdown rendering of the page. Default: true.', default: true },
          include_images:   { type: 'boolean', description: 'Include image URLs found on the page. Default: false.', default: false },
          include_links:    { type: 'boolean', description: 'Include links found on the page. Default: false.', default: false },
          include_videos:   { type: 'boolean', description: 'Include videos found on the page. Default: false.', default: false },
          max_chars:        { type: 'number',  description: 'Truncate returned content to this many characters (1000–200000). Default: 50000.', minimum: 1000, maximum: 200000, default: 50000 },
        },
        required: ['url'],
      },
    };
  }

  private static batchSearch(): ToolDefinition {
    return {
      name: 'search_many',
      description:
        'Run multiple web searches in one call (parallel). Duplicate URLs across queries are removed automatically. ' +
        'Great for comparing topics, gathering multi-angle context, or fanning out sub-queries. Each query costs 1 credit.',
      inputSchema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Search queries (1–10 items, each max 400 chars / 50 words).',
            minItems: 1,
            maxItems: 10,
          },
          ...this.numResults(20, 5),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
        },
        required: ['queries'],
      },
    };
  }

  private static deepResearch(): ToolDefinition {
    return {
      name: 'deep_research',
      description:
        'AI-powered deep research tool. Breaks your question into sub-queries, runs multiple Google searches, ' +
        'then synthesizes a cited research report using your LLM (OpenRouter or Gemini). ' +
        'Requires OPENROUTER_API_KEY or GEMINI_API_KEY environment variable.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Research question or topic to investigate.',
          },
          depth: {
            type: 'string',
            description:
              'Research depth: "basic" (3 sub-queries, fast), "standard" (5 sub-queries, balanced), ' +
              '"deep" (8 sub-queries, exhaustive). Default: "standard".',
            enum: ['basic', 'standard', 'deep'],
            default: 'standard',
          },
          country: {
            type: 'string',
            description: 'Country code for search localisation. Default: "US".',
            default: 'US',
          },
        },
        required: ['query'],
      },
    };
  }

  private static ragContext(): ToolDefinition {
    return {
      name: 'search_rag_context',
      description:
        'Returns Google search results as clean, chunked, metadata-rich text optimized for ' +
        'embedding pipelines and vector databases. No LLM required. ' +
        'Each chunk includes: text, source URL, domain, title, date, word count, and chunk index. ' +
        'Perfect for RAG pipelines, semantic search, and AI grounding.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to retrieve and chunk.',
          },
          num_results: {
            type: 'number',
            description: 'Number of web results to fetch (1–20, default 10).',
            minimum: 1,
            maximum: 20,
            default: 10,
          },
          country:     { type: 'string', description: 'Country code. Default: "US".' },
          ...this.freshness(),
          max_chunk_words: {
            type: 'number',
            description: 'Maximum words per chunk (default 200). Lower = more chunks, finer granularity.',
            minimum: 50,
            maximum: 1000,
            default: 200,
          },
          include_paa: {
            type: 'boolean',
            description: 'Include "People Also Ask" Q&A pairs as extra chunks. Default: true.',
            default: true,
          },
          output_format: {
            type: 'string',
            description: '"json" (structured, for vector DBs) or "text" (plain blocks, for direct prompt use). Default: "json".',
            enum: ['json', 'text'],
            default: 'json',
          },
          ...this.linkResolution(),
        },
        required: ['query'],
      },
    };
  }

  private static resolveLinksTool(): ToolDefinition {
    return {
      name: 'resolve_links',
      description:
        'Turn google.com/goto redirect links from a recent search into real URLs via Serper /resolve ' +
        '(free, 0 credits). Requires exactly one of: search_id, or links. ' +
        'Pass the search_id a search result asked for, or a list of goto links. ' +
        'Right after a search one call takes ~20–30 s. Links not ready yet stay goto links; Serper then suggests ' +
        'a wait (often 90 s), which is only honoured if it fits in max_wait_seconds — otherwise call again later.',
      inputSchema: {
        type: 'object',
        properties: {
          search_id:        { type: 'string', description: 'search_id shown in a search result that still had goto links.' },
          links:            { type: 'array', items: { type: 'string' }, description: 'google.com/goto?url=… links to resolve (alternative to search_id, max 100).', maxItems: 100 },
          max_wait_seconds: { type: 'number', description: 'Retry within this budget when Serper says to wait (default 60).', minimum: 0, maximum: 300, default: 60 },
        },
        required: [],
      },
    };
  }

  static validateArgs(toolName: string, args: unknown): void {
    if (toolName === 'search_maps' || toolName === 'search_reviews' || toolName === 'search_lens') return;
    const tool = this.getAllTools().find((t) => t.name === toolName);
    if (!tool) throw new ValidationError(`Unknown tool: ${toolName}`);
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
      throw new ValidationError('Arguments must be an object');
    }

    for (const key of tool.inputSchema.required) {
      if (!(key in (args as object))) throw new ValidationError(`Missing required parameter: ${key}`);
    }

    const a = args as Record<string, unknown>;
    if (typeof a['query'] === 'string') {
      const q = a['query'].trim();
      if (!q) throw new ValidationError('query must not be empty');
      if (q.length > 400) throw new ValidationError('query exceeds 400 characters');
      if (q.split(/\s+/).length > 50) throw new ValidationError('query exceeds 50 words');
    }

    if (Array.isArray(a['queries'])) {
      const queries = a['queries'] as unknown[];
      if (queries.length < 1) throw new ValidationError('queries must contain at least 1 query');
      if (queries.length > 10) throw new ValidationError('queries exceeds 10 items');
      for (const q of queries) {
        if (typeof q !== 'string' || !q.trim()) throw new ValidationError('each query must be a non-empty string');
        const trimmed = q.trim();
        if (trimmed.length > 400) throw new ValidationError('each query must be at most 400 characters');
        if (trimmed.split(/\s+/).length > 50) throw new ValidationError('each query must be at most 50 words');
      }
    }

    if (toolName === 'scrape') {
      const url = a['url'];
      if (typeof url !== 'string' || !/^https?:\/\/.+/i.test(url)) {
        throw new ValidationError('url must be an absolute http(s) URL');
      }
    }

    if (a['verbosity'] !== undefined) {
      const v = a['verbosity'];
      if (!['auto', 'compact', 'standard', 'full'].includes(v as string)) {
        throw new ValidationError('verbosity must be auto|compact|standard|full');
      }
    }

    if (a['provider'] !== undefined && typeof a['provider'] === 'string') {
      const p = (a['provider'] as string).toLowerCase();
      if (!['auto', 'serper', 'tavily', 'brave', 'exa', 'firecrawl', 'all'].includes(p)) {
        throw new ValidationError('provider must be auto|serper|tavily|brave|exa|firecrawl|all');
      }
    }

    if (a['link_resolution'] !== undefined && !LINK_MODES.includes(a['link_resolution'] as never)) {
      throw new ValidationError(`link_resolution must be ${LINK_MODES.join('|')}`);
    }

    if (toolName === 'resolve_links') LinkResolver.validateArgs(a);

    if (a['max_chars'] !== undefined) {
      const n = Number(a['max_chars']);
      if (!Number.isFinite(n) || n < 0) throw new ValidationError('max_chars must be >= 0');
    }

    if (a['min_rating'] !== undefined) {
      const n = Number(a['min_rating']);
      if (!Number.isFinite(n) || n < 0 || n > 5) throw new ValidationError('min_rating must be 0-5');
    }

    if (a['type'] !== undefined && toolName === 'search' && typeof a['type'] === 'string') {
      const t = (a['type'] as string).toLowerCase();
      if (!['web', 'images', 'videos', 'news', 'shopping', 'places', 'scholar', 'patents', 'autocomplete'].includes(t)) {
        throw new ValidationError('type must be web|images|videos|news|shopping|places|scholar|patents|autocomplete');
      }
    }

    for (const [key, rawSchema] of Object.entries(tool.inputSchema.properties)) {
      if (!(key in a) || a[key] === undefined) continue;
      const schema = rawSchema as {
        type?: string;
        enum?: unknown[];
        minimum?: number;
        maximum?: number;
        minItems?: number;
        maxItems?: number;
      };
      const value = a[key];

      if (schema.enum && !schema.enum.includes(value)) {
        throw new ValidationError(`${key} must be one of: ${schema.enum.join('|')}`);
      }
      if (schema.type === 'string' && typeof value !== 'string') {
        throw new ValidationError(`${key} must be a string`);
      }
      if (schema.type === 'number') {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new ValidationError(`${key} must be a number`);
        }
        if (schema.minimum !== undefined && value < schema.minimum) {
          throw new ValidationError(`${key} must be >= ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          throw new ValidationError(`${key} must be <= ${schema.maximum}`);
        }
      }
      if (schema.type === 'boolean' && typeof value !== 'boolean') {
        throw new ValidationError(`${key} must be a boolean`);
      }
      if (schema.type === 'array') {
        if (!Array.isArray(value)) throw new ValidationError(`${key} must be an array`);
        if (schema.minItems !== undefined && value.length < schema.minItems) {
          throw new ValidationError(`${key} must contain at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
        }
        if (schema.maxItems !== undefined && value.length > schema.maxItems) {
          throw new ValidationError(`${key} must contain at most ${schema.maxItems} items`);
        }
      }
    }
  }
}
