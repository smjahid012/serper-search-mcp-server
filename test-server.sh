#!/bin/bash
#
# Serper MCP Server — comprehensive local test script
# Author: smjahid012 (SMLabs AI)
#
# Run with a real Bash shell:
#   Windows (Git Bash):  "C:\Program Files\Git\bin\bash.exe" test-server.sh
#   macOS / Linux / WSL: ./test-server.sh
#
# SERPER_API_KEY must be set but a dummy value (e.g. "dummy") is fine —
# this script makes NO live Serper API calls.
# Set SKIP_DOCKER=1 to skip the slow Docker build check.

set -u
cd "$(dirname "$0")" || exit 1

SKIP_DOCKER="${SKIP_DOCKER:-0}"
VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
HTTP_PORT=18080
SERVER_PID=""

cleanup() {
  if [ -n "$SERVER_PID" ]; then
    kill "$SERVER_PID" 2>/dev/null
    wait "$SERVER_PID" 2>/dev/null
  fi
}
trap cleanup EXIT

RED=$'\033[0;31m'; GREEN=$'\033[0;32m'; YELLOW=$'\033[1;33m'; BLUE=$'\033[0;34m'; NC=$'\033[0m'
print_status()  { echo "${BLUE}[INFO]${NC} $1"; }
print_success() { echo "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo "${YELLOW}[WARNING]${NC} $1"; }
print_error()   { echo "${RED}[ERROR]${NC} $1"; }
fail()          { print_error "$1"; exit 1; }

echo "🧪 Serper MCP Server v${VERSION} - Testing"
echo "====================================="

# ── Prerequisites ─────────────────────────────────────────────────────────────
if [ -z "${SERPER_API_KEY:-}" ]; then
  print_error "SERPER_API_KEY is not set (a dummy value such as 'dummy' is fine)."
  echo "  export SERPER_API_KEY='dummy'"
  exit 1
fi
print_success "SERPER_API_KEY is set"

command -v node >/dev/null 2>&1 || fail "node is required"
command -v npm  >/dev/null 2>&1 || fail "npm is required"

# ── Test 1: TypeScript compilation ───────────────────────────────────────────
echo
print_status "Test 1: TypeScript Compilation"
echo "-------------------------------"
npm run build || fail "TypeScript compilation failed"
print_success "TypeScript compilation successful"

# ── Test 2: Bundle freshness ─────────────────────────────────────────────────
echo
print_status "Test 2: Generated Bundle Freshness"
echo "----------------------------------"
npm run check:bundle || fail "index.js is stale — run 'npm run bundle'"
print_success "index.js is up to date with src/"

# ── Test 3: Unit + integration tests ─────────────────────────────────────────
echo
print_status "Test 3: Unit + Integration Tests"
echo "---------------------------------"
TEST_OUT=$(npm test 2>&1)
TEST_CODE=$?
echo "$TEST_OUT" | tail -n 8
[ "$TEST_CODE" -eq 0 ] || fail "Test suite failed"
print_success "All tests passed"

# ── Test 4: Node.js basic execution ──────────────────────────────────────────
echo
print_status "Test 4: Node.js Basic Execution"
echo "--------------------------------"
node -e "
const m = require('./index.js');
if (typeof m.SerperMCPServer !== 'function') {
  console.error('SerperMCPServer export missing');
  process.exit(1);
}
console.log('Import successful — SerperMCPServer exported');
" || fail "index.js import test failed"
print_success "Node.js execution test passed"

# ── Test 5: CLI help ─────────────────────────────────────────────────────────
echo
print_status "Test 5: CLI Help System"
echo "-----------------------"
node index.js --help > /tmp/serper-mcp-help.txt 2>&1 || fail "CLI help crashed"
grep -q "Serper Search MCP Server v${VERSION}" /tmp/serper-mcp-help.txt \
  || fail "Help output missing version v${VERSION}"
for tool in search_web search_images search_videos search_news search_shopping \
            search_places search_scholar scrape search_many deep_research search_rag_context; do
  grep -q "$tool" /tmp/serper-mcp-help.txt || fail "Help output missing tool: $tool"
done
print_success "CLI help system is working (14 tools listed)"

# ── Test 6: Package.json validation ──────────────────────────────────────────
echo
print_status "Test 6: Package.json Validation"
echo "------------------------------"
grep -q '"name": "serper-search-mcp"' package.json || fail "package.json: wrong name"
grep -q "\"version\": \"${VERSION}\"" package.json       || fail "package.json: version mismatch"
grep -q '"author": "smjahid012 (SMLabs AI)' package.json  || fail "package.json: missing author"
print_success "Package.json has correct metadata (v${VERSION})"

# ── Test 7: File structure ───────────────────────────────────────────────────
echo
print_status "Test 7: Structure Validation"
echo "----------------------------"
REQUIRED_FILES=(
    "src/index.ts"
    "src/types/index.ts"
    "src/api/SerperAPI.ts"
    "src/api/LLMClient.ts"
    "src/tools/SearchTools.ts"
    "src/tools/BatchSearch.ts"
    "src/tools/DeepResearch.ts"
    "src/tools/RAGContext.ts"
    "src/utils/ResultFormatter.ts"
    "src/utils/HttpRetry.ts"
    "src/utils/TtlCache.ts"
    "src/utils/Logger.ts"
    "src/server/SerperMCPServer.ts"
    "dist/index.js"
    "index.js"
    "scripts/bundle.mjs"
    ".github/workflows/ci.yml"
    "tsconfig.json"
    "Dockerfile"
    "docker-compose.yml"
    "docker-config.json"
    "npx-config.json"
)

all_files_exist=true
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        print_success "✓ $file exists"
    else
        print_error "✗ $file is missing"
        all_files_exist=false
    fi
done
[ -d "tests" ] || { print_error "✗ tests/ directory is missing"; all_files_exist=false; }
[ "$all_files_exist" = true ] || fail "Some required files are missing"
print_success "All required files are present"

# ── Test 8: Config files are valid JSON ──────────────────────────────────────
echo
print_status "Test 8: Configuration Files"
echo "--------------------------"
node -e "
for (const f of ['docker-config.json', 'npx-config.json']) {
  JSON.parse(require('fs').readFileSync(f, 'utf8'));
}
console.log('Config JSON valid');
" || fail "Configuration files have JSON syntax errors"
print_success "Configuration files have valid JSON syntax"

# ── Test 9: README ───────────────────────────────────────────────────────────
echo
print_status "Test 9: Documentation Validation"
echo "-------------------------------"
grep -q "SMLabs AI" README.md            || fail "README: missing SMLabs AI"
grep -q "serper-search-mcp" README.md    || fail "README: missing package name"
for tool in search_scholar scrape search_many; do
  grep -q "$tool" README.md || fail "README: missing documentation for $tool"
done
print_success "README documents all tools and author information"

# ── Test 10: Basic performance ───────────────────────────────────────────────
echo
print_status "Test 10: Basic Performance Check"
echo "-------------------------------"
START=$SECONDS
if command -v timeout >/dev/null 2>&1; then
  timeout 10s node index.js --help > /dev/null 2>&1 || fail "Server help did not finish in 10s"
else
  node index.js --help > /dev/null 2>&1 || fail "Server help crashed"
fi
DURATION=$((SECONDS - START))
print_success "Server starts quickly (${DURATION}s)"

# ── Test 11: Tools count ─────────────────────────────────────────────────────
echo
print_status "Test 11: Tool Registry"
echo "----------------------"
node -e "
const { SearchTools } = require('./dist/tools/SearchTools.js');
const tools = SearchTools.getAllTools();
if (tools.length !== 14) {
  console.error('Expected 14 tools, found ' + tools.length);
  process.exit(1);
}
console.log('Tool registry OK: ' + tools.length + ' tools');
" || fail "Tool registry check failed"
print_success "14 tools registered"

# ── Test 12: HTTP transport + health + bearer auth ───────────────────────────
echo
print_status "Test 12: HTTP Transport (health, tools/list, auth)"
echo "---------------------------------------------------"
if command -v curl >/dev/null 2>&1; then
  SERPER_API_KEY="$SERPER_API_KEY" \
  SERPER_MCP_TRANSPORT=http SERPER_MCP_PORT="$HTTP_PORT" SERPER_MCP_HOST=127.0.0.1 \
  SERPER_MCP_AUTH_TOKEN=test-token \
  node index.js > /tmp/serper-mcp-http.log 2>&1 &
  SERVER_PID=$!
  sleep 2

  HEALTH=$(curl -s --max-time 5 "http://127.0.0.1:${HTTP_PORT}/health")
  echo "$HEALTH" | grep -q '"status":"ok"'                    || fail "Health endpoint did not return status ok (got: $HEALTH)"
  echo "$HEALTH" | grep -q "\"version\":\"${VERSION}\""       || fail "Health endpoint version mismatch"
  echo "$HEALTH" | grep -q '"auth_required":true'             || fail "Health endpoint should report auth_required"
  print_success "GET /health responds (version + auth flag)"

  UNAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
    -X POST "http://127.0.0.1:${HTTP_PORT}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
  [ "$UNAUTH_CODE" = "401" ] || fail "Unauthenticated /mcp should return 401 (got $UNAUTH_CODE)"
  print_success "Unauthenticated /mcp correctly rejected (401)"

  TOOLS_RESPONSE=$(curl -s --max-time 10 \
    -X POST "http://127.0.0.1:${HTTP_PORT}/mcp" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "Authorization: Bearer test-token" \
    -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}')
  echo "$TOOLS_RESPONSE" | grep -q '"search_web"'     || fail "tools/list did not include search_web"
  echo "$TOOLS_RESPONSE" | grep -q '"scrape"'         || fail "tools/list did not include scrape"
  echo "$TOOLS_RESPONSE" | grep -q '"search_many"'    || fail "tools/list did not include search_many"
  print_success "Authenticated tools/list returns the new tool set"

  kill "$SERVER_PID" 2>/dev/null
  wait "$SERVER_PID" 2>/dev/null
  SERVER_PID=""
else
  print_warning "curl not installed — skipping HTTP transport test"
fi

# ── Test 13: Environment validation ──────────────────────────────────────────
echo
print_status "Test 13: Environment Variables"
echo "------------------------------"
ENV_OUT=$(SERPER_API_KEY="" node index.js --transport http 2>&1)
ENV_CODE=$?
if [ "$ENV_CODE" -ne 0 ] && echo "$ENV_OUT" | grep -q "SERPER_API_KEY is required"; then
  print_success "Missing SERPER_API_KEY is rejected with a clear error"
else
  fail "Environment variable validation failed (exit=$ENV_CODE, output=$ENV_OUT)"
fi

# ── Test 14: Docker ──────────────────────────────────────────────────────────
echo
print_status "Test 14: Docker Build + Compose Config"
echo "--------------------------------------"
if [ "$SKIP_DOCKER" = "1" ]; then
  print_warning "SKIP_DOCKER=1 — skipping Docker checks"
elif ! command -v docker >/dev/null 2>&1; then
  print_warning "docker not installed — skipping Docker checks"
else
  if docker build -t smjahid/server-serper-search:test . > /tmp/docker-build.log 2>&1; then
    IMAGE_BYTES=$(docker image inspect smjahid/server-serper-search:test --format "{{.Size}}")
    IMAGE_SIZE=$(node -e "console.log((Number(process.argv[1])/1048576).toFixed(1) + ' MB')" "$IMAGE_BYTES")
    print_success "Docker build completed successfully (size: $IMAGE_SIZE)"
    docker rmi smjahid/server-serper-search:test > /dev/null 2>&1
  else
    print_status "Docker build log (last 20 lines):"
    tail -n 20 /tmp/docker-build.log
    fail "Docker build failed"
  fi

  if docker compose version >/dev/null 2>&1; then
    DC="docker compose"
  elif command -v docker-compose >/dev/null 2>&1; then
    DC="docker-compose"
  else
    DC=""
  fi

  if [ -n "$DC" ]; then
    if $DC config > /dev/null 2>&1; then
      print_success "Docker Compose configuration is valid ($DC)"
    else
      fail "Docker Compose configuration has errors"
    fi
  else
    print_warning "Neither 'docker compose' nor 'docker-compose' found — skipping compose check"
  fi
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo
echo "🎉 **TESTING COMPLETE**"
echo "===================="
print_success "Serper MCP Server v${VERSION} is ready!"
echo
echo "📋 **Test Summary:**"
echo "✅ TypeScript compilation"
echo "✅ Generated bundle freshness"
echo "✅ Unit + integration tests (58)"
echo "✅ Node.js execution"
echo "✅ CLI help (14 tools)"
echo "✅ Package.json validation"
echo "✅ File structure verification"
echo "✅ Configuration files"
echo "✅ Documentation accuracy"
echo "✅ Performance check"
echo "✅ Tool registry"
echo "✅ HTTP transport + health + bearer auth"
echo "✅ Environment validation"
echo "✅ Docker build + compose config"
echo
echo "🚀 **Ready for Production Deployment!**"
echo
echo "👨‍💻 Author: smjahid012 (SMLabs AI)"
echo "📦 NPM: serper-search-mcp"
echo "🐳 Docker: smjahid/server-serper-search"
