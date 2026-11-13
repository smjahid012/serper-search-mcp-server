/**
 * Serper Search MCP Server — SMLabs AI
 * github.com/smjahid012/serper-search-mcp-server
 */

import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { webcrypto, timingSafeEqual, randomUUID, createHash } from 'node:crypto';

// Node < 19 does not expose WebCrypto as a global. The MCP Streamable HTTP
// transport needs `globalThis.crypto` (randomUUID for SSE event ids), so
// polyfill it from node:crypto. No-op on newer Node versions.
if (!(globalThis as { crypto?: unknown }).crypto) {
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig, SearchOptions, SearchType, Verbosity } from '../types/index.js';
import { SerperAPI } from '../api/SerperAPI.js';
import { SearchTools } from '../tools/SearchTools.js';
import { ProviderRouter } from '../api/providers/Router.js';
import { effectiveFetchCount, ResultFormatter } from '../utils/ResultFormatter.js';
import { runDeepResearch, ResearchDepth } from '../tools/DeepResearch.js';
import { buildRAGContext } from '../tools/RAGContext.js';
import { runBatchSearch } from '../tools/BatchSearch.js';
import { LinkResolver } from '../tools/ResolveLinks.js';
import { LinkMode, defaultLinkMode, shownGotoCount, unresolvedNote } from '../utils/LinkResolution.js';
import { deepResearchLinkFooter } from '../tools/DeepResearch.js';
import { setLogLevel, logger, withRequestId } from '../utils/Logger.js';
import { AuthError, ValidationError } from '../utils/errors.js';
import { snapshot as metricsSnapshot } from '../utils/Metrics.js';
import { version } from '../../package.json';

const SEARCH_TYPE_MAP: Record<string, SearchType> = {
  search: 'web', // unified tool resolves type from args
  search_web:      'web',
  search_images:   'images',
  search_videos:   'videos',
  search_news:     'news',
  search_shopping: 'shopping',
  search_places:   'places',
  search_scholar:  'scholar',
  search_patents:  'patents',
  autocomplete:    'autocomplete',
};

/**
 * When a token is configured, /mcp requires `Authorization: Bearer <token>`.
 * /health always stays open for load balancers.
 */
export function isAuthorized(authorization: string | undefined, token: string | undefined): boolean {
  if (!token) return true;
  if (!authorization) return false;
  const match = /^Bearer[ \t]+(.+)$/i.exec(authorization);
  if (!match) return false;
  const a = createHash('sha256').update(match[1], 'utf8').digest();
  const b = createHash('sha256').update(token, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Strip HTML, redact credential-looking tokens, and cap length before a message reaches a client. */
export function sanitizeErrorMessage(message: string): string {
  const noHtml = message
    .replace(/<[^>]{1,200}>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const redacted = noHtml
    .replace(/([?&](?:key|api[_-]?key|token|access_token)=)[^\s&"']+/gi, '$1[redacted]')
    .replace(/\b(Bearer)\s+[A-Za-z0-9._-]{8,}/gi, '$1 [redacted]')
    .replace(/\bsk-[A-Za-z0-9._-]{8,}/g, 'sk-[redacted]');
  return redacted.length > 300 ? `${redacted.slice(0, 300)}...` : redacted;
}

const LOOPBACK_HOST_VALUES = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/** Set of allowed Host-header values, or null when rebinding protection is off. */
export function hostAllowedSet(bindHost: string): Set<string> | null {
  const extras = (process.env.SERPER_MCP_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const bind = (bindHost ?? '').trim().toLowerCase();
  const loopbackBind = LOOPBACK_HOST_VALUES.has(bind);
  if (!loopbackBind && extras.length === 0) return null;
  const allowed = new Set<string>(['127.0.0.1', 'localhost', '::1', '[::1]']);
  if (bind && !['0.0.0.0', '::', '[::]', '*'].includes(bind)) allowed.add(bind);
  for (const e of extras) allowed.add(e);
  return allowed;
}

export function isAllowedHostHeader(
  hostHeader: string | string[] | undefined,
  allowed: Set<string>
): boolean {
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return false;
  const h = raw.trim().toLowerCase();
  if (allowed.has(h)) return true;
  const stripped = h.replace(/:\d+$/, '');
  return stripped !== h && allowed.has(stripped);
}

export class SerperMCPServer {
  public readonly config: ServerConfig;
  private api: SerperAPI;
  private router: ProviderRouter;
  private links: LinkResolver;

  constructor(options: Partial<ServerConfig> = {}) {
    const envPort = parseInt(process.env.SERPER_MCP_PORT || '8080', 10);
    const candidate = Number.isInteger(options.port) ? (options.port as number) : envPort;
    const port = Number.isInteger(candidate) && candidate > 0 && candidate <= 65535 ? candidate : 8080;
    this.config = {
      apiKey:    options.apiKey    || process.env.SERPER_API_KEY    || '',
      transport: options.transport || (process.env.SERPER_MCP_TRANSPORT as 'stdio' | 'http') || 'stdio',
      port,
      host:      options.host      || process.env.SERPER_MCP_HOST   || '127.0.0.1',
      logLevel:  options.logLevel  || process.env.SERPER_MCP_LOG_LEVEL || 'info',
      authToken: options.authToken || process.env.SERPER_MCP_AUTH_TOKEN || undefined,
    };

    setLogLevel(this.config.logLevel);

    if (!this.config.apiKey) throw new AuthError('SERPER_API_KEY is required');

    this.api = new SerperAPI(this.config.apiKey);
    this.router = new ProviderRouter(this.api);
    this.links = new LinkResolver(this.api);
  }

  /**
   * Build a fully-configured MCP server instance.
   * HTTP mode creates one per request (stateless); stdio mode uses a single instance.
   */
  buildServer(): Server {
    const server = new Server(
      { name: 'serper-search-mcp', version },
      { capabilities: { tools: {} } }
    );
    this.registerHandlers(server);
    return server;
  }

  private registerHandlers(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: SearchTools.getAllTools(),
    }));

    server.setRequestHandler(CallToolRequestSchema, (req) =>
      withRequestId(randomUUID().slice(0, 8), async () => {
      const { name, arguments: args } = req.params;

      const knownTool =
        name in SEARCH_TYPE_MAP ||
        name === 'deep_research' ||
        name === 'search_rag_context' ||
        name === 'scrape' ||
        name === 'search_many' ||
        name === 'search_maps' ||
        name === 'search_reviews' ||
        name === 'search_lens' ||
        name === 'resolve_links';
      if (!knownTool) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

      try {
        SearchTools.validateArgs(name, args);
        const a = args as Record<string, unknown>;

        // ── Google redirect links ─────────────────────────────────────────────
        if (name === 'resolve_links') {
          const text = await this.links.resolveLinksTool(a);
          return { content: [{ type: 'text', text }] };
        }

        // ── Scrape ────────────────────────────────────────────────────────────
        if (name === 'scrape') {
          const url = a['url'] as string;
          const maxChars = Math.min(200_000, Math.max(1_000, Math.floor(Number(a['max_chars'])) || 50_000));
          const data = await this.api.scrape(url, {
            includeMarkdown: (a['include_markdown'] as boolean) ?? true,
            includeImages:   (a['include_images']   as boolean) ?? false,
            includeLinks:    (a['include_links']    as boolean) ?? false,
            includeVideos:   (a['include_videos']   as boolean) ?? false,
          });
          const text = ResultFormatter.formatScrape(data, url, maxChars);
          return { content: [{ type: 'text', text }] };
        }

        // ── Batch search ──────────────────────────────────────────────────────
        if (name === 'search_many') {
          const text = await runBatchSearch(
            a['queries'] as string[],
            {
              num_results: (a['num_results'] as number)  ?? 5,
              country:     (a['country']     as string)  ?? 'US',
              search_lang: (a['search_lang'] as string)  ?? 'en',
              ui_lang:     (a['ui_lang']     as string)  ?? 'en',
              freshness:   a['freshness'] as SearchOptions['freshness'],
              safesearch:  (a['safesearch']  as SearchOptions['safesearch']) ?? 'moderate',
            },
            this.router
          );
          return { content: [{ type: 'text', text }] };
        }

        // ── Deep Research ─────────────────────────────────────────────────────
        if (name === 'deep_research') {
          const result = await runDeepResearch(
            a['query'] as string,
            (a['depth'] as ResearchDepth) ?? 'standard',
            (a['country'] as string) ?? 'US',
            this.router
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

          return { content: [{ type: 'text', text: header + result.report + deepResearchLinkFooter(result) }] };
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
              link_resolution: (a['link_resolution'] as LinkMode | undefined) ?? defaultLinkMode(),
            },
            this.router,
            this.links
          );
          return { content: [{ type: 'text', text }] };
        }

        // ── Maps / Reviews / Lens stubs (v3.2 sweep — documented, not silent) ──
        if (name === 'search_maps' || name === 'search_reviews' || name === 'search_lens') {
          const hint = name === 'search_maps'
            ? 'Use search_places instead — same Serper places index with address/phone/hours/GPS.'
            : name === 'search_reviews'
              ? 'Use search_places (ratings + review counts) or search_web with "<place> reviews".'
              : 'Use search_images with a site filter (e.g. site=dribbble.com) for visual discovery.';
          return { content: [{ type: 'text', text: `## ⚠️ ${name} is not a separate Serper endpoint\n\n${hint}` }] };
        }

        // ── Standard search tools ─────────────────────────────────────────────
        let searchType = SEARCH_TYPE_MAP[name];
        if (!searchType) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        // Unified `search` tool resolves type from args
        if (name === 'search' && typeof a['type'] === 'string') {
          const t = (a['type'] as string).toLowerCase();
          if (t in SEARCH_TYPE_MAP || ['web','images','videos','news','shopping','places','scholar','patents','autocomplete'].includes(t)) {
            searchType = t as SearchType;
          }
        }
        return await this.runSearch(a, searchType);

      } catch (err) {
        if (err instanceof McpError) throw err;
        const msg = sanitizeErrorMessage(err instanceof Error ? err.message : String(err));
        if (err instanceof ValidationError) throw new McpError(ErrorCode.InvalidParams, msg);
        throw new McpError(ErrorCode.InternalError, msg);
      }
      })
    );

    server.onerror = (err) => logger.error('[MCP error]', err);
  }

  private async runSearch(args: Record<string, unknown>, searchType: SearchType) {
    // Credit-safe: compact defaults to num:5 (never fetch-10-show-3)
    const verbosity = (args['verbosity'] as Verbosity) ?? 'auto';
    const numResults = effectiveFetchCount(args['num_results'] as number | undefined, verbosity === 'auto' ? 'standard' : verbosity, searchType);
    const maxChars = args['max_chars'] !== undefined ? Math.max(0, Math.floor(Number(args['max_chars']))) : undefined;
    const opts: Partial<SearchOptions> = {
      num_results:  numResults,
      country:      (args['country']      as string)  ?? 'US',
      search_lang:  (args['search_lang']  as string)  ?? 'en',
      ui_lang:      (args['ui_lang']      as string)  ?? 'en',
      freshness:    (args['freshness']    as SearchOptions['freshness'])
                    ?? (searchType === 'news' ? 'pd' : undefined),
      safesearch:   (args['safesearch']   as SearchOptions['safesearch']) ?? 'moderate',
      autocorrect:  (args['autocorrect']  as boolean) ?? true,
      page:         (args['page']         as number)  ?? 1,
      verbosity,
      max_chars: maxChars,
      snippets_only: (args['snippets_only'] as boolean) ?? false,
      provider: (args['provider'] as string) ?? 'auto',
      link_resolution: (args['link_resolution'] as LinkMode | undefined) ?? defaultLinkMode(),
    };

    // Image discovery filters → query shaping (Serper has no native size/color params)
    let query = args['query'] as string;
    if (searchType === 'images' && typeof args['site'] === 'string' && args['site']) {
      query = `site:${args['site']} ${query}`;
    }

    const data = await this.router.search(query, searchType, opts);
    const timeFilter = (args['freshness'] as SearchOptions['freshness'] | undefined) ?? (searchType === 'news' ? 'pd' : undefined);
    const render = (d: typeof data) => searchType === 'places'
      ? this.formatPlacesWithFilters(d, numResults, args, maxChars)
      : ResultFormatter.format(d, numResults, searchType, {
          verbosity,
          maxChars,
          snippetsOnly: opts.snippets_only,
          timeFilter,
          layout: args['layout'] as string | undefined,
          size: args['size'] as string | undefined,
          orientation: args['orientation'] as string | undefined,
        });
    const r = await this.links.apply(data, {
      mode: opts.link_resolution ?? 'auto',
      countShown: (d) => shownGotoCount(d, searchType, numResults, verbosity),
      render: (d, state) => render(d) + unresolvedNote(state),
    });
    const text = render(r.data) + unresolvedNote(r);
    return { content: [{ type: 'text', text }] };
  }

  private formatPlacesWithFilters(
    data: import('../types/index.js').SerperAPIResponse,
    numResults: number,
    args: Record<string, unknown>,
    maxChars: number | undefined
  ): string {
    // Reuse ResultFormatter.format for header/footer, but inject filtered places first
    const minRating = args['min_rating'] !== undefined ? Number(args['min_rating']) : undefined;
    const sortBy = args['sort_by'] as 'rating' | 'reviews' | undefined;
    const filtered = ResultFormatter.formatPlaces(data.places ?? [], numResults, {
      minRating: Number.isFinite(minRating as number) ? (minRating as number) : undefined,
      sortBy: sortBy === 'rating' || sortBy === 'reviews' ? sortBy : undefined,
      compact: (args['verbosity'] as string | undefined) === 'compact',
    });
    // Compose final output manually: filtered rows + credit footer.
    const footer = `\n\n---\n*Provider: ${data.provider ?? 'serper'} · Cache: ${data.cache_hit ? 'hit (0 credits)' : 'miss'}${data.credits !== undefined ? ` · Serper credits used: ${data.credits}` : ''}*`;
    let text = [`## 📍 Places Search Results${data.searchParameters?.q ? ` — "${data.searchParameters.q}"` : ''}\n`, ...filtered].join('\n') + footer;
    if (maxChars && maxChars > 0 && text.length > maxChars) {
      text = text.slice(0, maxChars) + `\n\n…[truncated to ${maxChars.toLocaleString()} chars]`;
    }
    return text;
  }

  /**
   * Streamable HTTP transport — stateless mode.
   *   POST /mcp     MCP JSON-RPC endpoint
   *   GET  /health  container/load-balancer health probe
   */
  private async runHttp(): Promise<void> {
    const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost', '[::1]']);
    const insecureOptOut = ['1', 'true', 'yes'].includes(
      (process.env.SERPER_MCP_INSECURE_NO_AUTH ?? '').toLowerCase()
    );
    if (!this.config.authToken && !LOOPBACK_HOSTS.has(this.config.host) && !insecureOptOut) {
      throw new AuthError(
        `Refusing to serve HTTP on ${this.config.host} without SERPER_MCP_AUTH_TOKEN. ` +
        'Set SERPER_MCP_AUTH_TOKEN, keep the default host 127.0.0.1 (reverse proxy), ' +
        'or set SERPER_MCP_INSECURE_NO_AUTH=true if authentication is handled elsewhere.'
      );
    }

    const MAX_BODY_BYTES = 256 * 1024;
    const allowedHosts = hostAllowedSet(this.config.host);
    const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      void withRequestId(randomUUID().slice(0, 8), async () => {
      try {
        // ── Body-size guard: reject oversized requests before buffering ──────
        const contentLength = Number(req.headers['content-length']);
        if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Request body too large (max ${MAX_BODY_BYTES} bytes)` }));
          return;
        }
        const transferEncoding = req.headers['transfer-encoding'];
        if (transferEncoding && String(transferEncoding).toLowerCase().includes('chunked') && !req.headers['content-length']) {
          res.writeHead(411, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Content-Length required (chunked bodies are not accepted)' }));
          return;
        }
        const pathname = (req.url ?? '/').split('?')[0];

        if (pathname === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            status: 'ok',
            name: 'serper-search-mcp',
            version,
            auth_required: Boolean(this.config.authToken),
            uptime_s: Math.round(process.uptime()),
            metrics: metricsSnapshot(),
          }));
          return;
        }

        if (pathname === '/mcp') {
          if (allowedHosts && !isAllowedHostHeader(req.headers.host, allowedHosts)) {
            res.writeHead(403, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              error:
                'Forbidden: Host header not allowed (DNS rebinding protection). ' +
                'If you are behind a reverse proxy, set SERPER_MCP_ALLOWED_HOSTS=<your domain>.',
            }));
            return;
          }
          if (!isAuthorized(req.headers.authorization, this.config.authToken)) {
            res.writeHead(401, { 'Content-Type': 'application/json', 'WWW-Authenticate': 'Bearer' });
            res.end(JSON.stringify({ error: 'Unauthorized — send Authorization: Bearer <SERPER_MCP_AUTH_TOKEN>' }));
            return;
          }

          const server = this.buildServer();
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
          res.on('close', () => {
            void transport.close();
            void server.close();
          });
          await server.connect(transport);
          await transport.handleRequest(req, res);
          return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found. MCP endpoint: POST /mcp' }));
      } catch (err) {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: sanitizeErrorMessage(err instanceof Error ? err.message : String(err)) }));
      }
      });
    });

    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(this.config.port, this.config.host, resolve);
    });

    // ── Server timeout + graceful shutdown for HTTP (matches stdio SIG handling)
    httpServer.timeout = 120_000;
    httpServer.keepAliveTimeout = 5_000;
    const shutdown = () => {
      logger.info('Shutting down HTTP server…');
      httpServer.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);

    logger.info(
      `Serper Search MCP Server v${version} — HTTP listening on http://${this.config.host}:${this.config.port}/mcp ` +
      `(health: /health${this.config.authToken ? ' · bearer auth enabled' : ''})`
    );
  }

  async run(): Promise<void> {
    if (this.config.transport === 'http') {
      await this.runHttp();
      return;
    }

    const server = this.buildServer();
    const shutdownStdio = () => {
      server
        .close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
      setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.on('SIGINT', shutdownStdio);
    process.on('SIGTERM', shutdownStdio);

    await server.connect(new StdioServerTransport());
    logger.info(`Serper Search MCP Server v${version} — SMLabs AI`);
  }
}
