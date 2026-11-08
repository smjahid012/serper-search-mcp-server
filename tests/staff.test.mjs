/**
 * Staff-hardening tests — errors, metrics, env validation, requestId, router edges.
 * Run: npm test  (builds first, then runs against dist/)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError, AuthError, ProviderError } from '../dist/utils/errors.js';
import { increment, snapshot, resetMetrics } from '../dist/utils/Metrics.js';
import { validateEnv, findUnknownEnvKeys } from '../dist/utils/EnvCheck.js';
import { setRequestId, getRequestId, logger, setLogLevel } from '../dist/utils/Logger.js';
import { SearchTools } from '../dist/tools/SearchTools.js';
import { SerperAPI } from '../dist/api/SerperAPI.js';
import { ProviderRouter } from '../dist/api/providers/Router.js';

const okJson = (data) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

describe('Error hierarchy', () => {
  it('ValidationError is an Error with a stable name', () => {
    const err = new ValidationError('bad input');
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ValidationError');
    assert.equal(err.message, 'bad input');
  });

  it('AuthError is an Error with a stable name', () => {
    const err = new AuthError('missing key');
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'AuthError');
  });

  it('ProviderError carries provider + status + cause', () => {
    const cause = new Error('root');
    const err = new ProviderError('upstream failed', { provider: 'tavily', status: 429, cause });
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'ProviderError');
    assert.equal(err.provider, 'tavily');
    assert.equal(err.status, 429);
    assert.equal(err.cause, cause);
  });

  it('validateArgs throws ValidationError (not plain Error)', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', {}), ValidationError);
    assert.throws(() => SearchTools.validateArgs('search_web', { query: '' }), ValidationError);
    assert.throws(() => SearchTools.validateArgs('scrape', { url: 'notaurl' }), ValidationError);
  });
});

describe('Metrics', () => {
  it('increments, snapshots immutably, and resets', () => {
    resetMetrics();
    increment('cache_hits');
    increment('cache_hits');
    increment('failover_events');
    const snap = snapshot();
    assert.equal(snap.cache_hits, 2);
    assert.equal(snap.failover_events, 1);
    assert.equal(snap.cache_misses, 0);

    snap.cache_hits = 999; // mutating the snapshot must NOT touch live counters
    assert.equal(snapshot().cache_hits, 2);

    resetMetrics();
    assert.equal(snapshot().cache_hits, 0);
    assert.equal(snapshot().failover_events, 0);
  });

  it('SerperAPI counts cache hits and misses', async (t) => {
    resetMetrics();
    t.mock.method(globalThis, 'fetch', async () => okJson({ organic: [] }));
    const api = new SerperAPI('test-key', { cacheTtlMs: 60_000 });

    await api.search('metrics probe query', 'web', {});
    await api.search('metrics probe query', 'web', {}); // cache hit

    const snap = snapshot();
    assert.equal(snap.cache_misses, 1);
    assert.equal(snap.cache_hits, 1);
    assert.equal(snap.searches, 2);
    resetMetrics();
  });
});

describe('EnvCheck', () => {
  it('flags unknown SERPER_*/SEARCH_* keys', () => {
    const unknown = findUnknownEnvKeys({ SERPER_TIMEOOUT_MS: '1', SERPER_CACHE_TTL: '5', PATH: '/usr/bin' });
    assert.deepEqual(unknown, ['SERPER_CACHE_TTL', 'SERPER_TIMEOOUT_MS']);
  });

  it('accepts every known key without warnings', () => {
    const warnings = validateEnv({
      SERPER_API_KEY: 'k',
      SERPER_MCP_TRANSPORT: 'http',
      SERPER_MCP_LOG_LEVEL: 'debug',
      SERPER_MCP_PORT: '9090',
      SERPER_TIMEOUT_MS: '10000',
      SEARCH_PROVIDER_ORDER: 'serper,tavily',
      SEARCH_FALLBACK: 'true',
    });
    assert.deepEqual(warnings, []);
  });

  it('warns on invalid transport, log level, port, and provider order', () => {
    const warnings = validateEnv({
      SERPER_MCP_TRANSPORT: 'grpc',
      SERPER_MCP_LOG_LEVEL: 'verbose',
      SERPER_MCP_PORT: '99999',
      SEARCH_PROVIDER_ORDER: 'serper,google',
    });
    assert.equal(warnings.length, 4);
    assert.match(warnings[0], /SERPER_MCP_TRANSPORT/);
    assert.match(warnings[1], /SERPER_MCP_LOG_LEVEL/);
    assert.match(warnings[2], /SERPER_MCP_PORT/);
    assert.match(warnings[3], /google/);
  });
});

describe('Logger requestId', () => {
  it('stamps log lines with the request id and clears cleanly', (t) => {
    setLogLevel('info');
    const spy = t.mock.method(console, 'error', () => {});

    setRequestId('abc12345');
    assert.equal(getRequestId(), 'abc12345');
    logger.info('stamped');
    assert.equal(spy.mock.calls[0].arguments[0], '[serper-mcp][abc12345]');

    setRequestId('');
    logger.info('plain');
    assert.equal(spy.mock.calls[1].arguments[0], '[serper-mcp]');
  });
});

describe('Router edge cases', () => {
  it('rejects unknown pinned provider with ValidationError', async () => {
    const api = new SerperAPI('test-key', { cacheTtlMs: 0 });
    const router = new ProviderRouter(api);
    await assert.rejects(
      router.search('q', 'web', { provider: 'nonexistent' }),
      (err) => err instanceof ValidationError && /Unknown provider: nonexistent/.test(err.message)
    );
  });

  it('provider=all with every provider failing returns empty organic, no throw', async (t) => {
    // Fan-out uses Promise.allSettled — rejections are excluded from fusion,
    // never thrown. Zero fulfilled lists → fuseRRF([]) → empty result set.
    t.mock.method(globalThis, 'fetch', async () => {
      throw new TypeError('fetch failed (network down)');
    });
    const api = new SerperAPI('test-key', { cacheTtlMs: 0, retries: 0 });
    const router = new ProviderRouter(api);
    const res = await router.search('rrf empty probe', 'web', { provider: 'all' });
    assert.equal(res.provider, 'all');
    assert.deepEqual(res.organic, []);
  });

  it('wraps upstream failures in ProviderError with attribution (auto chain, no fallback)', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => new Response('boom', { status: 500 }));
    process.env.SEARCH_FALLBACK = 'false';
    try {
      const api = new SerperAPI('test-key', { cacheTtlMs: 0, retries: 0 });
      const router = new ProviderRouter(api);
      await assert.rejects(
        router.search('provider error probe', 'web', {}),
        (err) => err instanceof ProviderError && err.provider === 'serper'
      );
    } finally {
      delete process.env.SEARCH_FALLBACK;
    }
  });

  it('fails over from serper to tavily on 5xx when fallback enabled', async (t) => {
    process.env.TAVILY_API_KEY = 'tvly-test';
    process.env.SEARCH_FALLBACK = 'true';
    t.mock.method(globalThis, 'fetch', async (url) => {
      const u = String(url);
      if (u.includes('serper.dev')) return new Response('upstream broke', { status: 503 });
      if (u.includes('tavily.com')) {
        return okJson({ results: [{ title: 'Tavily hit', url: 'https://t.example', content: 'from tavily' }] });
      }
      return new Response('not found', { status: 404 });
    });
    try {
      const api = new SerperAPI('test-key', { cacheTtlMs: 0, retries: 0 });
      const router = new ProviderRouter(api);
      const res = await router.search('failover probe unique', 'web', { num_results: 3 });
      assert.equal(res.provider, 'tavily');
      assert.equal(res.organic.length, 1);
    } finally {
      delete process.env.TAVILY_API_KEY;
      delete process.env.SEARCH_FALLBACK;
    }
  });

  it('malformed JSON from a provider mid-chain fails over (does not crash)', async (t) => {
    process.env.TAVILY_API_KEY = 'tvly-test-2';
    process.env.SEARCH_FALLBACK = 'true';
    t.mock.method(globalThis, 'fetch', async (url) => {
      const u = String(url);
      if (u.includes('serper.dev')) {
        // 200 OK but body is not JSON → response.json() throws SyntaxError
        return new Response('<html>gateway error</html>', { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (u.includes('tavily.com')) {
        return okJson({ results: [{ title: 'Recovered', url: 'https://r.example', content: 'via tavily' }] });
      }
      return new Response('not found', { status: 404 });
    });
    try {
      const api = new SerperAPI('test-key', { cacheTtlMs: 0, retries: 0 });
      const router = new ProviderRouter(api);
      const res = await router.search('malformed json probe', 'web', {});
      assert.equal(res.provider, 'tavily');
      assert.equal(res.organic[0]?.title, 'Recovered');
    } finally {
      delete process.env.TAVILY_API_KEY;
      delete process.env.SEARCH_FALLBACK;
    }
  });
});