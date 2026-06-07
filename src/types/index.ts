/**
 * Type definitions for Serper Search MCP Server
 * SMLabs AI — https://smlabsai.com
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
  page?: number;
  autocorrect?: boolean;
}

// ── Web / Organic ────────────────────────────────────────────────────────────

export interface OrganicResult {
  title: string;
  link: string;
  snippet?: string;
  position?: number;
  date?: string;
  attributes?: Record<string, string>;
  sitelinks?: Array<{ title: string; link: string }>;
}

export interface KnowledgeGraph {
  title?: string;
  type?: string;
  description?: string;
  imageUrl?: string;
  attributes?: Record<string, string>;
  website?: string;
  rating?: number;
  reviewsCount?: number;
}

export interface PeopleAlsoAsk {
  question: string;
  snippet: string;
  link: string;
}

export interface AnswerBox {
  snippet?: string;
  snippetHighlighted?: string[];
  title?: string;
  link?: string;
}

// ── Media result types ───────────────────────────────────────────────────────

export interface ImageResult {
  title: string;
  imageUrl: string;
  imageWidth?: number;
  imageHeight?: number;
  thumbnailUrl?: string;
  source?: string;
  domain?: string;
  link?: string;
  position?: number;
}

export interface VideoResult {
  title: string;
  link?: string;
  snippet?: string;
  imageUrl?: string;
  duration?: string;
  source?: string;
  channel?: string;
  date?: string;
  position?: number;
}

export interface NewsResult {
  title: string;
  link: string;
  snippet?: string;
  date?: string;
  source?: string;
  imageUrl?: string;
  position?: number;
}

export interface ShoppingResult {
  title: string;
  source?: string;
  link?: string;
  price?: string;
  delivery?: string;
  imageUrl?: string;
  rating?: number;
  ratingCount?: number;
  position?: number;
  offers?: string;
}

export interface PlaceResult {
  title: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  openingHours?: string[];
  position?: number;
}

// ── Full API response ────────────────────────────────────────────────────────

export interface SerperAPIResponse {
  searchParameters?: {
    q: string;
    gl?: string;
    hl?: string;
    num?: number;
    type?: string;
    [key: string]: unknown;
  };
  answerBox?: AnswerBox;
  knowledgeGraph?: KnowledgeGraph;
  organic?: OrganicResult[];
  peopleAlsoAsk?: PeopleAlsoAsk[];
  relatedSearches?: Array<{ query: string }>;
  images?: ImageResult[];
  videos?: VideoResult[];
  news?: NewsResult[];
  shopping?: ShoppingResult[];
  places?: PlaceResult[];
  credits?: number;
}

// ── Server config ────────────────────────────────────────────────────────────

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
    properties: Record<string, unknown>;
    required: string[];
  };
}

export type SearchType = 'web' | 'images' | 'videos' | 'news' | 'shopping' | 'places';
