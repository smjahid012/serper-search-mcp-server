/**
 * Serper Search MCP Server — SMLabs AI
 * github.com/smjahid012/serper-search-mcp-server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig, SearchOptions, SearchType } from '../types/index.js';
import { SerperAPI } from '../api/SerperAPI.js';
import { SearchTools } from '../tools/SearchTools.js';
import { ResultFormatter } from '../utils/ResultFormatter.js';
import { runDeepResearch, ResearchDepth } from '../tools/DeepResearch.js';
import { buildRAGContext } from '../tools/RAGContext.js';

const SEARCH_TYPE_MAP: Record<string, SearchType> = {
  search_web:      'web',
  search_images:   'images',
  search_videos:   'videos',
  search_news:     'news',
  search_shopping: 'shopping',
  search_places:   'places',
};

export class SerperMCPServer {
  public readonly config: ServerConfig;
  private server: Server;
  private api: SerperAPI;

  constructor(options: Partial<ServerConfig> = {}) {
    this.config = {
      apiKey:    options.apiKey    || process.env.SERPER_API_KEY    || '',
      transport: options.transport || (process.env.SERPER_MCP_TRANSPORT as 'stdio' | 'http') || 'stdio',
      port:      options.port      || parseInt(process.env.SERPER_MCP_PORT  || '8080', 10),
      host:      options.host      || process.env.SERPER_MCP_HOST   || '0.0.0.0',
      logLevel:  options.logLevel  || process.env.SERPER_MCP_LOG_LEVEL || 'info',
    };

    if (!this.config.apiKey) throw new Error('SERPER_API_KEY is required');

    this.api = new SerperAPI(this.config.apiKey);
    this.server = new Server(
      { name: 'serper-search-mcp', version: '3.0.0' },
      { capabilities: { tools: {} } }
    );

    this.registerHandlers();
  }

  private registerHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: SearchTools.getAllTools(),
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;

      try {
        SearchTools.validateArgs(name, args);
        const a = args as Record<string, unknown>;

        // ── Deep Research ─────────────────────────────────────────────────────
        if (name === 'deep_research') {
          const result = await runDeepResearch(
            a['query'] as string,
            (a['depth'] as ResearchDepth) ?? 'standard',
            (a['country'] as string) ?? 'US',
            this.api
          );

          const header = [
            `## 🔬 Deep Research Report`,
            `**Query:** ${result.query}`,
            `**Depth:** ${result.depth} | **Sources:** ${result.sourceCount} | **LLM:** ${result.model} (${result.provider})`,
            `**Sub-queries explored:**`,
            ...result.subQueries.map((q, i) => `${i + 1}. ${q}`),
            '',
            '---',
            '',
          ].join('\n');

          return { content: [{ type: 'text', text: header + result.report }] };
        }

        // ── RAG Context ───────────────────────────────────────────────────────
        if (name === 'search_rag_context') {
          const text = await buildRAGContext(
            a['query'] as string,
            {
              num_results:     (a['num_results']     as number)  ?? 10,
              country:         (a['country']         as string)  ?? 'US',
              freshness:       a['freshness']        as SearchOptions['freshness'],
              max_chunk_words: (a['max_chunk_words'] as number)  ?? 200,
              include_paa:     (a['include_paa']     as boolean) ?? true,
              output_format:   (a['output_format']   as 'json' | 'text') ?? 'json',
            },
            this.api
          );
          return { content: [{ type: 'text', text }] };
        }

        // ── Standard search tools ─────────────────────────────────────────────
        const searchType = SEARCH_TYPE_MAP[name];
        if (!searchType) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        return await this.runSearch(a, searchType);

      } catch (err) {
        if (err instanceof McpError) throw err;
        const msg = err instanceof Error ? err.message : String(err);
        throw new McpError(ErrorCode.InternalError, msg);
      }
    });

    this.server.onerror = (err) => console.error('[MCP error]', err);
    process.on('SIGINT',  () => this.server.close().then(() => process.exit(0)));
    process.on('SIGTERM', () => this.server.close().then(() => process.exit(0)));
  }

  private async runSearch(args: Record<string, unknown>, searchType: SearchType) {
    const defaultNum = searchType === 'places' ? 5 : 10;
    const opts: Partial<SearchOptions> = {
      num_results:  (args['num_results']  as number)  ?? defaultNum,
      country:      (args['country']      as string)  ?? 'US',
      search_lang:  (args['search_lang']  as string)  ?? 'en',
      ui_lang:      (args['ui_lang']      as string)  ?? 'en',
      freshness:    args['freshness']     as SearchOptions['freshness'],
      safesearch:   (args['safesearch']   as SearchOptions['safesearch']) ?? 'moderate',
      summary:      (args['summary']      as boolean) ?? false,
      autocorrect:  (args['autocorrect']  as boolean) ?? true,
      page:         (args['page']         as number)  ?? 1,
    };

    const data = await this.api.search(args['query'] as string, searchType, opts);
    const text = ResultFormatter.format(data, opts.num_results ?? defaultNum, searchType);
    return { content: [{ type: 'text', text }] };
  }

  async run(): Promise<void> {
    await this.server.connect(new StdioServerTransport());
    console.error('Serper Search MCP Server v3.0.0 — SMLabs AI');
  }
}
