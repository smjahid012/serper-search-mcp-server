/**
 * Result Formatter for Serper MCP Server v2.0.0 - Enterprise Edition
 * Author: SMJAHID from SMLabs01
 */

import { SerperAPIResponse, SearchResult, SearchType } from '../types';

export class ResultFormatter {
  /**
   * Format search results for display
   */
  static formatResults(results: SerperAPIResponse, maxResults: number, searchType: SearchType): string {
    const query = results.searchParameters?.q || 'Unknown query';
    let output = `## ${this.capitalizeFirst(searchType)} Search Results for "${query}"\n\n`;

    // Handle different result structures based on search type
    let resultArray: SearchResult[] = [];
    let resultKey = '';

    switch (searchType) {
      case 'web':
        resultKey = 'organic';
        break;
      case 'images':
        resultKey = 'images';
        break;
      case 'videos':
        resultKey = 'videos';
        break;
      case 'news':
        resultKey = 'news';
        break;
      case 'shopping':
        resultKey = 'shopping';
        break;
      default:
        resultKey = 'organic';
    }

    if (!results[resultKey as keyof SerperAPIResponse] ||
        (results[resultKey as keyof SerperAPIResponse] as SearchResult[]).length === 0) {
      return output + 'No search results found.';
    }

    resultArray = results[resultKey as keyof SerperAPIResponse] as SearchResult[];
    const limitedResults = resultArray.slice(0, maxResults);

    limitedResults.forEach((result, index) => {
      output += `### ${index + 1}. `;

      switch (searchType) {
        case 'web':
          output += `${result.title}\n`;
          output += `**URL:** ${result.link}\n`;
          if (result.snippet) {
            output += `**Snippet:** ${result.snippet}\n`;
          }
          break;

        case 'images':
          output += `${result.title}\n`;
          output += `**Image URL:** ${result.imageUrl}\n`;
          output += `**Source:** ${result.source}\n`;
          if (result.link) {
            output += `**Page:** ${result.link}\n`;
          }
          break;

        case 'videos':
          output += `${result.title}\n`;
          output += `**Channel:** ${result.channel}\n`;
          output += `**Duration:** ${result.duration || 'Unknown'}\n`;
          if (result.link) {
            output += `**URL:** ${result.link}\n`;
          }
          break;

        case 'news':
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

        case 'shopping':
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

      output += '\n';
    });

    if (resultArray.length > maxResults) {
      output += `*Showing ${maxResults} of ${resultArray.length} total results.*\n`;
    }

    return output;
  }

  /**
   * Format error message
   */
  static formatError(error: Error): string {
    return `❌ **Error:** ${error.message}\n\nPlease check your query and try again.`;
  }

  /**
   * Format validation error
   */
  static formatValidationError(message: string): string {
    return `⚠️ **Validation Error:** ${message}\n\nPlease check your input parameters.`;
  }

  /**
   * Format server info
   */
  static formatServerInfo(): string {
    return `🚀 **Serper MCP Server v2.0.0 - Enterprise Edition**

👨‍💻 **Author:** SMJAHID from SMLabs01
🔧 **Features:** Multi-Transport, Advanced Filtering, AI Summarization
🌐 **Search Types:** Web, Images, Videos, News, Shopping

Ready to process search requests!`;
  }

  /**
   * Capitalize first letter of a string
   */
  private static capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}