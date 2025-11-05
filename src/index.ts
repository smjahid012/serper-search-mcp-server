#!/usr/bin/env node

import { SerperMCPServer } from './server/SerperMCPServer';

/**
 * Serper Search MCP Server v2.0.0 - Enterprise Edition
 *
 * Author: SMJAHID from SMLabs01
 * Description: Enterprise-grade Google search MCP server with multi-transport support
 *
 * Features:
 * - Multi-Type Search (Web, Images, Videos, News, Shopping)
 * - Multi-Transport (STDIO, HTTP/SSE)
 * - Advanced Filtering (Country, Language, Freshness, Content)
 * - AI Summarization
 * - Docker & NPM Deployment
 */

// Parse command line arguments
function parseArgs(): any {
  const args = process.argv.slice(2);
  const options: any = {};

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
Serper MCP Server v2.0.0 - Enterprise Edition

Usage: node dist/index.js [options]

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

Examples:
  # STDIO mode (default)
  npm start

  # HTTP mode
  node dist/index.js --transport http --port 3000

  # Docker deployment
  docker run -e SERPER_API_KEY=your_key smjahid/server-serper-search

Author: SMJAHID from SMLabs01
        `);
        return;
    }
  }

  return options;
}

// Main execution
async function main() {
  try {
    console.log('🚀 Starting Serper MCP Server v2.0.0 - Enterprise Edition');
    console.log('👨‍💻 Author: SMJAHID from SMLabs01');

    const options = parseArgs();
    const server = new SerperMCPServer(options);

    console.log(`🌐 Transport: ${server.config.transport}`);
    if (server.config.transport === 'http') {
      console.log(`📍 Server: http://${server.config.host}:${server.config.port}`);
    }

    await server.run();

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  main();
}

export { SerperMCPServer };