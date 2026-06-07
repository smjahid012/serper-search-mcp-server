/**
 * RAG Context Tool — search_rag_context
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 *
 * Returns search results as clean, chunked, metadata-rich text
 * optimized for embedding pipelines and vector databases.
 * No LLM required — pure formatting.
 */

import { SerperAPI } from '../api/SerperAPI.js';
import { OrganicResult, SerperAPIResponse } from '../types/index.js';

export interface RAGChunk {
  chunk_index: number;
  source_index: number;
  title: string;
  url: string;
  domain: string;
  date: string | null;
  text: string;
  word_count: number;
  char_count: number;
}

export interface RAGContextResult {
  query: string;
  total_sources: number;
  total_chunks: number;
  total_words: number;
  chunks: RAGChunk[];
}

// ── Text cleaning ─────────────────────────────────────────────────────────────

function cleanText(raw: string): string {
  return raw
    .replace(/\*\*|__|~~|\[|\]|\(.*?\)/g, '')   // strip markdown
    .replace(/<[^>]+>/g, '')                      // strip HTML tags
    .replace(/https?:\/\/\S+/g, '')               // strip URLs inline
    .replace(/\s{2,}/g, ' ')                      // collapse whitespace
    .trim();
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

// ── Chunk builder ─────────────────────────────────────────────────────────────

function buildChunks(
  results: OrganicResult[],
  maxChunkWords: number,
  includeSnippet: boolean
): RAGChunk[] {
  const chunks: RAGChunk[] = [];
  let chunkIndex = 0;

  for (let si = 0; si < results.length; si++) {
    const r = results[si];
    if (!r.title && !r.snippet) continue;

    // Combine title + snippet into one text block
    const parts: string[] = [];
    parts.push(cleanText(r.title));
    if (includeSnippet && r.snippet) {
      parts.push(cleanText(r.snippet));
    }

    const fullText = parts.join(' ').trim();
    if (!fullText) continue;

    const words = fullText.split(/\s+/);

    // Split into chunks if text exceeds maxChunkWords
    for (let start = 0; start < words.length; start += maxChunkWords) {
      const slice = words.slice(start, start + maxChunkWords).join(' ');
      chunks.push({
        chunk_index:  chunkIndex++,
        source_index: si + 1,
        title:        r.title,
        url:          r.link,
        domain:       extractDomain(r.link),
        date:         r.date ?? null,
        text:         slice,
        word_count:   slice.split(/\s+/).length,
        char_count:   slice.length,
      });
    }
  }

  return chunks;
}

// ── People Also Ask as extra context ─────────────────────────────────────────

function paaChunks(data: SerperAPIResponse, startIndex: number): RAGChunk[] {
  if (!data.peopleAlsoAsk?.length) return [];

  return data.peopleAlsoAsk.slice(0, 4).map((paa, i) => {
    const text = `Q: ${paa.question} A: ${cleanText(paa.snippet)}`;
    return {
      chunk_index:  startIndex + i,
      source_index: 0,              // 0 = PAA, not an organic result
      title:        paa.question,
      url:          paa.link,
      domain:       extractDomain(paa.link),
      date:         null,
      text,
      word_count:   text.split(/\s+/).length,
      char_count:   text.length,
    };
  });
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function buildRAGContext(
  query: string,
  options: {
    num_results?: number;
    country?: string;
    freshness?: 'pd' | 'pw' | 'pm' | 'py';
    max_chunk_words?: number;
    include_paa?: boolean;
    output_format?: 'json' | 'text';
  },
  api: SerperAPI
): Promise<string> {
  const {
    num_results    = 10,
    country        = 'US',
    freshness,
    max_chunk_words = 200,
    include_paa     = true,
    output_format   = 'json',
  } = options;

  const data = await api.search(query, 'web', { num_results, country, freshness, autocorrect: true });
  const organic = data.organic ?? [];

  const mainChunks = buildChunks(organic, max_chunk_words, true);
  const paa        = include_paa ? paaChunks(data, mainChunks.length) : [];
  const allChunks  = [...mainChunks, ...paa];

  const totalWords = allChunks.reduce((sum, c) => sum + c.word_count, 0);

  const result: RAGContextResult = {
    query,
    total_sources: organic.length,
    total_chunks:  allChunks.length,
    total_words:   totalWords,
    chunks:        allChunks,
  };

  if (output_format === 'text') {
    // Plain text format — one chunk per block, easy to paste into a prompt
    const lines: string[] = [
      `# RAG Context: "${query}"`,
      `Sources: ${result.total_sources} | Chunks: ${result.total_chunks} | Words: ${result.total_words}`,
      '',
    ];
    for (const c of allChunks) {
      lines.push(`--- Chunk ${c.chunk_index + 1} | Source ${c.source_index || 'PAA'} | ${c.domain}${c.date ? ` | ${c.date}` : ''} ---`);
      lines.push(`Title: ${c.title}`);
      lines.push(`URL: ${c.url}`);
      lines.push(c.text);
      lines.push('');
    }
    return lines.join('\n');
  }

  // JSON format — structured for vector DB ingestion
  return JSON.stringify(result, null, 2);
}
