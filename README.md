# Serper Search MCP Server v2.0.1 - Enterprise Edition

🚀 **Enterprise-grade Google search MCP server** with **dual architecture**: JavaScript for integration + TypeScript for enterprise development.

👨‍💻 **Author:** SMJAHID from SMLabs01
📦 **NPM:** [`serper-search-mcp`](https://www.npmjs.com/package/serper-search-mcp)
🐳 **Docker:** [`smjahid/server-serper-search`](https://hub.docker.com/r/smjahid/server-serper-search)
🔧 **Architecture:** JavaScript (primary) + TypeScript (enterprise modular design)

---

## 🏗️ Dual Architecture Approach

This server provides **the best of both worlds**:

### **JavaScript Version (Primary)**
- **File:** `index.js` - Single file deployment
- **Transport:** Full HTTP/SSE + STDIO support
- **Integration:** Zero build process, immediate deployment
- **Use Case:** Kilo Code integration, simple deployment

### **TypeScript Version (Enterprise)**
- **Structure:** `src/` - Modular enterprise architecture
- **Features:** Type safety, better IDE support, team development
- **Build:** `npm run build` creates `dist/` folder
- **Use Case:** Large teams, maintainability, advanced development

## 🏗️ Enterprise Architecture
This server follows enterprise-grade patterns:

```
src/
├── api/
│   └── SerperAPI.ts          # Serper API client abstraction
├── tools/
│   └── SearchTools.ts        # Tool definitions and validation
├── utils/
│   └── ResultFormatter.ts    # Response formatting utilities
├── server/
│   └── SerperMCPServer.ts    # Main server implementation
├── types/
│   └── index.ts             # TypeScript type definitions
└── index.ts                 # Application entry point
```

## Features
- 🔍 **Multi-Type Search**: Web, Images, Videos, News, and Shopping search capabilities
- 🚀 **Multi-Transport**: STDIO (default) and HTTP/SSE transport modes
- 🌍 **Advanced Filtering**: Country, language, freshness, and content filters
- 🤖 **AI Summarization**: Generate summaries from search results
- 🐳 **Docker Support**: Multi-stage builds with smjahid namespace
- 📦 **NPM Package**: TypeScript with full CLI support
- ⚡ **Fast Results**: Optimized API client with error handling
- 🎯 **Structured Data**: Clean JSON responses perfect for AI processing
- 🔧 **Enterprise Ready**: Modular architecture for maintainability

## 🚀 Quick Start & Integration Guide

**🎯 Use JavaScript Version (`index.js`) for integration:**

```bash
# No build process required
node index.js --help

# HTTP transport ready
SERPER_MCP_TRANSPORT=http SERPER_MCP_PORT=8080 node index.js

# Docker integration
docker run -e SERPER_API_KEY=your_key smjahid/server-serper-search:2.0.0
```

**Why JavaScript for Integration:**
- ✅ **Zero configuration** - No build step needed
- ✅ **HTTP transport** - Full MCP SSE support
- ✅ **Simple deployment** - Single file execution
- ✅ **Standard approach** - Like other MCP servers

### For Enterprise Development (Optional)

**🏗️ Use TypeScript Version (`src/`) for development:**

```bash
# Build TypeScript
npm run build

# Use compiled version
node dist/index.js --help

# Enterprise benefits
# - Type safety and IntelliSense
# - Modular architecture
# - Better for large teams
```

## Installation & Setup

### Option 1: NPX (Recommended for Integration)

1. **Get your Serper API key** from [Serper.dev](https://serper.dev)

2. **Configure the MCP server** in your MCP settings:

```json
{
  "mcpServers": {
    "serper-search": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-serper-search"],
      "env": {
        "SERPER_API_KEY": "your_actual_api_key_here"
      }
    }
  }
}
```

3. **Restart your MCP client** 

### Option 2: Docker

1. **Pull from Docker Hub** (Recommended):
```bash
docker pull smjahid/server-serper-search:2.0.0
```

2. **Or build locally**:
```bash
docker build -t smjahid/server-serper-search:2.0.0 .
```

3. **Configure the MCP server**:
```json
{
  "mcpServers": {
    "serper-search": {
      "command": "docker",
      "args": [
        "run",
        "-i",
        "--rm",
        "-e",
        "SERPER_API_KEY=your_actual_api_key_here",
        "smjahid/server-serper-search:2.0.0"
      ]
    }
  }
}
```

### Option 2.1: Docker Compose (Development)

1. **Set your API key**:
```bash
export SERPER_API_KEY="your_actual_api_key_here"
```

2. **Start with Docker Compose**:
```bash
# Production mode
docker-compose up

# Development mode with hot reload
docker-compose --profile dev up
```

3. **Access the server** at `http://localhost:8080`

### Option 3: Local Installation

1. **Clone and install**:
```bash
git clone https://github.com/smjahid012/serper-search-mcp-server.git
cd server-serper-search
npm install
```

2. **Set environment variable**:
```bash
export SERPER_API_KEY="your_actual_api_key_here"
```

3. **Run locally**:
```bash
# STDIO mode (default)
npm start

# HTTP mode
npm run http

# Show help
npm run help
```

### Option 4: Command Line Interface

```bash
# Show all options
node index.js --help

# Run with custom options
node index.js --transport http --port 3000 --host 127.0.0.1

# Environment variables
SERPER_MCP_TRANSPORT=http SERPER_MCP_PORT=3000 node index.js
```

## Usage

Once configured, you can use the search tools in your MCP client:

### Available Tools:

#### 1. `search_web` - General Web Search
**Parameters:**
- `query` (required): The search query string (max 400 chars, 50 words)
- `num_results` (optional): Number of results to return (1-20, default: 10)
- `country` (optional): Country code (default: "US")
- `search_lang` (optional): Search language (default: "en")
- `ui_lang` (optional): UI language (default: "en-US")
- `freshness` (optional): Time filter ("pd", "pw", "pm", "py")
- `safesearch` (optional): Content filtering ("off", "moderate", "strict")
- `summary` (optional): Enable AI summarization (default: false)

**Example:**
```javascript
// Advanced search with filtering
await callTool("search_web", {
  query: "artificial intelligence recent news",
  num_results: 15,
  country: "US",
  freshness: "pw",  // Past week
  safesearch: "moderate",
  summary: true     // Get AI summary
});
```

#### 2. `search_images` - Image Search
**Parameters:**
- `query` (required): The image search query
- `num_results` (optional): Number of results to return (default: 10)

**Example:**
```javascript
// Search for AI-generated images
await callTool("search_images", {
  query: "artificial intelligence artwork",
  num_results: 8
});
```

#### 3. `search_videos` - Video Search
**Parameters:**
- `query` (required): The video search query
- `num_results` (optional): Number of results to return (default: 10)

**Example:**
```javascript
// Search for tutorial videos
await callTool("search_videos", {
  query: "machine learning tutorials",
  num_results: 5
});
```

#### 4. `search_news` - News Search
**Parameters:**
- `query` (required): The news search query
- `num_results` (optional): Number of results to return (default: 10)

**Example:**
```javascript
// Get latest AI news
await callTool("search_news", {
  query: "artificial intelligence breakthroughs 2024",
  num_results: 10
});
```

#### 5. `search_shopping` - Shopping/Product Search
**Parameters:**
- `query` (required): The shopping search query
- `num_results` (optional): Number of results to return (default: 10)

**Example:**
```javascript
// Search for products
await callTool("search_shopping", {
  query: "wireless headphones under $100",
  num_results: 5
});
```

## Configuration

### Environment Variables

The server supports the following environment variables:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `SERPER_API_KEY` | Your Serper API key | - | ✅ |
| `SERPER_MCP_TRANSPORT` | Transport mode | `stdio` | ❌ |
| `SERPER_MCP_PORT` | HTTP server port | `8080` | ❌ |
| `SERPER_MCP_HOST` | HTTP server host | `0.0.0.0` | ❌ |
| `SERPER_MCP_LOG_LEVEL` | Logging level | `info` | ❌ |

### Command Line Options

```bash
node index.js [options]

Options:
  --transport <stdio\|http>    Transport type (default: stdio)
  --port <number>             HTTP server port (default: 8080)
  --host <string>             HTTP server host (default: "0.0.0.0")
  --log-level <string>        Logging level (default: "info")
  --api-key <string>          Serper API key
  --help                      Show help message
```

## Search Capabilities

The server supports all major Google search types through the Serper API:

| Search Type | Use Case | Data Included |
|-------------|----------|---------------|
| **Web** | General research, content discovery | Title, URL, snippet, SEO data |
| **Images** | AI datasets, creative tools, visual research | Image URL, thumbnail, source page |
| **Videos** | Learning, entertainment, research | Title, channel, duration, thumbnail |
| **News** | Current events, trend monitoring | Headlines, sources, publication dates |
| **Shopping** | E-commerce, price comparison | Products, prices, ratings, sources |

## Usage Scenarios

With these comprehensive search capabilities, Serper MCP server can be used for:

### 🤖 **AI & Machine Learning**
- **Dataset Collection**: Gather images for training computer vision models
- **Research**: Find latest papers, tutorials, and educational videos
- **Content Generation**: Source diverse content for AI-generated materials

### 🔍 **Research & Analysis**
- **Market Research**: Track product prices, reviews, and competition
- **Trend Analysis**: Monitor news and social media for emerging trends
- **Competitive Intelligence**: Research competitor products and strategies

### 📈 **Business Intelligence**
- **Lead Generation**: Find business contact information and company data
- **Content Marketing**: Discover trending topics and viral content
- **SEO Research**: Analyze search results and ranking factors

### 🎨 **Creative Work**
- **Design Inspiration**: Search for visual references and creative assets
- **Media Research**: Find videos, images, and audio for projects
- **Content Curation**: Gather materials for blogs, presentations, and reports

### 💼 **E-commerce & Shopping**
- **Price Monitoring**: Track product prices across different retailers
- **Product Research**: Find detailed product information and reviews
- **Market Analysis**: Compare products and identify market gaps


## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
- GitHub Issues: [Report bugs](https://github.com/smjahid012/serper-search-mcp-server/issues)
- Serper API: [Get API key](https://serper.dev)

## 📋 Version History & Migration Guide

### v2.0.0 (Latest) - Enterprise Edition 🚀
**Release Date:** October 2024
**Author:** SMJAHID from SMLabs01

**🎯 New Features:**
- 🌐 **Multi-Transport Support**: HTTP/SSE + STDIO transport modes
- 🎛️ **Advanced Filtering**: Country, language, freshness, content filters
- 🤖 **AI Summarization**: Generate summaries from search results
- 🔧 **Command Line Interface**: Full CLI with help and options
- 🐳 **Docker Compose**: Development and production environments
- ⚙️ **Enhanced Configuration**: Environment variables and CLI options
- 📦 **Enterprise Architecture**: Modular TypeScript structure available

**🔧 Improvements:**
- 📊 **Parameter Validation**: Query length limits and input validation
- 🔍 **Enhanced Search Parameters**: Full Serper API feature support
- 📚 **Comprehensive Documentation**: Complete integration guide
- 🏗️ **Better Architecture**: Improved error handling and logging
- 🚀 **Performance Optimized**: Faster startup and response times

**📁 File Structure:**
```
JavaScript (Primary): index.js - Single file deployment
TypeScript (Enterprise): src/ (6 modules) - Modular architecture
```

**⬆️ Migration from v1.x:**
- ✅ **Backward Compatible**: All v1.x configurations work
- ✅ **Default Transport**: STDIO (same as v1.x)
- ✅ **New Features**: Opt-in via parameters
- ⚡ **No Breaking Changes**: Existing integrations continue working

### v1.1.0 - Multi-Type Search Expansion
**Added:** Images, Videos, News, Shopping search capabilities
**Enhanced:** Result formatting and documentation

### v1.0.0 - Initial Release
**Features:** Basic web search, Docker/NPX support, MCP compliance

---

## 📋 **v2.0.0 Integration Summary**

| Component | JavaScript Version | TypeScript Version | Agent Ready |
|-----------|-------------------|-------------------|----------------|
| **Primary Server** | ✅ `index.js` | ❌ `src/` (enterprise) | ✅ **JavaScript** |
| **Transport Support** | ✅ HTTP/SSE + STDIO | ✅ STDIO | ✅ **JavaScript** |
| **Build Required** | ❌ No | ✅ Yes (`npm run build`) | ✅ **JavaScript** |
| **Docker Hub** | ✅ `smjahid/server-serper-search` | ✅ Same | ✅ **Both** |
| **Enterprise Ready** | ❌ Simple | ✅ Modular structure | ✅ **TypeScript** |

---
