/**
 * Serper API Client for Serper MCP Server v2.0.0 - Enterprise Edition
 * Author: SMJAHID from SMLabs01
 */

import { SearchOptions, SerperAPIResponse, SearchType } from '../types';

export class SerperAPI {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseURL = 'https://google.serper.dev';
  }

  /**
   * Perform search request to Serper API
   */
  async search(query: string, searchType: SearchType = 'web', options: Partial<SearchOptions> = {}): Promise<SerperAPIResponse> {
    const requestBody = this.buildRequestBody(query, searchType, {
      query,
      ...options
    });

    try {
      const response = await fetch(`${this.baseURL}/search`, {
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
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error occurred during API request');
    }
  }

  /**
   * Build request body for Serper API
   */
  private buildRequestBody(query: string, searchType: SearchType, options: SearchOptions): any {
    const {
      num_results = 10,
      country = 'US',
      search_lang = 'en',
      ui_lang = 'en-US',
      freshness,
      safesearch = 'moderate',
      summary = false
    } = options;

    const requestBody: any = {
      q: query,
      num: Math.min(num_results, 20), // Cap at 20 per API limits
      gl: country, // Country code
      hl: ui_lang, // UI language
      lr: `lang_${search_lang}` // Search language
    };

    // Add search type specific parameters
    switch (searchType) {
      case 'images':
        requestBody.tbm = 'isch'; // Images search
        break;
      case 'videos':
        requestBody.tbm = 'vid'; // Videos search
        break;
      case 'news':
        requestBody.tbm = 'nws'; // News search
        break;
      case 'shopping':
        requestBody.tbm = 'shop'; // Shopping search
        break;
      // web search uses default parameters
    }

    // Add optional filters
    if (freshness) {
      requestBody.tbs = `qdr:${freshness}`; // Time-based search
    }

    if (safesearch && safesearch !== 'moderate') {
      requestBody.safe = safesearch === 'strict' ? 'active' : 'off';
    }

    if (summary) {
      requestBody.summary = true; // Enable AI summarization
    }

    return requestBody;
  }

  /**
   * Validate API key by making a test request
   */
  async validateApiKey(): Promise<boolean> {
    try {
      await this.search('test query', 'web', { num_results: 1 });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get API usage information (if available)
   */
  getApiInfo(): { endpoint: string; version: string } {
    return {
      endpoint: this.baseURL,
      version: '2.0.0'
    };
  }
}