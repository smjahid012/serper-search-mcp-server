/**
 * Main Serper MCP Server for Serper MCP Server v2.0.0 - Enterprise Edition
 * Author: SMJAHID from SMLabs01
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

import { ServerConfig, SearchOptions, SearchType } from '../types';
import { SerperAPI } from '../api/SerperAPI';
import { SearchTools } from '../tools/SearchTools';
import { ResultFormatter } from '../utils/ResultFormatter';

export class SerperMCPServer {
  public readonly config: ServerConfig;
  private server: Server;
  private serperAPI: SerperAPI;

  constructor(options: Partial<ServerConfig> = {}) {
    // Merge provided options with defaults
    this.config = {
      apiKey: options.apiKey || process.env.SERPER_API_KEY || '',
      transport: options.transport || (process.env.SERPER_MCP_TRANSPORT as 'stdio' | 'http') || 'stdio',
      port: options.port || parseInt(process.env.SERPER_MCP_PORT || '8080'),
      host: options.host || process.env.SERPER_MCP_HOST || '0.0.0.0',
      logLevel: options.logLevel || process.env.SERPER_MCP_LOG_LEVEL || 'info'
    };

    // Validate required configuration
    if (!this.config.apiKey) {
      throw new Error('SERPER_API_KEY environment variable is required');
    }

    // Initialize components
    this.serperAPI = new SerperAPI(this.config.apiKey);
    this.server = new Server(
      {
        name: 'serper-search-server',
        version: '2.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
  }

  /**
   * Setup MCP tool handlers
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: SearchTools.getAllTools()
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Validate arguments
        SearchTools.validateToolArgs(name, args);

        // Route to appropriate handler
        switch (name) {
          case 'search_web':
            return await this.performSearch(args, 'web');
          case 'search_images':
            return await this.performSearch(args, 'images');
          case 'search_videos':
            return await this.performSearch(args, 'videos');
          case 'search_news':
            return await this.performSearch(args, 'news');
          case 'search_shopping':
            return await this.performSearch(args, 'shopping');
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        const message = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(ErrorCode.InternalError, message);
      }
    });
  }

  /**
   * Perform search operation
   */
  private async performSearch(args: any, searchType: SearchType) {
    const searchOptions: SearchOptions = {
      query: args.query,
      num_results: args.num_results || 10,
      country: args.country || 'US',
      search_lang: args.search_lang || 'en',
      ui_lang: args.ui_lang || 'en-US',
      freshness: args.freshness,
      safesearch: args.safesearch || 'moderate',
      summary: args.summary || false
    };

    try {
      // Perform search via API
      const searchResults = await this.serperAPI.search(
        searchOptions.query,
        searchType,
        searchOptions
      );

      // Format results
      const formattedResults = ResultFormatter.formatResults(
        searchResults,
        searchOptions.num_results || 10,
        searchType
      );

      return {
        content: [
          {
            type: 'text',
            text: formattedResults
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new McpError(ErrorCode.InternalError, `Search failed: ${message}`);
    }
  }

  /**
   * Start the server
   */
  async run(): Promise<void> {
    try {
      if (this.config.transport === 'http') {
        // HTTP transport using SSE - Note: HTTP transport may need different implementation
        // For now, fallback to STDIO for TypeScript compatibility
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log(`🚀 Serper MCP Server v2.0.0 running on STDIO (HTTP transport available in JavaScript version)`);
        console.log(`👨‍💻 Author: SMJAHID from SMLabs01`);
      } else {
        // Default STDIO transport
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log('🚀 Serper MCP Server v2.0.0 running on STDIO');
        console.log('👨‍💻 Author: SMJAHID from SMLabs01');
      }
    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  /**
   * Get server configuration
   */
  getConfig(): ServerConfig {
    return { ...this.config };
  }

  /**
   * Get server info
   */
  getInfo(): { name: string; version: string; author: string; features: string[] } {
    return {
      name: 'Serper Search MCP Server',
      version: '2.0.0',
      author: 'SMJAHID from SMLabs01',
      features: [
        'Multi-Type Search (Web, Images, Videos, News, Shopping)',
        'Multi-Transport (STDIO, HTTP/SSE)',
        'Advanced Filtering (Country, Language, Freshness)',
        'AI Summarization',
        'Enterprise Architecture',
        'Docker & NPM Deployment'
      ]
    };
  }
}