/**
 * Type definitions for Serper MCP Server v2.0.0 - Enterprise Edition
 * Author: SMJAHID from SMLabs01
 */

export interface SearchOptions {
  query: string;
  num_results?: number;
  country?: string;
  search_lang?: string;
  ui_lang?: string;
  freshness?: 'pd' | 'pw' | 'pm' | 'py';
  safesearch?: 'off' | 'moderate' | 'strict';
  summary?: boolean;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet?: string;
  imageUrl?: string;
  source?: string;
  channel?: string;
  duration?: string;
  date?: string;
  price?: string;
  rating?: string;
}

export interface SerperAPIResponse {
  searchParameters?: {
    q: string;
    [key: string]: any;
  };
  organic?: SearchResult[];
  images?: SearchResult[];
  videos?: SearchResult[];
  news?: SearchResult[];
  shopping?: SearchResult[];
  [key: string]: any;
}

export interface ServerConfig {
  apiKey: string;
  transport: 'stdio' | 'http';
  port: number;
  host: string;
  logLevel: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
}

export type SearchType = 'web' | 'images' | 'videos' | 'news' | 'shopping';

export interface Transport {
  run(): Promise<void>;
}