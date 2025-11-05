/**
 * Search Tools for Serper MCP Server v2.0.0 - Enterprise Edition
 * Author: SMJAHID from SMLabs01
 */

import { ToolDefinition, SearchType } from '../types';

export class SearchTools {
  /**
   * Get all available search tools
   */
  static getAllTools(): ToolDefinition[] {
    return [
      this.getWebSearchTool(),
      this.getImageSearchTool(),
      this.getVideoSearchTool(),
      this.getNewsSearchTool(),
      this.getShoppingSearchTool()
    ];
  }

  /**
   * Web search tool definition
   */
  static getWebSearchTool(): ToolDefinition {
    return {
      name: 'search_web',
      description: 'Search the web using Serper API (Google search results)',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The search query to execute (max 400 chars, 50 words)'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (1-20, default: 10)',
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: {
            type: 'string',
            description: 'Country code (default: "US")',
            default: 'US'
          },
          search_lang: {
            type: 'string',
            description: 'Search language (default: "en")',
            default: 'en'
          },
          ui_lang: {
            type: 'string',
            description: 'UI language (default: "en-US")',
            default: 'en-US'
          },
          freshness: {
            type: 'string',
            description: 'Time filter: "pd" (day), "pw" (week), "pm" (month), "py" (year)',
            enum: ['pd', 'pw', 'pm', 'py']
          },
          safesearch: {
            type: 'string',
            description: 'Content filtering',
            enum: ['off', 'moderate', 'strict'],
            default: 'moderate'
          },
          summary: {
            type: 'boolean',
            description: 'Enable AI summarization (default: false)',
            default: false
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * Image search tool definition
   */
  static getImageSearchTool(): ToolDefinition {
    return {
      name: 'search_images',
      description: 'Search for images using Serper API',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The image search query'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default: 10)',
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: {
            type: 'string',
            description: 'Country code (default: "US")',
            default: 'US'
          },
          search_lang: {
            type: 'string',
            description: 'Search language (default: "en")',
            default: 'en'
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * Video search tool definition
   */
  static getVideoSearchTool(): ToolDefinition {
    return {
      name: 'search_videos',
      description: 'Search for videos using Serper API',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The video search query'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default: 10)',
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: {
            type: 'string',
            description: 'Country code (default: "US")',
            default: 'US'
          },
          search_lang: {
            type: 'string',
            description: 'Search language (default: "en")',
            default: 'en'
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * News search tool definition
   */
  static getNewsSearchTool(): ToolDefinition {
    return {
      name: 'search_news',
      description: 'Search for news articles using Serper API',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The news search query'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default: 10)',
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: {
            type: 'string',
            description: 'Country code (default: "US")',
            default: 'US'
          },
          search_lang: {
            type: 'string',
            description: 'Search language (default: "en")',
            default: 'en'
          },
          freshness: {
            type: 'string',
            description: 'Time filter (default: "pd" for last 24 hours)',
            enum: ['pd', 'pw', 'pm', 'py'],
            default: 'pd'
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * Shopping search tool definition
   */
  static getShoppingSearchTool(): ToolDefinition {
    return {
      name: 'search_shopping',
      description: 'Search for products and shopping results using Serper API',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'The shopping search query'
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default: 10)',
            minimum: 1,
            maximum: 20,
            default: 10
          },
          country: {
            type: 'string',
            description: 'Country code (default: "US")',
            default: 'US'
          },
          search_lang: {
            type: 'string',
            description: 'Search language (default: "en")',
            default: 'en'
          }
        },
        required: ['query']
      }
    };
  }

  /**
   * Validate tool arguments
   */
  static validateToolArgs(toolName: string, args: any): void {
    const tool = this.getAllTools().find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    // Check required parameters
    for (const required of tool.inputSchema.required) {
      if (!(required in args)) {
        throw new Error(`Missing required parameter: ${required}`);
      }
    }

    // Validate query length
    if (args.query) {
      if (typeof args.query !== 'string') {
        throw new Error('Query must be a string');
      }
      if (args.query.length > 400) {
        throw new Error('Query too long (max 400 characters)');
      }
      if (args.query.split(' ').length > 50) {
        throw new Error('Query too long (max 50 words)');
      }
    }
  }
}