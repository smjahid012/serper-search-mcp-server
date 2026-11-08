/**
 * MCP server integration tests — real Server over InMemoryTransport.
 * Network I/O (Serper API) is mocked; protocol layer is real.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { SerperMCPServer, isAuthorized } from '../dist/server/SerperMCPServer.js';
import { setLogLevel } from '../dist/utils/Logger.js';

setLogLevel('silent');

const okJson = (data) =>
  new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

async function connectTestClient(t) {
  const app = new SerperMCPServer({ apiKey: 'test-key' });
  const server = app.buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  t.after(async () => {
    await client.close();
    await server.close();
  });

  return { app, client };
}

describe('MCP server integration', () => {
  it('lists all 14 tools', async (t) => {
    const { client } = await connectTestClient(t);
    const { tools } = await client.listTools();

    assert.equal(tools.length, 14);
    const names = tools.map((tool) => tool.name);
    assert.ok(names.includes('search'));
    assert.ok(names.includes('scrape'));
    assert.ok(names.includes('search_scholar'));
    assert.ok(names.includes('search_patents'));
    assert.ok(names.includes('autocomplete'));
    assert.ok(names.includes('search_many'));
  });

  it('returns MethodNotFound for unknown tools', async (t) => {
    const { client } = await connectTestClient(t);
    await assert.rejects(client.callTool({ name: 'not_a_tool', arguments: {} }), /Unknown tool: not_a_tool/);
  });

  it('rejects invalid scrape URLs before any network call', async (t) => {
    const { client } = await connectTestClient(t);
    await assert.rejects(
      client.callTool({ name: 'scrape', arguments: { url: 'ftp://nope' } }),
      /absolute http\(s\) URL/
    );
  });

  it('serves scrape results as markdown', async (t) => {
    t.mock.method(globalThis, 'fetch', async () => okJson({ markdown: '# Hello page', credits: 2 }));

    const { client } = await connectTestClient(t);
    const res = await client.callTool({ name: 'scrape', arguments: { url: 'https://example.com' } });

    assert.match(res.content[0].text, /# Hello page/);
    assert.match(res.content[0].text, /credits used: 2/);
  });

  it('serves scholar results with citations', async (t) => {
    t.mock.method(globalThis, 'fetch', async () =>
      okJson({
        searchParameters: { q: 'attention' },
        organic: [{
          title: 'Attention Is All You Need',
          link: 'https://arxiv.org/abs/1706.03762',
          publicationInfo: 'Vaswani et al., 2017',
          citedBy: 12345,
        }],
      })
    );

    const { client } = await connectTestClient(t);
    const res = await client.callTool({ name: 'search_scholar', arguments: { query: 'attention' } });

    assert.match(res.content[0].text, /cited by 12345/);
  });

  it('dedupes shared URLs across search_many queries', async (t) => {
    t.mock.method(globalThis, 'fetch', async (_url, init) => {
      const q = JSON.parse(init.body).q;
      return okJson({
        organic: [
          { title: `shared for ${q}`, link: 'https://shared.example.com/page' },
          { title: `unique for ${q}`, link: `https://unique.example.com/${encodeURIComponent(q)}` },
        ],
      });
    });

    const { client } = await connectTestClient(t);
    const res = await client.callTool({ name: 'search_many', arguments: { queries: ['alpha', 'beta'] } });
    const text = res.content[0].text;

    assert.match(text, /Batch Search — 2 queries/);
    assert.match(text, /shared for alpha/);
    assert.match(text, /unique for alpha/);
    assert.match(text, /unique for beta/);
    assert.doesNotMatch(text, /shared for beta/);     // duplicate removed
    assert.match(text, /Removed 1 duplicate URL/);
  });

  it('reports per-query failures without failing the batch', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
      calls++;
      if (calls === 1) return new Response('bad key', { status: 403 });
      return okJson({ organic: [{ title: 'fine', link: 'https://fine.example.com' }] });
    });

    const { client } = await connectTestClient(t);
    const res = await client.callTool({ name: 'search_many', arguments: { queries: ['willfail', 'willwork'], num_results: 1 } });
    const text = res.content[0].text;

    assert.match(text, /⚠️ failed/);
    assert.match(text, /Serper API error 403/);
    assert.match(text, /fine/);
  });
});

describe('isAuthorized', () => {
  it('allows everything when no token is configured', () => {
    assert.equal(isAuthorized(undefined, undefined), true);
    assert.equal(isAuthorized('Bearer anything', undefined), true);
  });

  it('requires the exact bearer token when configured', () => {
    assert.equal(isAuthorized('Bearer secret', 'secret'), true);
    assert.equal(isAuthorized('Bearer wrong', 'secret'), false);
    assert.equal(isAuthorized(undefined, 'secret'), false);
    assert.equal(isAuthorized('secret', 'secret'), false);
  });
});
