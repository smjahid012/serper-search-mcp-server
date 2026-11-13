/**
 * HTTP transport end-to-end tests — spawns the real CLI over real HTTP.
 * Guards the StreamableHTTPServerTransport path (incl. Node 18 WebCrypto shim),
 * which InMemoryTransport tests cannot cover.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const basePort = 18000 + (process.pid % 500);

async function waitForHealth(port, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return res;
    } catch {
      // not up yet
    }
    await delay(150);
  }
  throw new Error(`server on port ${port} did not become healthy in time`);
}

function spawnServer(port, extraEnv = {}) {
  const child = spawn(
    process.execPath,
    ['dist/index.js', '--transport', 'http', '--port', String(port), '--host', '127.0.0.1'],
    {
      cwd: root,
      env: { ...process.env, SERPER_API_KEY: 'dummy', SERPER_MCP_LOG_LEVEL: 'silent', ...extraEnv },
      stdio: 'ignore',
    }
  );
  return child;
}

describe('HTTP transport e2e', () => {
  it('serves /health and POST /mcp tools/list', async (t) => {
    const child = spawnServer(basePort);
    t.after(() => child.kill());

    const health = await (await waitForHealth(basePort)).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.auth_required, false);

    const res = await fetch(`http://127.0.0.1:${basePort}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    const body = await res.text();
    assert.equal(res.status, 200);
    assert.match(body, /search_web/);
    assert.match(body, /search_many/);
    assert.match(body, /scrape/);
  });

  it('enforces bearer auth when SERPER_MCP_AUTH_TOKEN is set', async (t) => {
    const port = basePort + 1;
    const child = spawnServer(port, { SERPER_MCP_AUTH_TOKEN: 'tok' });
    t.after(() => child.kill());

    const health = await (await waitForHealth(port)).json();
    assert.equal(health.auth_required, true);

    const unauth = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(unauth.status, 401);

    const authed = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: 'Bearer tok',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    });
    assert.equal(authed.status, 200);
  });

  it('rejects foreign Host headers on /mcp (DNS rebinding protection)', async (t) => {
    const port = basePort + 2;
    const child = spawnServer(port);
    t.after(() => child.kill());
    await waitForHealth(port);

    const post = (host) =>
      new Promise((resolve, reject) => {
        const req = httpRequest(
          {
            host: '127.0.0.1',
            port,
            path: '/mcp',
            method: 'POST',
            headers: {
              Host: host,
              'Content-Type': 'application/json',
              Accept: 'application/json, text/event-stream',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (c) => (data += c));
            res.on('end', () => resolve({ status: res.statusCode, data }));
          }
        );
        req.on('error', reject);
        req.end(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
      });

    const evil = await post('evil.example.com');
    assert.equal(evil.status, 403);
    assert.match(evil.data, /rebinding/);

    const good = await post(`127.0.0.1:${port}`);
    assert.equal(good.status, 200);
    assert.match(good.data, /search_web/);
  });
});
