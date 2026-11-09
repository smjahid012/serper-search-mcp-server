/**
 * TtlCache tests — TTL expiry, LRU eviction, disabled mode.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../dist/utils/TtlCache.js';

describe('TtlCache', () => {
  it('stores and retrieves values', () => {
    const cache = new TtlCache(60_000, 10);
    assert.equal(cache.get('missing'), undefined);

    cache.set('a', 1);
    assert.equal(cache.get('a'), 1);
    assert.equal(cache.size, 1);
  });

  it('expires entries after their ttl', async () => {
    const cache = new TtlCache(25, 10);
    cache.set('a', 'x');
    assert.equal(cache.get('a'), 'x');

    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.size, 0);
  });

  it('evicts the least recently used entry beyond maxEntries', () => {
    const cache = new TtlCache(60_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a');       // 'a' is now most recently used, 'b' is LRU
    cache.set('c', 3);    // should evict 'b'

    assert.equal(cache.get('a'), 1);
    assert.equal(cache.get('b'), undefined);
    assert.equal(cache.get('c'), 3);
  });

  it('never stores when ttl <= 0', () => {
    const cache = new TtlCache(0);
    cache.set('a', 1);
    assert.equal(cache.get('a'), undefined);
    assert.equal(cache.size, 0);
  });

  it('clear() empties the cache', () => {
    const cache = new TtlCache(60_000);
    cache.set('a', 1);
    cache.clear();
    assert.equal(cache.get('a'), undefined);
  });

  it('persists and reloads entries from disk', () => {
    import('node:fs').then(({ rmSync, existsSync }) => {
      const testPath = './tests/.tmp-cache.json';
      try { if (existsSync(testPath)) rmSync(testPath); } catch {}
      const cache1 = new TtlCache(60_000, 10, testPath);
      cache1.set('test-key', { foo: 'bar' });
      cache1.flushToDisk();

      const cache2 = new TtlCache(60_000, 10, testPath);
      assert.deepEqual(cache2.get('test-key'), { foo: 'bar' });

      cache2.clear();
      try { if (existsSync(testPath)) rmSync(testPath); } catch {}
    });
  });
});
