/**
 * Tool definitions — Serper Search MCP Server
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 */

import { ToolDefinition } from '../types/index.js';

export class SearchTools {
  static getAllTools(): ToolDefinition[] {
    return [
      this.webSearch(),
      this.imageSearch(),
      this.videoSearch(),
      this.newsSearch(),
      this.shoppingSearch(),
      this.placesSearch(),
      this.deepResearch(),
      this.ragContext(),
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
    return { num_results: { type: 'number', description: `Results (1–${max}, default ${def}).`, minimum: 1, maximum: max, default: def } };
  }

  private static freshness(def?: string) {
    return { freshness: { type: 'string', description: `Time filter: pd=day pw=week pm=month py=year.${def ? ` Default: "${def}".` : ''}`, enum: ['pd','pw','pm','py'] } };
  }

  private static safesearch() {
    return { safesearch: { type: 'string', description: '"off" | "moderate" | "strict". Default: "moderate".', enum: ['off','moderate','strict'], default: 'moderate' } };
  }

  private static webSearch(): ToolDefinition {
    return {
      name: 'search_web',
      description: 'Google web search via Serper API. Returns organic results plus Knowledge Graph, Answer Box, People Also Ask, and related searches.',
      inputSchema: {
        type: 'object',
        properties: {
          query:       { type: 'string', description: 'Search query (max 400 chars / 50 words).' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness(),
          ...this.safesearch(),
          autocorrect: { type: 'boolean', description: 'Auto-correct spelling. Default: true.', default: true },
          summary:     { type: 'boolean', description: 'Request Serper AI summary. Default: false.', default: false },
          page:        { type: 'number',  description: 'Page number for pagination. Default: 1.', minimum: 1, default: 1 },
        },
        required: ['query'],
      },
    };
  }

  private static imageSearch(): ToolDefinition {
    return {
      name: 'search_images',
      description: 'Google Image search via Serper API. Returns image URLs, dimensions, and source pages.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Image search query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.safesearch(),
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
        },
        required: ['query'],
      },
    };
  }

  private static newsSearch(): ToolDefinition {
    return {
      name: 'search_news',
      description: 'Google News search via Serper API. Returns headlines, sources, and publication dates.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'News search query.' },
          ...this.numResults(),
          ...this.localeParams(),
          ...this.freshness('pd'),
          ...this.safesearch(),
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
        },
        required: ['query'],
      },
    };
  }

  private static placesSearch(): ToolDefinition {
    return {
      name: 'search_places',
      description: 'Google Places / Maps search via Serper API. Returns local businesses with address, phone, hours, ratings, and GPS coordinates.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Place or business query (e.g. "coffee shops in Tokyo").' },
          ...this.numResults(20, 5),
          ...this.localeParams(),
        },
        required: ['query'],
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
        },
        required: ['query'],
      },
    };
  }

  static validateArgs(toolName: string, args: unknown): void {
    const tool = this.getAllTools().find((t) => t.name === toolName);
    if (!tool) throw new Error(`Unknown tool: ${toolName}`);
    if (typeof args !== 'object' || args === null) throw new Error('Arguments must be an object');

    for (const key of tool.inputSchema.required) {
      if (!(key in (args as object))) throw new Error(`Missing required parameter: ${key}`);
    }

    const a = args as Record<string, unknown>;
    if (typeof a['query'] === 'string') {
      const q = a['query'].trim();
      if (!q) throw new Error('query must not be empty');
      if (q.length > 400) throw new Error('query exceeds 400 characters');
      if (q.split(/\s+/).length > 50) throw new Error('query exceeds 50 words');
    }
  }
}
