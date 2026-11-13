/**
 * Regression tests for the v4.1.0 fix batch — validation, router typing,
 * auth, error redaction, client-side image filters, places compact mode.
 * Run: npm test
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SearchTools } from '../dist/tools/SearchTools.js';
import { ProviderRouter } from '../dist/api/providers/Router.js';
import { SerperAPI } from '../dist/api/SerperAPI.js';
import { isAuthorized, sanitizeErrorMessage, hostAllowedSet, isAllowedHostHeader } from '../dist/server/SerperMCPServer.js';
import { ResultFormatter } from '../dist/utils/ResultFormatter.js';
import { setLogLevel } from '../dist/utils/Logger.js';

setLogLevel('silent');

const okJson = (data) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

describe('validateArgs hardening (v4.1.0)', () => {
  it('rejects a non-string query', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 123 }), /query must be a string/);
  });

  it('rejects non-number and out-of-range numbers', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'ok', num_results: 'abc' }), /num_results must be a number/);
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'ok', num_results: 99 }), /num_results must be <= 20/);
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'ok', page: 0 }), /page must be >= 1/);
  });

  it('rejects invalid enums', () => {
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'ok', freshness: 'weekly' }), /freshness must be one of/);
    assert.throws(() => SearchTools.validateArgs('search_web', { query: 'ok', safesearch: 'loose' }), /safesearch must be one of/);
    assert.throws(() => SearchTools.validateArgs('search_images', { query: 'ok', layout: 'carousel' }), /layout must be one of/);
  });

  it('rejects wrong types for booleans and arrays', () => {
    assert.throws(() => SearchTools.validateArgs('scrape', { url: 'https://x.com', include_images: 'yes' }), /include_images must be a boolean/);
    assert.throws(() => SearchTools.validateArgs('search_many', { queries: 'text' }), /queries must be an array/);
    assert.throws(() => SearchTools.validateArgs('search_web', []), /must be an object/);
  });

  it('still accepts valid arguments and the stub tool names', () => {
    assert.doesNotThrow(() => SearchTools.validateArgs('search_web', { query: 'valid query', num_results: 5, freshness: 'pd' }));
    assert.doesNotThrow(() => SearchTools.validateArgs('search_maps', {}));
    assert.doesNotThrow(() => SearchTools.validateArgs('search_lens', {}));
  });
});

describe('Router per-type handling (v4.1.0)', () => {
  it('rejects a web-only provider for a non-web search', async () => {
    const router = new ProviderRouter(new SerperAPI('k', { cacheTtlMs: 0, retries: 0 }));
    await assert.rejects(() => router.search('q', 'images', { provider: 'tavily' }), /web only/);
    await assert.rejects(() => router.search('q', 'videos', { provider: 'exa' }), /web only/);
  });

  it('keeps serper video results instead of failing over as empty', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => okJson({ videos: [{ title: 'v', link: 'https://e.com/v' }] }));
    const router = new ProviderRouter(new SerperAPI('k', { cacheTtlMs: 0, retries: 0 }));
    const data = await router.search('cats', 'videos', {});
    assert.equal(data.provider, 'serper');
    assert.equal(data.videos?.length, 1);
  });

  it('provider=all fuses into the field for the requested type', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => okJson({ images: [{ title: 'i', imageUrl: 'https://e.com/1.png', imageWidth: 10, imageHeight: 10 }] }));
    const router = new ProviderRouter(new SerperAPI('k', { cacheTtlMs: 0, retries: 0 }));
    const data = await router.search('cats', 'images', { provider: 'all' });
    assert.equal(data.provider, 'all');
    assert.equal(data.images?.length, 1);
    assert.equal(data.organic, undefined);
  });
});

describe('auth + error redaction (v4.1.0)', () => {
  it('bearer scheme is case-insensitive and token check stays strict', () => {
    assert.equal(isAuthorized('bearer tok123456', 'tok123456'), true);
    assert.equal(isAuthorized('BEARER tok123456', 'tok123456'), true);
    assert.equal(isAuthorized('Bearer wrong99999', 'tok123456'), false);
    assert.equal(isAuthorized('Basic tok123456', 'tok123456'), false);
    assert.equal(isAuthorized(undefined, 'tok123456'), false);
    assert.equal(isAuthorized('anything', undefined), true);
  });

  it('sanitizes html, query keys, bearer tokens, sk- keys, and long messages', () => {
    const raw =
      '<html>Gateway Error</html> fetch https://x.test/?key=SECRETVAL99 ' +
      'Authorization: Bearer abcdef1234567890 sk-proj-ABCDEFGhij123 ' +
      'y'.repeat(500);
    const out = sanitizeErrorMessage(raw);
    assert.ok(!out.includes('<html>'));
    assert.ok(!out.includes('SECRETVAL99'));
    assert.ok(!out.includes('abcdef1234567890'));
    assert.ok(!out.includes('ABCDEFGhij123'));
    assert.ok(out.length <= 303, `expected <=303 chars, got ${out.length}`);
  });
});

describe('DNS rebinding protection helpers (v4.1.0)', () => {
  it('loopback bind produces an enforcing set', () => {
    const s = hostAllowedSet('127.0.0.1');
    assert.ok(s);
    assert.equal(isAllowedHostHeader('127.0.0.1:8080', s), true);
    assert.equal(isAllowedHostHeader('LOCALHOST:8080', s), true);
    assert.equal(isAllowedHostHeader('[::1]:8080', s), true);
    assert.equal(isAllowedHostHeader('evil.com', s), false);
    assert.equal(isAllowedHostHeader('127.0.0.1.evil.com', s), false);
    assert.equal(isAllowedHostHeader(undefined, s), false);
  });

  it('wildcard bind without extras disables protection', () => {
    delete process.env.SERPER_MCP_ALLOWED_HOSTS;
    assert.equal(hostAllowedSet('0.0.0.0'), null);
  });

  it('wildcard bind with SERPER_MCP_ALLOWED_HOSTS enables exact extras only', () => {
    process.env.SERPER_MCP_ALLOWED_HOSTS = 'api.example.com, mcp.internal:9443';
    try {
      const s = hostAllowedSet('0.0.0.0');
      assert.ok(s);
      assert.equal(isAllowedHostHeader('api.example.com', s), true);
      assert.equal(isAllowedHostHeader('api.example.com:443', s), true);
      assert.equal(isAllowedHostHeader('mcp.internal:9443', s), true);
      assert.equal(isAllowedHostHeader('other.example.com', s), false);
    } finally {
      delete process.env.SERPER_MCP_ALLOWED_HOSTS;
    }
  });
});

describe('image filters + places compact (v4.1.0)', () => {
  const imgs = [
    { title: 'wide', imageUrl: 'https://e.com/a.png', imageWidth: 800, imageHeight: 600 },
    { title: 'tall', imageUrl: 'https://e.com/b.png', imageWidth: 300, imageHeight: 900 },
    { title: 'square', imageUrl: 'https://e.com/c.png', imageWidth: 400, imageHeight: 400 },
    { title: 'unknown', imageUrl: 'https://e.com/d.png' },
  ];

  it('orientation filters by WxH and keeps images without dimensions', () => {
    const txt = ResultFormatter.formatImages(imgs, 10, { orientation: 'portrait' }).join('\n');
    assert.ok(txt.includes('tall'));
    assert.ok(txt.includes('unknown'));
    assert.ok(!txt.includes('wide'));
    assert.ok(!txt.includes('square'));
  });

  it('size filters by longest side and keeps images without dimensions', () => {
    const txt = ResultFormatter.formatImages(imgs, 10, { size: 'small' }).join('\n');
    assert.ok(txt.includes('square'));
    assert.ok(txt.includes('unknown'));
    assert.ok(!txt.includes('wide'));
    assert.ok(!txt.includes('tall'));
  });

  it('places compact keeps title/rating/address but drops hours', () => {
    const txt = ResultFormatter.formatPlaces(
      [{ title: 'Cafe', address: '1 Main St', rating: 4.5, openingHours: ['Monday: 9:00 AM – 5:00 PM'] }],
      5,
      { compact: true }
    ).join('\n');
    assert.ok(txt.includes('Cafe'));
    assert.ok(txt.includes('1 Main St'));
    assert.ok(!txt.includes('Monday'));
  });

  it('places rich mode still renders hours', () => {
    const txt = ResultFormatter.formatPlaces(
      [{ title: 'Cafe', address: '1 Main St', openingHours: ['Monday: 9:00 AM – 5:00 PM'] }],
      5,
      {}
    ).join('\n');
    assert.ok(txt.includes('Monday'));
  });
});