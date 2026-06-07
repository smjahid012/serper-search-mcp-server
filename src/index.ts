#!/usr/bin/env node
/**
 * Entry point — Serper Search MCP Server
 * SMLabs AI · github.com/smjahid012/serper-search-mcp-server
 */

import { SerperMCPServer } from './server/SerperMCPServer.js';

function parseArgs(): Record<string, string> {
  const argv = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1] ?? 'true';
      i++;
    }
  }
  return out;
}

async function main() {
  const flags = parseArgs();

  if ('help' in flags) {
    console.log(`
Serper Search MCP Server v3.0.0 — SMLabs AI

Usage:
  npx serper-search-mcp [options]

Options:
  --api-key <key>          Serper API key (or set SERPER_API_KEY env)
  --transport <stdio|http> Transport mode (default: stdio)
  --port <number>          HTTP port (default: 8080)
  --host <string>          HTTP host (default: 0.0.0.0)
  --help                   Show this help

Environment variables:
  SERPER_API_KEY           Required — get one free at https://serper.dev
  SERPER_MCP_TRANSPORT     stdio | http
  SERPER_MCP_PORT          HTTP port
  SERPER_MCP_HOST          HTTP host

Tools provided:
  search_web         Google web search with Knowledge Graph + Answer Box
  search_images      Google Image search
  search_videos      Google Video search
  search_news        Google News search
  search_shopping    Google Shopping search
  search_places      Google Places / Maps search (NEW in v3)
  deep_research      Multi-step research: sub-queries, parallel search, LLM report
  search_rag_context Clean chunked text + metadata for RAG/embedding pipelines
`);
    process.exit(0);
  }

  try {
    const server = new SerperMCPServer({
      apiKey: flags['api-key'],
      transport: flags['transport'] as 'stdio' | 'http',
      port: flags['port'] ? parseInt(flags['port'], 10) : undefined,
      host: flags['host'],
    });
    await server.run();
  } catch (err) {
    console.error('Fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

main();
