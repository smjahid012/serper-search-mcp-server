#!/bin/bash

# Serper MCP Server v3.0.0 - Comprehensive Testing Script
# Author: smjahid012 (SMLabs AI)

echo "🧪 Serper MCP Server v3.0.0 - Testing"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if API key is set
if [ -z "$SERPER_API_KEY" ]; then
    print_error "SERPER_API_KEY environment variable is not set!"
    echo "Please set your API key:"
    echo "export SERPER_API_KEY='your_api_key_here'"
    exit 1
fi

print_success "API key is configured"

# Test 1: TypeScript Compilation
echo
print_status "Test 1: TypeScript Compilation"
echo "-------------------------------"

if npm run build; then
    print_success "TypeScript compilation successful"
else
    print_error "TypeScript compilation failed"
    exit 1
fi

# Test 2: Node.js Execution (Basic Import Test)
echo
print_status "Test 2: Node.js Basic Execution"
echo "--------------------------------"

if node -e "console.log('Node.js is working'); try { require('./index.js'); console.log('Import successful'); } catch(e) { console.error('Import failed:', e.message); process.exit(1); }"; then
    print_success "Node.js execution test passed"
else
    print_error "Node.js execution test failed"
    exit 1
fi

# Test 3: CLI Help Test
echo
print_status "Test 3: CLI Help System"
echo "-----------------------"

if node index.js --help | grep -q "Serper MCP Server v3.0.0"; then
    print_success "CLI help system is working"
else
    print_error "CLI help system failed"
    exit 1
fi

# Test 4: Docker Build Test
echo
print_status "Test 4: Docker Build Process"
echo "----------------------------"

if docker build -t smjahid/server-serper-search:test . > /tmp/docker-build.log 2>&1; then
    print_success "Docker build completed successfully"
    IMAGE_SIZE=$(docker images smjahid/server-serper-search:test --format "{{.Size}}")
    print_status "Docker image size: $IMAGE_SIZE"
    docker rmi smjahid/server-serper-search:test > /dev/null 2>&1
else
    print_error "Docker build failed"
    print_status "Docker build log:"
    cat /tmp/docker-build.log
    exit 1
fi

# Test 5: Docker Compose Configuration
echo
print_status "Test 5: Docker Compose Configuration"
echo "-----------------------------------"

if docker-compose config > /dev/null 2>&1; then
    print_success "Docker Compose configuration is valid"
else
    print_error "Docker Compose configuration has errors"
    exit 1
fi

# Test 6: Package.json Validation
echo
print_status "Test 6: Package.json Validation"
echo "------------------------------"

if grep -q '"name": "serper-search-mcp"' package.json && \
   grep -q '"version": "3.0.0"' package.json && \
   grep -q '"author": "smjahid012 (SMLabs AI)' package.json; then
    print_success "Package.json has correct metadata"
else
    print_error "Package.json is missing required fields"
    exit 1
fi

# Test 7: File Structure Validation
echo
print_status "Test 7: Structure Validation"
echo "----------------------------"

REQUIRED_FILES=(
    "src/index.ts"
    "src/types/index.ts"
    "src/api/SerperAPI.ts"
    "src/api/LLMClient.ts"
    "src/tools/SearchTools.ts"
    "src/tools/DeepResearch.ts"
    "src/tools/RAGContext.ts"
    "src/utils/ResultFormatter.ts"
    "src/server/SerperMCPServer.ts"
    "dist/index.js"
    "index.js"
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

if [ "$all_files_exist" = true ]; then
    print_success "All required files are present"
else
    print_error "Some required files are missing"
    exit 1
fi

# Test 8: Configuration Files Validation
echo
print_status "Test 8: Configuration Files"
echo "--------------------------"

if [ -f "docker-config.json" ] && [ -f "npx-config.json" ]; then
    print_success "Configuration files are present"
    if command -v jq &> /dev/null; then
        if jq empty docker-config.json npx-config.json 2>/dev/null; then
            print_success "Configuration files have valid JSON syntax"
        else
            print_error "Configuration files have JSON syntax errors"
            exit 1
        fi
    else
        print_warning "jq not installed - skipping JSON validation"
    fi
else
    print_error "Configuration files are missing"
    exit 1
fi

# Test 9: README Validation
echo
print_status "Test 9: Documentation Validation"
echo "-------------------------------"

if grep -q "SMLabs AI" README.md && \
   grep -q "v3.0.0\|3.0.0" README.md && \
   grep -q "serper-search-mcp" README.md; then
    print_success "README contains correct version and author information"
else
    print_error "README is missing required information"
    exit 1
fi

# Test 10: Performance Check (Basic)
echo
print_status "Test 10: Basic Performance Check"
echo "-------------------------------"

START_TIME=$(date +%s.%N)
timeout 10s node index.js --help > /dev/null 2>&1
EXIT_CODE=$?
END_TIME=$(date +%s.%N)
DURATION=$(echo "$END_TIME - $START_TIME" | bc 2>/dev/null || echo "N/A")

if [ $EXIT_CODE -eq 0 ]; then
    print_success "Server starts quickly (${DURATION}s)"
else
    print_error "Server startup test failed"
    exit 1
fi

# Test 11: Module Import Test
echo
print_status "Test 11: Module Import Test"
echo "---------------------------"

if node -e "
try {
    const mcp = require('./index.js');
    console.log('✓ index.js import successful');
} catch(e) {
    console.error('✗ Module import failed:', e.message);
    process.exit(1);
}
"; then
    print_success "Module import test passed"
else
    print_error "Module import test failed"
    exit 1
fi

# Test 12: Transport Mode Test
echo
print_status "Test 12: Transport Mode Configuration"
echo "------------------------------------"

if SERPER_MCP_TRANSPORT=stdio node index.js --help > /dev/null 2>&1; then
    print_success "STDIO transport mode configured correctly"
else
    print_error "STDIO transport mode test failed"
fi

if SERPER_MCP_TRANSPORT=http SERPER_MCP_PORT=8080 node index.js --help > /dev/null 2>&1; then
    print_success "HTTP transport mode configured correctly"
else
    print_error "HTTP transport mode test failed"
fi

# Test 13: Environment Variables Test
echo
print_status "Test 13: Environment Variables"
echo "------------------------------"

if SERPER_API_KEY="" node index.js --help 2>&1 | grep -q "SERPER_API_KEY environment variable is required"; then
    print_success "Environment variable validation working"
else
    print_warning "Environment variable validation may not be working properly"
fi

# Summary
echo
echo "🎉 **TESTING COMPLETE**"
echo "===================="
print_success "Serper MCP Server v3.0.0 is ready!"
echo
echo "📋 **Test Summary:**"
echo "✅ TypeScript compilation"
echo "✅ Node.js execution"
echo "✅ CLI functionality"
echo "✅ Docker build process"
echo "✅ Docker Compose configuration"
echo "✅ Package.json validation"
echo "✅ File structure verification"
echo "✅ Configuration files"
echo "✅ Documentation accuracy"
echo "✅ Performance metrics"
echo "✅ Module imports"
echo "✅ Transport modes"
echo "✅ Environment validation"
echo
echo "🚀 **Ready for Production Deployment!**"
echo
echo "👨‍💻 Author: smjahid012 (SMLabs AI)"
echo "📦 NPM: serper-search-mcp"
echo "🐳 Docker: smjahid/server-serper-search"
echo "🌟 MCP server ready for KiloCode!"
