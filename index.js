#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { SSEServerTransport } = require("@modelcontextprotocol/sdk/server/sse.js");
const { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } = require("@modelcontextprotocol/sdk/types.js");

class SerperMCPServer {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.SERPER_API_KEY;
    if (!this.apiKey) {
      throw new Error("SERPER_API_KEY environment variable is required");
    }

    this.transport = options.transport || process.env.SERPER_MCP_TRANSPORT || 'stdio';
    this.port = options.port || parseInt(process.env.SERPER_MCP_PORT) || 8080;
    this.host = options.host || process.env.SERPER_MCP_HOST || '0.0.0.0';
    this.logLevel = options.logLevel || process.env.SERPER_MCP_LOG_LEVEL || 'info';

    this.server = new Server(
      {
        name: "serper-search-server",
        version: "2.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_web",
            description: "Search the web using Serper API (Google search results)",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query to execute (max 400 chars, 50 words)"
                },
                num_results: {
                  type: "number",
                  description: "Number of results to return (1-20, default: 10)",
                  default: 10,
                  minimum: 1,
                  maximum: 20
                },
                country: {
                  type: "string",
                  description: "Country code (default: 'US')",
                  default: "US"
                },
                search_lang: {
                  type: "string",
                  description: "Search language (default: 'en')",
                  default: "en"
                },
                ui_lang: {
                  type: "string",
                  description: "UI language (default: 'en-US')",
                  default: "en-US"
                },
                freshness: {
                  type: "string",
                  description: "Time filter: 'pd' (day), 'pw' (week), 'pm' (month), 'py' (year)",
                  enum: ["pd", "pw", "pm", "py"]
                },
                safesearch: {
                  type: "string",
                  description: "Content filtering",
                  enum: ["off", "moderate", "strict"],
                  default: "moderate"
                },
                summary: {
                  type: "boolean",
                  description: "Enable AI summarization (default: false)",
                  default: false
                }
              },
              required: ["query"]
            }
          },
          {
            name: "search_images",
            description: "Search for images using Serper API",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The image search query"
                },
                num_results: {
                  type: "number",
                  description: "Number of results to return (default: 10)",
                  default: 10
                }
              },
              required: ["query"]
            }
          },
          {
            name: "search_videos",
            description: "Search for videos using Serper API",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The video search query"
                },
                num_results: {
                  type: "number",
                  description: "Number of results to return (default: 10)",
                  default: 10
                }
              },
              required: ["query"]
            }
          },
          {
            name: "search_news",
            description: "Search for news articles using Serper API",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The news search query"
                },
                num_results: {
                  type: "number",
                  description: "Number of results to return (default: 10)",
                  default: 10
                }
              },
              required: ["query"]
            }
          },
          {
            name: "search_shopping",
            description: "Search for products and shopping results using Serper API",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The shopping search query"
                },
                num_results: {
                  type: "number",
                  description: "Number of results to return (default: 10)",
                  default: 10
                }
              },
              required: ["query"]
            }
          }
        ]
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "search_web":
          return await this.performSearch(args, "web");
        case "search_images":
          return await this.performSearch(args, "images");
        case "search_videos":
          return await this.performSearch(args, "videos");
        case "search_news":
          return await this.performSearch(args, "news");
        case "search_shopping":
          return await this.performSearch(args, "shopping");
        default:
          throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
      }
    });
  }

  async performSearch(args, searchType = "web") {
    const {
      query,
      num_results = 10,
      country = "US",
      search_lang = "en",
      ui_lang = "en-US",
      freshness,
      safesearch = "moderate",
      summary = false
    } = args;

    if (!query || typeof query !== "string" || query.trim() === "") {
      throw new McpError(ErrorCode.InvalidParams, "Query parameter is required and must be a non-empty string");
    }

    // Validate query length (following Brave API limits)
    if (query.length > 400 || query.split(' ').length > 50) {
      throw new McpError(ErrorCode.InvalidParams, "Query too long (max 400 chars, 50 words)");
    }

    try {
      const searchResults = await this.makeSerperRequest(query.trim(), searchType, {
        num_results,
        country,
        search_lang,
        ui_lang,
        freshness,
        safesearch,
        summary
      });

      // Format results for better readability
      const formattedResults = this.formatSearchResults(searchResults, num_results, searchType);

      return {
        content: [
          {
            type: "text",
            text: formattedResults
          }
        ]
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Search failed: ${error.message}`
      );
    }
  }

  async makeSerperRequest(query, searchType = "web", options = {}) {
    const {
      num_results = 10,
      country = "US",
      search_lang = "en",
      ui_lang = "en-US",
      freshness,
      safesearch = "moderate",
      summary = false
    } = options;

    const requestBody = {
      q: query,
      num: Math.min(num_results, 20), // Cap at 20 per API limits
      gl: country, // Country code
      hl: ui_lang, // UI language
      lr: `lang_${search_lang}` // Search language
    };

    // Add search type specific parameters
    switch (searchType) {
      case "images":
        requestBody.tbm = "isch"; // Images search
        break;
      case "videos":
        requestBody.tbm = "vid"; // Videos search
        break;
      case "news":
        requestBody.tbm = "nws"; // News search
        break;
      case "shopping":
        requestBody.tbm = "shop"; // Shopping search
        break;
      // web search uses default parameters
    }

    // Add optional filters
    if (freshness) {
      requestBody.tbs = `qdr:${freshness}`; // Time-based search
    }

    if (safesearch && safesearch !== "moderate") {
      requestBody.safe = safesearch === "strict" ? "active" : "off";
    }

    if (summary) {
      requestBody.summary = true; // Enable AI summarization
    }

    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Serper API error (${response.status}): ${errorText}`);
    }

    return await response.json();
  }

  formatSearchResults(results, maxResults, searchType = "web") {
    const query = results.searchParameters?.q || 'Unknown query';
    let output = `## ${this.capitalizeFirst(searchType)} Search Results for "${query}"\n\n`;

    // Handle different result structures based on search type
    let resultArray = [];
    let resultKey = "";

    switch (searchType) {
      case "web":
        resultKey = "organic";
        break;
      case "images":
        resultKey = "images";
        break;
      case "videos":
        resultKey = "videos";
        break;
      case "news":
        resultKey = "news";
        break;
      case "shopping":
        resultKey = "shopping";
        break;
      default:
        resultKey = "organic";
    }

    if (!results[resultKey] || results[resultKey].length === 0) {
      return output + "No search results found.";
    }

    resultArray = results[resultKey];
    const limitedResults = resultArray.slice(0, maxResults);

    limitedResults.forEach((result, index) => {
      output += `### ${index + 1}. `;

      switch (searchType) {
        case "web":
          output += `${result.title}\n`;
          output += `**URL:** ${result.link}\n`;
          if (result.snippet) {
            output += `**Snippet:** ${result.snippet}\n`;
          }
          break;

        case "images":
          output += `${result.title}\n`;
          output += `**Image URL:** ${result.imageUrl}\n`;
          output += `**Source:** ${result.source}\n`;
          if (result.link) {
            output += `**Page:** ${result.link}\n`;
          }
          break;

        case "videos":
          output += `${result.title}\n`;
          output += `**Channel:** ${result.channel}\n`;
          output += `**Duration:** ${result.duration || 'Unknown'}\n`;
          if (result.link) {
            output += `**URL:** ${result.link}\n`;
          }
          break;

        case "news":
          output += `${result.title}\n`;
          output += `**Source:** ${result.source}\n`;
          output += `**Published:** ${result.date || 'Unknown'}\n`;
          if (result.link) {
            output += `**URL:** ${result.link}\n`;
          }
          if (result.snippet) {
            output += `**Snippet:** ${result.snippet}\n`;
          }
          break;

        case "shopping":
          output += `${result.title}\n`;
          output += `**Price:** ${result.price || 'Price not available'}\n`;
          output += `**Source:** ${result.source}\n`;
          if (result.link) {
            output += `**URL:** ${result.link}\n`;
          }
          if (result.rating) {
            output += `**Rating:** ${result.rating}/5\n`;
          }
          break;
      }

      output += `\n`;
    });

    if (resultArray.length > maxResults) {
      output += `*Showing ${maxResults} of ${resultArray.length} total results.*\n`;
    }

    return output;
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  async run() {
    if (this.transport === 'http') {
      // HTTP transport using SSE
      const transport = new SSEServerTransport(this.host, this.port);
      await this.server.connect(transport);
      console.error(`Serper MCP server running on HTTP at http://${this.host}:${this.port}`);
    } else {
      // Default STDIO transport
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Serper MCP server running on stdio");
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--transport':
        options.transport = args[++i];
        break;
      case '--port':
        options.port = parseInt(args[++i]);
        break;
      case '--host':
        options.host = args[++i];
        break;
      case '--log-level':
        options.logLevel = args[++i];
        break;
      case '--api-key':
        options.apiKey = args[++i];
        break;
      case '--help':
        console.log(`
Serper MCP Server v2.0.0

Usage: node index.js [options]

Options:
  --transport <stdio|http>    Transport mode (default: stdio)
  --port <number>             HTTP server port (default: 8080)
  --host <string>             HTTP server host (default: "0.0.0.0")
  --log-level <string>        Logging level (default: "info")
  --api-key <string>          Serper API key
  --help                      Show this help message

Environment Variables:
  SERPER_API_KEY              Your Serper API key (required)
  SERPER_MCP_TRANSPORT        Transport mode ("stdio" or "http")
  SERPER_MCP_PORT             HTTP server port
  SERPER_MCP_HOST             HTTP server host
  SERPER_MCP_LOG_LEVEL        Logging level
        `);
        process.exit(0);
        break;
    }
  }

  return options;
}

// Start server if this file is run directly
if (require.main === module) {
  try {
    const options = parseArgs();
    const server = new SerperMCPServer(options);
    server.run().catch((error) => {
      console.error("Failed to start server:", error);
      process.exit(1);
    });
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

module.exports = { SerperMCPServer };