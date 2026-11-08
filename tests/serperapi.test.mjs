/**
 * SerperAPI tests — request building, retry/backoff, timeout, cache, scrape.
 * All network I/O is mocked via t.mock.method(globalThis, 'fetch', …).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SerperAPI } from '../dist/api/SerperAPI.js';
import { setLogLevel } from '../dist/utils/Logger.js';

setLogLevel('silent'); // keep retry warnings out of test output

const okJson = (data) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

function makeApi({ cacheTtlMs = 0, retries = 2, timeoutMs = 5_000 } = {}) {
  return new SerperAPI('test-key', { retries, timeoutMs, baseDelayMs: 1, cacheTtlMs, cacheMaxEntries: 10 });
}

describe('SerperAPI', () => {
  it('posts to the correct endpoint with mapped params', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => okJson({ organic: [] }));
    const api = makeApi();

    await api.search('hello world', 'web', {
      search_lang: 'de',
      num_results: 50,
      country: 'GB',
      freshness: 'pw',
      safesearch: 'strict',
    });

    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://google.serper.dev/search');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['X-API-KEY'], 'test-key');

    const body = JSON.parse(init.body);
    assert.equal(body.q, 'hello world');
    assert.equal(body.hl, 'de');
    assert.equal(body.num, 20);            // clamped from 50
    assert.equal(body.gl, 'gb');
    assert.equal(body.tbs, 'qdr:pw');
    assert.equal(body.safe, 'active');
  });

  it('routes scholar to its dedicated endpoint', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => okJson({ organic: [] }));
    const api = makeApi();

    await api.search('transformers', 'scholar');

    assert.equal(fetchMock.mock.calls[0].arguments[0], 'https://google.serper.dev/scholar');
  });

  it('retries on 429 and succeeds', async (t) => {
    let calls = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (calls === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
      return okJson({ organic: [{ title: 'ok', link: 'https://x.com' }] });
    });
    const api = makeApi();

    const data = await api.search('q');
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(data.organic[0].title, 'ok');
  });

  it('retries on network errors', async (t) => {
    let calls = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (calls === 1) throw new TypeError('fetch failed');
      return okJson({ organic: [] });
    });
    const api = makeApi();

    await api.search('q');
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it('does not retry non-retryable 4xx', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('bad key', { status: 403 }));
    const api = makeApi();

    await assert.rejects(api.search('q'), /Serper API error 403/);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  it('gives up after exhausting retries', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response('boom', { status: 503 }));
    const api = makeApi({ retries: 1 });

    await assert.rejects(api.search('q'), /Serper API error 503/);
    assert.equal(fetchMock.mock.callCount(), 2); // initial + 1 retry
  });

  it('times out slow requests and reports it', async (t) => {
    t.mock.method(
      globalThis,
      'fetch',
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const api = makeApi({ retries: 0, timeoutMs: 40 });

    await assert.rejects(api.search('q'), /timed out after 40ms/);
  });

  it('caches identical searches (same endpoint + params)', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => okJson({ organic: [] }));
    const api = makeApi({ cacheTtlMs: 60_000 });

    await api.search('same');
    await api.search('same');
    assert.equal(fetchMock.mock.callCount(), 1);

    await api.search('different');
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it('does not cache failures', async (t) => {
    let calls = 0;
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (calls === 1) return new Response('bad', { status: 400 });
      return okJson({ organic: [] });
    });
    const api = makeApi({ cacheTtlMs: 60_000 });

    await assert.rejects(api.search('q'), /Serper API error 400/);
    await api.search('q');
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it('honors cache being disabled (ttl = 0)', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => okJson({ organic: [] }));
    const api = makeApi({ cacheTtlMs: 0 });

    await api.search('same');
    await api.search('same');
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  it('scrapes via the dedicated scrape host', async (t) => {
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => okJson({ markdown: '# Hi', credits: 2 }));
    const api = makeApi();

    const data = await api.scrape('https://example.com');

    const [url, init] = fetchMock.mock.calls[0].arguments;
    assert.equal(url, 'https://scrape.serper.dev');
    const body = JSON.parse(init.body);
    assert.equal(body.url, 'https://example.com');
    assert.equal(body.includeMarkdown, true);
    assert.equal(body.includeImages, false);
    assert.equal(data.markdown, '# Hi');
  });
});
