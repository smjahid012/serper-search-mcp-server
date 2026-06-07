/**
 * Serper API Client — SMLabs AI
 * Supports: web · images · videos · news · shopping · places
 */

import {
  SearchOptions,
  SearchType,
  SerperAPIResponse,
} from '../types/index.js';

const ENDPOINT_MAP: Record<SearchType, string> = {
  web: 'https://google.serper.dev/search',
  images: 'https://google.serper.dev/images',
  videos: 'https://google.serper.dev/videos',
  news: 'https://google.serper.dev/news',
  shopping: 'https://google.serper.dev/shopping',
  places: 'https://google.serper.dev/places',
};

export class SerperAPI {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(
    query: string,
    searchType: SearchType = 'web',
    options: Partial<SearchOptions> = {}
  ): Promise<SerperAPIResponse> {
    const url = ENDPOINT_MAP[searchType] ?? ENDPOINT_MAP.web;

    const body: Record<string, unknown> = {
      q: query,
      num: Math.min(options.num_results ?? 10, 20),
      gl: (options.country ?? 'US').toLowerCase(),
      hl: options.ui_lang ?? 'en',
      autocorrect: options.autocorrect ?? true,
    };

    if (options.freshness) body.tbs = `qdr:${options.freshness}`;
    if (options.safesearch === 'strict') body.safe = 'active';
    if (options.safesearch === 'off') body.safe = 'off';
    if (options.summary) body.summary = true;
    if (options.page && options.page > 1) body.page = options.page;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Serper API error ${response.status}: ${msg}`);
    }

    return response.json() as Promise<SerperAPIResponse>;
  }
}
