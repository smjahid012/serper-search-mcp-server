/**
 * Google redirect-link resolution — link_resolution modes, resolve_links, /resolve hardening.
 * Real MCP server over InMemoryTransport; Serper (search + /resolve) and the LLM are mocked.
 */
process.env.SERPER_CACHE_TTL_MS = '0';       // every call hits the (mocked) network
process.env.SERPER_CACHE_PERSIST = 'false';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SerperMCPServer } from '../dist/server/SerperMCPServer.js';
import { SerperAPI } from '../dist/api/SerperAPI.js';
import { shownGotoCount, countGotoLinks } from '../dist/utils/LinkResolution.js';
import { setLogLevel } from '../dist/utils/Logger.js';
import { findUnknownEnvKeys, validateEnv } from '../dist/utils/EnvCheck.js';

setLogLevel('silent');

const RESOLVE = 'https://google.serper.dev/resolve';
const okJson = (data) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const goto = (n) => `https://www.google.com/goto?url=https://site${n}.example.com/&ved=x${n}`;
const real = (n) => `https://site${n}.example.com/`;

/** 3 resolved results + 2 goto links, like Serper returns since 2026-10-30. */
function searchResponse() {
  return {
    searchParameters: { q: 'test' },
    organic: [1, 2, 3, 4, 5].map((n) => ({ title: `Result ${n}`, link: n <= 3 ? real(n) : goto(n), snippet: `s${n}` })),
    credits: 1,
  };
}

/** Replace every goto link in a JSON value with its real URL. */
function resolveAll(node) {
  if (typeof node === 'string') {
    const m = node.match(/goto\?url=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : node;
  }
  if (Array.isArray(node)) return node.map(resolveAll);
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, resolveAll(v)]));
  return node;
}

/**
 * fetch mock: search endpoints return `search()`, /resolve is handled by `resolve(body, n)`.
 * Records every call as { url, body }.
 */
function mockServer(t, { search = searchResponse, resolve = (body) => okJson(resolveAll(body)), llm } = {}) {
  const calls = [];
  let resolveCalls = 0;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: String(url), body });
    if (url === RESOLVE) return resolve(body, ++resolveCalls);
    if (String(url).startsWith('https://google.serper.dev/')) return okJson(search(body));
    if (llm) return llm(body);
    throw new Error(`unexpected fetch ${url}`);
  });
  return calls;
}

async function connect(t) {
  const app = new SerperMCPServer({ apiKey: 'test-key' });
  const server = app.buildServer();
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });
  await Promise.all([client.connect(ct), server.connect(st)]);
  t.after(async () => { await client.close(); await server.close(); });
  return client;
}

const text = (res) => res.content[0].text;
const searchIdOf = (s) => s.match(/search_id: "([^"]+)"/)?.[1];

describe('link_resolution', () => {
  it('auto: keeps results, reports goto links with a search_id, does not call /resolve', async (t) => {
    const calls = mockServer(t);
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test' } }));

    assert.equal(calls.filter((c) => c.url === RESOLVE).length, 0);
    assert.equal(calls[0].body.resolveLinks, undefined);
    assert.match(out, /2 of the links above are Google redirects/);
    assert.ok(searchIdOf(out), 'search_id offered');
  });

  it('auto: no note when the shown results have no goto links', async (t) => {
    mockServer(t);
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', num_results: 3 } }));
    assert.doesNotMatch(out, /Google redirects/);
  });

  it('auto: goto links only in sections that are not rendered are ignored', async (t) => {
    mockServer(t, {
      search: () => ({ ...searchResponse(), organic: searchResponse().organic.slice(0, 3), peopleAlsoAsk: [{ question: 'q', snippet: 's', link: goto(9) }] }),
    });
    const client = await connect(t);
    const compact = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', verbosity: 'compact' } }));
    assert.doesNotMatch(compact, /Google redirects/);
    const standard = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', verbosity: 'standard' } }));
    assert.match(standard, /1 of the links above are Google redirects/);
  });

  it('all: resolves before returning', async (t) => {
    const calls = mockServer(t);
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', link_resolution: 'all' } }));

    const resolveCall = calls.find((c) => c.url === RESOLVE);
    assert.ok(resolveCall);
    assert.equal(resolveCall.body.credits, undefined, 'local fields are not sent to /resolve');
    assert.equal(resolveCall.body.provider, undefined);
    assert.match(out, /site5\.example\.com/);
    assert.doesNotMatch(out, /goto\?/);
    assert.doesNotMatch(out, /Google redirects/);
    assert.match(out, /Serper credits used: 1/);
  });

  it('none: sends resolveLinks:false', async (t) => {
    const calls = mockServer(t);
    const client = await connect(t);
    await client.callTool({ name: 'search_news', arguments: { query: 'test', link_resolution: 'none' } });
    assert.equal(calls[0].body.resolveLinks, false);
  });

  it('SERPER_LINK_RESOLUTION sets the default mode', async (t) => {
    process.env.SERPER_LINK_RESOLUTION = 'none';
    t.after(() => { delete process.env.SERPER_LINK_RESOLUTION; });
    const calls = mockServer(t);
    const client = await connect(t);
    await client.callTool({ name: 'search_web', arguments: { query: 'test' } });
    assert.equal(calls[0].body.resolveLinks, false);
  });

  it('rejects an invalid mode', async (t) => {
    mockServer(t);
    const client = await connect(t);
    await assert.rejects(
      client.callTool({ name: 'search_web', arguments: { query: 'test', link_resolution: 'some' } }),
      /link_resolution must be auto\|all\|none/
    );
  });

  it('all: a /resolve HTTP error keeps the results and reports the error', async (t) => {
    mockServer(t, { resolve: () => new Response('nope', { status: 400 }) });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', link_resolution: 'all' } }));
    assert.match(out, /Result 5/);
    assert.match(out, /\/resolve failed: Serper \/resolve error 400/);
    assert.ok(searchIdOf(out));
  });

  it('all: a reply that drops the result array is an error, not "all resolved"', async (t) => {
    mockServer(t, { resolve: (body) => okJson({ ...body, organic: undefined }) });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', link_resolution: 'all' } }));
    assert.match(out, /\/resolve failed: \/resolve reply is missing or changed "organic"/);
    assert.match(out, /2 of the links above are Google redirects/);
  });

  it('all: a reply that changes the array size is an error', async (t) => {
    mockServer(t, { resolve: (body) => okJson({ ...resolveAll(body), organic: resolveAll(body).organic.slice(0, 2) }) });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'search_web', arguments: { query: 'test', link_resolution: 'all' } }));
    assert.match(out, /reply is missing or changed "organic" \(sent 5 items\)/);
  });
});

describe('resolve_links', () => {
  it('resolves a search by search_id and re-renders it', async (t) => {
    mockServer(t);
    const client = await connect(t);
    const first = text(await client.callTool({ name: 'search_web', arguments: { query: 'test' } }));
    const id = searchIdOf(first);

    const out = text(await client.callTool({ name: 'resolve_links', arguments: { search_id: id } }));
    assert.match(out, /Resolved 2 of 2 Google redirect link\(s\) shown/);
    assert.match(out, /the original search used 1 credit/);
    assert.match(out, /site4\.example\.com/);
    assert.doesNotMatch(out, /goto\?/);
    assert.doesNotMatch(out, /Serper credits used/, 'resolving is free; no credit footer');
  });

  it('honours retryAfter when it fits in max_wait_seconds', async (t) => {
    const calls = mockServer(t, {
      resolve: (body, n) => okJson(n === 1 ? { ...body, retryAfter: 0 } : resolveAll(body)),
    });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'resolve_links', arguments: { links: [goto(7)] } }));
    assert.equal(calls.filter((c) => c.url === RESOLVE).length, 2);
    assert.match(out, /Resolved 1 of 1/);
    assert.match(out, /site7\.example\.com/);
  });

  it('stops and reports when retryAfter exceeds max_wait_seconds', async (t) => {
    const calls = mockServer(t, { resolve: (body) => okJson({ ...body, retryAfter: 90 }) });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'resolve_links', arguments: { links: [goto(7), 'https://plain.example.com/'], max_wait_seconds: 10 } }));
    assert.equal(calls.filter((c) => c.url === RESOLVE).length, 1);
    assert.deepEqual(calls.find((c) => c.url === RESOLVE).body, { links: [goto(7)] }, 'only goto links are sent');
    assert.match(out, /not resolved yet/);
    assert.match(out, /not a Google redirect link; unchanged/);
    assert.match(out, /after 90 s/);
  });

  it('search_id re-render keeps an unresolved search_id when links remain', async (t) => {
    mockServer(t, { resolve: (body) => okJson({ ...body, retryAfter: 90 }) });
    const client = await connect(t);
    const id = searchIdOf(text(await client.callTool({ name: 'search_web', arguments: { query: 'test' } })));
    const out = text(await client.callTool({ name: 'resolve_links', arguments: { search_id: id, max_wait_seconds: 0 } }));
    assert.match(out, /Resolved 0 of 2/);
    assert.equal(searchIdOf(out), id);
    assert.match(out, /Serper suggested waiting 90 s/);
  });

  it('search_ids are random, not sequential', async (t) => {
    mockServer(t);
    const client = await connect(t);
    const a = searchIdOf(text(await client.callTool({ name: 'search_web', arguments: { query: 'test' } })));
    const b = searchIdOf(text(await client.callTool({ name: 'search_web', arguments: { query: 'test' } })));
    assert.match(a, /^[A-Za-z0-9_-]{22}$/);
    assert.notEqual(a, b);
  });

  it('validates its arguments', async (t) => {
    mockServer(t);
    const client = await connect(t);
    await assert.rejects(client.callTool({ name: 'resolve_links', arguments: {} }), /exactly one of search_id or links/);
    await assert.rejects(client.callTool({ name: 'resolve_links', arguments: { search_id: 'x', links: [goto(1)] } }), /exactly one/);
    await assert.rejects(client.callTool({ name: 'resolve_links', arguments: { links: Array(101).fill(goto(1)) } }), /at most 100/);
    await assert.rejects(client.callTool({ name: 'resolve_links', arguments: { search_id: 'nope-1' } }), /unknown search_id/);
  });
});

describe('search_rag_context + deep_research', () => {
  it('rag json: reports unresolved_links + search_id; resolve_links re-renders the json', async (t) => {
    mockServer(t);
    const client = await connect(t);
    const json = JSON.parse(text(await client.callTool({ name: 'search_rag_context', arguments: { query: 'test' } })));
    assert.equal(json.unresolved_links, 2);
    assert.ok(json.search_id);

    const out = text(await client.callTool({ name: 'resolve_links', arguments: { search_id: json.search_id } }));
    const after = JSON.parse(out.slice(out.indexOf('{')));
    assert.equal(after.unresolved_links, undefined);
    assert.ok(after.chunks.some((c) => c.url === real(5)));
  });

  it('rag all: resolves before chunking', async (t) => {
    mockServer(t);
    const client = await connect(t);
    const json = JSON.parse(text(await client.callTool({ name: 'search_rag_context', arguments: { query: 'test', link_resolution: 'all' } })));
    assert.equal(json.unresolved_links, undefined);
    assert.ok(json.chunks.every((c) => !c.url.includes('goto?')));
  });

  it('deep_research resolves sources and lists any that are still redirects', async (t) => {
    process.env.OPENROUTER_API_KEY = 'or-test';
    t.after(() => { delete process.env.OPENROUTER_API_KEY; });
    let llmCalls = 0;
    const llm = (body) => {
      llmCalls++;
      const content = llmCalls === 1 ? '["sub one"]' : `REPORT\n${body.messages.at(-1).content.includes(real(4)) ? 'saw-real-4' : 'no-real-4'}`;
      return okJson({ choices: [{ message: { content } }] });
    };
    // /resolve resolves site4 but site5 is not ready yet.
    mockServer(t, {
      llm,
      resolve: (body) => okJson({ links: body.links.map((l) => (l.includes('site4') ? real(4) : l)), retryAfter: 90 }),
    });
    const client = await connect(t);
    const out = text(await client.callTool({ name: 'deep_research', arguments: { query: 'test', depth: 'standard' } }));
    assert.match(out, /saw-real-4/, 'resolved URL reaches the prompt');
    assert.match(out, /1 source URL\(s\) are still Google redirects/);
    assert.match(out, /\[5\] https:\/\/www\.google\.com\/goto/);
  });
});

describe('helpers', () => {
  it('countGotoLinks matches google.<tld>/goto only', () => {
    assert.equal(countGotoLinks([goto(1), 'https://www.google.de/goto?url=x', 'https://google.com/search?q=goto', 'https://example.com/goto?x']), 2);
  });

  it('shownGotoCount respects num_results', () => {
    const d = searchResponse();
    assert.equal(shownGotoCount(d, 'web', 3), 0);
    assert.equal(shownGotoCount(d, 'web', 5), 2);
  });

  it('the new env vars are known and an invalid mode warns', () => {
    assert.deepEqual(findUnknownEnvKeys({ SERPER_LINK_RESOLUTION: 'all', SERPER_RESOLVE_MAX_WAIT: '30' }), []);
    assert.ok(validateEnv({ SERPER_LINK_RESOLUTION: 'some' }).some((w) => /SERPER_LINK_RESOLUTION must be/.test(w)));
  });

  it('SerperAPI.resolve sends local fields stripped and returns attempts', async (t) => {
    mockServer(t);
    const api = new SerperAPI('k', { cacheTtlMs: 0, retries: 0 });
    const r = await api.resolve({ ...searchResponse(), provider: 'serper', cache_hit: false });
    assert.equal(r.unresolved, 0);
    assert.equal(r.attempts, 1);
  });
});
