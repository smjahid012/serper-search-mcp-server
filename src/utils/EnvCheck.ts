/**
 * Boot-time env validation — SMLabs AI
 *
 * Typo protection: the server silently falls back to defaults for mistyped
 * env vars (e.g. SERPER_TIMEOOUT_MS). validateEnv() surfaces those at boot
 * as warnings — never fatal, so existing deployments keep working.
 * Only SERPER_ and SEARCH_ namespaces are scanned (our documented surface).
 */

const KNOWN_ENV = new Set([
  // server
  'SERPER_API_KEY', 'SERPER_MCP_TRANSPORT', 'SERPER_MCP_PORT', 'SERPER_MCP_HOST',
  'SERPER_MCP_AUTH_TOKEN', 'SERPER_MCP_LOG_LEVEL',
  // tuning (read lazily via numberFromEnv)
  'SERPER_CACHE_TTL_MS', 'SERPER_CACHE_MAX', 'SERPER_TIMEOUT_MS', 'SERPER_RETRIES',
  'SERPER_RETRY_BASE_MS', 'SERPER_LLM_TIMEOUT_MS', 'SERPER_LLM_RETRIES',
  // provider routing
  'SEARCH_PROVIDER_ORDER', 'SEARCH_FALLBACK',
]);

const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'silent'];
const PROVIDER_NAMES = ['serper', 'tavily', 'brave', 'exa', 'firecrawl'];

/** Unknown SERPER_ or SEARCH_ keys (likely typos). Pure — inject env in tests. */
export function findUnknownEnvKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  return Object.keys(env)
    .filter((key) => /^(SERPER|SEARCH)_/.test(key) && !KNOWN_ENV.has(key))
    .sort();
}

/**
 * Returns human-readable warnings for: unknown keys, invalid transport,
 * invalid log level, invalid port, and provider-order entries that
 * providerOrderFromEnv() would silently drop.
 */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];

  for (const key of findUnknownEnvKeys(env)) {
    warnings.push(`Unknown env var ${key} will be ignored (possible typo — see --help for the full list)`);
  }

  const transport = env.SERPER_MCP_TRANSPORT;
  if (transport && !['stdio', 'http'].includes(transport)) {
    warnings.push(`SERPER_MCP_TRANSPORT must be stdio|http (got "${transport}") — falling back to stdio`);
  }

  const level = env.SERPER_MCP_LOG_LEVEL;
  if (level && !LOG_LEVELS.includes(level.toLowerCase())) {
    warnings.push(`SERPER_MCP_LOG_LEVEL must be ${LOG_LEVELS.join('|')} (got "${level}") — falling back to info`);
  }

  const port = env.SERPER_MCP_PORT;
  if (port !== undefined && port !== '' && !(Number.isInteger(Number(port)) && Number(port) > 0 && Number(port) <= 65535)) {
    warnings.push(`SERPER_MCP_PORT must be an integer 1-65535 (got "${port}") — falling back to 8080`);
  }

  const order = env.SEARCH_PROVIDER_ORDER;
  if (order) {
    const dropped = order.split(',').map((s) => s.trim()).filter((s) => s && !PROVIDER_NAMES.includes(s));
    if (dropped.length) {
      warnings.push(`SEARCH_PROVIDER_ORDER contains unknown provider(s): ${dropped.join(', ')} (valid: ${PROVIDER_NAMES.join(',')}) — they will be dropped from the failover chain`);
    }
  }

  return warnings;
}